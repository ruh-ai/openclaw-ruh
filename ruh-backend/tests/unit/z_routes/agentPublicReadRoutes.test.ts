import { beforeEach, describe, expect, mock, test } from 'bun:test';

const agentPayload = {
  id: 'agent-1',
  name: 'Webhook Agent',
  avatar: '🤖',
  description: 'Accepts inbound alerts.',
  skills: ['Alert Intake'],
  trigger_label: 'Webhook POST',
  status: 'draft',
  sandbox_ids: [],
  forge_sandbox_id: null,
  skill_graph: null,
  workflow: null,
  agent_rules: [],
  tool_connections: [],
  triggers: [
    {
      id: 'webhook-post',
      title: 'Webhook POST',
      kind: 'webhook',
      status: 'supported',
      description: 'Accept signed inbound POST events.',
      webhookPublicId: 'public-webhook-1',
      webhookSecretHash: 'hashed-secret',
      webhookSecretLastFour: '1234',
      webhookSecretIssuedAt: '2026-03-27T09:00:00.000Z',
    },
  ],
  improvements: [],
  workspace_memory: {
    instructions: '',
    continuity_summary: '',
    pinned_paths: [],
    updated_at: null,
  },
  created_at: '2026-03-27T09:00:00.000Z',
  updated_at: '2026-03-27T09:00:00.000Z',
};

const mockGetAgent = mock(async () => agentPayload);
const mockGetAgentForCreator = mock(async () => agentPayload);
const mockListAgents = mock(async () => [agentPayload]);
const mockListAgentsForCreator = mock(async () => [agentPayload]);

mock.module('../../../src/store', () => ({
  getSandbox: mock(async () => null),
  deleteSandbox: mock(async () => false),
  listSandboxes: mock(async () => []),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  updateSandboxSharedCodex: mock(async () => {}),
  initDb: mock(async () => {}),
}));

mock.module('../../../src/conversationStore', () => ({
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

mock.module('../../../src/agentStore', () => ({
  initDb: mock(async () => {}),
  listAgents: mockListAgents,
  listAgentsForCreator: mockListAgentsForCreator,
  listAgentsForCreatorInOrg: mock(async () => []),
  saveAgent: mock(async () => ({})),
  getAgent: mockGetAgent,
  getAgentForCreator: mockGetAgentForCreator,
  getAgentForCreatorInOrg: mock(async () => null),
  getAgentOwnership: mock(async () => null),
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  addSandboxToAgent: mock(async () => ({})),
  removeSandboxFromAgent: mock(async () => ({})),
  setForgeSandbox: mock(async () => ({})),
  promoteForgeSandbox: mock(async () => ({})),
  clearForgeSandbox: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
  updatePaperclipMapping: mock(async () => null),
  getAgentBySandboxId: mock(async () => null),
  saveAgentCredential: mock(async () => {}),
  deleteAgentCredential: mock(async () => {}),
  getAgentCredentials: mock(async () => []),
  getAgentCredentialSummary: mock(async () => []),
}));

mock.module('../../../src/auth/middleware', () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: (error?: unknown) => void) => {
    req.user = {
      userId: 'developer-1',
      email: 'developer@test.dev',
      role: 'developer',
      // orgId intentionally omitted: getActiveOrgKind short-circuits to null
      // when req.user.orgId is falsy, bypassing orgStore.getOrg entirely
    };
    next();
  },
  optionalAuth: (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
}));

mock.module('../../../src/auth/builderAccess', () => ({
  requireActiveDeveloperOrg: mock(async (user?: Record<string, unknown>) => ({
    user,
    organization: {
      id: 'org-dev-1',
      name: 'Developer Org',
      slug: 'developer-org',
      kind: 'developer',
      plan: 'free',
    },
  })),
}));

mock.module('../../../src/sandboxManager', () => ({
  PREVIEW_PORTS: [],
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
}));

mock.module('../../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  setTelegramConfig: mock(async () => ({ ok: true, logs: [] })),
  setSlackConfig: mock(async () => ({ ok: true, logs: [] })),
  probeChannelStatus: mock(async () => ({ ok: true })),
  listPairingRequests: mock(async () => ({ ok: true, codes: [] })),
  approvePairing: mock(async () => ({ ok: true })),
}));

mock.module('../../../src/backendReadiness', () => ({
  getBackendReadiness: () => ({ status: 'ready', ready: true, reason: null }),
}));

mock.module('../../../src/docker', () => ({
  buildConfigureAgentCronAddCommand: () => '',
  buildCronDeleteCommand: () => '',
  buildCronRunCommand: () => '',
  buildHomeFileWriteCommand: () => '',
  dockerContainerRunning: mock(async () => true),
  dockerExec: mock(async () => [true, '']),
  dockerSpawn: mock(async () => ({ code: 0, stdout: '', stderr: '' })),
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  listManagedSandboxContainers: mock(async () => []),
  normalizePathSegment: (value: string) => value,
  parseManagedSandboxContainerList: mock(() => []),
}));

mock.module('../../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mock(async () => {}),
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
}));

// orgStore must be mocked so getActiveOrgKind doesn't hit the real DB pool.
// When req.user.orgId is set (from a previously-registered requireAuth mock),
// getActiveOrgKind calls orgStore.getOrg — returning null makes it fall through
// to the developer flow without needing a real database connection.
mock.module('../../../src/orgStore', () => ({
  initDb: mock(async () => {}),
  createOrg: mock(async () => ({})),
  getOrg: mock(async () => null),
  listOrgs: mock(async () => []),
  updateOrg: mock(async () => ({})),
  deleteOrg: mock(async () => true),
}));

const { app } = await import('../../../src/app');

type MockReq = {
  method: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  user?: Record<string, unknown>;
  ip: string;
  socket: { remoteAddress: string };
};

function makeReq(overrides: Partial<MockReq> = {}): MockReq {
  return {
    method: 'GET',
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function makeRes() {
  let resolveJson: ((value: unknown) => void) | null = null;
  const done = new Promise<unknown>((resolve) => {
    resolveJson = resolve;
  });

  return {
    statusCode: 200,
    body: undefined as unknown,
    done,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      resolveJson?.(payload);
      return this;
    },
    setHeader() {},
  };
}

function getRouteHandler(method: string, path: string) {
  const router = (app as unknown as { _router?: { stack: Array<Record<string, unknown>> } })._router;
  if (!router) {
    throw new Error('Express router not initialized');
  }

  const layer = router.stack.find((entry) => {
    const route = entry.route as { path?: string; methods?: Record<string, boolean> } | undefined;
    return route?.path === path && route.methods?.[method.toLowerCase()];
  });

  const route = layer?.route as { stack: Array<{ handle: Function }> } | undefined;
  const handles = route?.stack?.map((entry) => entry.handle) ?? [];
  if (handles.length === 0) {
    throw new Error(`Route not found: ${method} ${path}`);
  }

  return handles as Array<(req: MockReq, res: ReturnType<typeof makeRes>, next: (error?: unknown) => void) => void>;
}

async function invokeRoute(method: string, path: string, req: MockReq) {
  const handlers = getRouteHandler(method, path);
  const res = makeRes();

  let index = 0;
  const runNext = async (): Promise<void> => {
    const handler = handlers[index++];
    if (!handler) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let nextCalled = false;
      const next = (error?: unknown) => {
        nextCalled = true;
        if (error) reject(error);
        else resolve();
      };

      try {
        handler(req, res, next);
      } catch (error) {
        reject(error);
        return;
      }

      queueMicrotask(() => {
        if (!nextCalled) {
          resolve();
        }
      });
    });

    if (index <= handlers.length) {
      await runNext();
    }
  };

  await runNext();
  await Promise.race([
    res.done,
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
  return res;
}

beforeEach(() => {
  mockGetAgent.mockReset();
  mockGetAgent.mockImplementation(async () => agentPayload);
  mockGetAgentForCreator.mockReset();
  mockGetAgentForCreator.mockImplementation(async () => agentPayload);
  mockListAgents.mockReset();
  mockListAgents.mockImplementation(async () => [agentPayload]);
  mockListAgentsForCreator.mockReset();
  mockListAgentsForCreator.mockImplementation(async () => [agentPayload]);
});

describe('agent public read routes', () => {
  test('GET /api/agents/:id redacts webhook secret hashes from public trigger metadata', async () => {
    const res = await invokeRoute('GET', '/api/agents/:id', makeReq({
      params: { id: 'agent-1' },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id: 'agent-1',
      triggers: [
        {
          id: 'webhook-post',
          webhookPublicId: 'public-webhook-1',
          webhookSecretLastFour: '1234',
          webhookSecretIssuedAt: '2026-03-27T09:00:00.000Z',
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toContain('hashed-secret');
  });

  test('GET /api/agents redacts webhook secret hashes from list responses too', async () => {
    const res = await invokeRoute('GET', '/api/agents', makeReq());

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('hashed-secret');
  });
});
