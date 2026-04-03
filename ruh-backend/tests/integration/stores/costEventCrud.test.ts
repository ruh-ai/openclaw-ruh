/**
 * Integration tests for cost event and budget policy store — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as costStore from '../../../src/costStore';
import * as agentStore from '../../../src/agentStore';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

async function createTestAgent() {
  return agentStore.saveAgent({ name: 'Cost Test Agent', avatar: '💰' });
}

describe('Cost Event CRUD (integration)', () => {
  test('create cost event and verify fields', async () => {
    const agent = await createTestAgent();
    const event = await costStore.createCostEvent({
      agent_id: agent.id,
      model: 'gpt-4o',
      input_tokens: 1000,
      output_tokens: 500,
      cost_cents: 3.5,
    });

    expect(event.id).toBeTruthy();
    expect(event.agent_id).toBe(agent.id);
    expect(event.model).toBe('gpt-4o');
    expect(event.input_tokens).toBe(1000);
    expect(event.output_tokens).toBe(500);
    expect(Number(event.cost_cents)).toBeCloseTo(3.5, 1);
    expect(event.worker_id).toBeNull();
  });

  test('create cost event with worker and run IDs', async () => {
    const agent = await createTestAgent();
    const event = await costStore.createCostEvent({
      agent_id: agent.id,
      worker_id: '11111111-1111-1111-1111-111111111111',
      task_id: 'task-1',
      run_id: 'run-1',
      model: 'claude-3',
      input_tokens: 200,
      output_tokens: 100,
      cost_cents: 1.2,
    });

    expect(event.worker_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(event.task_id).toBe('task-1');
    expect(event.run_id).toBe('run-1');
  });

  test('list cost events for agent', async () => {
    const agent = await createTestAgent();
    for (let i = 0; i < 3; i++) {
      await costStore.createCostEvent({
        agent_id: agent.id,
        model: 'gpt-4o',
        input_tokens: 100 * (i + 1),
        output_tokens: 50,
        cost_cents: i + 1,
      });
    }

    const result = await costStore.listCostEvents(agent.id);
    expect(result.items).toHaveLength(3);
    expect(result.has_more).toBe(false);
  });

  test('list cost events with run_id filter', async () => {
    const agent = await createTestAgent();
    await costStore.createCostEvent({
      agent_id: agent.id, run_id: 'run-A', model: 'gpt-4o',
      input_tokens: 100, output_tokens: 50, cost_cents: 1,
    });
    await costStore.createCostEvent({
      agent_id: agent.id, run_id: 'run-B', model: 'gpt-4o',
      input_tokens: 200, output_tokens: 100, cost_cents: 2,
    });

    const result = await costStore.listCostEvents(agent.id, { run_id: 'run-A' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].run_id).toBe('run-A');
  });

  test('list cost events has_more with pagination', async () => {
    const agent = await createTestAgent();
    for (let i = 0; i < 5; i++) {
      await costStore.createCostEvent({
        agent_id: agent.id, model: 'gpt-4o',
        input_tokens: 100, output_tokens: 50, cost_cents: 1,
      });
    }

    const result = await costStore.listCostEvents(agent.id, { limit: 3 });
    expect(result.items).toHaveLength(3);
    expect(result.has_more).toBe(true);
  });

  test('agent isolation — events from different agents', async () => {
    const agent1 = await createTestAgent();
    const agent2 = await agentStore.saveAgent({ name: 'Agent 2' });

    await costStore.createCostEvent({
      agent_id: agent1.id, model: 'gpt-4o',
      input_tokens: 100, output_tokens: 50, cost_cents: 1,
    });
    await costStore.createCostEvent({
      agent_id: agent2.id, model: 'gpt-4o',
      input_tokens: 200, output_tokens: 100, cost_cents: 2,
    });

    const result1 = await costStore.listCostEvents(agent1.id);
    expect(result1.items).toHaveLength(1);
  });
});

describe('Monthly Summary (integration)', () => {
  test('aggregates costs for current month', async () => {
    const agent = await createTestAgent();
    await costStore.createCostEvent({
      agent_id: agent.id, model: 'gpt-4o',
      input_tokens: 1000, output_tokens: 500, cost_cents: 5,
    });
    await costStore.createCostEvent({
      agent_id: agent.id, model: 'claude-3',
      input_tokens: 2000, output_tokens: 1000, cost_cents: 10,
    });

    const summary = await costStore.getMonthlySummary(agent.id);
    expect(summary.agent_id).toBe(agent.id);
    expect(summary.total_cost_cents).toBe(15);
    expect(summary.total_input_tokens).toBe(3000);
    expect(summary.total_output_tokens).toBe(1500);
    expect(summary.event_count).toBe(2);
  });

  test('returns zeroes when no events', async () => {
    const agent = await createTestAgent();
    const summary = await costStore.getMonthlySummary(agent.id);
    expect(summary.total_cost_cents).toBe(0);
    expect(summary.event_count).toBe(0);
  });
});

describe('Budget Policy (integration)', () => {
  test('upsert creates budget policy', async () => {
    const agent = await createTestAgent();
    const policy = await costStore.upsertBudgetPolicy({
      agent_id: agent.id,
      monthly_cap_cents: 10000,
    });

    expect(policy.id).toBeTruthy();
    expect(policy.agent_id).toBe(agent.id);
    expect(policy.monthly_cap_cents).toBe(10000);
    expect(policy.soft_warning_pct).toBe(80);
    expect(policy.hard_stop).toBe(true);
  });

  test('upsert updates existing policy', async () => {
    const agent = await createTestAgent();
    await costStore.upsertBudgetPolicy({
      agent_id: agent.id,
      monthly_cap_cents: 5000,
    });

    const updated = await costStore.upsertBudgetPolicy({
      agent_id: agent.id,
      monthly_cap_cents: 20000,
      soft_warning_pct: 90,
      hard_stop: false,
    });

    expect(updated.monthly_cap_cents).toBe(20000);
    expect(updated.soft_warning_pct).toBe(90);
    expect(updated.hard_stop).toBe(false);
  });

  test('get budget policy', async () => {
    const agent = await createTestAgent();
    await costStore.upsertBudgetPolicy({
      agent_id: agent.id,
      monthly_cap_cents: 10000,
    });

    const policy = await costStore.getBudgetPolicy(agent.id);
    expect(policy).not.toBeNull();
    expect(policy!.monthly_cap_cents).toBe(10000);
  });

  test('get budget policy returns null when none set', async () => {
    const agent = await createTestAgent();
    const policy = await costStore.getBudgetPolicy(agent.id);
    expect(policy).toBeNull();
  });

  test('worker-specific budget policy', async () => {
    const agent = await createTestAgent();
    await costStore.upsertBudgetPolicy({
      agent_id: agent.id,
      monthly_cap_cents: 10000,
    });
    await costStore.upsertBudgetPolicy({
      agent_id: agent.id,
      worker_id: '11111111-1111-1111-1111-111111111111',
      monthly_cap_cents: 3000,
    });

    const agentPolicy = await costStore.getBudgetPolicy(agent.id);
    const workerPolicy = await costStore.getBudgetPolicy(agent.id, '11111111-1111-1111-1111-111111111111');

    expect(agentPolicy!.monthly_cap_cents).toBe(10000);
    expect(workerPolicy!.monthly_cap_cents).toBe(3000);
  });
});

describe('Budget Status (integration)', () => {
  test('computes utilization percentage', async () => {
    const agent = await createTestAgent();
    await costStore.upsertBudgetPolicy({
      agent_id: agent.id,
      monthly_cap_cents: 10000,
      soft_warning_pct: 80,
    });
    // Spend 5000 cents (50%)
    await costStore.createCostEvent({
      agent_id: agent.id, model: 'gpt-4o',
      input_tokens: 50000, output_tokens: 25000, cost_cents: 5000,
    });

    const status = await costStore.getBudgetStatus(agent.id);
    expect(status.spent_cents).toBe(5000);
    expect(status.cap_cents).toBe(10000);
    expect(status.utilization_pct).toBe(50);
    expect(status.at_soft_warning).toBe(false);
    expect(status.at_hard_stop).toBe(false);
  });

  test('triggers soft warning', async () => {
    const agent = await createTestAgent();
    await costStore.upsertBudgetPolicy({
      agent_id: agent.id,
      monthly_cap_cents: 1000,
      soft_warning_pct: 80,
    });
    await costStore.createCostEvent({
      agent_id: agent.id, model: 'gpt-4o',
      input_tokens: 1000, output_tokens: 500, cost_cents: 850,
    });

    const status = await costStore.getBudgetStatus(agent.id);
    expect(status.at_soft_warning).toBe(true);
    expect(status.at_hard_stop).toBe(false);
  });

  test('triggers hard stop', async () => {
    const agent = await createTestAgent();
    await costStore.upsertBudgetPolicy({
      agent_id: agent.id,
      monthly_cap_cents: 1000,
      hard_stop: true,
    });
    await costStore.createCostEvent({
      agent_id: agent.id, model: 'gpt-4o',
      input_tokens: 1000, output_tokens: 500, cost_cents: 1100,
    });

    const status = await costStore.getBudgetStatus(agent.id);
    expect(status.at_hard_stop).toBe(true);
  });

  test('no policy returns zero cap and no warnings', async () => {
    const agent = await createTestAgent();
    const status = await costStore.getBudgetStatus(agent.id);
    expect(status.policy).toBeNull();
    expect(status.cap_cents).toBe(0);
    expect(status.utilization_pct).toBe(0);
    expect(status.at_soft_warning).toBe(false);
    expect(status.at_hard_stop).toBe(false);
  });
});
