import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as agentStore from '../../src/agentStore';

function makeAgentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-test-uuid',
    name: 'Credentialed Agent',
    avatar: '🤖',
    description: 'A test agent',
    skills: ['exec'],
    trigger_label: 'On demand',
    status: 'draft',
    sandbox_ids: [],
    skill_graph: null,
    workflow: null,
    agent_rules: [],
    tool_connections: [],
    triggers: [],
    improvements: [],
    workspace_memory: {
      instructions: '',
      continuity_summary: '',
      pinned_paths: [],
      updated_at: null,
    },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('agentStore public reads', () => {
  test('listAgents strips stored credential envelopes from the public agent payload', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeAgentRow()],
      rowCount: 1,
    }));

    const result = await agentStore.listAgents();
    expect(result[0]).not.toHaveProperty('agent_credentials');
  });

  test('getAgent strips stored credential envelopes from the public agent payload', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeAgentRow()],
      rowCount: 1,
    }));

    const result = await agentStore.getAgent('agent-test-uuid');
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('agent_credentials');
  });
});
