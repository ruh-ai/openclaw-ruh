/**
 * Unit tests for src/agentVersionStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as agentVersionStore from '../../../src/agentVersionStore';

// ─────────────────────────────────────────────────────────────────────────────

function makeVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-test-uuid',
    agent_id: 'agent-123',
    version: '1.0.0',
    changelog: 'Initial release',
    snapshot: { systemName: 'TestAgent', skills: [] },
    created_by: 'user-456',
    created_at: new Date('2025-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── getAgentVersionByVersion ─────────────────────────────────────────────────

describe('agentVersionStore.getAgentVersionByVersion', () => {
  test('returns serialized record when found', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeVersionRow()],
      rowCount: 1,
    }));

    const version = await agentVersionStore.getAgentVersionByVersion('agent-123', '1.0.0');
    expect(version).not.toBeNull();
    expect(version!.agentId).toBe('agent-123');
    expect(version!.version).toBe('1.0.0');
    expect(version!.changelog).toBe('Initial release');
    expect(version!.createdBy).toBe('user-456');
  });

  test('returns null when not found', async () => {
    const version = await agentVersionStore.getAgentVersionByVersion('agent-123', '99.0.0');
    expect(version).toBeNull();
  });

  test('preserves snapshot as generic type', async () => {
    const snapshotData = { systemName: 'Agent', skills: ['browse'], meta: { count: 3 } };
    mockQuery.mockImplementation(async () => ({
      rows: [makeVersionRow({ snapshot: snapshotData })],
      rowCount: 1,
    }));

    const version = await agentVersionStore.getAgentVersionByVersion<typeof snapshotData>('agent-123', '1.0.0');
    expect(version!.snapshot).toEqual(snapshotData);
  });

  test('defaults changelog to empty string when null', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeVersionRow({ changelog: null })],
      rowCount: 1,
    }));

    const version = await agentVersionStore.getAgentVersionByVersion('agent-123', '1.0.0');
    expect(version!.changelog).toBe('');
  });
});

// ── createAgentVersion ───────────────────────────────────────────────────────

describe('agentVersionStore.createAgentVersion', () => {
  test('inserts version with JSON.stringify on snapshot', async () => {
    const snapshot = { systemName: 'Agent', skills: ['exec'] };
    mockQuery.mockImplementation(async () => ({
      rows: [makeVersionRow({ snapshot })],
      rowCount: 1,
    }));

    const version = await agentVersionStore.createAgentVersion({
      agentId: 'agent-123',
      version: '1.0.0',
      snapshot,
      createdBy: 'user-456',
    });
    expect(version.agentId).toBe('agent-123');
    expect(version.version).toBe('1.0.0');

    const params = mockQuery.mock.calls[0][1] as unknown[];
    // Param at index 4 should be JSON.stringify of snapshot
    expect(params[4]).toBe(JSON.stringify(snapshot));
  });

  test('defaults changelog to empty string', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeVersionRow({ changelog: '' })],
      rowCount: 1,
    }));

    await agentVersionStore.createAgentVersion({
      agentId: 'agent-123',
      version: '1.0.0',
      snapshot: {},
      createdBy: 'user-456',
    });
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('');
  });

  test('passes custom changelog when provided', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeVersionRow({ changelog: 'Bug fixes' })],
      rowCount: 1,
    }));

    await agentVersionStore.createAgentVersion({
      agentId: 'agent-123',
      version: '1.1.0',
      changelog: 'Bug fixes',
      snapshot: {},
      createdBy: 'user-456',
    });
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('Bug fixes');
  });
});
