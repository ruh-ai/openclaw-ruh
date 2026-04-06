import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (client: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

const evalResultStore = await import('../../src/evalResultStore');

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('evalResultStore.createEvalResult', () => {
  test('inserts serialized tasks and loop state, then returns a normalized record', async () => {
    mockQuery.mockImplementationOnce(async () => ({
      rows: [{
        id: 'eval-1',
        agent_id: 'agent-1',
        sandbox_id: 'sandbox-1',
        mode: 'reinforcement',
        tasks: JSON.stringify([{ name: 'Check tone' }]),
        loop_state: JSON.stringify({ iteration: 2 }),
        pass_rate: '0.75',
        avg_score: '0.9',
        total_tasks: '4',
        passed_tasks: '3',
        failed_tasks: '1',
        iterations: '2',
        stop_reason: 'score_threshold',
        created_at: '2026-04-03T00:00:00.000Z',
      }],
      rowCount: 1,
    }));

    const result = await evalResultStore.createEvalResult({
      agent_id: 'agent-1',
      sandbox_id: 'sandbox-1',
      mode: 'reinforcement',
      tasks: [{ name: 'Check tone' }],
      loop_state: { iteration: 2 },
      pass_rate: 0.75,
      avg_score: 0.9,
      total_tasks: 4,
      passed_tasks: 3,
      failed_tasks: 1,
      iterations: 2,
      stop_reason: 'score_threshold',
    });

    expect(result).toEqual({
      id: 'eval-1',
      agent_id: 'agent-1',
      sandbox_id: 'sandbox-1',
      mode: 'reinforcement',
      tasks: [{ name: 'Check tone' }],
      loop_state: { iteration: 2 },
      pass_rate: 0.75,
      avg_score: 0.9,
      total_tasks: 4,
      passed_tasks: 3,
      failed_tasks: 1,
      iterations: 2,
      stop_reason: 'score_threshold',
      created_at: '2026-04-03T00:00:00.000Z',
    });

    const insertCall = mockQuery.mock.calls[0];
    expect(String(insertCall?.[0])).toContain('INSERT INTO eval_results');
    expect(insertCall?.[1]?.[1]).toBe('agent-1');
    expect(insertCall?.[1]?.[4]).toBe(JSON.stringify([{ name: 'Check tone' }]));
    expect(insertCall?.[1]?.[5]).toBe(JSON.stringify({ iteration: 2 }));
  });

  test('defaults nullable fields when sandbox_id, loop_state, iterations, and stop_reason are omitted', async () => {
    mockQuery.mockImplementationOnce(async () => ({
      rows: [{
        id: 'eval-2',
        agent_id: 'agent-2',
        sandbox_id: null,
        mode: 'single_pass',
        tasks: [],
        loop_state: null,
        pass_rate: 1,
        avg_score: 0.5,
        total_tasks: 1,
        passed_tasks: 1,
        failed_tasks: 0,
        iterations: null,
        stop_reason: null,
        created_at: '2026-04-03T01:00:00.000Z',
      }],
      rowCount: 1,
    }));

    const result = await evalResultStore.createEvalResult({
      agent_id: 'agent-2',
      mode: 'single_pass',
      tasks: [],
      pass_rate: 1,
      avg_score: 0.5,
      total_tasks: 1,
      passed_tasks: 1,
      failed_tasks: 0,
    });

    expect(result).toEqual(expect.objectContaining({
      sandbox_id: null,
      loop_state: null,
      iterations: 1,
      stop_reason: null,
    }));

    const insertCall = mockQuery.mock.calls[0];
    expect(insertCall?.[1]?.[2]).toBeNull();
    expect(insertCall?.[1]?.[5]).toBeNull();
    expect(insertCall?.[1]?.[11]).toBe(1);
    expect(insertCall?.[1]?.[12]).toBeNull();
  });
});

describe('evalResultStore query helpers', () => {
  test('getEvalResult returns null when no row exists', async () => {
    mockQuery.mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }));

    expect(await evalResultStore.getEvalResult('missing')).toBeNull();
  });

  test('getEvalResult parses JSON string fields when present', async () => {
    mockQuery.mockImplementationOnce(async () => ({
      rows: [{
        id: 'eval-3',
        agent_id: 'agent-3',
        sandbox_id: null,
        mode: 'single_pass',
        tasks: JSON.stringify([{ id: 1 }]),
        loop_state: JSON.stringify({ stage: 'review' }),
        pass_rate: '0',
        avg_score: '0',
        total_tasks: '0',
        passed_tasks: '0',
        failed_tasks: '0',
        iterations: '0',
        stop_reason: null,
        created_at: '2026-04-03T02:00:00.000Z',
      }],
      rowCount: 1,
    }));

    expect(await evalResultStore.getEvalResult('eval-3')).toEqual({
      id: 'eval-3',
      agent_id: 'agent-3',
      sandbox_id: null,
      mode: 'single_pass',
      tasks: [{ id: 1 }],
      loop_state: { stage: 'review' },
      pass_rate: 0,
      avg_score: 0,
      total_tasks: 0,
      passed_tasks: 0,
      failed_tasks: 0,
      iterations: 1,
      stop_reason: null,
      created_at: '2026-04-03T02:00:00.000Z',
    });
  });

  test('listEvalResults applies default pagination and returns normalized rows', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({ rows: [{ count: '2' }], rowCount: 1 }))
      .mockImplementationOnce(async () => ({
        rows: [{
          id: 'eval-4',
          agent_id: 'agent-4',
          sandbox_id: 'sandbox-4',
          mode: 'single_pass',
          tasks: [{ name: 'One' }],
          loop_state: null,
          pass_rate: 1,
          avg_score: 0.9,
          total_tasks: 1,
          passed_tasks: 1,
          failed_tasks: 0,
          iterations: 1,
          stop_reason: null,
          created_at: '2026-04-03T03:00:00.000Z',
        }],
        rowCount: 1,
      }));

    const result = await evalResultStore.listEvalResults('agent-4');

    expect(result).toEqual({
      items: [{
        id: 'eval-4',
        agent_id: 'agent-4',
        sandbox_id: 'sandbox-4',
        mode: 'single_pass',
        tasks: [{ name: 'One' }],
        loop_state: null,
        pass_rate: 1,
        avg_score: 0.9,
        total_tasks: 1,
        passed_tasks: 1,
        failed_tasks: 0,
        iterations: 1,
        stop_reason: null,
        created_at: '2026-04-03T03:00:00.000Z',
      }],
      total: 2,
    });

    expect(mockQuery.mock.calls[1]?.[1]).toEqual(['agent-4', 20, 0]);
  });

  test('listEvalResults accepts explicit limit and offset values', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({ rows: [{ count: '0' }], rowCount: 1 }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }));

    await evalResultStore.listEvalResults('agent-5', { limit: 5, offset: 10 });

    expect(mockQuery.mock.calls[1]?.[1]).toEqual(['agent-5', 5, 10]);
  });

  test('deleteEvalResult returns true only when a row was removed', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 1 }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }));

    expect(await evalResultStore.deleteEvalResult('eval-6')).toBe(true);
    expect(await evalResultStore.deleteEvalResult('eval-7')).toBe(false);
  });
});
