import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (client: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

mock.module('uuid', () => ({
  v4: () => 'agent-version-uuid',
}));

const agentVersionStore = await import('../../src/agentVersionStore?unitAgentVersionStore');

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('agentVersionStore.getAgentVersionByVersion', () => {
  test('returns null when the version does not exist', async () => {
    const record = await agentVersionStore.getAgentVersionByVersion('agent-1', 'v1');
    expect(record).toBeNull();
  });

  test('serializes an existing version row', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'version-1',
        agent_id: 'agent-1',
        version: 'v2',
        changelog: 'Added marketplace install support',
        snapshot: { temperature: 0.2 },
        created_by: 'user-1',
        created_at: '2026-04-02T00:00:00.000Z',
      }],
      rowCount: 1,
    }));

    const record = await agentVersionStore.getAgentVersionByVersion<{ temperature: number }>('agent-1', 'v2');

    expect(record).toEqual({
      id: 'version-1',
      agentId: 'agent-1',
      version: 'v2',
      changelog: 'Added marketplace install support',
      snapshot: { temperature: 0.2 },
      createdBy: 'user-1',
      createdAt: '2026-04-02T00:00:00.000Z',
    });
  });
});

describe('agentVersionStore.createAgentVersion', () => {
  test('inserts a version snapshot and returns the serialized row', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{
        id: 'agent-version-uuid',
        agent_id: 'agent-1',
        version: 'v3',
        changelog: 'Tuned prompts',
        snapshot: { prompt: 'new prompt' },
        created_by: 'user-2',
        created_at: '2026-04-02T01:00:00.000Z',
      }],
      rowCount: 1,
    }));

    const record = await agentVersionStore.createAgentVersion({
      agentId: 'agent-1',
      version: 'v3',
      changelog: 'Tuned prompts',
      snapshot: { prompt: 'new prompt' },
      createdBy: 'user-2',
    });

    expect(record).toEqual({
      id: 'agent-version-uuid',
      agentId: 'agent-1',
      version: 'v3',
      changelog: 'Tuned prompts',
      snapshot: { prompt: 'new prompt' },
      createdBy: 'user-2',
      createdAt: '2026-04-02T01:00:00.000Z',
    });

    const insertCall = mockQuery.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO agent_versions'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toEqual([
      'agent-version-uuid',
      'agent-1',
      'v3',
      'Tuned prompts',
      JSON.stringify({ prompt: 'new prompt' }),
      'user-2',
    ]);
  });
});
