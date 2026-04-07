/**
 * Daytona sandbox provider — creates and manages sandboxes via the Daytona API.
 *
 * API: https://app.daytona.io/api
 *   - POST /sandbox — create sandbox
 *   - GET  /sandbox/{id} — get sandbox (includes toolboxProxyUrl)
 *   - GET  /sandbox/{id}/ports/{port}/preview-url — get public URL for a port
 *   - DELETE /sandbox/{id} — remove sandbox
 *
 * Exec: https://proxy.app.daytona.io/toolbox/{id}/process/execute
 *   - POST { command, timeout } → { exitCode, result }
 *
 * Default image: daytonaio/sandbox:0.6.0 (has Node.js pre-installed)
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SandboxProvider,
  InfraCreateOpts,
  InfrastructureResult,
  ManagedSandboxInfo,
} from './types';
import type { SandboxEvent } from '../sandboxManager';

const GATEWAY_PORT = 18789;
const VNC_WS_PORT = 6080;
const DASHBOARD_PORT = 8080;
const DAYTONA_LABEL_KEY = 'ruh-managed';
const DAYTONA_LABEL_VALUE = 'true';

interface DaytonaConfig {
  apiUrl: string;
  apiKey: string;
}

interface DaytonaSandbox {
  id: string;
  state: string;
  snapshot?: string;
  toolboxProxyUrl?: string;
  errorReason?: string | null;
}

interface DaytonaExecResult {
  exitCode: number;
  result: string;
}

interface DaytonaPreviewUrl {
  sandboxId: string;
  url: string;
  token?: string;
}

export class DaytonaProvider implements SandboxProvider {
  private readonly config: DaytonaConfig;

  constructor(config: DaytonaConfig) {
    this.config = config;
  }

  private async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 60_000,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${this.config.apiUrl}${path}`;
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const detail = text.startsWith('<!') ? 'HTML response (wrong URL?)' : text.slice(0, 400);
        throw new Error(`Daytona API ${method} ${path} → ${response.status}: ${detail}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : ({} as T);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Execute a command via the sandbox's toolbox proxy.
   * The proxy URL comes from the sandbox record's `toolboxProxyUrl` field.
   */
  private async toolboxExec(
    toolboxProxyUrl: string,
    sandboxId: string,
    cmd: string,
    timeoutMs = 300_000,
    maxRetries = 2,
  ): Promise<[boolean, string]> {
    const url = `${toolboxProxyUrl}/${sandboxId}/process/execute`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs + 10_000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            command: cmd,
            timeout: Math.floor(timeoutMs / 1000),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          // Daytona may return 400 "container IP not found" when the sandbox network
          // is still settling after startup — retry with backoff
          const isTransient =
            response.status === 400 &&
            (text.includes('container IP') || text.includes('no IP address') || text.includes('resolve'));
          if (isTransient && attempt < maxRetries) {
            const delay = Math.min(3000 * (attempt + 1), 15_000);
            await Bun.sleep(delay);
            continue;
          }
          return [false, `Toolbox exec failed (${response.status}): ${text.slice(0, 400)}`];
        }

        const result = (await response.json()) as DaytonaExecResult;
        return [result.exitCode === 0, result.result ?? ''];
      } catch (err) {
        clearTimeout(timeout);
        // Network errors (fetch abort, ECONNREFUSED) — retry if we have attempts left
        if (attempt < maxRetries) {
          await Bun.sleep(3000);
          continue;
        }
        return [false, err instanceof Error ? err.message : String(err)];
      }
    }

    return [false, 'Toolbox exec: max retries exceeded'];
  }

  async *createInfrastructure(
    opts: InfraCreateOpts,
  ): AsyncGenerator<SandboxEvent | ['infra_ready', InfrastructureResult]> {
    const sandboxId = uuidv4();

    yield ['log', `Creating Daytona sandbox (API: ${this.config.apiUrl})...`];

    // Parse env args from ['-e', 'KEY=VAL', ...] into a flat map
    const envVars: Record<string, string> = {};
    for (let i = 0; i < opts.envArgs.length; i += 2) {
      if (opts.envArgs[i] === '-e' && opts.envArgs[i + 1]) {
        const eqIdx = opts.envArgs[i + 1].indexOf('=');
        if (eqIdx > 0) {
          envVars[opts.envArgs[i + 1].slice(0, eqIdx)] = opts.envArgs[i + 1].slice(eqIdx + 1);
        }
      }
    }

    // Create sandbox — Daytona uses daytonaio/sandbox image by default (has Node.js)
    let sandbox: DaytonaSandbox;
    try {
      sandbox = await this.apiRequest<DaytonaSandbox>('POST', '/sandbox', {
        labels: { [DAYTONA_LABEL_KEY]: DAYTONA_LABEL_VALUE },
        envVars,
        resources: {
          cpu: 2,
          memory: 8,
          disk: 10,
        },
        autoStopInterval: 0,
      }, 120_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield ['error', `Failed to create Daytona sandbox: ${msg}`];
      return;
    }

    yield ['log', `Daytona sandbox created: ${sandbox.id} (image: ${sandbox.snapshot ?? 'default'})`];

    // Wait for sandbox to be ready
    yield ['log', 'Waiting for sandbox to start...'];
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      try {
        sandbox = await this.apiRequest<DaytonaSandbox>('GET', `/sandbox/${sandbox.id}`);
        if (sandbox.state === 'started' || sandbox.state === 'running') break;
        if (sandbox.state === 'error' || sandbox.state === 'failed' || sandbox.state === 'stopped') {
          yield ['error', `Daytona sandbox entered ${sandbox.state} state: ${sandbox.errorReason ?? 'unknown'}`];
          return;
        }
      } catch { /* transient — keep polling */ }
      await Bun.sleep(3000);
    }

    if (sandbox.state !== 'started' && sandbox.state !== 'running') {
      yield ['error', 'Daytona sandbox did not start within 180s'];
      await this.stopAndRemove(sandboxId).catch(() => {});
      return;
    }
    yield ['log', 'Sandbox is running'];

    // Resolve toolbox proxy URL for exec calls
    const toolboxProxyUrl = sandbox.toolboxProxyUrl ?? 'https://proxy.app.daytona.io/toolbox';
    yield ['log', `Toolbox proxy: ${toolboxProxyUrl}`];

    // Probe the toolbox until it actually responds — the Daytona toolbox service
    // inside the container can take 30–120s to register its IP with the proxy
    // even after the sandbox state transitions to "started".
    yield ['log', 'Probing toolbox (waiting for exec to become available)...'];
    {
      const probeDeadline = Date.now() + 180_000; // up to 3 min
      let probeOk = false;
      let probeAttempts = 0;
      while (Date.now() < probeDeadline) {
        probeAttempts++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const res = await fetch(
            `${toolboxProxyUrl}/${sandbox.id}/process/execute`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
              },
              body: JSON.stringify({ command: 'echo __TOOLBOX_READY__', timeout: 5 }),
              signal: controller.signal,
            },
          );
          clearTimeout(timer);
          if (res.ok) {
            const body = (await res.json()) as DaytonaExecResult;
            if ((body.result ?? '').includes('__TOOLBOX_READY__') || body.exitCode === 0) {
              probeOk = true;
              yield ['log', `Toolbox ready after ${probeAttempts} probe(s)`];
              break;
            }
          }
        } catch {
          clearTimeout(timer);
        }
        await Bun.sleep(5000);
      }
      if (!probeOk) {
        yield ['error', 'Daytona toolbox did not become ready within 3 minutes — sandbox networking may be degraded'];
        await this.stopAndRemove(sandboxId).catch(() => {});
        return;
      }
    }

    // ── Resolve preview URLs for exposed ports ──────────────────────────────
    yield ['log', 'Resolving gateway preview URL...'];
    let gatewayUrl: string | null = null;
    let previewToken: string | null = null;
    try {
      const preview = await this.apiRequest<DaytonaPreviewUrl>(
        'GET',
        `/sandbox/${sandbox.id}/ports/${GATEWAY_PORT}/preview-url`,
        undefined,
        15_000,
      );
      gatewayUrl = preview.url || null;
      previewToken = preview.token || null;
    } catch (err) {
      yield ['log', `Warning: Failed to get gateway preview URL: ${(err as Error).message}`];
    }

    if (!gatewayUrl) {
      gatewayUrl = `https://${GATEWAY_PORT}-${sandbox.id}.daytonaproxy01.net`;
      yield ['log', `Using constructed gateway URL: ${gatewayUrl}`];
    }
    yield ['log', `Gateway preview URL: ${gatewayUrl}`];

    // VNC preview URL (optional)
    let vncPreviewUrl: string | null = null;
    try {
      const vncRes = await this.apiRequest<DaytonaPreviewUrl>(
        'GET', `/sandbox/${sandbox.id}/ports/${VNC_WS_PORT}/preview-url`, undefined, 10_000,
      );
      vncPreviewUrl = vncRes.url || null;
    } catch { /* optional */ }

    // Dashboard preview URL (optional)
    let dashboardPreviewUrl: string | null = null;
    try {
      const dashRes = await this.apiRequest<DaytonaPreviewUrl>(
        'GET', `/sandbox/${sandbox.id}/ports/${DASHBOARD_PORT}/preview-url`, undefined, 10_000,
      );
      dashboardPreviewUrl = dashRes.url || null;
    } catch { /* optional */ }

    // Store mappings for exec/status/remove
    this.workspaceMap.set(sandboxId, sandbox.id);
    this.toolboxUrlMap.set(sandboxId, toolboxProxyUrl);

    yield ['infra_ready', {
      sandboxId,
      gatewayUrl,
      gatewayHostPort: String(GATEWAY_PORT),
      vncHostPort: null,
      dashboardHostPort: null,
      dashboardUrl: dashboardPreviewUrl ?? gatewayUrl,
      previewToken,
      sshCommand: `daytona sandbox ssh ${sandbox.id}`,
      // Daytona's default image (daytonaio/sandbox) has Node.js but NOT OpenClaw —
      // so we need the legacy install path (usingPrebuiltImage = false)
      usingPrebuiltImage: false,
    }];
  }

  // Map our sandbox IDs → Daytona sandbox IDs
  private workspaceMap = new Map<string, string>();
  // Map our sandbox IDs → Daytona toolbox proxy URLs
  private toolboxUrlMap = new Map<string, string>();

  private resolveWorkspaceId(sandboxId: string): string {
    return this.workspaceMap.get(sandboxId) ?? sandboxId;
  }

  private resolveToolboxUrl(sandboxId: string): string {
    return this.toolboxUrlMap.get(sandboxId) ?? 'https://proxy.app.daytona.io/toolbox';
  }

  /**
   * Recover the Daytona sandbox ID from the DB sandbox record when the
   * in-memory map is empty (e.g. after a backend restart). The Daytona ID
   * is embedded in the standard_url: https://{port}-{daytonaId}.daytonaproxy01.net
   */
  async rehydrateMapping(sandboxId: string): Promise<void> {
    if (this.workspaceMap.has(sandboxId)) return;
    try {
      // Lazy import to avoid circular dependency
      const store = await import('../store');
      const record = await store.getSandbox(sandboxId);
      if (!record) { console.log(`[daytona] rehydrate: no record for ${sandboxId}`); return; }
      const url: string = record.standard_url || record.dashboard_url || '';
      // Extract Daytona ID from URL pattern: https://{port}-{daytonaId}.daytonaproxy01.net
      const match = url.match(/\d+-([0-9a-f-]{36})\./);
      if (match?.[1]) {
        this.workspaceMap.set(sandboxId, match[1]);
        console.log(`[daytona] Rehydrated mapping: ${sandboxId} → ${match[1]}`);
      } else {
        console.log(`[daytona] rehydrate: no match in URL "${url}" for ${sandboxId}`);
      }
    } catch (e) {
      console.error(`[daytona] rehydrate error for ${sandboxId}:`, e instanceof Error ? e.message : e);
    }
  }

  async exec(sandboxId: string, cmd: string, timeoutMs = 300_000): Promise<[boolean, string]> {
    await this.rehydrateMapping(sandboxId);
    const workspaceId = this.resolveWorkspaceId(sandboxId);
    const toolboxUrl = this.resolveToolboxUrl(sandboxId);
    return this.toolboxExec(toolboxUrl, workspaceId, cmd, timeoutMs);
  }

  async isRunning(sandboxId: string): Promise<boolean> {
    await this.rehydrateMapping(sandboxId);
    const workspaceId = this.resolveWorkspaceId(sandboxId);
    try {
      const sb = await this.apiRequest<DaytonaSandbox>('GET', `/sandbox/${workspaceId}`, undefined, 10_000);
      return sb.state === 'started' || sb.state === 'running';
    } catch {
      return false;
    }
  }

  async stopAndRemove(sandboxId: string): Promise<void> {
    await this.rehydrateMapping(sandboxId);
    const workspaceId = this.resolveWorkspaceId(sandboxId);
    try {
      await this.apiRequest('DELETE', `/sandbox/${workspaceId}`, undefined, 30_000);
    } catch { /* best-effort */ }
    this.workspaceMap.delete(sandboxId);
    this.toolboxUrlMap.delete(sandboxId);
  }

  async listManaged(): Promise<ManagedSandboxInfo[]> {
    try {
      const sandboxes = await this.apiRequest<DaytonaSandbox[]>(
        'GET', `/sandbox?label=${DAYTONA_LABEL_KEY}=${DAYTONA_LABEL_VALUE}`, undefined, 15_000,
      );
      return (Array.isArray(sandboxes) ? sandboxes : []).map((sb) => ({
        sandbox_id: sb.id,
        container_name: sb.id,
        state: sb.state,
        running: sb.state === 'started' || sb.state === 'running',
        status: sb.state,
      }));
    } catch {
      return [];
    }
  }
}
