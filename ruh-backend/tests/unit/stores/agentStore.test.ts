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

const agentStore = await import('../../../src/agentStore?unitAgentStore');

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
    forge_sandbox_id: null,
    forge_stage: null,
    workspace_memory: {
      instructions: '',
      continuity_summary: '',
      pinned_paths: [],
      updated_at: null,
    },
    paperclip_company_id: null,
    paperclip_workers: [],
    creation_session: null,
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

describe('agentStore creator and ownership queries', () => {
  test('listAgentsForCreator filters by created_by', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeAgentRow({ created_by: 'user-1' })],
      rowCount: 1,
    }));

    const result = await agentStore.listAgentsForCreator('user-1');

    expect(result).toHaveLength(1);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1']);
  });

  test('listAgentsForCreatorInOrg filters by created_by and org_id', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeAgentRow({ created_by: 'user-1', org_id: 'org-1' })],
      rowCount: 1,
    }));

    const result = await agentStore.listAgentsForCreatorInOrg('user-1', 'org-1');

    expect(result).toHaveLength(1);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1', 'org-1']);
  });

  test('getAgentOwnership returns normalized owner fields and null when missing', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({
        rows: [{ id: AGENT_ID, created_by: 'user-1', org_id: 'org-1' }],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }));

    expect(await agentStore.getAgentOwnership(AGENT_ID)).toEqual({
      id: AGENT_ID,
      createdBy: 'user-1',
      orgId: 'org-1',
    });
    expect(await agentStore.getAgentOwnership('missing')).toBeNull();
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

  test('selects forge_stage for lifecycle resume', async () => {
    await agentStore.getAgent('look-me-up');
    expect(mockQuery.mock.calls[0][0] as string).toContain('forge_stage');
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

describe('agentStore sandbox lifecycle helpers', () => {
  test('removeSandboxFromAgent filters the sandbox id out of sandbox_ids', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return { rows: [makeAgentRow({ sandbox_ids: ['sb-002'] })], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await agentStore.removeSandboxFromAgent(AGENT_ID, 'sb-001');

    expect(result?.sandbox_ids).toEqual(['sb-002']);
    const updateCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('jsonb_array_elements'));
    expect(updateCall?.[1]).toEqual(['sb-001', AGENT_ID]);
  });

  test('setForgeSandbox stores forge_sandbox_id, marks the agent forging, and appends the sandbox when missing', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [makeAgentRow({
            forge_sandbox_id: 'forge-1',
            status: 'forging',
            sandbox_ids: ['forge-1'],
          })],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await agentStore.setForgeSandbox(AGENT_ID, 'forge-1');

    expect(result).toEqual(expect.objectContaining({
      forge_sandbox_id: 'forge-1',
      status: 'forging',
    }));
    const updateCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('forge_sandbox_id = $1'));
    expect(updateCall?.[1]).toEqual(['forge-1', JSON.stringify(['forge-1']), AGENT_ID]);
  });

  test('promoteForgeSandbox returns early when there is no forge sandbox and otherwise promotes it to active', async () => {
    mockQuery.mockImplementationOnce(async () => ({
      rows: [makeAgentRow({ forge_sandbox_id: null, sandbox_ids: ['prod-1'] })],
      rowCount: 1,
    }));

    const noForge = await agentStore.promoteForgeSandbox(AGENT_ID);
    expect(noForge).toEqual(expect.objectContaining({ forge_sandbox_id: null }));
    expect(mockQuery.mock.calls.every((c) => !String(c[0]).includes('UPDATE agents'))).toBe(true);

    mockQuery.mockReset();
    mockQuery
      .mockImplementationOnce(async () => ({
        rows: [makeAgentRow({
          forge_sandbox_id: 'forge-2',
          sandbox_ids: ['prod-1'],
          creation_session: { phase: 'build' },
          status: 'forging',
        })],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 1 }))
      .mockImplementationOnce(async () => ({
        rows: [makeAgentRow({
          forge_sandbox_id: null,
          sandbox_ids: ['prod-1', 'forge-2'],
          creation_session: null,
          status: 'active',
        })],
        rowCount: 1,
      }));

    const promoted = await agentStore.promoteForgeSandbox(AGENT_ID);

    expect(promoted).toEqual(expect.objectContaining({
      forge_sandbox_id: null,
      sandbox_ids: ['prod-1', 'forge-2'],
      status: 'active',
      creation_session: null,
    }));
    expect(mockQuery.mock.calls[1]?.[1]).toEqual([JSON.stringify(['prod-1', 'forge-2']), AGENT_ID]);
  });

  test('clearForgeSandbox clears forge metadata and returns the refreshed draft agent', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [makeAgentRow({
            forge_sandbox_id: null,
            creation_session: null,
            status: 'draft',
          })],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await agentStore.clearForgeSandbox(AGENT_ID);

    expect(result).toEqual(expect.objectContaining({
      forge_sandbox_id: null,
      status: 'draft',
      creation_session: null,
    }));
    expect(mockQuery.mock.calls[0]?.[0]).toContain('creation_session = NULL');
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

describe('agentStore Paperclip helpers', () => {
  test('updatePaperclipMapping stores the company id and serialized worker list', async () => {
    const workers = [
      {
        worker_id: 'worker-1',
        paperclip_agent_id: 'pc-1',
        role: 'ceo',
        name: 'Coordinator',
        skill_cluster: [],
      },
    ];

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [makeAgentRow({
            paperclip_company_id: 'company-1',
            paperclip_workers: workers,
          })],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await agentStore.updatePaperclipMapping(AGENT_ID, 'company-1', workers);

    expect(result).toEqual(expect.objectContaining({
      paperclip_company_id: 'company-1',
      paperclip_workers: workers,
    }));
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['company-1', JSON.stringify(workers), AGENT_ID]);
  });

  test('getAgentBySandboxId searches by sandbox_ids containment and returns null when absent', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({
        rows: [makeAgentRow({ sandbox_ids: ['sb-007'] })],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }));

    expect(await agentStore.getAgentBySandboxId('sb-007')).toEqual(expect.objectContaining({
      sandbox_ids: ['sb-007'],
    }));
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([JSON.stringify(['sb-007'])]);
    expect(await agentStore.getAgentBySandboxId('missing')).toBeNull();
  });
});

describe('agentStore credentials and config versions', () => {
  test('saveAgentCredential upserts a tool entry and deleteAgentCredential removes it', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({
        rows: [{
          agent_credentials: [
            { toolId: 'slack', encrypted: 'old', iv: 'old-iv', createdAt: '2026-04-02T00:00:00.000Z' },
            { toolId: 'github', encrypted: 'gh', iv: 'gh-iv', createdAt: '2026-04-02T00:00:00.000Z' },
          ],
        }],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 1 }))
      .mockImplementationOnce(async () => ({
        rows: [{
          agent_credentials: [
            { toolId: 'slack', encrypted: 'new', iv: 'new-iv', createdAt: '2026-04-03T00:00:00.000Z' },
            { toolId: 'github', encrypted: 'gh', iv: 'gh-iv', createdAt: '2026-04-02T00:00:00.000Z' },
          ],
        }],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 1 }));

    await agentStore.saveAgentCredential(AGENT_ID, 'slack', 'new', 'new-iv');
    const savedPayload = JSON.parse(String(mockQuery.mock.calls[1]?.[1]?.[0]));
    expect(savedPayload).toEqual(expect.arrayContaining([
      expect.objectContaining({ toolId: 'slack', encrypted: 'new', iv: 'new-iv' }),
      expect.objectContaining({ toolId: 'github', encrypted: 'gh' }),
    ]));

    await agentStore.deleteAgentCredential(AGENT_ID, 'slack');
    const deletedPayload = JSON.parse(String(mockQuery.mock.calls[3]?.[1]?.[0]));
    expect(deletedPayload).toEqual([
      expect.objectContaining({ toolId: 'github', encrypted: 'gh' }),
    ]);
  });

  test('getAgentCredentials normalizes stored envelopes and getAgentCredentialSummary maps them for UI use', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({
        rows: [{
          agent_credentials: [
            { toolId: 'slack', encrypted: 'cipher', iv: 'nonce', createdAt: '2026-04-03T00:00:00.000Z' },
            { toolId: 'broken' },
          ],
        }],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({
        rows: [{
          agent_credentials: [
            { toolId: 'slack', encrypted: 'cipher', iv: 'nonce', createdAt: '2026-04-03T00:00:00.000Z' },
          ],
        }],
        rowCount: 1,
      }));

    expect(await agentStore.getAgentCredentials(AGENT_ID)).toEqual([
      {
        toolId: 'slack',
        encrypted: 'cipher',
        iv: 'nonce',
        createdAt: '2026-04-03T00:00:00.000Z',
      },
    ]);
    expect(await agentStore.getAgentCredentialSummary(AGENT_ID)).toEqual([
      {
        toolId: 'slack',
        hasCredentials: true,
        createdAt: '2026-04-03T00:00:00.000Z',
      },
    ]);
  });

  test('create/list/get config versions serialize snapshots and rollback applies stored config fields', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({
        rows: [{
          id: 'version-1',
          agent_id: AGENT_ID,
          version_number: 1,
          snapshot: { skillGraph: [{ id: 'n1' }] },
          message: 'Initial snapshot',
          created_at: '2026-04-03T00:00:00.000Z',
          created_by: 'user-1',
        }],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({
        rows: [{
          id: 'version-2',
          agent_id: AGENT_ID,
          version_number: 2,
          snapshot: { workflow: { steps: [] } },
          message: null,
          created_at: '2026-04-03T01:00:00.000Z',
          created_by: null,
        }],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({
        rows: [{
          id: 'version-3',
          agent_id: AGENT_ID,
          version_number: 3,
          snapshot: { agentRules: ['be concise'] },
          message: 'Review version',
          created_at: '2026-04-03T02:00:00.000Z',
          created_by: 'user-2',
        }],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({
        rows: [{
          id: 'version-4',
          agent_id: AGENT_ID,
          version_number: 4,
          snapshot: {
            skillGraph: [{ name: 'Slack Reader' }],
            workflow: { steps: ['plan'] },
            agentRules: ['stay safe'],
            runtimeInputs: [{ key: 'workspace', label: 'Workspace', description: '', required: true, source: 'architect_requirement', value: 'team-1' }],
            toolConnections: [{ toolId: 'slack', name: 'Slack', description: '', status: 'configured', authKind: 'oauth', connectorType: 'mcp', configSummary: [] }],
            triggers: [{ id: 'manual', title: 'Manual', kind: 'manual', status: 'supported', description: 'Manual launch' }],
            discoveryDocuments: {
              prd: { title: 'PRD', sections: [] },
              trd: { title: 'TRD', sections: [] },
            },
          },
          message: 'Rollback target',
          created_at: '2026-04-03T03:00:00.000Z',
          created_by: 'user-3',
        }],
        rowCount: 1,
      }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 1 }))
      .mockImplementationOnce(async () => ({
        rows: [makeAgentRow({
          skill_graph: [{ name: 'Slack Reader' }],
          workflow: { steps: ['plan'] },
          agent_rules: ['stay safe'],
          runtime_inputs: [{ key: 'workspace', label: 'Workspace', description: '', required: true, source: 'architect_requirement', value: 'team-1' }],
          tool_connections: [{ toolId: 'slack', name: 'Slack', description: '', status: 'configured', authKind: 'oauth', connectorType: 'mcp', configSummary: [] }],
          triggers: [{ id: 'manual', title: 'Manual', kind: 'manual', status: 'supported', description: 'Manual launch' }],
          discovery_documents: {
            prd: { title: 'PRD', sections: [] },
            trd: { title: 'TRD', sections: [] },
          },
        })],
        rowCount: 1,
      }));

    const created = await agentStore.createAgentConfigVersion(AGENT_ID, { skillGraph: [{ id: 'n1' }] }, 'Initial snapshot', 'user-1');
    expect(created).toEqual(expect.objectContaining({
      id: 'version-1',
      version_number: 1,
      message: 'Initial snapshot',
      created_by: 'user-1',
    }));
    expect(mockQuery.mock.calls[0]?.[1]?.[2]).toBe(JSON.stringify({ skillGraph: [{ id: 'n1' }] }));

    const listed = await agentStore.listAgentConfigVersions(AGENT_ID, 999);
    expect(listed).toHaveLength(1);
    expect(mockQuery.mock.calls[1]?.[1]).toEqual([AGENT_ID, 100]);

    const fetched = await agentStore.getAgentConfigVersion(AGENT_ID, 3);
    expect(fetched).toEqual(expect.objectContaining({
      id: 'version-3',
      version_number: 3,
    }));

    const rolledBack = await agentStore.rollbackAgentToConfigVersion(AGENT_ID, 4);
    expect(rolledBack).toEqual(expect.objectContaining({
      agent_rules: ['stay safe'],
    }));
    const rollbackUpdateCall = mockQuery.mock.calls[4];
    expect(String(rollbackUpdateCall?.[0])).toContain('UPDATE agents SET');
    expect(rollbackUpdateCall?.[1]).toContain(JSON.stringify([{ name: 'Slack Reader' }]));
    expect(rollbackUpdateCall?.[1]).toContain(JSON.stringify({ steps: ['plan'] }));
  });
});

// ── normalizeRuntimeInputs — populationStrategy + enriched fields ───────────

describe('runtime input normalization preserves enriched fields', () => {
  test('getAgent returns populationStrategy, inputType, defaultValue, example, options, group', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [
        makeAgentRow({
          runtime_inputs: [
            {
              key: 'API_KEY',
              label: 'API Key',
              description: 'Secret key',
              required: true,
              source: 'architect_requirement',
              value: 'sk-123',
              populationStrategy: 'user_required',
              inputType: 'text',
              defaultValue: undefined,
              example: 'sk-abc...',
              group: 'Authentication',
            },
            {
              key: 'COMPANY_NAME',
              label: 'Company Name',
              description: 'Company this agent serves',
              required: true,
              source: 'architect_requirement',
              value: '',
              populationStrategy: 'ai_inferred',
              inputType: 'text',
              defaultValue: 'Acme Corp',
              example: 'Globex',
              group: 'Behavior',
            },
            {
              key: 'LOG_LEVEL',
              label: 'Log Level',
              description: 'Logging verbosity',
              required: false,
              source: 'architect_requirement',
              value: '',
              populationStrategy: 'static_default',
              inputType: 'select',
              defaultValue: 'info',
              options: ['debug', 'info', 'warn', 'error'],
              group: 'Behavior',
            },
          ],
        }),
      ],
      rowCount: 1,
    }));

    const agent = await agentStore.getAgent(AGENT_ID);
    expect(agent).not.toBeNull();

    const inputs = agent!.runtime_inputs;
    expect(inputs).toHaveLength(3);

    // user_required input
    expect(inputs[0].populationStrategy).toBe('user_required');
    expect(inputs[0].inputType).toBe('text');
    expect(inputs[0].example).toBe('sk-abc...');
    expect(inputs[0].group).toBe('Authentication');

    // ai_inferred input
    expect(inputs[1].populationStrategy).toBe('ai_inferred');
    expect(inputs[1].defaultValue).toBe('Acme Corp');
    expect(inputs[1].group).toBe('Behavior');

    // static_default input
    expect(inputs[2].populationStrategy).toBe('static_default');
    expect(inputs[2].inputType).toBe('select');
    expect(inputs[2].defaultValue).toBe('info');
    expect(inputs[2].options).toEqual(['debug', 'info', 'warn', 'error']);
  });

  test('getAgent defaults populationStrategy to undefined for legacy inputs', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [
        makeAgentRow({
          runtime_inputs: [
            {
              key: 'OLD_KEY',
              label: 'Old Key',
              description: 'Legacy',
              required: true,
              value: 'val',
            },
          ],
        }),
      ],
      rowCount: 1,
    }));

    const agent = await agentStore.getAgent(AGENT_ID);
    const inputs = agent!.runtime_inputs;
    expect(inputs[0].populationStrategy).toBeUndefined();
    expect(inputs[0].inputType).toBeUndefined();
    expect(inputs[0].defaultValue).toBeUndefined();
  });
});
