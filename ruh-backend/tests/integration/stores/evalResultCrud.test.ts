/**
 * Integration tests for eval result CRUD — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as evalResultStore from '../../../src/evalResultStore';
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

// Helper to create an agent (eval results reference agent_id)
async function createTestAgent() {
  return agentStore.saveAgent({ name: 'Eval Test Agent', avatar: '🧪' });
}

describe('Eval Result CRUD (integration)', () => {
  test('create and get eval result', async () => {
    const agent = await createTestAgent();
    const result = await evalResultStore.createEvalResult({
      agent_id: agent.id,
      mode: 'single',
      tasks: [{ name: 'task1', passed: true, score: 0.9 }],
      pass_rate: 1.0,
      avg_score: 0.9,
      total_tasks: 1,
      passed_tasks: 1,
      failed_tasks: 0,
    });

    expect(result.id).toBeTruthy();
    expect(result.agent_id).toBe(agent.id);
    expect(result.mode).toBe('single');

    const fetched = await evalResultStore.getEvalResult(result.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.tasks).toEqual([{ name: 'task1', passed: true, score: 0.9 }]);
    expect(fetched!.pass_rate).toBe(1.0);
  });

  test('list eval results with pagination', async () => {
    const agent = await createTestAgent();
    for (let i = 0; i < 3; i++) {
      await evalResultStore.createEvalResult({
        agent_id: agent.id,
        mode: 'single',
        tasks: [],
        pass_rate: i * 0.3,
        avg_score: i * 0.3,
        total_tasks: i + 1,
        passed_tasks: i,
        failed_tasks: 1,
      });
    }

    const page = await evalResultStore.listEvalResults(agent.id, { limit: 2 });
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(2);
  });

  test('delete eval result', async () => {
    const agent = await createTestAgent();
    const result = await evalResultStore.createEvalResult({
      agent_id: agent.id,
      mode: 'single',
      tasks: [],
      pass_rate: 0,
      avg_score: 0,
      total_tasks: 0,
      passed_tasks: 0,
      failed_tasks: 0,
    });

    const deleted = await evalResultStore.deleteEvalResult(result.id);
    expect(deleted).toBe(true);

    const fetched = await evalResultStore.getEvalResult(result.id);
    expect(fetched).toBeNull();
  });

  test('delete returns false for nonexistent', async () => {
    const deleted = await evalResultStore.deleteEvalResult('nonexistent-uuid');
    expect(deleted).toBe(false);
  });

  test('loop_state JSON round-trips', async () => {
    const agent = await createTestAgent();
    const loopState = { iteration: 3, best_score: 0.95, mutations: ['tweak-prompt'] };
    const result = await evalResultStore.createEvalResult({
      agent_id: agent.id,
      mode: 'loop',
      tasks: [{ name: 't1', passed: true }],
      loop_state: loopState,
      pass_rate: 0.95,
      avg_score: 0.95,
      total_tasks: 1,
      passed_tasks: 1,
      failed_tasks: 0,
      iterations: 3,
      stop_reason: 'converged',
    });

    const fetched = await evalResultStore.getEvalResult(result.id);
    expect(fetched!.loop_state).toEqual(loopState);
    expect(fetched!.iterations).toBe(3);
    expect(fetched!.stop_reason).toBe('converged');
  });

  test('filter by agent_id isolates results', async () => {
    const agent1 = await createTestAgent();
    const agent2 = await agentStore.saveAgent({ name: 'Agent 2' });

    await evalResultStore.createEvalResult({
      agent_id: agent1.id, mode: 'single', tasks: [],
      pass_rate: 0, avg_score: 0, total_tasks: 0, passed_tasks: 0, failed_tasks: 0,
    });
    await evalResultStore.createEvalResult({
      agent_id: agent2.id, mode: 'single', tasks: [],
      pass_rate: 0, avg_score: 0, total_tasks: 0, passed_tasks: 0, failed_tasks: 0,
    });

    const list1 = await evalResultStore.listEvalResults(agent1.id);
    expect(list1.total).toBe(1);

    const list2 = await evalResultStore.listEvalResults(agent2.id);
    expect(list2.total).toBe(1);
  });
});
