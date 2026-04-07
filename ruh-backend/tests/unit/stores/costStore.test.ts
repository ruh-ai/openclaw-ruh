import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { mockQuery, mockClient } from '../../helpers/mockDb';

import * as costStore from '../../../src/costStore';

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ---------------------------------------------------------------------------
// createCostEvent
// ---------------------------------------------------------------------------

describe('costStore.createCostEvent', () => {
  test('inserts a cost event and returns serialized row', async () => {
    const now = new Date('2026-03-30T10:00:00Z');
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'ce-1',
        agent_id: 'agent-1',
        worker_id: null,
        task_id: 'task-001',
        run_id: 'run-abc',
        model: 'claude-sonnet-4-6',
        input_tokens: 1000,
        output_tokens: 500,
        cost_cents: '0.3500',
        created_at: now,
      }],
      rowCount: 1,
    }));

    const event = await costStore.createCostEvent({
      agent_id: 'agent-1',
      task_id: 'task-001',
      run_id: 'run-abc',
      model: 'claude-sonnet-4-6',
      input_tokens: 1000,
      output_tokens: 500,
      cost_cents: 0.35,
    });

    expect(event.agent_id).toBe('agent-1');
    expect(event.model).toBe('claude-sonnet-4-6');
    expect(event.input_tokens).toBe(1000);
    expect(event.output_tokens).toBe(500);
    expect(event.cost_cents).toBe('0.3500');
    expect(event.worker_id).toBeNull();
    expect(typeof event.created_at).toBe('string');

    const insertCall = mockQuery.mock.calls.find(c =>
      String(c[0]).includes('INSERT INTO cost_events'),
    );
    expect(insertCall).toBeDefined();
  });

  test('passes worker_id when provided', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'ce-2', agent_id: 'a', worker_id: 'w-1', task_id: null, run_id: null,
        model: 'gpt-4o', input_tokens: 100, output_tokens: 50, cost_cents: '0.0100',
        created_at: new Date(),
      }],
      rowCount: 1,
    }));

    const event = await costStore.createCostEvent({
      agent_id: 'a',
      worker_id: 'w-1',
      model: 'gpt-4o',
      input_tokens: 100,
      output_tokens: 50,
      cost_cents: 0.01,
    });

    expect(event.worker_id).toBe('w-1');
  });
});

// ---------------------------------------------------------------------------
// listCostEvents
// ---------------------------------------------------------------------------

describe('costStore.listCostEvents', () => {
  test('returns paginated items with has_more=false when under limit', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'ce-1', agent_id: 'a', worker_id: null, task_id: null, run_id: null,
        model: 'claude-sonnet-4-6', input_tokens: 100, output_tokens: 50,
        cost_cents: '0.0500', created_at: new Date(),
      }],
      rowCount: 1,
    }));

    const result = await costStore.listCostEvents('a', { limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.has_more).toBe(false);
  });

  test('sets has_more=true when result exceeds limit', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `ce-${i}`, agent_id: 'a', worker_id: null, task_id: null, run_id: null,
      model: 'm', input_tokens: 1, output_tokens: 1, cost_cents: '0.0001',
      created_at: new Date(),
    }));
    mockQuery.mockImplementation(async () => ({ rows, rowCount: 3 }));

    const result = await costStore.listCostEvents('a', { limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.has_more).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getMonthlySummary
// ---------------------------------------------------------------------------

describe('costStore.getMonthlySummary', () => {
  test('returns zero-sum summary when no events', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));

    const summary = await costStore.getMonthlySummary('agent-1', '2026-03');
    expect(summary.total_cost_cents).toBe(0);
    expect(summary.event_count).toBe(0);
    expect(summary.month).toBe('2026-03');
    expect(summary.agent_id).toBe('agent-1');
  });

  test('returns aggregated data when events exist', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        agent_id: 'agent-1',
        month: '2026-03',
        total_cost_cents: '1.5000',
        total_input_tokens: '5000',
        total_output_tokens: '2500',
        event_count: '10',
      }],
      rowCount: 1,
    }));

    const summary = await costStore.getMonthlySummary('agent-1', '2026-03');
    expect(summary.total_cost_cents).toBe(1.5);
    expect(summary.total_input_tokens).toBe(5000);
    expect(summary.event_count).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// upsertBudgetPolicy
// ---------------------------------------------------------------------------

describe('costStore.upsertBudgetPolicy', () => {
  test('inserts a budget policy with defaults', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'bp-1', agent_id: 'a', worker_id: null,
        monthly_cap_cents: 5000, soft_warning_pct: 80, hard_stop: true,
        created_at: new Date(),
      }],
      rowCount: 1,
    }));

    const policy = await costStore.upsertBudgetPolicy({
      agent_id: 'a',
      monthly_cap_cents: 5000,
    });

    expect(policy.monthly_cap_cents).toBe(5000);
    expect(policy.soft_warning_pct).toBe(80);
    expect(policy.hard_stop).toBe(true);
    expect(policy.worker_id).toBeNull();

    const upsertCall = mockQuery.mock.calls.find(c =>
      String(c[0]).includes('INSERT INTO budget_policies'),
    );
    expect(upsertCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getBudgetPolicy
// ---------------------------------------------------------------------------

describe('costStore.getBudgetPolicy', () => {
  test('returns null when no policy exists', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const policy = await costStore.getBudgetPolicy('agent-1');
    expect(policy).toBeNull();
  });

  test('returns policy when it exists', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'bp-1', agent_id: 'a', worker_id: null,
        monthly_cap_cents: 10000, soft_warning_pct: 75, hard_stop: false,
        created_at: new Date(),
      }],
      rowCount: 1,
    }));

    const policy = await costStore.getBudgetPolicy('a');
    expect(policy?.monthly_cap_cents).toBe(10000);
    expect(policy?.hard_stop).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBudgetStatus
// ---------------------------------------------------------------------------

describe('costStore.getBudgetStatus', () => {
  test('returns at_hard_stop=true when spent >= cap and hard_stop is enabled', async () => {
    // First call: getBudgetPolicy
    // Second call: getMonthlySummary (no rows → uses default 0)
    let callCount = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      callCount++;
      if (String(sql).includes('budget_policies')) {
        return {
          rows: [{
            id: 'bp-1', agent_id: 'a', worker_id: null,
            monthly_cap_cents: 100, soft_warning_pct: 80, hard_stop: true,
            created_at: new Date(),
          }],
          rowCount: 1,
        };
      }
      if (String(sql).includes('cost_cents')) {
        return {
          rows: [{
            agent_id: 'a', month: '2026-03',
            total_cost_cents: '100.0000',
            total_input_tokens: '1000',
            total_output_tokens: '500',
            event_count: '5',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const status = await costStore.getBudgetStatus('a');
    expect(status.at_hard_stop).toBe(true);
    expect(status.at_soft_warning).toBe(true);
    expect(status.utilization_pct).toBe(100);
  });

  test('returns at_hard_stop=false when no policy set', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));

    const status = await costStore.getBudgetStatus('a');
    expect(status.at_hard_stop).toBe(false);
    expect(status.policy).toBeNull();
    expect(status.cap_cents).toBe(0);
  });
});
