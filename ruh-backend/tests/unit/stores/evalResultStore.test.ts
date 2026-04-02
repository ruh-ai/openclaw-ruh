/**
 * Unit tests for src/evalResultStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as evalResultStore from '../../../src/evalResultStore';

// ─────────────────────────────────────────────────────────────────────────────

function makeEvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'eval-test-uuid',
    agent_id: 'agent-123',
    sandbox_id: 'sandbox-456',
    mode: 'single',
    tasks: [{ name: 'task1', passed: true }],
    loop_state: null,
    pass_rate: 0.85,
    avg_score: 0.9,
    total_tasks: 10,
    passed_tasks: 8,
    failed_tasks: 2,
    iterations: 1,
    stop_reason: null,
    created_at: new Date('2025-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── createEvalResult ─────────────────────────────────────────────────────────

describe('evalResultStore.createEvalResult', () => {
  test('inserts eval result and returns serialized record', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeEvalRow()],
      rowCount: 1,
    }));

    const result = await evalResultStore.createEvalResult({
      agent_id: 'agent-123',
      mode: 'single',
      tasks: [{ name: 'task1', passed: true }],
      pass_rate: 0.85,
      avg_score: 0.9,
      total_tasks: 10,
      passed_tasks: 8,
      failed_tasks: 2,
    });
    expect(result.agent_id).toBe('agent-123');
    expect(result.mode).toBe('single');
    expect(result.pass_rate).toBe(0.85);
    expect(result.total_tasks).toBe(10);
  });

  test('JSON.stringifies tasks parameter', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeEvalRow()],
      rowCount: 1,
    }));

    const tasks = [{ name: 'task1', passed: true }];
    await evalResultStore.createEvalResult({
      agent_id: 'agent-123',
      mode: 'single',
      tasks,
      pass_rate: 1,
      avg_score: 1,
      total_tasks: 1,
      passed_tasks: 1,
      failed_tasks: 0,
    });
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe(JSON.stringify(tasks));
  });

  test('JSON.stringifies loop_state when provided', async () => {
    const loopState = { iteration: 3, best_score: 0.9 };
    mockQuery.mockImplementation(async () => ({
      rows: [makeEvalRow({ loop_state: loopState })],
      rowCount: 1,
    }));

    await evalResultStore.createEvalResult({
      agent_id: 'agent-123',
      mode: 'loop',
      tasks: [],
      loop_state: loopState,
      pass_rate: 0.9,
      avg_score: 0.9,
      total_tasks: 5,
      passed_tasks: 4,
      failed_tasks: 1,
    });
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[5]).toBe(JSON.stringify(loopState));
  });

  test('defaults sandbox_id to null', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeEvalRow({ sandbox_id: null })],
      rowCount: 1,
    }));

    await evalResultStore.createEvalResult({
      agent_id: 'agent-123',
      mode: 'single',
      tasks: [],
      pass_rate: 0,
      avg_score: 0,
      total_tasks: 0,
      passed_tasks: 0,
      failed_tasks: 0,
    });
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull();
  });

  test('defaults iterations to 1 and stop_reason to null', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeEvalRow()],
      rowCount: 1,
    }));

    await evalResultStore.createEvalResult({
      agent_id: 'agent-123',
      mode: 'single',
      tasks: [],
      pass_rate: 0,
      avg_score: 0,
      total_tasks: 0,
      passed_tasks: 0,
      failed_tasks: 0,
    });
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[11]).toBe(1);   // iterations
    expect(params[12]).toBeNull(); // stop_reason
  });
});

// ── getEvalResult ────────────────────────────────────────────────────────────

describe('evalResultStore.getEvalResult', () => {
  test('returns deserialized result when found', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeEvalRow()],
      rowCount: 1,
    }));

    const result = await evalResultStore.getEvalResult('eval-test-uuid');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('eval-test-uuid');
    expect(result!.tasks).toEqual([{ name: 'task1', passed: true }]);
  });

  test('returns null when not found', async () => {
    const result = await evalResultStore.getEvalResult('nonexistent');
    expect(result).toBeNull();
  });

  test('parses string-typed tasks JSON', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeEvalRow({ tasks: JSON.stringify([{ name: 'parsed' }]) })],
      rowCount: 1,
    }));

    const result = await evalResultStore.getEvalResult('eval-1');
    expect(result!.tasks).toEqual([{ name: 'parsed' }]);
  });

  test('parses string-typed loop_state JSON', async () => {
    const loopState = { iteration: 2 };
    mockQuery.mockImplementation(async () => ({
      rows: [makeEvalRow({ loop_state: JSON.stringify(loopState) })],
      rowCount: 1,
    }));

    const result = await evalResultStore.getEvalResult('eval-1');
    expect(result!.loop_state).toEqual(loopState);
  });
});

// ── listEvalResults ──────────────────────────────────────────────────────────

describe('evalResultStore.listEvalResults', () => {
  test('returns items and total', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT')) return { rows: [{ count: '3' }], rowCount: 1 };
      return { rows: [makeEvalRow(), makeEvalRow({ id: 'eval-2' })], rowCount: 2 };
    });

    const result = await evalResultStore.listEvalResults('agent-123', { limit: 2 });
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(2);
  });

  test('uses default limit 20 and offset 0', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT')) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await evalResultStore.listEvalResults('agent-123');
    const selectParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(selectParams[1]).toBe(20); // limit
    expect(selectParams[2]).toBe(0);  // offset
  });

  test('filters by agent_id', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT')) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await evalResultStore.listEvalResults('agent-xyz');
    const countParams = mockQuery.mock.calls[0][1] as unknown[];
    expect(countParams[0]).toBe('agent-xyz');
  });
});

// ── deleteEvalResult ─────────────────────────────────────────────────────────

describe('evalResultStore.deleteEvalResult', () => {
  test('returns true when deleted', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 1 }));

    const result = await evalResultStore.deleteEvalResult('eval-1');
    expect(result).toBe(true);
  });

  test('returns false when not found', async () => {
    const result = await evalResultStore.deleteEvalResult('nonexistent');
    expect(result).toBe(false);
  });
});
