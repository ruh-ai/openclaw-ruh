import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockGetAgent = mock(async () => ({
  id: 'agent-1',
  name: 'Credentialed Agent',
}));
const mockGetAgentCredentialSummary = mock(async () => ([
  {
    toolId: 'google-ads',
    hasCredentials: true,
    createdAt: '2026-03-26T09:00:00.000Z',
  },
]));
const mockSaveAgentCredential = mock(async () => {});
const mockDeleteAgentCredential = mock(async () => {});
const mockWriteAuditEvent = mock(async () => {});
const mockEncryptCredentials = mock((_plain: Record<string, string>) => ({
  encrypted: 'ciphertext',
  iv: 'nonce',
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
  saveAgent: mock(async () => ({})),
  getAgent: mockGetAgent,
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
  getAgentCredentialSummary: mockGetAgentCredentialSummary,
  saveAgentCredential: mockSaveAgentCredential,
  deleteAgentCredential: mockDeleteAgentCredential,
}));

mock.module('../../src/credentials', () => ({
  encryptCredentials: mockEncryptCredentials,
}));

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
}));

mock.module('../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  setTelegramConfig: mock(async () => ({ ok: true, logs: [] })),
  setSlackConfig: mock(async () => ({ ok: true, logs: [] })),
  probeChannelStatus: mock(async () => ({ ok: true })),
  listPairingRequests: mock(async () => ({ ok: true, codes: [] })),
  approvePairing: mock(async () => ({ ok: true })),
}));

mock.module('../../src/backendReadiness', () => ({
  getBackendReadiness: () => ({ status: 'ready', ready: true, reason: null }),
}));

mock.module('../../src/docker', () => ({
  buildConfigureAgentCronAddCommand: () => '',
  buildCronDeleteCommand: () => '',
  buildCronRunCommand: () => '',
  buildHomeFileWriteCommand: () => '',
  dockerContainerRunning: mock(async () => true),
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (value: string) => value,
}));

mock.module('../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mockWriteAuditEvent,
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
}));

const { app } = await import('../../src/app');

type MockReq = {
  method: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
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
  const handle = route?.stack?.[0]?.handle;
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
  mockGetAgent.mockImplementation(async () => ({
    id: 'agent-1',
    name: 'Credentialed Agent',
  }));
  mockGetAgentCredentialSummary.mockReset();
  mockGetAgentCredentialSummary.mockImplementation(async () => ([
    {
      toolId: 'google-ads',
      hasCredentials: true,
      createdAt: '2026-03-26T09:00:00.000Z',
    },
  ]));
  mockSaveAgentCredential.mockReset();
  mockSaveAgentCredential.mockImplementation(async () => {});
  mockDeleteAgentCredential.mockReset();
  mockDeleteAgentCredential.mockImplementation(async () => {});
  mockWriteAuditEvent.mockReset();
  mockWriteAuditEvent.mockImplementation(async () => {});
  mockEncryptCredentials.mockReset();
  mockEncryptCredentials.mockImplementation((_plain: Record<string, string>) => ({
    encrypted: 'ciphertext',
    iv: 'nonce',
  }));
});

describe('agent credential routes', () => {
  test('GET returns summary-only credential state', async () => {
    const res = await invokeRoute('GET', '/api/agents/:id/credentials', makeReq({
      params: { id: 'agent-1' },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      {
        toolId: 'google-ads',
        hasCredentials: true,
        createdAt: '2026-03-26T09:00:00.000Z',
      },
    ]);
  });

  test('PUT encrypts and stores credentials without echoing them back', async () => {
    const res = await invokeRoute('PUT', '/api/agents/:id/credentials/:toolId', makeReq({
      method: 'PUT',
      params: { id: 'agent-1', toolId: 'google-ads' },
      body: {
        credentials: {
          GOOGLE_ADS_CLIENT_ID: 'client-id',
          GOOGLE_ADS_CLIENT_SECRET: 'secret',
        },
      },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockEncryptCredentials).toHaveBeenCalledWith({
      GOOGLE_ADS_CLIENT_ID: 'client-id',
      GOOGLE_ADS_CLIENT_SECRET: 'secret',
    });
    expect(mockSaveAgentCredential).toHaveBeenCalledWith('agent-1', 'google-ads', 'ciphertext', 'nonce');
    expect(res.body).toEqual({ ok: true, toolId: 'google-ads' });
    expect(JSON.stringify(res.body)).not.toContain('client-id');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
