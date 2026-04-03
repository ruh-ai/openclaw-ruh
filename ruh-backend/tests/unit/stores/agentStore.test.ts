/**
 * Unit tests for src/agentStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as agentStore from '../../../src/agentStore';

// ─────────────────────────────────────────────────────────────────────────────

const AGENT_ID = 'agent-test-uuid';

function makeAgentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    name: 'Test Agent',
    avatar: '🤖',
    description: 'A test agent',
    skills: ['exec', 'browse'],
    trigger_label: 'On demand',
    status: 'draft',
    sandbox_ids: [],
    skill_graph: null,
    workflow: null,
    agent_rules: [],
    tool_connections: [],
    runtime_inputs: [],
    triggers: [],
    channels: [],
    discovery_documents: null,
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

// ── saveAgent ─────────────────────────────────────────────────────────────────

describe('agentStore.saveAgent', () => {
  test('inserts agent and returns the created record', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const agent = await agentStore.saveAgent({ name: 'Test Agent', avatar: '🤖' });
    expect(agent.name).toBe('Test Agent');
    expect(agent.avatar).toBe('🤖');
  });

  test('INSERT includes required columns', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    await agentStore.saveAgent({ name: 'My Agent', skills: ['exec'] });
    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('INSERT INTO agents'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain('My Agent');
  });

  test('throws when SELECT after INSERT returns nothing', async () => {
    // INSERT succeeds, SELECT returns empty
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await expect(agentStore.saveAgent({ name: 'Broken' })).rejects.toThrow('Failed to create agent');
  });

  test('defaults skills, agentRules to empty arrays', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    await agentStore.saveAgent({ name: 'Minimal' });
    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('INSERT INTO agents'),
    );
    const params = insertCall![1] as unknown[];
    // skills param should be '[]'
    expect(params.some((p) => p === '[]')).toBe(true);
  });

  test('persists tool connection and trigger metadata alongside config fields', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [
            makeAgentRow({
              tool_connections: [
                {
                  toolId: 'google-ads',
                  name: 'Google Ads',
                  description: 'Manage campaigns',
                  status: 'configured',
                  authKind: 'oauth',
                  connectorType: 'mcp',
                  configSummary: ['Connected account: Acme Ads'],
                },
              ],
              triggers: [
                {
                  id: 'cron-schedule',
                  title: 'Cron Schedule',
                  kind: 'schedule',
                  status: 'supported',
                  description: 'Runs every weekday at 9 AM.',
                  schedule: '0 9 * * 1-5',
                },
              ],
            }),
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await agentStore.saveAgent({
      name: 'Google Ads Agent',
      toolConnections: [
        {
          toolId: 'google-ads',
          name: 'Google Ads',
          description: 'Manage campaigns',
          status: 'configured',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['Connected account: Acme Ads'],
        },
      ],
      triggers: [
        {
          id: 'cron-schedule',
          title: 'Cron Schedule',
          kind: 'schedule',
          status: 'supported',
          description: 'Runs every weekday at 9 AM.',
          schedule: '0 9 * * 1-5',
        },
      ],
    });

    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('INSERT INTO agents'),
    );
    const params = insertCall?.[1] as unknown[];
    expect(params.some((p) => p === JSON.stringify([
      {
        toolId: 'google-ads',
        name: 'Google Ads',
        description: 'Manage campaigns',
        status: 'configured',
        authKind: 'oauth',
        connectorType: 'mcp',
        configSummary: ['Connected account: Acme Ads'],
      },
    ]))).toBe(true);
    expect(params.some((p) => p === JSON.stringify([
      {
        id: 'cron-schedule',
        title: 'Cron Schedule',
        kind: 'schedule',
        status: 'supported',
        description: 'Runs every weekday at 9 AM.',
        schedule: '0 9 * * 1-5',
      },
    ]))).toBe(true);
  });

  test('persists runtime input metadata alongside config fields', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [
            makeAgentRow({
              runtime_inputs: [
                {
                  key: 'GOOGLE_ADS_CUSTOMER_ID',
                  label: 'Customer ID',
                  description: 'Google Ads customer ID for the target account.',
                  required: true,
                  source: 'architect_requirement',
                  value: '123-456-7890',
                },
              ],
            }),
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await agentStore.saveAgent({
      name: 'Google Ads Agent',
      runtimeInputs: [
        {
          key: 'GOOGLE_ADS_CUSTOMER_ID',
          label: 'Customer ID',
          description: 'Google Ads customer ID for the target account.',
          required: true,
          source: 'architect_requirement',
          value: '123-456-7890',
        },
      ],
    });

    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('INSERT INTO agents'),
    );
    const params = insertCall?.[1] as unknown[];
    expect(params.some((p) => p === JSON.stringify([
      {
        key: 'GOOGLE_ADS_CUSTOMER_ID',
        label: 'Customer ID',
        description: 'Google Ads customer ID for the target account.',
        required: true,
        source: 'architect_requirement',
        value: '123-456-7890',
      },
    ]))).toBe(true);
  });

  test('persists channel metadata alongside config fields', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [
            makeAgentRow({
              channels: [
                {
                  kind: 'slack',
                  status: 'planned',
                  label: 'Slack',
                  description: 'Configure the workspace bot after deploy.',
                },
              ],
            }),
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await agentStore.saveAgent({
      name: 'Channel Agent',
      channels: [
        {
          kind: 'slack',
          status: 'planned',
          label: 'Slack',
          description: 'Configure the workspace bot after deploy.',
        },
      ],
    });

    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('INSERT INTO agents'),
    );
    const params = insertCall?.[1] as unknown[];
    expect(params.some((p) => p === JSON.stringify([
      {
        kind: 'slack',
        status: 'planned',
        label: 'Slack',
        description: 'Configure the workspace bot after deploy.',
      },
    ]))).toBe(true);
  });

  test('persists approved discovery documents alongside config fields', async () => {
    const discoveryDocuments = {
      prd: {
        title: 'Product Requirements Document',
        sections: [
          {
            heading: 'Goal',
            content: 'Build a Google Ads copilot for media buyers.',
          },
        ],
      },
      trd: {
        title: 'Technical Requirements Document',
        sections: [
          {
            heading: 'Integrations',
            content: 'Use the Google Ads MCP connector and persisted runtime inputs.',
          },
        ],
      },
    };

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [
            makeAgentRow({
              discovery_documents: discoveryDocuments,
            }),
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await agentStore.saveAgent({
      name: 'Google Ads Agent',
      discoveryDocuments,
    });

    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('INSERT INTO agents'),
    );
    const params = insertCall?.[1] as unknown[];
    expect(params.some((p) => p === JSON.stringify(discoveryDocuments))).toBe(true);
  });
});

// ── listAgents ────────────────────────────────────────────────────────────────

describe('agentStore.listAgents', () => {
  test('returns empty array when no agents exist', async () => {
    const result = await agentStore.listAgents();
    expect(result).toEqual([]);
  });

  test('returns serialized agents', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeAgentRow(), makeAgentRow({ id: 'agent-2', name: 'Second' })],
      rowCount: 2,
    }));
    const result = await agentStore.listAgents();
    expect(result.length).toBe(2);
    expect(typeof result[0].created_at).toBe('string');
    expect(typeof result[0].updated_at).toBe('string');
  });

  test('issues ORDER BY created_at DESC query', async () => {
    await agentStore.listAgents();
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY created_at DESC');
  });

  test('preserves api and cli connector types when reading tool metadata', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [
        makeAgentRow({
          tool_connections: [
            {
              toolId: 'figma',
              name: 'Figma',
              description: 'Design comments and file inspection',
              status: 'unsupported',
              authKind: 'none',
              connectorType: 'api',
              configSummary: ['Manual API wrapper recommended'],
            },
            {
              toolId: 'docker',
              name: 'Docker',
              description: 'Local image and container management',
              status: 'unsupported',
              authKind: 'none',
              connectorType: 'cli',
              configSummary: ['CLI integration recommended'],
            },
          ],
        }),
      ],
      rowCount: 1,
    }));

    const result = await agentStore.listAgents();

    expect(result[0]?.tool_connections).toEqual([
      expect.objectContaining({
        toolId: 'figma',
        connectorType: 'api',
      }),
      expect.objectContaining({
        toolId: 'docker',
        connectorType: 'cli',
      }),
    ]);
  });

});

// ── getAgent ──────────────────────────────────────────────────────────────────

describe('agentStore.getAgent', () => {
  test('returns null when agent not found', async () => {
    const result = await agentStore.getAgent('nonexistent');
    expect(result).toBeNull();
  });

  test('returns agent when found', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeAgentRow()],
      rowCount: 1,
    }));
    const result = await agentStore.getAgent(AGENT_ID);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(AGENT_ID);
  });

  test('passes id as query parameter', async () => {
    await agentStore.getAgent('look-me-up');
    expect(mockQuery.mock.calls[0][1]).toContain('look-me-up');
  });
});

// ── updateAgent ───────────────────────────────────────────────────────────────

describe('agentStore.updateAgent', () => {
  test('returns null when agent not found after update', async () => {
    // UPDATE succeeds but SELECT returns empty
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await agentStore.updateAgent(AGENT_ID, { name: 'New Name' });
    expect(result).toBeNull();
  });

  test('returns updated agent when found', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow({ name: 'Updated' })], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const result = await agentStore.updateAgent(AGENT_ID, { name: 'Updated' });
    expect(result!.name).toBe('Updated');
  });

  test('skips UPDATE and calls getAgent directly when patch is empty', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeAgentRow()],
      rowCount: 1,
    }));
    await agentStore.updateAgent(AGENT_ID, {});
    const sqls = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls.every((s) => !s.includes('UPDATE'))).toBe(true);
    expect(sqls.some((s) => s.includes('SELECT'))).toBe(true);
  });

  test('includes name in UPDATE SET clause when provided', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await agentStore.updateAgent(AGENT_ID, { name: 'Renamed' });
    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('UPDATE agents SET'),
    );
    expect(updateCall![0]).toContain('name');
    expect(updateCall![1]).toContain('Renamed');
  });
});

// ── updateAgentConfig ─────────────────────────────────────────────────────────

describe('agentStore.updateAgentConfig', () => {
  test('returns null when agent not found after config update', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await agentStore.updateAgentConfig(AGENT_ID, { agentRules: ['be helpful'] });
    expect(result).toBeNull();
  });

  test('returns agent after successful config update', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const result = await agentStore.updateAgentConfig(AGENT_ID, { agentRules: ['rule1'] });
    expect(result).not.toBeNull();
  });

  test('skips UPDATE when config is empty', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [makeAgentRow()], rowCount: 1 }));
    await agentStore.updateAgentConfig(AGENT_ID, {});
    const sqls = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls.every((s) => !s.includes('UPDATE'))).toBe(true);
  });

  test('includes skill_graph in SET when provided', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await agentStore.updateAgentConfig(AGENT_ID, { skillGraph: { nodes: [] } });
    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('UPDATE agents SET'),
    );
    expect(updateCall![0]).toContain('skill_graph');
  });

  test('includes tool_connections and triggers in config updates when provided', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    await agentStore.updateAgentConfig(AGENT_ID, {
      toolConnections: [
        {
          toolId: 'google-ads',
          name: 'Google Ads',
          description: 'Manage campaigns',
          status: 'missing_secret',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['Account selected; credentials still required'],
        },
      ],
      triggers: [
        {
          id: 'cron-schedule',
          title: 'Cron Schedule',
          kind: 'schedule',
          status: 'supported',
          description: 'Runs every weekday at 9 AM.',
          schedule: '0 9 * * 1-5',
        },
      ],
    });

    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('UPDATE agents SET'),
    );
    expect(updateCall?.[0]).toContain('tool_connections');
    expect(updateCall?.[0]).toContain('triggers');
  });
});

// ── workspace memory ─────────────────────────────────────────────────────────

describe('agentStore.getAgentWorkspaceMemory', () => {
  test('returns normalized empty memory when agent exists with no stored payload', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeAgentRow({ workspace_memory: null })],
      rowCount: 1,
    }));

    const result = await agentStore.getAgentWorkspaceMemory(AGENT_ID);
    expect(result).toEqual({
      instructions: '',
      continuity_summary: '',
      pinned_paths: [],
      updated_at: null,
    });
  });
});

describe('agentStore.updateAgentWorkspaceMemory', () => {
  test('writes workspace_memory JSON and returns normalized memory', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [makeAgentRow({
            workspace_memory: {
              instructions: 'Keep summaries short',
              continuity_summary: 'Need to finish launch review',
              pinned_paths: ['plans/launch.md'],
              updated_at: '2026-03-25T17:30:00.000Z',
            },
          })],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await agentStore.updateAgentWorkspaceMemory(AGENT_ID, {
      instructions: 'Keep summaries short',
      continuitySummary: 'Need to finish launch review',
      pinnedPaths: ['plans/launch.md'],
    });

    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('UPDATE agents SET workspace_memory'),
    );

    expect(updateCall).toBeDefined();
    expect(updateCall![1]?.[0]).toBeTypeOf('string');
    expect(result).toEqual({
      instructions: 'Keep summaries short',
      continuity_summary: 'Need to finish launch review',
      pinned_paths: ['plans/launch.md'],
      updated_at: '2026-03-25T17:30:00.000Z',
    });
  });
});

// ── addSandboxToAgent ─────────────────────────────────────────────────────────

describe('agentStore.addSandboxToAgent', () => {
  test('returns agent after adding sandbox', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow({ sandbox_ids: ['sb-001'] })], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const result = await agentStore.addSandboxToAgent(AGENT_ID, 'sb-001');
    expect(result).not.toBeNull();
  });

  test('UPDATE uses jsonb append operator', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await agentStore.addSandboxToAgent(AGENT_ID, 'sb-new');
    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('UPDATE agents'),
    );
    expect(updateCall![0]).toContain('sandbox_ids || $1::jsonb');
  });

  test('passes sandbox id as JSON array in params', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await agentStore.addSandboxToAgent(AGENT_ID, 'sb-xyz');
    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('UPDATE agents'),
    );
    expect(updateCall![1]).toContain(JSON.stringify(['sb-xyz']));
  });
});

// ── deleteAgent ───────────────────────────────────────────────────────────────

describe('agentStore.deleteAgent', () => {
  test('returns true when agent deleted', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 1 }));
    const result = await agentStore.deleteAgent(AGENT_ID);
    expect(result).toBe(true);
  });

  test('returns false when agent not found', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await agentStore.deleteAgent('nonexistent');
    expect(result).toBe(false);
  });

  test('executes DELETE FROM agents', async () => {
    await agentStore.deleteAgent(AGENT_ID);
    const sqls = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('DELETE FROM agents'))).toBe(true);
  });

  test('passes id as parameter', async () => {
    await agentStore.deleteAgent('del-me');
    expect(mockQuery.mock.calls[0][1]).toContain('del-me');
  });
});

describe('agentStore improvement metadata', () => {
  test('saveAgent persists improvements JSON', async () => {
    const improvements = [
      {
        id: 'connect-google-ads',
        kind: 'tool_connection',
        status: 'accepted',
        scope: 'builder',
        title: 'Connect Google Ads before deploy',
        summary: 'Attach a Google Ads connection so the optimizer can read live account data.',
        rationale: 'The generated Google Ads skills depend on account data that is not available yet.',
        targetId: 'google-ads',
      },
    ];

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [makeAgentRow({ improvements })],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await agentStore.saveAgent({
      name: 'Google Ads Agent',
      improvements,
    });

    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('INSERT INTO agents'),
    );
    const params = insertCall?.[1] as unknown[];
    expect(params).toContain(JSON.stringify(improvements));
  });

  test('updateAgentConfig writes improvements when provided', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeAgentRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    await agentStore.updateAgentConfig(AGENT_ID, {
      improvements: [
        {
          id: 'connect-google-ads',
          kind: 'tool_connection',
          status: 'dismissed',
          scope: 'builder',
          title: 'Connect Google Ads before deploy',
          summary: 'Attach a Google Ads connection so the optimizer can read live account data.',
          rationale: 'The generated Google Ads skills depend on account data that is not available yet.',
          targetId: 'google-ads',
        },
      ],
    });

    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('UPDATE agents SET'),
    );
    expect(updateCall?.[0]).toContain('improvements');
  });
});

// ── credential redaction ──────────────────────────────────────────────────────

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

    const result = await agentStore.getAgent(AGENT_ID);
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('agent_credentials');
  });
});
