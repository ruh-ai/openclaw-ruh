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
const mockListAgents = mock(async () => [agentPayload]);

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
  listAgents: mockListAgents,
  saveAgent: mock(async () => ({})),
  getAgent: mockGetAgent,
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
}));

mock.module('../../src/sandboxManager', () => ({
  PREVIEW_PORTS: [],
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
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
  dockerSpawn: mock(async () => ({ code: 0, stdout: '', stderr: '' })),
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (value: string) => value,
}));

mock.module('../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mock(async () => {}),
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
  mockGetAgent.mockImplementation(async () => agentPayload);
  mockListAgents.mockReset();
  mockListAgents.mockImplementation(async () => [agentPayload]);
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
