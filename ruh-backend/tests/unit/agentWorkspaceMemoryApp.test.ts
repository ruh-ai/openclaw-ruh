import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockGetAgent = mock(async () => ({
  id: 'agent-1',
  name: 'Memory Agent',
}));
const mockGetAgentWorkspaceMemory = mock(async () => ({
  instructions: 'Keep status updates concise',
  continuity_summary: 'Waiting on design sign-off',
  pinned_paths: ['plans/launch.md'],
  updated_at: '2026-03-25T17:30:00.000Z',
}));
const mockUpdateAgentWorkspaceMemory = mock(async () => ({
  instructions: 'Keep status updates concise',
  continuity_summary: 'Waiting on design sign-off',
  pinned_paths: ['plans/launch.md'],
  updated_at: '2026-03-25T17:30:00.000Z',
}));

mock.module('../../src/auth/builderAccess', () => ({
  requireActiveDeveloperOrg: mock(async (user?: Record<string, unknown>) => ({
    user,
    organization: {
      id: 'org-test-001',
      name: 'Test Dev Org',
      slug: 'test-dev-org',
      kind: 'developer',
      plan: 'free',
    },
  })),
}));

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
  listAgentsForCreatorInOrg: mock(async () => []),
  saveAgent: mock(async () => ({})),
  getAgent: mockGetAgent,
  getAgentForCreator: mock(async () => ({ id: 'agent-1', name: 'Memory Agent' })),
  getAgentForCreatorInOrg: mock(async () => ({ id: 'agent-1', name: 'Memory Agent' })),
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  setForgeSandbox: mock(async () => ({})),
  promoteForgeSandbox: mock(async () => ({})),
  clearForgeSandbox: mock(async () => ({})),
  removeSandboxFromAgent: mock(async () => ({})),
  getAgentWorkspaceMemory: mockGetAgentWorkspaceMemory,
  updateAgentWorkspaceMemory: mockUpdateAgentWorkspaceMemory,
  getAgentCredentials: mock(async () => []),
  getAgentCredentialSummary: mock(async () => []),
  saveAgentCredential: mock(async () => {}),
  deleteAgentCredential: mock(async () => {}),
  getAgentBySandboxId: mock(async () => null),
}));

mock.module('../../src/orgStore', () => ({
  createOrg: mock(async (name: string, slug: string, kind = 'developer') => ({
    id: `org-${slug}`,
    name,
    slug,
    kind,
    status: 'active',
  })),
  getOrg: mock(async () => ({
    id: 'org-test-001',
    name: 'Test Dev Org',
    slug: 'test-dev-org',
    kind: 'developer',
    status: 'active',
  })),
  listOrgs: mock(async () => []),
}));

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, 'true']),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
  PREVIEW_PORTS: [],
  waitForGateway: mock(async () => true),
  sandboxExec: mock(async () => [0, '']),
}));

mock.module('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

mock.module('../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  setTelegramConfig: mock(async () => ({ ok: true, logs: [] })),
  setSlackConfig: mock(async () => ({ ok: true, logs: [] })),
  probeChannelStatus: mock(async () => ({ ok: true })),
  listPairingRequests: mock(async () => ({ ok: true, codes: [] })),
  approvePairing: mock(async () => ({ ok: true })),
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
  buildConfigureAgentCronAddCommand: () => '',
  buildCronDeleteCommand: () => '',
  buildCronRunCommand: () => '',
  buildHomeFileWriteCommand: () => '',
  dockerContainerRunning: mock(async () => true),
  dockerExec: mock(async () => [true, '']),
  dockerSpawn: mock(async () => [0, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  listManagedSandboxContainers: mock(async () => []),
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (value: string) => value,
}));

mock.module('../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mock(async () => {}),
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
}));

const { app } = await import('../../src/app.ts?unitAgentWorkspaceMemoryApp');

type MockReq = {
  method: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  ip: string;
  socket: { remoteAddress: string };
  user?: Record<string, unknown>;
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
    user: {
      userId: 'user-test-001',
      email: 'developer@test.dev',
      role: 'developer',
      orgId: 'org-test-001',
    },
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

  const layer = router.stack
    .find((entry) => {
      const route = entry['route'] as { path?: string; methods?: Record<string, boolean> } | undefined;
      return route?.path === path && route.methods?.[method.toLowerCase()];
    });

  const route = layer?.['route'] as { stack: Array<{ handle: Function }> } | undefined;
  const stack = route?.stack;
  const handle = stack && stack.length > 0 ? stack[stack.length - 1].handle : undefined;
  if (!handle) {
    throw new Error(`Route not found: ${method} ${path}`);
  }
  return handle as (req: MockReq, res: ReturnType<typeof makeRes>, next: (error?: unknown) => void) => void;
}

async function invokeRoute(method: string, path: string, req: MockReq) {
  const handler = getRouteHandler(method, path);
  const res = makeRes();

  const nextResult = new Promise<unknown>((resolve, reject) => {
    handler(req, res, (error?: unknown) => {
      if (error) reject(error);
      else resolve(undefined);
    });
  });

  await Promise.race([res.done, nextResult]);
  return res;
}

beforeEach(() => {
  mockGetAgent.mockReset();
  mockGetAgent.mockImplementation(async () => ({ id: 'agent-1', name: 'Memory Agent' }));
  mockGetAgentWorkspaceMemory.mockReset();
  mockGetAgentWorkspaceMemory.mockImplementation(async () => ({
    instructions: 'Keep status updates concise',
    continuity_summary: 'Waiting on design sign-off',
    pinned_paths: ['plans/launch.md'],
    updated_at: '2026-03-25T17:30:00.000Z',
  }));
  mockUpdateAgentWorkspaceMemory.mockReset();
  mockUpdateAgentWorkspaceMemory.mockImplementation(async () => ({
    instructions: 'Keep status updates concise',
    continuity_summary: 'Waiting on design sign-off',
    pinned_paths: ['plans/launch.md'],
    updated_at: '2026-03-25T17:30:00.000Z',
  }));
});

describe('agent workspace memory routes', () => {
  test('GET returns the normalized workspace-memory payload', async () => {
    const res = await invokeRoute('GET', '/api/agents/:id/workspace-memory', makeReq({
      params: { id: 'agent-1' },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      instructions: 'Keep status updates concise',
      continuity_summary: 'Waiting on design sign-off',
      pinned_paths: ['plans/launch.md'],
      updated_at: '2026-03-25T17:30:00.000Z',
    });
  });

  test('PATCH validates and forwards workspace-memory updates', async () => {
    const res = await invokeRoute('PATCH', '/api/agents/:id/workspace-memory', makeReq({
      method: 'PATCH',
      params: { id: 'agent-1' },
      body: {
        instructions: '  Keep status updates concise  ',
        continuitySummary: '  Waiting on design sign-off  ',
        pinnedPaths: [' plans/launch.md '],
      },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockUpdateAgentWorkspaceMemory).toHaveBeenCalledWith('agent-1', {
      instructions: 'Keep status updates concise',
      continuitySummary: 'Waiting on design sign-off',
      pinnedPaths: ['plans/launch.md'],
    });
  });
});
