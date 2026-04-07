import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { mockQuery, mockClient } from '../../helpers/mockDb';

import * as execStore from '../../../src/executionRecordingStore';

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ---------------------------------------------------------------------------
// createExecutionRecording
// ---------------------------------------------------------------------------

describe('executionRecordingStore.createExecutionRecording', () => {
  test('inserts a recording and returns serialized row', async () => {
    const now = new Date('2026-03-30T10:00:00Z');
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'er-1',
        agent_id: 'agent-1',
        worker_id: 'bid-optimizer',
        task_id: 'task-003',
        run_id: 'run-abc123',
        success: true,
        tool_calls: [{ tool: 'google-ads-api', action: 'updateBid', input: {}, output: {}, latency_ms: 340, success: true }],
        tokens_used: { input: 2800, output: 1400 },
        skills_applied: ['smart-bidding-v3'],
        skills_effective: ['smart-bidding-v3'],
        started_at: now,
        completed_at: now,
        created_at: now,
      }],
      rowCount: 1,
    }));

    const recording = await execStore.createExecutionRecording({
      agent_id: 'agent-1',
      worker_id: 'bid-optimizer',
      task_id: 'task-003',
      run_id: 'run-abc123',
      success: true,
      tool_calls: [{ tool: 'google-ads-api', action: 'updateBid', input: {}, output: {}, latency_ms: 340, success: true }],
      tokens_used: { input: 2800, output: 1400 },
      skills_applied: ['smart-bidding-v3'],
      skills_effective: ['smart-bidding-v3'],
    });

    expect(recording.agent_id).toBe('agent-1');
    expect(recording.worker_id).toBe('bid-optimizer');
    expect(recording.run_id).toBe('run-abc123');
    expect(recording.success).toBe(true);
    expect(recording.skills_applied).toEqual(['smart-bidding-v3']);
    expect(recording.tool_calls).toHaveLength(1);
    expect(typeof recording.created_at).toBe('string');

    const insertCall = mockQuery.mock.calls.find(c =>
      String(c[0]).includes('INSERT INTO execution_recordings'),
    );
    expect(insertCall).toBeDefined();
  });

  test('defaults optional fields to empty collections', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'er-2', agent_id: 'a', worker_id: null, task_id: null,
        run_id: 'run-xyz', success: null,
        tool_calls: [], tokens_used: {}, skills_applied: [], skills_effective: [],
        started_at: null, completed_at: null, created_at: new Date(),
      }],
      rowCount: 1,
    }));

    const recording = await execStore.createExecutionRecording({
      agent_id: 'a',
      run_id: 'run-xyz',
    });

    expect(recording.worker_id).toBeNull();
    expect(recording.success).toBeNull();
    expect(recording.tool_calls).toEqual([]);
    expect(recording.skills_applied).toEqual([]);
    expect(recording.started_at).toBeNull();
    expect(recording.completed_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getExecutionRecording
// ---------------------------------------------------------------------------

describe('executionRecordingStore.getExecutionRecording', () => {
  test('returns null when recording not found', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await execStore.getExecutionRecording('run-missing', 'agent-1');
    expect(result).toBeNull();
  });

  test('returns recording when found', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'er-1', agent_id: 'agent-1', worker_id: null, task_id: null,
        run_id: 'run-found', success: false,
        tool_calls: [], tokens_used: {}, skills_applied: [], skills_effective: [],
        started_at: null, completed_at: null, created_at: new Date(),
      }],
      rowCount: 1,
    }));

    const result = await execStore.getExecutionRecording('run-found', 'agent-1');
    expect(result?.run_id).toBe('run-found');
    expect(result?.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listExecutionRecordings
// ---------------------------------------------------------------------------

describe('executionRecordingStore.listExecutionRecordings', () => {
  test('returns items with has_more=false when under limit', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'er-1', agent_id: 'a', worker_id: null, task_id: null,
        run_id: 'run-1', success: true,
        tool_calls: [], tokens_used: {}, skills_applied: [], skills_effective: [],
        started_at: null, completed_at: null, created_at: new Date(),
      }],
      rowCount: 1,
    }));

    const result = await execStore.listExecutionRecordings('a', { limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.has_more).toBe(false);
  });

  test('caps limit at 100', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await execStore.listExecutionRecordings('a', { limit: 999 });

    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall).toBeDefined();
    const params = queryCall?.[1] as unknown[];
    // LIMIT is passed as limit+1 = 101
    expect(params?.[1]).toBe(101);
  });
});
