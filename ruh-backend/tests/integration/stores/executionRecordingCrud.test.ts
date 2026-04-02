/**
 * Integration tests for execution recording store — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as executionStore from '../../../src/executionRecordingStore';
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
  return agentStore.saveAgent({ name: 'Recording Agent', avatar: '📹' });
}

describe('Execution Recording CRUD (integration)', () => {
  test('create and get recording', async () => {
    const agent = await createTestAgent();
    const recording = await executionStore.createExecutionRecording({
      agent_id: agent.id,
      run_id: 'run-001',
      success: true,
      tool_calls: [
        { tool: 'google-ads', action: 'getCampaigns', input: {}, output: { count: 5 }, latency_ms: 120, success: true },
      ],
      tokens_used: { input: 1000, output: 500 },
      skills_applied: ['analyze', 'report'],
      skills_effective: ['analyze'],
    });

    expect(recording.id).toBeTruthy();
    expect(recording.agent_id).toBe(agent.id);
    expect(recording.run_id).toBe('run-001');
    expect(recording.success).toBe(true);

    const fetched = await executionStore.getExecutionRecording('run-001', agent.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.tool_calls).toHaveLength(1);
    expect(fetched!.tool_calls[0].tool).toBe('google-ads');
    expect(fetched!.tokens_used).toEqual({ input: 1000, output: 500 });
    expect(fetched!.skills_applied).toEqual(['analyze', 'report']);
    expect(fetched!.skills_effective).toEqual(['analyze']);
  });

  test('returns null for nonexistent recording', async () => {
    const agent = await createTestAgent();
    const fetched = await executionStore.getExecutionRecording('nonexistent', agent.id);
    expect(fetched).toBeNull();
  });

  test('create recording with worker and task IDs', async () => {
    const agent = await createTestAgent();
    const recording = await executionStore.createExecutionRecording({
      agent_id: agent.id,
      worker_id: 'worker-1',
      task_id: 'task-1',
      run_id: 'run-002',
    });

    expect(recording.worker_id).toBe('worker-1');
    expect(recording.task_id).toBe('task-1');
  });

  test('create recording with timestamps', async () => {
    const agent = await createTestAgent();
    const started = '2026-01-15T10:00:00.000Z';
    const completed = '2026-01-15T10:05:00.000Z';

    const recording = await executionStore.createExecutionRecording({
      agent_id: agent.id,
      run_id: 'run-003',
      started_at: started,
      completed_at: completed,
    });

    expect(recording.started_at).toBeTruthy();
    expect(recording.completed_at).toBeTruthy();
  });

  test('list recordings for agent', async () => {
    const agent = await createTestAgent();
    for (let i = 0; i < 3; i++) {
      await executionStore.createExecutionRecording({
        agent_id: agent.id,
        run_id: `run-${i}`,
        success: i % 2 === 0,
      });
    }

    const result = await executionStore.listExecutionRecordings(agent.id);
    expect(result.items).toHaveLength(3);
    expect(result.has_more).toBe(false);
  });

  test('list recordings with pagination', async () => {
    const agent = await createTestAgent();
    for (let i = 0; i < 5; i++) {
      await executionStore.createExecutionRecording({
        agent_id: agent.id,
        run_id: `run-${i}`,
      });
    }

    const page1 = await executionStore.listExecutionRecordings(agent.id, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.has_more).toBe(true);

    const page2 = await executionStore.listExecutionRecordings(agent.id, { limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);
  });

  test('agent isolation', async () => {
    const agent1 = await createTestAgent();
    const agent2 = await agentStore.saveAgent({ name: 'Agent 2' });

    await executionStore.createExecutionRecording({ agent_id: agent1.id, run_id: 'run-a' });
    await executionStore.createExecutionRecording({ agent_id: agent2.id, run_id: 'run-b' });

    const list1 = await executionStore.listExecutionRecordings(agent1.id);
    expect(list1.items).toHaveLength(1);
    expect(list1.items[0].run_id).toBe('run-a');
  });

  test('complex tool_calls JSON fidelity', async () => {
    const agent = await createTestAgent();
    const toolCalls = [
      { tool: 'google-ads', action: 'getCampaigns', input: { customerId: '123' }, output: { campaigns: [{ id: 1 }] }, latency_ms: 250, success: true },
      { tool: 'slack', action: 'sendMessage', input: { channel: '#ops' }, output: { ok: true }, latency_ms: 80, success: true },
      { tool: 'google-ads', action: 'updateBid', input: { campaignId: 1, bid: 2.5 }, output: null, latency_ms: 300, success: false },
    ];

    await executionStore.createExecutionRecording({
      agent_id: agent.id,
      run_id: 'run-complex',
      tool_calls: toolCalls,
    });

    const fetched = await executionStore.getExecutionRecording('run-complex', agent.id);
    expect(fetched!.tool_calls).toEqual(toolCalls);
  });

  test('default values for optional fields', async () => {
    const agent = await createTestAgent();
    const recording = await executionStore.createExecutionRecording({
      agent_id: agent.id,
      run_id: 'run-defaults',
    });

    expect(recording.worker_id).toBeNull();
    expect(recording.task_id).toBeNull();
    expect(recording.success).toBeNull();
    expect(recording.tool_calls).toEqual([]);
    expect(recording.tokens_used).toEqual({});
    expect(recording.skills_applied).toEqual([]);
    expect(recording.skills_effective).toEqual([]);
  });
});
