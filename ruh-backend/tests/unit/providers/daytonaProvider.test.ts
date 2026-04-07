/**
 * Unit tests for providers/daytonaProvider.ts — mocks fetch() to avoid real API calls.
 *
 * Daytona API: https://app.daytona.io/api
 * Toolbox proxy: https://proxy.app.daytona.io/toolbox/{sandboxId}/process/execute
 */

import { describe, expect, test, mock, beforeEach, spyOn } from 'bun:test';

spyOn(Bun, 'sleep').mockImplementation(async () => {});

import { DaytonaProvider } from '../../../src/providers/daytonaProvider';

const fetchCalls: Array<{ url: string; method: string; body?: string }> = [];
let fetchResponses: Array<{ status: number; body: unknown }> = [];

beforeEach(() => {
  fetchCalls.length = 0;
  fetchResponses = [];

  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const body = init?.body ? String(init.body) : undefined;
    fetchCalls.push({ url, method, body });

    const next = fetchResponses.shift();
    if (!next) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return new Response(
      typeof next.body === 'string' ? next.body : JSON.stringify(next.body),
      { status: next.status },
    );
  }) as typeof fetch;
});

const DAYTONA_CONFIG = {
  apiUrl: 'https://app.daytona.test/api',
  apiKey: 'test-daytona-key',
};

const SANDBOX_RESPONSE = {
  id: 'ws-001',
  state: 'started',
  snapshot: 'daytonaio/sandbox:0.6.0',
  toolboxProxyUrl: 'https://proxy.test/toolbox',
};

/** Queue responses for a successful sandbox creation flow. */
function queueSuccessfulCreate() {
  // POST /sandbox → created
  fetchResponses.push({ status: 200, body: SANDBOX_RESPONSE });
  // GET /sandbox/ws-001 (poll status) → running
  fetchResponses.push({ status: 200, body: SANDBOX_RESPONSE });
  // GET /sandbox/ws-001/ports/18789/preview-url
  fetchResponses.push({
    status: 200,
    body: { sandboxId: 'ws-001', url: 'https://18789-ws-001.daytonaproxy.net', token: 'tok-preview' },
  });
  // GET /sandbox/ws-001/ports/6080/preview-url (VNC)
  fetchResponses.push({
    status: 200,
    body: { sandboxId: 'ws-001', url: 'https://6080-ws-001.daytonaproxy.net' },
  });
  // GET /sandbox/ws-001/ports/8080/preview-url (dashboard)
  fetchResponses.push({
    status: 200,
    body: { sandboxId: 'ws-001', url: 'https://8080-ws-001.daytonaproxy.net' },
  });
}

describe('DaytonaProvider', () => {
  describe('createInfrastructure', () => {
    test('yields log events and infra_ready on success', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);
      queueSuccessfulCreate();

      const events: Array<[string, unknown]> = [];
      for await (const event of provider.createInfrastructure({ envArgs: [], sandboxName: 'test' })) {
        events.push(event as [string, unknown]);
      }

      const logs = events.filter(([t]) => t === 'log');
      const infraReady = events.filter(([t]) => t === 'infra_ready');

      expect(logs.length).toBeGreaterThan(0);
      expect(infraReady.length).toBe(1);

      const infra = infraReady[0][1] as Record<string, unknown>;
      expect(typeof infra.sandboxId).toBe('string');
      expect(infra.gatewayUrl).toBe('https://18789-ws-001.daytonaproxy.net');
      expect(infra.dashboardUrl).toBe('https://8080-ws-001.daytonaproxy.net');
      expect(infra.previewToken).toBe('tok-preview');
      // Daytona's default image doesn't have OpenClaw — needs legacy install path
      expect(infra.usingPrebuiltImage).toBe(false);
    });

    test('falls back to constructed URL when preview URL fails', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);

      // POST create
      fetchResponses.push({ status: 200, body: SANDBOX_RESPONSE });
      // GET status
      fetchResponses.push({ status: 200, body: SANDBOX_RESPONSE });
      // GET preview-url fails
      fetchResponses.push({ status: 404, body: 'Not found' });
      // VNC (optional, also fails)
      fetchResponses.push({ status: 404, body: 'Not found' });
      // Dashboard (optional, also fails)
      fetchResponses.push({ status: 404, body: 'Not found' });

      const events: Array<[string, unknown]> = [];
      for await (const event of provider.createInfrastructure({ envArgs: [], sandboxName: 'test' })) {
        events.push(event as [string, unknown]);
      }

      const infra = events.find(([t]) => t === 'infra_ready');
      expect(infra).toBeTruthy();
      // Falls back to constructed URL
      expect((infra![1] as Record<string, unknown>).gatewayUrl).toContain('18789-ws-001');
    });

    test('yields error when sandbox creation fails', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);

      fetchResponses.push({ status: 500, body: 'Internal Server Error' });

      const events: Array<[string, unknown]> = [];
      for await (const event of provider.createInfrastructure({ envArgs: [], sandboxName: 'test' })) {
        events.push(event as [string, unknown]);
      }

      const errors = events.filter(([t]) => t === 'error');
      expect(errors.length).toBe(1);
      expect(String(errors[0][1])).toContain('Failed to create Daytona sandbox');
    });

    test('parses env args into sandbox env vars', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);
      queueSuccessfulCreate();

      for await (const _ of provider.createInfrastructure({
        envArgs: ['-e', 'OPENAI_API_KEY=sk-test', '-e', 'TELEGRAM_BOT_TOKEN=bot123'],
        sandboxName: 'test',
      })) { /* drain */ }

      const createCall = fetchCalls.find((c) => c.method === 'POST' && c.url.includes('/sandbox'));
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall!.body!);
      expect(body.envVars.OPENAI_API_KEY).toBe('sk-test');
      expect(body.envVars.TELEGRAM_BOT_TOKEN).toBe('bot123');
    });
  });

  describe('exec', () => {
    test('sends POST to toolbox proxy exec endpoint', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);

      // First create a sandbox so the provider maps IDs
      queueSuccessfulCreate();
      let infraSandboxId = '';
      for await (const event of provider.createInfrastructure({ envArgs: [], sandboxName: 'test' })) {
        if (event[0] === 'infra_ready') {
          infraSandboxId = (event[1] as Record<string, unknown>).sandboxId as string;
        }
      }

      // Now exec
      fetchResponses.push({
        status: 200,
        body: { exitCode: 0, result: 'hello world' },
      });

      const [ok, output] = await provider.exec(infraSandboxId, 'echo hello');

      expect(ok).toBe(true);
      expect(output).toBe('hello world');
      // The exec call should go through the toolbox proxy
      const execCall = fetchCalls.find((c) => c.url.includes('/process/execute'));
      expect(execCall).toBeTruthy();
      expect(execCall!.url).toContain('proxy.test/toolbox');
      expect(execCall!.method).toBe('POST');
    });

    test('returns false when command fails', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);

      // Exec without create — falls back to default proxy
      fetchResponses.push({
        status: 200,
        body: { exitCode: 1, result: 'command not found' },
      });

      const [ok, output] = await provider.exec('ws-001', 'bad-cmd');
      expect(ok).toBe(false);
      expect(output).toBe('command not found');
    });
  });

  describe('isRunning', () => {
    test('returns true for started sandbox', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);
      fetchResponses.push({ status: 200, body: { id: 'ws-001', state: 'started' } });
      expect(await provider.isRunning('ws-001')).toBe(true);
    });

    test('returns false for stopped sandbox', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);
      fetchResponses.push({ status: 200, body: { id: 'ws-001', state: 'stopped' } });
      expect(await provider.isRunning('ws-001')).toBe(false);
    });

    test('returns false on network error', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);
      fetchResponses.push({ status: 500, body: 'Error' });
      expect(await provider.isRunning('ws-001')).toBe(false);
    });
  });

  describe('stopAndRemove', () => {
    test('sends DELETE to sandbox endpoint', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);
      fetchResponses.push({ status: 200, body: {} });
      await provider.stopAndRemove('ws-001');
      expect(fetchCalls[0].url).toContain('/sandbox/ws-001');
      expect(fetchCalls[0].method).toBe('DELETE');
    });
  });

  describe('listManaged', () => {
    test('returns sandboxes filtered by label', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);
      fetchResponses.push({
        status: 200,
        body: [
          { id: 'ws-001', state: 'started' },
          { id: 'ws-002', state: 'stopped' },
        ],
      });
      const list = await provider.listManaged();
      expect(list.length).toBe(2);
      expect(list[0].running).toBe(true);
      expect(list[1].running).toBe(false);
    });

    test('returns empty array on API error', async () => {
      const provider = new DaytonaProvider(DAYTONA_CONFIG);
      fetchResponses.push({ status: 500, body: 'Error' });
      expect(await provider.listManaged()).toEqual([]);
    });
  });
});
