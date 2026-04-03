/**
 * Unit tests for src/sandboxManager.ts — mocks src/docker.ts so no real
 * Docker daemon is needed.
 *
 * sandboxManager.ts imports dockerSpawn, dockerExec, and getContainerName
 * from ./docker. We intercept that module with mock.module() so all spawn
 * calls go through our controlled queues.
 */

import { describe, expect, test, mock, beforeEach, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Mock src/docker.ts ────────────────────────────────────────────────────────

type SpawnResult = [number, string];
type ExecResult  = [boolean, string];

const spawnCalls: string[][] = [];
const execCalls:  Array<[string, string]> = [];
const spawnQueue: SpawnResult[] = [];
const execQueue:  ExecResult[]  = [];
let defaultSpawn: SpawnResult = [0, ''];
let defaultExec:  ExecResult  = [true, ''];

mock.module('../../../src/docker', () => ({
  getContainerName: (id: string) => `openclaw-${id}`,

  dockerSpawn: async (args: string[]): Promise<SpawnResult> => {
    spawnCalls.push([...args]);
    if (spawnQueue.length)                   return spawnQueue.shift()!;
    // Command-aware defaults for common docker commands
    const cmd = args.join(' ');
    if (cmd.startsWith('image inspect node:22-bookworm')) {
      return [0, '[]'];
    }
    if (cmd.startsWith('port '))             return [0, '0.0.0.0:32769'];
    return [...defaultSpawn] as SpawnResult;
  },

  dockerExec: async (containerName: string, cmd: string): Promise<ExecResult> => {
    execCalls.push([containerName, cmd]);
    if (execQueue.length)                   return execQueue.shift()!;
    // Command-aware defaults for common openclaw commands
    if (cmd.includes('gateway.auth.token')) return [true, 'tok-gateway-123'];
    if (cmd.includes("agent.id!=='architect'")) {
      return [true, containerName === 'openclaw-openclaw-gateway-1' ? 'updated' : 'absent'];
    }
    if (
      cmd.includes('openclaw models status') &&
      cmd.includes('--probe') &&
      cmd.includes('--probe-provider openai-codex')
    ) {
      return [true, JSON.stringify({
        defaultModel: 'openai-codex/gpt-5.4',
        resolvedDefault: 'openai-codex/gpt-5.4',
        auth: {
          missingProvidersInUse: [],
          probes: {
            totalTargets: 1,
            results: [{ status: 'ok' }],
          },
        },
      })];
    }
    if (cmd.includes('bootstrap-config-verify')) {
      return [true, JSON.stringify({ ok: true, failures: [] })];
    }
    if (cmd.includes('openclaw models status --json')) {
      return [true, JSON.stringify({
        defaultModel: 'openai-codex/gpt-5.4',
        resolvedDefault: 'openai-codex/gpt-5.4',
        auth: {
          probes: {
            totalTargets: 1,
            results: [{ status: 'ok' }],
          },
        },
      })];
    }
    if (cmd.includes('net.connect'))        return [true, ''];          // port-check succeeds
    if (cmd.includes('devices approve'))    return [true, 'Approved DEVICE001'];
    return [...defaultExec] as ExecResult;
  },
}));

// Skip real sleeps (polling loops in createOpenclawSandbox)
spyOn(Bun, 'sleep').mockImplementation(async () => {});

import { getContainerName, createOpenclawSandbox, reconfigureSandboxLlm } from '../../../src/sandboxManager';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function collectEvents(opts: Record<string, string>) {
  const events: Array<[string, unknown]> = [];
  for await (const event of createOpenclawSandbox(opts)) {
    events.push(event);
  }
  return events;
}

const BASE_OPTS = { sandboxName: 'test-sandbox' };

function makeTempAuthFile(relativePath: string, content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'openclaw-auth-'));
  const filePath = join(dir, relativePath);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
  return {
    filePath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

beforeEach(() => {
  spawnCalls.length = 0;
  execCalls.length  = 0;
  spawnQueue.length = 0;
  execQueue.length  = 0;
  defaultSpawn = [0, ''];
  defaultExec  = [true, ''];
  process.env.OPENCLAW_SHARED_OAUTH_JSON_PATH = join(tmpdir(), 'missing-openclaw-oauth.json');
  process.env.CODEX_AUTH_JSON_PATH = join(tmpdir(), 'missing-codex-auth.json');
  process.env.OPENCLAW_SHARED_CODEX_MODEL = 'openai-codex/gpt-5.4';
});

// ── getContainerName ──────────────────────────────────────────────────────────

describe('getContainerName', () => {
  test('prefixes sandbox id with "openclaw-"', () => {
    expect(getContainerName('abc-123')).toBe('openclaw-abc-123');
  });

  test('handles uuid-shaped ids', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(getContainerName(id)).toBe(`openclaw-${id}`);
  });

  test('handles empty string', () => {
    expect(getContainerName('')).toBe('openclaw-');
  });
});

// ── createOpenclawSandbox: happy path ─────────────────────────────────────────

describe('createOpenclawSandbox', () => {
  test('yields result event with correct shape', async () => {
    const events = await collectEvents(BASE_OPTS);
    const resultEvents = events.filter(([t]) => t === 'result');
    expect(resultEvents.length).toBe(1);

    const data = resultEvents[0][1] as Record<string, unknown>;
    expect(typeof data['sandbox_id']).toBe('string');
    expect(data['gateway_port']).toBe(32769);
    expect(data['gateway_token']).toBe('tok-gateway-123');
    expect(data['sandbox_state']).toBe('running');
    expect(typeof data['standard_url']).toBe('string');
  });

  test('yields approved event with device approval message', async () => {
    const events = await collectEvents(BASE_OPTS);
    const approved = events.filter(([t]) => t === 'approved');
    expect(approved.length).toBeGreaterThan(0);
    expect(String((approved[0][1] as Record<string, unknown>)['message'])).toContain('Approved');
  });

  test('no error events on happy path', async () => {
    const events = await collectEvents(BASE_OPTS);
    expect(events.filter(([t]) => t === 'error').length).toBe(0);
  });

  test('yields log events during creation', async () => {
    const events = await collectEvents(BASE_OPTS);
    const logs = events.filter(([t]) => t === 'log').map(([, m]) => m as string);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((m) => m.includes('Creating container'))).toBe(true);
  });

  test('skips docker pull when the pre-built sandbox image is already cached locally', async () => {
    // Default spawn succeeds → ruh-sandbox:latest is present → no pull needed
    await collectEvents(BASE_OPTS);

    expect(
      spawnCalls.some((args) => args[0] === 'pull'),
    ).toBe(false);
    expect(
      spawnCalls.some((args) => args[0] === 'image' && args[1] === 'inspect' && args[2] === 'ruh-sandbox:latest'),
    ).toBe(true);
  });

  test('pulls the legacy base image when pre-built image is not present locally', async () => {
    spawnQueue.push([1, 'No such image: ruh-sandbox:latest']); // pre-built image inspect fails
    spawnQueue.push([1, 'No such image: node:22-bookworm']);    // legacy image inspect also fails → pull

    await collectEvents(BASE_OPTS);

    expect(
      spawnCalls.some((args) => args[0] === 'pull' && args[1] === 'node:22-bookworm'),
    ).toBe(true);
  });

  // ── Error paths ─────────────────────────────────────────────────────────────

  test('yields error when docker run fails', async () => {
    spawnQueue.push([0, '[]']); // image inspect
    spawnQueue.push([1, 'name already in use']); // run

    const events = await collectEvents(BASE_OPTS);
    const errors = events.filter(([t]) => t === 'error');
    expect(errors.length).toBe(1);
    expect(String(errors[0][1])).toContain('Failed to create container');
  });

  test('yields error when docker port mapping fails', async () => {
    spawnQueue.push([0, '[]']);               // image inspect
    spawnQueue.push([0, '']);               // docker run
    spawnQueue.push([1, 'no port mapping']); // docker port → fails

    const events = await collectEvents(BASE_OPTS);
    const errors = events.filter(([t]) => t === 'error');
    expect(errors.length).toBe(1);
    expect(String(errors[0][1])).toContain('Failed to get port mapping');
  });

  test('yields error when docker port output cannot be parsed', async () => {
    spawnQueue.push([0, '[]']);          // image inspect
    spawnQueue.push([0, '']);          // docker run
    spawnQueue.push([0, 'not-a-port']); // docker port → unparseable

    const events = await collectEvents(BASE_OPTS);
    const errors = events.filter(([t]) => t === 'error');
    expect(errors.length).toBe(1);
    expect(String(errors[0][1])).toContain('Could not parse host port');
  });

  test('yields error when both npm install attempts fail (legacy image path)', async () => {
    // Force legacy path: pre-built image not available, legacy image is present
    spawnQueue.push([1, 'No such image: ruh-sandbox:latest']); // pre-built inspect fails
    // legacy image inspect succeeds (cmd-aware default handles node:22-bookworm)
    // All exec calls fail by default → npm install fails twice
    defaultExec = [false, 'ERESOLVE'];

    const events = await collectEvents(BASE_OPTS);
    const errors = events.filter(([t]) => t === 'error');
    expect(errors.length).toBe(1);
    expect(String(errors[0][1])).toContain('OpenClaw installation failed');
  });

  test('yields error when openclaw binary not found in pre-built image', async () => {
    // Pre-built image present but openclaw --version fails (first exec call)
    execQueue.push([false, '']);   // openclaw --version fails in pre-built path
    // remaining exec calls won't be reached

    const events = await collectEvents(BASE_OPTS);
    const errors = events.filter(([t]) => t === 'error');
    expect(errors.length).toBe(1);
    expect(String(errors[0][1])).toContain('openclaw binary not found in pre-built image');
  });

  test('yields error when openclaw --version fails in legacy path', async () => {
    // Force legacy path: pre-built image not available
    spawnQueue.push([1, 'No such image: ruh-sandbox:latest']); // pre-built inspect fails
    // legacy image inspect succeeds (cmd-aware default)
    // npm install succeeds (1st exec call), version check fails (2nd)
    execQueue.push([true, '']);    // npm install
    execQueue.push([false, '']);   // --version fails
    // remaining exec calls won't be reached

    const events = await collectEvents(BASE_OPTS);
    const errors = events.filter(([t]) => t === 'error');
    expect(errors.length).toBe(1);
    expect(String(errors[0][1])).toContain('openclaw binary not found after install');
  });

  test('yields error when onboarding fails', async () => {
    // Pre-built path: openclaw --version succeeds, VNC start succeeds,
    // agent runtime succeeds, then onboarding fails
    execQueue.push([true, '']);              // openclaw --version
    execQueue.push([true, '']);              // sandbox-vnc-start
    execQueue.push([true, '']);              // sandbox-agent-runtime
    execQueue.push([false, 'onboard failed']); // openclaw onboard

    const events = await collectEvents(BASE_OPTS);
    const errors = events.filter(([t]) => t === 'error');
    expect(errors.length).toBe(1);
    expect(String(errors[0][1])).toContain('Onboarding failed');
  });

  test('fails closed when a required bootstrap config step fails', async () => {
    // Pre-built path exec sequence:
    // 1. openclaw --version
    // 2. sandbox-vnc-start
    // 3. sandbox-agent-runtime
    // 4. openclaw onboard (onboarding)
    // 5. auth-profiles.json node script
    // 6. batched bootstrap config → FAIL (triggers individual step retry)
    // 7. first individual step (gateway.bind) → FAIL → error
    execQueue.push([true, '']);            // openclaw --version
    execQueue.push([true, '']);            // sandbox-vnc-start
    execQueue.push([true, '']);            // sandbox-agent-runtime
    execQueue.push([true, 'onboarded']);   // openclaw onboard
    execQueue.push([true, '']);            // auth-profiles.json
    execQueue.push([false, 'batch failed']); // batched config fails → individual retry
    execQueue.push([false, 'permission denied']); // gateway.bind step fails

    const events = await collectEvents(BASE_OPTS);

    expect(events.some(([type]) => type === 'result')).toBe(false);
    const errors = events.filter(([type]) => type === 'error');
    expect(errors.length).toBe(1);
    expect(String(errors[0][1])).toContain('gateway.bind');
    expect(spawnCalls.some((args) => args[0] === 'rm' && args[1] === '-f')).toBe(true);
  });

  test('verifies required bootstrap config before yielding result', async () => {
    const events = await collectEvents(BASE_OPTS);

    expect(events.some(([type]) => type === 'result')).toBe(true);
    const verificationIndex = execCalls.findIndex(([, cmd]) =>
      cmd.includes('bootstrap-config-verify'),
    );
    expect(verificationIndex).toBeGreaterThanOrEqual(0);
  });

  test('passes a shell-safe bootstrap verification script to node -e', async () => {
    await collectEvents(BASE_OPTS);

    const verificationCall = execCalls.find(([, cmd]) =>
      cmd.includes('bootstrap-config-verify'),
    );

    expect(verificationCall).toBeDefined();
    const verificationCommand = verificationCall?.[1] ?? '';
    expect(verificationCommand).not.toContain('\\nconst fs');
    expect(verificationCommand).not.toContain('\\nconst os');
  });

  // ── LLM provider selection ───────────────────────────────────────────────────

  test('logs LLM provider: OpenRouter when openrouterApiKey provided', async () => {
    const events = await collectEvents({ ...BASE_OPTS, openrouterApiKey: 'or-test-key' });
    const logs = events.filter(([t]) => t === 'log').map(([, m]) => m as string);
    expect(logs.some((m) => m.includes('OpenRouter'))).toBe(true);
  });

  test('logs LLM provider: Anthropic when only anthropicApiKey provided', async () => {
    const events = await collectEvents({ ...BASE_OPTS, anthropicApiKey: 'sk-ant-key' });
    const logs = events.filter(([t]) => t === 'log').map(([, m]) => m as string);
    expect(logs.some((m) => m.includes('Anthropic'))).toBe(true);
  });

  test('logs LLM provider: OpenAI when only openaiApiKey provided', async () => {
    const events = await collectEvents({ ...BASE_OPTS, openaiApiKey: 'sk-oai-key' });
    const logs = events.filter(([t]) => t === 'log').map(([, m]) => m as string);
    expect(logs.some((m) => m.includes('OpenAI'))).toBe(true);
  });

  test('logs LLM provider: Gemini when only geminiApiKey provided', async () => {
    const events = await collectEvents({ ...BASE_OPTS, geminiApiKey: 'gem-key' });
    const logs = events.filter(([t]) => t === 'log').map(([, m]) => m as string);
    expect(logs.some((m) => m.includes('Gemini'))).toBe(true);
  });

  test('logs Ollama fallback when no API key provided', async () => {
    const events = await collectEvents(BASE_OPTS);
    const logs = events.filter(([t]) => t === 'log').map(([, m]) => m as string);
    expect(logs.some((m) => m.includes('Ollama'))).toBe(true);
  });

  test('OpenRouter takes priority over Anthropic and OpenAI', async () => {
    const events = await collectEvents({
      ...BASE_OPTS,
      openrouterApiKey: 'or-key',
      anthropicApiKey: 'ant-key',
    });
    const logs = events.filter(([t]) => t === 'log').map(([, m]) => m as string);
    expect(logs.some((m) => m.includes('OpenRouter'))).toBe(true);
    expect(logs.some((m) => m.includes('Anthropic'))).toBe(false);
  });

  test('forwards env vars as Forwarding log events', async () => {
    const events = await collectEvents({
      ...BASE_OPTS,
      anthropicApiKey: 'sk-ant-test',
      openaiApiKey: 'sk-oai-test',
    });
    const logs = events.filter(([t]) => t === 'log').map(([, m]) => m as string);
    expect(logs.some((m) => m.includes('ANTHROPIC_API_KEY'))).toBe(true);
    expect(logs.some((m) => m.includes('OPENAI_API_KEY'))).toBe(true);
  });

  test('uses shared Codex auth fallback when host OpenClaw OAuth state is absent', async () => {
    const codexAuth = makeTempAuthFile('codex/auth.json', '{"account":"shared"}');

    try {
      const events = await collectEvents({
        ...BASE_OPTS,
        sharedOpenClawOauthPath: join(tmpdir(), 'does-not-exist-oauth.json'),
        sharedCodexAuthPath: codexAuth.filePath,
      });

      const logs = events.filter(([t]) => t === 'log').map(([, m]) => String(m));
      expect(logs.some((m) => m.includes('Codex CLI auth'))).toBe(true);
      expect(execCalls.some(([, cmd]) => cmd.includes('/root/.codex/auth.json'))).toBe(true);
      expect(execCalls.some(([, cmd]) => cmd.includes('--auth-choice skip'))).toBe(true);
      expect(
        execCalls.some(([, cmd]) =>
          cmd.includes('openclaw config set agents.defaults.model.primary openai-codex/gpt-5.4'),
        ),
      ).toBe(true);
      expect(
        execCalls.some(([, cmd]) =>
          cmd.includes('openclaw models status --probe --probe-provider openai-codex --json'),
        ),
      ).toBe(true);
    } finally {
      codexAuth.cleanup();
    }
  });

  test('prefers shared OpenClaw OAuth state over Codex CLI auth when both are present', async () => {
    const openclawOauth = makeTempAuthFile('openclaw/credentials/oauth.json', '{"oauth":"shared"}');
    const codexAuth = makeTempAuthFile('codex/auth.json', '{"account":"shared"}');

    try {
      const events = await collectEvents({
        ...BASE_OPTS,
        sharedOpenClawOauthPath: openclawOauth.filePath,
        sharedCodexAuthPath: codexAuth.filePath,
      });

      const logs = events.filter(([t]) => t === 'log').map(([, m]) => String(m));
      expect(logs.some((m) => m.includes('OpenClaw OAuth'))).toBe(true);
      expect(execCalls.some(([, cmd]) => cmd.includes('/root/.openclaw/credentials/oauth.json'))).toBe(true);
      expect(execCalls.some(([, cmd]) => cmd.includes('/root/.codex/auth.json'))).toBe(false);
    } finally {
      openclawOauth.cleanup();
      codexAuth.cleanup();
    }
  });

  test('keeps VNC startup failure non-fatal when required bootstrap config still verifies', async () => {
    // Pre-built path: openclaw --version succeeds, sandbox-vnc-start fails (non-fatal)
    execQueue.push([true, '']);              // openclaw --version
    execQueue.push([false, 'vnc failed']); // sandbox-vnc-start fails → non-fatal

    const events = await collectEvents(BASE_OPTS);
    const logs = events.filter(([type]) => type === 'log').map(([, message]) => String(message));

    expect(events.some(([type]) => type === 'result')).toBe(true);
    expect(logs.some((message) => message.includes('live browser view unavailable'))).toBe(true);
  });
});

// ── shared Codex retrofit ────────────────────────────────────────────────────

describe('retrofitContainerToSharedCodex', () => {
  test('retrofits a container using a discovered /root home directory', async () => {
    const codexAuth = makeTempAuthFile('codex/auth.json', '{"account":"shared"}');

    try {
      execQueue.push([true, '/root']);

      const sandboxManager = (await import('../../../src/sandboxManager')) as Record<string, unknown>;
      const retrofit = sandboxManager.retrofitContainerToSharedCodex as (
        containerName: string,
        opts: Record<string, string>
      ) => Promise<Record<string, unknown>>;

      const result = await retrofit('openclaw-sandbox-123', {
        sharedCodexAuthPath: codexAuth.filePath,
      });

      expect(result.ok).toBe(true);
      expect(result.model).toBe('openai-codex/gpt-5.4');
      expect(result.homeDir).toBe('/root');
      expect(execCalls.some(([, cmd]) => cmd.includes('/root/.codex/auth.json'))).toBe(true);
      expect(execCalls.some(([, cmd]) => cmd.includes("openai-codex:default"))).toBe(true);
      expect(
        execCalls.some(([, cmd]) =>
          cmd.includes('openclaw config set agents.defaults.model.primary openai-codex/gpt-5.4'),
        ),
      ).toBe(true);
    } finally {
      codexAuth.cleanup();
    }
  });

  test('retrofits a container using a discovered /home/node home directory', async () => {
    const codexAuth = makeTempAuthFile('codex/auth.json', '{"account":"shared"}');

    try {
      execQueue.push([true, '/home/node']);

      const sandboxManager = (await import('../../../src/sandboxManager')) as Record<string, unknown>;
      const retrofit = sandboxManager.retrofitContainerToSharedCodex as (
        containerName: string,
        opts: Record<string, string>
      ) => Promise<Record<string, unknown>>;

      const result = await retrofit('openclaw-openclaw-gateway-1', {
        sharedCodexAuthPath: codexAuth.filePath,
      });

      expect(result.ok).toBe(true);
      expect(result.homeDir).toBe('/home/node');
      expect(execCalls.some(([, cmd]) => cmd.includes('/home/node/.codex/auth.json'))).toBe(true);
      expect(execCalls.some(([, cmd]) => cmd.includes("auth-profiles.json"))).toBe(true);
      expect(
        execCalls.some(([, cmd]) =>
          cmd.includes('openclaw models status --agent architect --probe --probe-provider openai-codex --json'),
        ),
      ).toBe(true);
      expect(Array.isArray(result.logs) && result.logs.includes('Architect model aligned')).toBe(true);
    } finally {
      codexAuth.cleanup();
    }
  });

  test('throws when the shared Codex auth probe fails', async () => {
    const codexAuth = makeTempAuthFile('codex/auth.json', '{"account":"shared"}');

    try {
      execQueue.push([true, '/root']);
      execQueue.push([true, 'seeded']);
      execQueue.push([true, 'onboard refreshed']);
      execQueue.push([true, 'synced']);
      execQueue.push([true, '']);
      execQueue.push([true, 'absent']);
      execQueue.push([false, 'probe failed']);

      const sandboxManager = (await import('../../../src/sandboxManager')) as Record<string, unknown>;
      const retrofit = sandboxManager.retrofitContainerToSharedCodex as (
        containerName: string,
        opts: Record<string, string>
      ) => Promise<Record<string, unknown>>;

      await expect(
        retrofit('openclaw-sandbox-123', { sharedCodexAuthPath: codexAuth.filePath }),
      ).rejects.toThrow('Shared Codex auth probe failed');
    } finally {
      codexAuth.cleanup();
    }
  });

  test('throws when the gateway does not become healthy after retrofit restart', async () => {
    const codexAuth = makeTempAuthFile('codex/auth.json', '{"account":"shared"}');

    try {
      execQueue.push([true, '/root']);
      execQueue.push([true, 'seeded']);
      execQueue.push([true, 'onboard refreshed']);
      execQueue.push([true, 'synced']);
      execQueue.push([true, '']);
      execQueue.push([true, 'absent']);
      execQueue.push([true, JSON.stringify({
        defaultModel: 'openai-codex/gpt-5.4',
        resolvedDefault: 'openai-codex/gpt-5.4',
        auth: { probes: { totalTargets: 1, results: [{ status: 'ok' }] } },
      })]);
      execQueue.push([true, '']);
      execQueue.push([true, '']);
      for (let i = 0; i < 10; i++) execQueue.push([false, 'connection refused']);

      const sandboxManager = (await import('../../../src/sandboxManager')) as Record<string, unknown>;
      const retrofit = sandboxManager.retrofitContainerToSharedCodex as (
        containerName: string,
        opts: Record<string, string>
      ) => Promise<Record<string, unknown>>;

      await expect(
        retrofit('openclaw-sandbox-123', { sharedCodexAuthPath: codexAuth.filePath }),
      ).rejects.toThrow('Gateway did not become healthy after shared Codex retrofit');
    } finally {
      codexAuth.cleanup();
    }
  });

  test('throws when the shared Codex probe returns no usable targets', async () => {
    const codexAuth = makeTempAuthFile('codex/auth.json', '{"account":"shared"}');

    try {
      execQueue.push([true, '/home/node']);
      execQueue.push([true, 'present']);
      execQueue.push([true, 'onboard refreshed']);
      execQueue.push([true, 'synced']);
      execQueue.push([true, '']);
      execQueue.push([true, 'updated']);
      execQueue.push([true, JSON.stringify({
        defaultModel: 'openai-codex/gpt-5.4',
        resolvedDefault: 'openai-codex/gpt-5.4',
        auth: { probes: { totalTargets: 0, results: [] } },
      })]);

      const sandboxManager = (await import('../../../src/sandboxManager')) as Record<string, unknown>;
      const retrofit = sandboxManager.retrofitContainerToSharedCodex as (
        containerName: string,
        opts: Record<string, string>
      ) => Promise<Record<string, unknown>>;

      await expect(
        retrofit('openclaw-openclaw-gateway-1', { sharedCodexAuthPath: codexAuth.filePath }),
      ).rejects.toThrow('Shared Codex auth probe returned no usable targets');
    } finally {
      codexAuth.cleanup();
    }
  });
});

// ── reconfigureSandboxLlm ─────────────────────────────────────────────────────

describe('reconfigureSandboxLlm', () => {
  test('throws when cloud provider is missing apiKey', async () => {
    await expect(
      reconfigureSandboxLlm('sandbox-123', { provider: 'openai' }),
    ).rejects.toThrow('apiKey is required');
  });

  test('throws when requested model does not belong to provider', async () => {
    await expect(
      reconfigureSandboxLlm('sandbox-123', {
        provider: 'openai',
        apiKey: 'sk-openai-secret-1234',
        model: 'claude-sonnet-4-6',
      }),
    ).rejects.toThrow('does not belong to provider');
  });

  test('writes config and restarts gateway for configured provider', async () => {
    const result = await reconfigureSandboxLlm('sandbox-123', {
      provider: 'openai',
      apiKey: 'sk-openai-secret-1234',
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4o');
    expect(result.configured.apiKey).toContain('***');

    const allCmds = execCalls.map(([, cmd]) => cmd).join('\n');
    expect(allCmds).toContain('node -e');
    expect(allCmds).toContain('gateway stop');
    expect(allCmds).toContain('gateway run');
    expect(execCalls.every(([container]) => container === 'openclaw-sandbox-123')).toBe(true);
  });

  test('writes custom Ollama model and base URL without requiring an apiKey', async () => {
    const result = await reconfigureSandboxLlm('sandbox-123', {
      provider: 'ollama',
      ollamaBaseUrl: 'http://ollama.internal:11434/v1',
      ollamaModel: 'llama3.3:70b',
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('ollama');
    expect(result.model).toBe('llama3.3:70b');
    expect(result.configured.apiKey).toBeUndefined();
    expect(result.configured.envVar).toBeUndefined();
    expect(result.configured.baseUrl).toBe('http://ollama.internal:11434/v1');

    const configWriteCmd = execCalls[0]?.[1] ?? '';
    const payloadMatch = configWriteCmd.match(/"([A-Za-z0-9+/=]+)" 2>&1$/);
    expect(payloadMatch).not.toBeNull();

    const payload = JSON.parse(
      Buffer.from(payloadMatch![1], 'base64').toString('utf8'),
    ) as {
      providerId: string;
      envUpdates: Record<string, string>;
      providerConfig: { apiKey: string; baseUrl: string };
    };

    expect(payload.providerId).toBe('ollama');
    expect(payload.envUpdates).toEqual({
      OLLAMA_BASE_URL: 'http://ollama.internal:11434/v1',
      OLLAMA_MODEL: 'llama3.3:70b',
    });
    expect(payload.providerConfig.apiKey).toBe('ollama-local');
    expect(payload.providerConfig.baseUrl).toBe('http://ollama.internal:11434/v1');
  });

  test('throws when gateway does not become healthy after reconfiguration', async () => {
    execQueue.push([true, 'Config updated']);
    execQueue.push([true, '']);
    execQueue.push([true, '']);
    for (let i = 0; i < 10; i++) execQueue.push([false, 'connection refused']);

    await expect(
      reconfigureSandboxLlm('sandbox-123', {
        provider: 'openai',
        apiKey: 'sk-openai-secret-1234',
      }),
    ).rejects.toThrow('Gateway did not become healthy after LLM reconfiguration');
  });
});
