import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { signAccessToken } from '../../src/auth/tokens';

import { AGENT_ID, SANDBOX_ID, makeAgentRecord } from '../helpers/fixtures';

let currentAgent = makeAgentRecord({
  id: AGENT_ID,
  name: 'Google Ads Manager',
  description: 'Optimizes ad spend and reporting.',
  status: 'active',
  sandbox_ids: [SANDBOX_ID],
  agent_rules: ['Always explain optimizations plainly'],
  runtime_inputs: [
    {
      key: 'GOOGLE_ADS_CUSTOMER_ID',
      label: 'Customer ID',
      description: 'Primary Google Ads account identifier',
      required: true,
      source: 'architect_requirement',
      value: '',
    },
    {
      key: 'REPORTING_WINDOW',
      label: 'Reporting Window',
      description: 'Date range for summaries',
      required: false,
      source: 'skill_requirement',
      value: '30d',
    },
  ],
  tool_connections: [
    {
      tool_id: 'google-ads',
      name: 'Google Ads',
      description: 'Campaign management',
      status: 'configured',
      connector_type: 'mcp',
    },
  ],
  triggers: [
    {
      id: 'trigger-daily',
      title: 'Daily Summary',
      kind: 'schedule',
      status: 'supported',
      description: 'Send a daily summary',
      schedule: '0 9 * * *',
    },
  ],
  channels: [
    {
      kind: 'slack',
      status: 'configured',
      label: 'Slack',
      description: 'Posts to the ads channel',
    },
  ],
  workspace_memory: {
    instructions: 'Use the latest spend report first.',
    continuity_summary: 'Waiting on April spend targets.',
    pinned_paths: ['reports/april.md'],
    updated_at: '2026-04-02T08:00:00.000Z',
  },
  creation_session: {
    summary: 'Created from the Google Ads template',
    objectives: ['Lower CPA', 'Improve weekly reporting'],
  },
});

const mockGetAgentForCreatorInOrg = mock(async () => currentAgent);
const mockUpdateAgent = mock(async (_id: string, patch: Record<string, unknown>) => {
  currentAgent = makeAgentRecord({
    ...currentAgent,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
  });
  return currentAgent;
});
const mockUpdateAgentConfig = mock(async (_id: string, patch: Record<string, unknown>) => {
  currentAgent = makeAgentRecord({
    ...currentAgent,
    ...(patch.agentRules !== undefined ? { agent_rules: patch.agentRules } : {}),
    ...(patch.runtimeInputs !== undefined ? { runtime_inputs: patch.runtimeInputs } : {}),
  });
  return currentAgent;
});
const mockUpdateAgentWorkspaceMemory = mock(async (_id: string, patch: Record<string, unknown>) => {
  currentAgent = makeAgentRecord({
    ...currentAgent,
    workspace_memory: {
      instructions: (patch.instructions as string | undefined) ?? currentAgent.workspace_memory?.instructions ?? '',
      continuity_summary:
        (patch.continuitySummary as string | undefined)
        ?? currentAgent.workspace_memory?.continuity_summary
        ?? '',
      pinned_paths:
        (patch.pinnedPaths as string[] | undefined)
        ?? currentAgent.workspace_memory?.pinned_paths
        ?? [],
      updated_at: '2026-04-02T10:30:00.000Z',
    },
  });
  return currentAgent.workspace_memory;
});

mock.module('../../src/store', () => ({
  getSandbox: mock(async () => null),
  deleteSandbox: mock(async () => false),
  listSandboxes: mock(async () => []),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  updateSandboxSharedCodex: mock(async () => {}),
  initDb: mock(async () => {}),
}));

mock.module('../../src/conversationStore', () => ({
  initDb: mock(async () => {}),
  getConversation: mock(async () => null),
  getConversationForSandbox: mock(async () => null),
  listConversationsPage: mock(async () => ({ items: [], has_more: false, next_cursor: null })),
  createConversation: mock(async () => ({})),
  getMessagesPage: mock(async () => ({ messages: [], has_more: false, next_cursor: null })),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
}));

mock.module('../../src/agentStore', () => ({
  initDb: mock(async () => {}),
  listAgents: mock(async () => []),
  listAgentsForCreator: mock(async () => []),
  listAgentsForCreatorInOrg: mock(async () => [currentAgent]),
  saveAgent: mock(async () => currentAgent),
  getAgent: mock(async () => currentAgent),
  getAgentForCreator: mock(async () => currentAgent),
  getAgentForCreatorInOrg: mockGetAgentForCreatorInOrg,
  updateAgent: mockUpdateAgent,
  updateAgentConfig: mockUpdateAgentConfig,
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => currentAgent),
  setForgeSandbox: mock(async () => currentAgent),
  promoteForgeSandbox: mock(async () => currentAgent),
  clearForgeSandbox: mock(async () => currentAgent),
  getAgentWorkspaceMemory: mock(async () => currentAgent.workspace_memory),
  updateAgentWorkspaceMemory: mockUpdateAgentWorkspaceMemory,
  getAgentCredentials: mock(async () => []),
  getAgentCredentialSummary: mock(async () => []),
  saveAgentCredential: mock(async () => {}),
  deleteAgentCredential: mock(async () => {}),
  removeSandboxFromAgent: mock(async () => currentAgent),
  getAgentBySandboxId: mock(async () => null),
}));

mock.module('../../src/orgStore', () => ({
  createOrg: mock(async (name: string, slug: string, kind = 'customer') => ({
    id: `org-${slug}`,
    name,
    slug,
    kind,
    status: 'active',
  })),
  getOrg: mock(async () => ({
    id: 'org-customer-1',
    name: 'Globex Corporation',
    slug: 'globex-corporation',
    kind: 'customer',
    status: 'active',
  })),
  listOrgs: mock(async () => []),
}));

mock.module('../../src/auth/customerAccess', () => ({
  requireActiveCustomerOrg: mock(async (user?: Record<string, unknown>) => ({
    user,
    organization: {
      id: 'org-customer-1',
      name: 'Globex Corporation',
      slug: 'globex-corporation',
      kind: 'customer',
      plan: 'starter',
    },
    membership: {
      id: 'membership-1',
      role: 'admin',
      status: 'active',
    },
  })),
}));

mock.module('../../src/auth/builderAccess', () => ({
  requireActiveDeveloperOrg: mock(async () => ({
    organization: {
      id: 'org-dev-1',
      name: 'Developer Org',
      slug: 'developer-org',
      kind: 'developer',
      plan: 'free',
    },
  })),
}));

mock.module('../../src/sandboxManager', () => ({
  PREVIEW_PORTS: [],
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, 'true']),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => {}),
  waitForGateway: mock(async () => true),
}));

mock.module('../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  getFormattedChannelsConfig: mock(async () => ({})),
  configureChannels: mock(async () => ({ ok: true })),
}));

mock.module('../../src/backendReadiness', () => {
  let ready = true;
  let reason: string | null = null;
  return {
    markBackendReady: () => {
      ready = true;
      reason = null;
    },
    markBackendNotReady: (nextReason = 'Waiting for database initialization') => {
      ready = false;
      reason = nextReason;
    },
    getBackendReadiness: () => ({ status: ready ? 'ready' : 'not_ready', ready, reason }),
  };
});

mock.module('../../src/docker', () => ({
  buildConfigureAgentCronAddCommand: mock(() => 'echo ok'),
  buildCronDeleteCommand: mock(() => 'echo ok'),
  buildCronRunCommand: mock(() => 'echo ok'),
  buildHomeFileWriteCommand: mock(() => 'echo ok'),
  dockerContainerRunning: mock(async () => true),
  dockerExec: mock(async () => [true, '']),
  dockerSpawn: mock(async () => [0, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  joinShellArgs: (args: unknown[]) => args.map(String).join(' '),
  listManagedSandboxContainers: mock(async () => []),
  normalizePathSegment: (value: string) => value,
  parseManagedSandboxContainerList: mock(() => []),
}));

mock.module('../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mock(async () => {}),
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
}));

mock.module('axios', () => ({
  default: { get: mock(async () => ({ status: 200, data: {} })), post: mock(async () => ({ status: 200, data: {} })) },
  get: mock(async () => ({ status: 200, data: {} })),
  post: mock(async () => ({ status: 200, data: {} })),
}));

const { request, resetStreams } = await import('../helpers/app.ts?unitCustomerAgentConfigApp');

function customerAuthHeader() {
  return `Bearer ${signAccessToken({
    userId: 'customer-user-1',
    email: 'prasanjit@ruh.ai',
    role: 'end_user',
    orgId: 'org-customer-1',
  })}`;
}

async function patchCustomerConfig(body: Record<string, unknown>) {
  const send = () => request()
    .patch(`/api/agents/${AGENT_ID}/customer-config`)
    .set('Authorization', customerAuthHeader())
    .send(body);

  try {
    return await send();
  } catch (error) {
    if (
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'ECONNRESET'
    ) {
      return await send();
    }
    throw error;
  }
}

beforeEach(() => {
  currentAgent = makeAgentRecord({
    id: AGENT_ID,
    name: 'Google Ads Manager',
    description: 'Optimizes ad spend and reporting.',
    status: 'active',
    sandbox_ids: [SANDBOX_ID],
    agent_rules: ['Always explain optimizations plainly'],
    runtime_inputs: [
      {
        key: 'GOOGLE_ADS_CUSTOMER_ID',
        label: 'Customer ID',
        description: 'Primary Google Ads account identifier',
        required: true,
        source: 'architect_requirement',
        value: '',
      },
      {
        key: 'REPORTING_WINDOW',
        label: 'Reporting Window',
        description: 'Date range for summaries',
        required: false,
        source: 'skill_requirement',
        value: '30d',
      },
    ],
    tool_connections: [
      {
        tool_id: 'google-ads',
        name: 'Google Ads',
        description: 'Campaign management',
        status: 'configured',
        connector_type: 'mcp',
      },
    ],
    triggers: [
      {
        id: 'trigger-daily',
        title: 'Daily Summary',
        kind: 'schedule',
        status: 'supported',
        description: 'Send a daily summary',
        schedule: '0 9 * * *',
      },
    ],
    channels: [
      {
        kind: 'slack',
        status: 'configured',
        label: 'Slack',
        description: 'Posts to the ads channel',
      },
    ],
    workspace_memory: {
      instructions: 'Use the latest spend report first.',
      continuity_summary: 'Waiting on April spend targets.',
      pinned_paths: ['reports/april.md'],
      updated_at: '2026-04-02T08:00:00.000Z',
    },
    creation_session: {
      summary: 'Created from the Google Ads template',
      objectives: ['Lower CPA', 'Improve weekly reporting'],
    },
  });

  mockGetAgentForCreatorInOrg.mockReset();
  mockGetAgentForCreatorInOrg.mockImplementation(async () => currentAgent);
  mockUpdateAgent.mockReset();
  mockUpdateAgent.mockImplementation(async (_id: string, patch: Record<string, unknown>) => {
    currentAgent = makeAgentRecord({
      ...currentAgent,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    });
    return currentAgent;
  });
  mockUpdateAgentConfig.mockReset();
  mockUpdateAgentConfig.mockImplementation(async (_id: string, patch: Record<string, unknown>) => {
    currentAgent = makeAgentRecord({
      ...currentAgent,
      ...(patch.agentRules !== undefined ? { agent_rules: patch.agentRules } : {}),
      ...(patch.runtimeInputs !== undefined ? { runtime_inputs: patch.runtimeInputs } : {}),
    });
    return currentAgent;
  });
  mockUpdateAgentWorkspaceMemory.mockReset();
  mockUpdateAgentWorkspaceMemory.mockImplementation(async (_id: string, patch: Record<string, unknown>) => {
    currentAgent = makeAgentRecord({
      ...currentAgent,
      workspace_memory: {
        instructions: (patch.instructions as string | undefined) ?? currentAgent.workspace_memory?.instructions ?? '',
        continuity_summary:
          (patch.continuitySummary as string | undefined)
          ?? currentAgent.workspace_memory?.continuity_summary
          ?? '',
        pinned_paths:
          (patch.pinnedPaths as string[] | undefined)
          ?? currentAgent.workspace_memory?.pinned_paths
          ?? [],
        updated_at: '2026-04-02T10:30:00.000Z',
      },
    });
    return currentAgent.workspace_memory;
  });
  resetStreams();
});

describe('customer agent config routes', () => {
  test('GET returns the normalized customer runtime config snapshot', async () => {
    const res = await request().get(`/api/agents/${AGENT_ID}/customer-config`).set('Authorization', customerAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      agent: {
        id: AGENT_ID,
        name: 'Google Ads Manager',
        description: 'Optimizes ad spend and reporting.',
        status: 'active',
        sandboxIds: [SANDBOX_ID],
      },
      agentRules: ['Always explain optimizations plainly'],
      runtimeInputs: [
        {
          key: 'GOOGLE_ADS_CUSTOMER_ID',
          label: 'Customer ID',
          value: '',
        },
        {
          key: 'REPORTING_WINDOW',
          value: '30d',
        },
      ],
      toolConnections: [
        {
          name: 'Google Ads',
        },
      ],
      triggers: [
        {
          id: 'trigger-daily',
        },
      ],
      channels: [
        {
          kind: 'slack',
        },
      ],
      workspaceMemory: {
        instructions: 'Use the latest spend report first.',
        continuitySummary: 'Waiting on April spend targets.',
        pinnedPaths: ['reports/april.md'],
      },
      creationSession: {
        summary: 'Created from the Google Ads template',
      },
    });
  });

  test('PATCH updates safe runtime fields and preserves runtime input metadata', async () => {
    const res = await patchCustomerConfig({
      name: 'Revenue Copilot',
      description: 'Keeps spend efficient and summaries tighter.',
      agentRules: ['Always tie optimizations back to ROI'],
      runtimeInputValues: [
        {
          key: 'GOOGLE_ADS_CUSTOMER_ID',
          value: '123-456-7890',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(mockUpdateAgent).toHaveBeenCalledWith(AGENT_ID, {
      name: 'Revenue Copilot',
      description: 'Keeps spend efficient and summaries tighter.',
    });
    expect(mockUpdateAgentConfig).toHaveBeenCalledWith(AGENT_ID, {
      agentRules: ['Always tie optimizations back to ROI'],
      runtimeInputs: [
        {
          key: 'GOOGLE_ADS_CUSTOMER_ID',
          label: 'Customer ID',
          description: 'Primary Google Ads account identifier',
          required: true,
          source: 'architect_requirement',
          value: '123-456-7890',
        },
        {
          key: 'REPORTING_WINDOW',
          label: 'Reporting Window',
          description: 'Date range for summaries',
          required: false,
          source: 'skill_requirement',
          value: '30d',
        },
      ],
    });
    expect(res.body).toMatchObject({
      agent: {
        name: 'Revenue Copilot',
      },
      agentRules: ['Always tie optimizations back to ROI'],
      runtimeInputs: [
        {
          key: 'GOOGLE_ADS_CUSTOMER_ID',
          value: '123-456-7890',
        },
        {
          key: 'REPORTING_WINDOW',
          value: '30d',
        },
      ],
    });
  });

  test('PATCH rejects unknown fields', async () => {
    const res = await request()
      .patch(`/api/agents/${AGENT_ID}/customer-config`)
      .set('Authorization', customerAuthHeader())
      .send({
        triggerLabel: 'daily',
      });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      detail: 'Unknown field: triggerLabel',
    });
  });

  test('GET allows customer access to workspace memory', async () => {
    const res = await request().get(`/api/agents/${AGENT_ID}/workspace-memory`).set('Authorization', customerAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      instructions: 'Use the latest spend report first.',
      continuity_summary: 'Waiting on April spend targets.',
      pinned_paths: ['reports/april.md'],
      updated_at: '2026-04-02T08:00:00.000Z',
    });
  });

  test('PATCH allows customer updates to workspace memory', async () => {
    const res = await request()
      .patch(`/api/agents/${AGENT_ID}/workspace-memory`)
      .set('Authorization', customerAuthHeader())
      .send({
        instructions: '  Use the latest ROAS snapshot first.  ',
        continuitySummary: '  Waiting on May spend targets.  ',
        pinnedPaths: [' reports/may.md '],
      });

    expect(res.status).toBe(200);
    expect(mockUpdateAgentWorkspaceMemory).toHaveBeenCalledWith(AGENT_ID, {
      instructions: 'Use the latest ROAS snapshot first.',
      continuitySummary: 'Waiting on May spend targets.',
      pinnedPaths: ['reports/may.md'],
    });
    expect(res.body).toEqual({
      instructions: 'Use the latest ROAS snapshot first.',
      continuity_summary: 'Waiting on May spend targets.',
      pinned_paths: ['reports/may.md'],
      updated_at: '2026-04-02T10:30:00.000Z',
    });
  });
});
