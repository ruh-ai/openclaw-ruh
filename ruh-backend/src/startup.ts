// @kb: 002-backend-overview 001-architecture
import type { Server } from 'node:http';
import { execSync } from 'node:child_process';
import { BackendConfig, getConfig } from './config';
import { initPool } from './db';
import { runSchemaMigrations } from './schemaMigrations';
import { app } from './app';
import { markBackendNotReady, markBackendReady } from './backendReadiness';
import { handleVncUpgrade } from './vncProxy';
import { handleGatewayUpgrade } from './gatewayProxy';
import { initTelemetry, shutdownTelemetry } from './telemetry';
import { dockerExec, getContainerName, listManagedSandboxContainers } from './docker';
import { startStuckSessionMonitor, type MonitorHandle } from './stuckSessionMonitor';
import { getAgentByForgeSandboxId } from './agentStore';
import { writeSystemEvent } from './systemEventStore';

let stuckSessionMonitorHandle: MonitorHandle | null = null;

export interface StartupLogger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface StartupDependencies {
  port?: number;
  host?: string;
  config?: BackendConfig;
  logger?: StartupLogger;
  listen?: (port: number, host: string) => Promise<Server | void>;
  initPool?: () => void;
  initSchemaMigrations?: () => Promise<void>;
  checkDocker?: () => boolean;
  skipPreflight?: boolean;
  /** Skip starting the stuck-session monitor — used in tests and one-shot scripts. */
  skipStuckSessionMonitor?: boolean;
}

export function stopStuckSessionMonitor(): void {
  if (stuckSessionMonitorHandle) {
    stuckSessionMonitorHandle.stop();
    stuckSessionMonitorHandle = null;
  }
}

const LLM_KEY_ENV_VARS = [
  'openrouterApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'geminiApiKey',
  'ollamaBaseUrl',
] as const;

function defaultCheckDocker(): boolean {
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function runPreflight(
  logger: StartupLogger,
  checkDocker = defaultCheckDocker,
  runtimeConfig: BackendConfig = getConfig(process.env, { requireDatabaseUrl: true }),
): void {
  // Required: Docker
  if (!checkDocker()) {
    throw new Error(
      'Docker is not available. Ensure the Docker daemon is running and accessible. ' +
      'Sandbox creation requires Docker to run agent containers.',
    );
  }

  // Warning: LLM keys
  const hasLlmKey = LLM_KEY_ENV_VARS.some((key) => Boolean(runtimeConfig[key]));
  if (!hasLlmKey) {
    logger.warn(
      'WARNING: No LLM provider key found. Set at least one of: ' +
      ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OLLAMA_BASE_URL'].join(', ') +
      '. Sandboxes will fall back to local Ollama (must be running).',
    );
  }
}

function defaultListen(port: number, host: string): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.on('error', reject);
  });
}

export async function startBackend(deps: StartupDependencies = {}): Promise<void> {
  const runtimeConfig = deps.config ?? getConfig(process.env, { requireDatabaseUrl: true });
  const port = Number(deps.port ?? runtimeConfig.port);
  const host = deps.host ?? '0.0.0.0';
  const logger: StartupLogger = deps.logger ?? { ...console, warn: console.warn };
  const listen = deps.listen ?? defaultListen;
  const initializePool = deps.initPool ?? initPool;
  const initializeSchemaMigrations = deps.initSchemaMigrations ?? runSchemaMigrations;

  markBackendNotReady();

  // Preflight: validate required infrastructure
  if (!deps.skipPreflight) {
    runPreflight(logger, deps.checkDocker, runtimeConfig);
  }

  try {
    initTelemetry(runtimeConfig);
    initializePool();
    await initializeSchemaMigrations();
    const server = await listen(port, host);
    // Attach WebSocket upgrade handlers for VNC and gateway proxies
    if (server && typeof server.on === 'function') {
      server.on('upgrade', (req, socket, head) => {
        const url = req.url ?? '';
        if (url.startsWith('/ws/gateway/')) {
          handleGatewayUpgrade(req, socket, head);
        } else {
          handleVncUpgrade(req, socket, head);
        }
      });
    }
    markBackendReady();
    logger.log(`OpenClaw backend (TypeScript/Bun) listening on port ${port}`);
    logger.log('Database ready');

    if (!deps.skipStuckSessionMonitor) {
      stuckSessionMonitorHandle = startStuckSessionMonitor({
        deps: {
          listRunningSandboxIds: async () => {
            const containers = await listManagedSandboxContainers().catch(() => []);
            return containers.filter((c) => c.running).map((c) => c.sandbox_id);
          },
          tailGatewayLog: async (sandboxId) => {
            const [, output] = await dockerExec(
              getContainerName(sandboxId),
              'tail -200 /tmp/openclaw-gateway.log 2>/dev/null || true',
              5_000,
            );
            return output;
          },
          resolveAgentId: async (sandboxId) => {
            const agent = await getAgentByForgeSandboxId(sandboxId).catch(() => null);
            return agent?.id ?? null;
          },
          emitEvent: async (event) => {
            await writeSystemEvent({
              level: event.kind === 'session.stuck' ? 'warn' : 'info',
              category: 'runtime.diagnostic',
              action: event.kind,
              status: event.kind === 'session.stuck' ? 'detected' : 'cleared',
              message:
                event.kind === 'session.stuck'
                  ? `Session ${event.session.session_key} stuck (age ${event.session.age_seconds}s, queueDepth ${event.session.queue_depth})`
                  : `Session ${event.session.session_key} recovered`,
              sandbox_id: event.sandbox_id,
              agent_id: event.agent_id,
              source: 'stuck-session-monitor',
              details: {
                session_id: event.session.session_id,
                session_key: event.session.session_key,
                state: event.session.state,
                age_seconds: event.session.age_seconds,
                queue_depth: event.session.queue_depth,
              },
            });
          },
          onError: (sandboxId, error) => {
            logger.warn(`stuck-session-monitor [${sandboxId}]:`, error instanceof Error ? error.message : error);
          },
        },
        onCycleError: (error) => {
          logger.error('stuck-session-monitor cycle error:', error);
        },
      });
      logger.log('Stuck-session monitor started');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markBackendNotReady(`Database initialization failed: ${message}`);
    logger.error('Startup error:', error);
    throw error;
  }
}
