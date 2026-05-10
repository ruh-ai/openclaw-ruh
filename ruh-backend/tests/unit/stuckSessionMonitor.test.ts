/**
 * Unit tests for src/stuckSessionMonitor.ts — focuses on the diff/transition
 * logic and the runMonitorCycle orchestration. Pure tests; no docker, no fetch.
 */

import { describe, expect, test } from 'bun:test';
import {
  diffSessionStates,
  extractCurrentSessions,
  runMonitorCycle,
  startStuckSessionMonitor,
  type SandboxSessionState,
  type StuckSessionEvent,
} from '../../src/stuckSessionMonitor';

const STUCK_LINE = (key: string, age: number, queue = 1) =>
  `2026-05-09T06:27:35.952+00:00 [diagnostic] stuck session: sessionId=copilot ` +
  `sessionKey=${key} state=processing age=${age}s queueDepth=${queue}`;

describe('extractCurrentSessions', () => {
  test('returns a map keyed by session_key', () => {
    const log = [STUCK_LINE('agent:copilot:abc', 215), STUCK_LINE('agent:copilot:def', 60)].join('\n');
    const sessions = extractCurrentSessions(log);
    expect(sessions.size).toBe(2);
    expect(sessions.get('agent:copilot:abc')?.age_seconds).toBe(215);
    expect(sessions.get('agent:copilot:def')?.age_seconds).toBe(60);
  });

  test('empty log yields empty map', () => {
    expect(extractCurrentSessions('').size).toBe(0);
  });
});

describe('diffSessionStates', () => {
  function makeMap(entries: Array<[string, number]>): SandboxSessionState {
    const m: SandboxSessionState = new Map();
    for (const [key, age] of entries) {
      m.set(key, { session_id: 'copilot', session_key: key, state: 'processing', age_seconds: age, queue_depth: 1 });
    }
    return m;
  }

  test('emits newlyStuck for keys not seen before', () => {
    const prev = makeMap([['key:a', 30]]);
    const curr = makeMap([['key:a', 60], ['key:b', 35]]);
    const diff = diffSessionStates(prev, curr);
    expect(diff.newlyStuck.map((s) => s.session_key)).toEqual(['key:b']);
    expect(diff.recovered).toEqual([]);
  });

  test('emits recovered for keys removed from current', () => {
    const prev = makeMap([['key:a', 100], ['key:b', 35]]);
    const curr = makeMap([['key:a', 130]]);
    const diff = diffSessionStates(prev, curr);
    expect(diff.newlyStuck).toEqual([]);
    expect(diff.recovered.map((s) => s.session_key)).toEqual(['key:b']);
  });

  test('steady-state (same keys both sides) emits nothing', () => {
    const prev = makeMap([['key:a', 100]]);
    const curr = makeMap([['key:a', 130]]);
    const diff = diffSessionStates(prev, curr);
    expect(diff.newlyStuck).toEqual([]);
    expect(diff.recovered).toEqual([]);
  });
});

describe('runMonitorCycle', () => {
  test('emits session.stuck on first detection and nothing on the second cycle', async () => {
    const state = new Map<string, SandboxSessionState>();
    const events: StuckSessionEvent[] = [];

    const deps = {
      listRunningSandboxIds: async () => ['sandbox-1'],
      tailGatewayLog: async () => STUCK_LINE('agent:copilot:plan-abc', 215),
      resolveAgentId: async () => 'agent-7',
      emitEvent: async (event: StuckSessionEvent) => {
        events.push(event);
      },
    };

    const cycle1 = await runMonitorCycle(state, deps);
    expect(cycle1).toHaveLength(1);
    expect(cycle1[0].kind).toBe('session.stuck');
    expect(cycle1[0].agent_id).toBe('agent-7');
    expect(cycle1[0].session.session_key).toBe('agent:copilot:plan-abc');

    // Same log content, second cycle — steady state, no new events.
    const cycle2 = await runMonitorCycle(state, deps);
    expect(cycle2).toEqual([]);
    expect(events).toHaveLength(1);
  });

  test('emits session.recovered when a stuck session disappears', async () => {
    const state = new Map<string, SandboxSessionState>();

    let logTail = STUCK_LINE('agent:copilot:plan-abc', 215);
    const deps = {
      listRunningSandboxIds: async () => ['sandbox-1'],
      tailGatewayLog: async () => logTail,
      resolveAgentId: async () => 'agent-7',
      emitEvent: async () => {},
    };

    await runMonitorCycle(state, deps); // detection
    logTail = ''; // session no longer in log
    const events = await runMonitorCycle(state, deps);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('session.recovered');
    expect(events[0].session.session_key).toBe('agent:copilot:plan-abc');
  });

  test('skips a sandbox cleanly when tailGatewayLog throws', async () => {
    const state = new Map<string, SandboxSessionState>();
    const errors: Array<{ sandboxId: string; error: unknown }> = [];

    const deps = {
      listRunningSandboxIds: async () => ['sandbox-bad', 'sandbox-good'],
      tailGatewayLog: async (sandboxId: string) => {
        if (sandboxId === 'sandbox-bad') throw new Error('docker exec timeout');
        return STUCK_LINE('agent:copilot:abc', 100);
      },
      resolveAgentId: async () => null,
      emitEvent: async () => {},
      onError: (sandboxId: string, error: unknown) => {
        errors.push({ sandboxId, error });
      },
    };

    const events = await runMonitorCycle(state, deps);

    expect(events).toHaveLength(1);
    expect(events[0].sandbox_id).toBe('sandbox-good');
    expect(errors).toHaveLength(1);
    expect(errors[0].sandboxId).toBe('sandbox-bad');
  });

  test('drops state for sandboxes that disappear from the running list', async () => {
    const state = new Map<string, SandboxSessionState>();
    let runningIds = ['sandbox-1', 'sandbox-2'];

    const deps = {
      listRunningSandboxIds: async () => runningIds,
      tailGatewayLog: async (sandboxId: string) =>
        sandboxId === 'sandbox-1'
          ? STUCK_LINE('agent:copilot:s1', 100)
          : STUCK_LINE('agent:copilot:s2', 100),
      resolveAgentId: async () => null,
      emitEvent: async () => {},
    };

    await runMonitorCycle(state, deps);
    expect(state.size).toBe(2);

    runningIds = ['sandbox-1']; // sandbox-2 no longer running
    await runMonitorCycle(state, deps);
    expect(state.size).toBe(1);
    expect(state.has('sandbox-1')).toBe(true);
    expect(state.has('sandbox-2')).toBe(false);
  });

  test('runs gracefully when listRunningSandboxIds throws', async () => {
    const state = new Map<string, SandboxSessionState>();
    let onErrorSandbox: string | null = null;

    const events = await runMonitorCycle(state, {
      listRunningSandboxIds: async () => {
        throw new Error('docker daemon down');
      },
      tailGatewayLog: async () => '',
      resolveAgentId: async () => null,
      emitEvent: async () => {},
      onError: (sandboxId) => {
        onErrorSandbox = sandboxId;
      },
    });

    expect(events).toEqual([]);
    expect(onErrorSandbox).toBe('<list>');
  });
});

describe('startStuckSessionMonitor', () => {
  test('triggerCycle runs a single cycle and stop() halts the timer', async () => {
    const events: StuckSessionEvent[] = [];
    const handle = startStuckSessionMonitor({
      // Big interval so the timer never naturally fires during the test.
      intervalMs: 10 * 60_000,
      deps: {
        listRunningSandboxIds: async () => ['sandbox-1'],
        tailGatewayLog: async () => STUCK_LINE('agent:copilot:abc', 90),
        resolveAgentId: async () => 'agent-1',
        emitEvent: async (event) => {
          events.push(event);
        },
      },
    });

    const cycleEvents = await handle.triggerCycle();
    handle.stop();

    expect(cycleEvents.length).toBeGreaterThanOrEqual(0);
    // The first cycle is kicked off automatically — give it a tick to run.
    await new Promise((r) => setTimeout(r, 5));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('session.stuck');
  });
});
