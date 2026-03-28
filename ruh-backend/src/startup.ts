import type { Server } from 'node:http';
import { execSync } from 'node:child_process';
import { BackendConfig, getConfig } from './config';
import { initPool } from './db';
import { runSchemaMigrations } from './schemaMigrations';
import { app } from './app';
import { markBackendNotReady, markBackendReady } from './backendReadiness';
import { handleVncUpgrade } from './vncProxy';
import { initTelemetry, shutdownTelemetry } from './telemetry';

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
    // Attach WebSocket upgrade handler for VNC proxy
    if (server && typeof server.on === 'function') {
      server.on('upgrade', handleVncUpgrade);
    }
    markBackendReady();
    logger.log(`OpenClaw backend (TypeScript/Bun) listening on port ${port}`);
    logger.log('Database ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markBackendNotReady(`Database initialization failed: ${message}`);
    logger.error('Startup error:', error);
    throw error;
  }
}
