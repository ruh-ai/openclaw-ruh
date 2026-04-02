import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { AGENT_ID, SANDBOX_ID, makeAgentRecord, makeSandboxRecord } from '../helpers/fixtures';

const mockGetSandbox = mock(async () => makeSandboxRecord({ sandbox_id: SANDBOX_ID }));
const mockGetAgentForCreatorInOrg = mock(async () =>
  makeAgentRecord({
    id: AGENT_ID,
    name: 'Google Ads Manager',
    status: 'active',
    sandbox_ids: [SANDBOX_ID],
  })
);
const mockWaitForGateway = mock(async () => true);
const mockRestartGateway = mock(async () => {});
const mockEnsureInteractiveRuntimeServices = mock(async () => {});
const mockSandboxManagerDockerExec = mock(async () => [true, 'true']);
const mockDockerContainerRunning = mock(async () => true);

mock.module('../../src/store', () => ({
  getSandbox: mockGetSandbox,
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
  saveAgent: mock(async () => ({})),
  getAgent: mock(async () => null),
  getAgentForCreator: mock(async () => null),
  getAgentForCreatorInOrg: mockGetAgentForCreatorInOrg,
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  setForgeSandbox: mock(async () => ({})),
  promoteForgeSandbox: mock(async () => ({})),
  clearForgeSandbox: mock(async () => ({})),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
}));

mock.module('../../src/auth/middleware', () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: (error?: unknown) => void) => {
    req.user = {
      userId: 'customer-user-1',
      email: 'prasanjit@ruh.ai',
      role: 'end_user',
      orgId: 'org-customer-1',
    };
    next();
  },
  optionalAuth: (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
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
  dockerExec: mockSandboxManagerDockerExec,
  ensureInteractiveRuntimeServices: mockEnsureInteractiveRuntimeServices,
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mockRestartGateway,
  waitForGateway: mockWaitForGateway,
}));

mock.module('../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  getFormattedChannelsConfig: mock(async () => ({})),
  configureChannels: mock(async () => ({ ok: true })),
}));

mock.module('../../src/backendReadiness', () => ({
  markBackendReady: mock(() => {}),
  markBackendNotReady: mock(() => {}),
  getBackendReadiness: mock(() => ({ status: 'ready', reason: null, timestamp: Date.now() })),
}));

mock.module('../../src/docker', () => ({
  buildConfigureAgentCronAddCommand: mock(() => 'echo ok'),
  buildCronDeleteCommand: mock(() => 'echo ok'),
  buildCronRunCommand: mock(() => 'echo ok'),
  buildHomeFileWriteCommand: mock(() => 'echo ok'),
  dockerContainerRunning: mockDockerContainerRunning,
  dockerExec: mock(async () => [true, '']),
  dockerSpawn: mock(async () => [0, '']),
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

const { request, resetStreams } = await import('../helpers/app');

beforeEach(() => {
  mockGetSandbox.mockReset();
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord({ sandbox_id: SANDBOX_ID }));
  mockGetAgentForCreatorInOrg.mockReset();
  mockGetAgentForCreatorInOrg.mockImplementation(async () =>
    makeAgentRecord({
      id: AGENT_ID,
      name: 'Google Ads Manager',
      status: 'active',
      sandbox_ids: [SANDBOX_ID],
    })
  );
  mockWaitForGateway.mockReset();
  mockWaitForGateway.mockImplementation(async () => true);
  mockRestartGateway.mockReset();
  mockRestartGateway.mockImplementation(async () => {});
  mockEnsureInteractiveRuntimeServices.mockReset();
  mockEnsureInteractiveRuntimeServices.mockImplementation(async () => {});
  mockSandboxManagerDockerExec.mockReset();
  mockSandboxManagerDockerExec.mockImplementation(async () => [true, 'true']);
  mockDockerContainerRunning.mockReset();
  mockDockerContainerRunning.mockImplementation(async () => true);
  resetStreams();
});

describe('POST /api/agents/:id/launch', () => {
  test('repairs an existing runtime when the gateway is down', async () => {
    mockWaitForGateway
      .mockImplementationOnce(async () => false)
      .mockImplementationOnce(async () => true);

    const res = await request().post(`/api/agents/${AGENT_ID}/launch`).send({});

    expect(res.status).toBe(200);
    expect(mockEnsureInteractiveRuntimeServices).toHaveBeenCalledWith(
      `openclaw-${SANDBOX_ID}`,
    );
    expect(mockRestartGateway).toHaveBeenCalledWith(`openclaw-${SANDBOX_ID}`);
    expect(res.body).toMatchObject({
      launched: false,
      sandboxId: SANDBOX_ID,
      agent: { id: AGENT_ID, sandbox_ids: [SANDBOX_ID] },
    });
  });

  test('reuses an already healthy runtime without restarting it', async () => {
    const res = await request().post(`/api/agents/${AGENT_ID}/launch`).send({});

    expect(res.status).toBe(200);
    expect(mockEnsureInteractiveRuntimeServices).toHaveBeenCalledWith(
      `openclaw-${SANDBOX_ID}`,
    );
    expect(mockRestartGateway).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      launched: false,
      sandboxId: SANDBOX_ID,
    });
  });
});
