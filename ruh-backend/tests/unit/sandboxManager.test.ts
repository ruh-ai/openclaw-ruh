/**
 * Unit tests for src/sandboxManager.ts — mocks Daytona SDK and Bun.sleep.
 */

import { describe, expect, test, mock, beforeEach, spyOn } from 'bun:test';
import { makeMockSandbox, makeMockDaytona } from '../helpers/mockDaytona';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSb = makeMockSandbox('sb-001');

mock.module('@daytonaio/sdk', () => ({
  Daytona: mock(() => makeMockDaytona(mockSb)),
}));

// Mock Bun.sleep to a no-op so tests run fast
spyOn(Bun, 'sleep').mockImplementation(async () => {});

import { createOpenclawSandbox } from '../../src/sandboxManager';

// ─────────────────────────────────────────────────────────────────────────────

const BASE_OPTS = {
  daytonaApiKey: 'test-daytona-key',
  sandboxName: 'test-sandbox',
};

/** Collect all events from the generator. */
async function collectEvents(opts: typeof BASE_OPTS & Record<string, string>) {
  const events: Array<[string, unknown]> = [];
  for await (const event of createOpenclawSandbox(opts)) {
    events.push(event);
  }
  return events;
}

beforeEach(() => {
  // Reset call log and queue
  mockSb.process.calls.length = 0;
  (mockSb.process as { queue: unknown[] }).queue = [];

  // Default: all commands succeed
  mockSb.process.defaultResult = { exitCode: 0, result: 'ok' };

  // Use commandMatcher so the approval polling loop terminates immediately:
  // when the sandbox runs `openclaw devices approve --latest`, return "Approved"
  mockSb.process.commandMatcher = (cmd: string) => {
    if (cmd.includes('devices approve')) return { exitCode: 0, result: 'Approved DEVICE001' };
    return undefined;
  };
});

describe('createOpenclawSandbox', () => {
  test('yields log events during creation', async () => {
    const events = await collectEvents(BASE_OPTS);
    const logMessages = events
      .filter(([t]) => t === 'log')
      .map(([, d]) => d as string);

    expect(logMessages.length).toBeGreaterThan(0);
    expect(logMessages.some((m) => m.includes('Creating sandbox'))).toBe(true);
  });

  test('yields result event with sandbox data', async () => {
    const events = await collectEvents(BASE_OPTS);
    const resultEvents = events.filter(([t]) => t === 'result');
    expect(resultEvents.length).toBe(1);

    const data = resultEvents[0][1] as Record<string, unknown>;
    expect(data['sandbox_id']).toBe('sb-001');
    expect(data['gateway_port']).toBe(18789);
    expect(data['ssh_command']).toContain('sb-001');
  });

  test('yields approved event with device approval message', async () => {
    const events = await collectEvents(BASE_OPTS);
    const approvedEvents = events.filter(([t]) => t === 'approved');
    expect(approvedEvents.length).toBeGreaterThan(0);
    const data = approvedEvents[0][1] as Record<string, unknown>;
    expect(String(data['message'])).toContain('Approved');
  });

  test('yields error event when npm install fails (both attempts)', async () => {
    // Both npm install and npm install --unsafe-perm fail
    mockSb.process.defaultResult = { exitCode: 1, result: 'ERESOLVE' };
    // No commandMatcher needed — we want error before approval loop

    const events = await collectEvents(BASE_OPTS);
    const errorEvents = events.filter(([t]) => t === 'error');
    expect(errorEvents.length).toBe(1);
    expect(String(errorEvents[0][1])).toContain('installation failed');
  });

  test('yields error when openclaw --version fails after install', async () => {
    // npm install succeeds, but version check fails
    mockSb.process.commandMatcher = (cmd: string) => {
      if (cmd.includes('npm install') && !cmd.includes('unsafe-perm')) return { exitCode: 0, result: 'added 1 package' };
      if (cmd.includes('--version')) return { exitCode: 1, result: '' };
      if (cmd.includes('devices approve')) return { exitCode: 0, result: 'Approved X' };
      return undefined;
    };

    const events = await collectEvents(BASE_OPTS);
    expect(events.some(([t]) => t === 'error')).toBe(true);
  });

  test('yields error when onboarding fails', async () => {
    mockSb.process.commandMatcher = (cmd: string) => {
      if (cmd.includes('openclaw onboard')) return { exitCode: 1, result: 'onboard failed' };
      if (cmd.includes('devices approve')) return { exitCode: 0, result: 'Approved X' };
      return undefined;
    };

    const events = await collectEvents(BASE_OPTS);
    const errorEvents = events.filter(([t]) => t === 'error');
    expect(errorEvents.length).toBe(1);
    expect(String(errorEvents[0][1])).toContain('Onboarding failed');
  });

  test('forwards ANTHROPIC_API_KEY and OPENAI_API_KEY as log events', async () => {
    const events = await collectEvents({
      ...BASE_OPTS,
      anthropicApiKey: 'sk-ant-test',
      openaiApiKey: 'sk-oai-test',
    });
    const logMessages = events.filter(([t]) => t === 'log').map(([, d]) => d as string);
    expect(logMessages.some((m) => m.includes('ANTHROPIC_API_KEY'))).toBe(true);
    expect(logMessages.some((m) => m.includes('OPENAI_API_KEY'))).toBe(true);
  });

  test('logs OpenRouter as LLM provider when openrouterApiKey provided', async () => {
    const events = await collectEvents({ ...BASE_OPTS, openrouterApiKey: 'or-test-key' });
    const logMessages = events.filter(([t]) => t === 'log').map(([, d]) => d as string);
    expect(logMessages.some((m) => m.toLowerCase().includes('openrouter'))).toBe(true);
  });

  test('logs Anthropic as LLM provider when only anthropicApiKey provided', async () => {
    const events = await collectEvents({ ...BASE_OPTS, anthropicApiKey: 'sk-ant-key' });
    const logMessages = events.filter(([t]) => t === 'log').map(([, d]) => d as string);
    expect(logMessages.some((m) => m.includes('Anthropic'))).toBe(true);
  });

  test('logs skip when no API key provided', async () => {
    const events = await collectEvents(BASE_OPTS);
    const logMessages = events.filter(([t]) => t === 'log').map(([, d]) => d as string);
    expect(logMessages.some((m) => m.toLowerCase().includes('skip'))).toBe(true);
  });

  test('result includes preview URL from getPreviewLink', async () => {
    const events = await collectEvents(BASE_OPTS);
    const resultEvent = events.find(([t]) => t === 'result');
    expect(resultEvent).toBeDefined();
    const data = resultEvent![1] as Record<string, unknown>;
    expect(typeof data['dashboard_url']).toBe('string');
    expect(String(data['dashboard_url'])).toContain('sb-001');
  });

  test('no error events on successful happy path', async () => {
    const events = await collectEvents(BASE_OPTS);
    const errorEvents = events.filter(([t]) => t === 'error');
    expect(errorEvents.length).toBe(0);
  });
});
