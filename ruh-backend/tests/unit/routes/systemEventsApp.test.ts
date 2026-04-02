import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockListSystemEvents = mock(async (filters: Record<string, unknown> = {}) => ({
  items: [{
    event_id: 'evt-1',
    occurred_at: new Date('2026-03-28T12:00:00Z').toISOString(),
    level: 'info',
    category: 'sandbox.lifecycle',
    action: 'sandbox.create.succeeded',
    status: 'success',
    message: 'Sandbox created successfully',
    request_id: filters.request_id ?? null,
    trace_id: filters.trace_id ?? null,
    span_id: null,
    sandbox_id: filters.sandbox_id ?? null,
    agent_id: filters.agent_id ?? null,
    conversation_id: null,
    source: 'ruh-backend:app',
    details: {},
  }],
  has_more: false,
}));
const mockWriteSystemEvent = mock(async () => {});
const mockSaveSandbox = mock(async () => {});
const mockMarkApproved = mock(async () => {});
const mockGetSandbox = mock(async () => ({
  sandbox_id: 'sb-123',
  sandbox_name: 'Test Sandbox',
  sandbox_state: 'running',
  dashboard_url: null,
  signed_url: null,
  standard_url: 'http://localhost:18789',
  preview_token: null,
  gateway_token: 'gw-token',
  gateway_port: 18789,
  ssh_command: 'docker exec -it openclaw-sb-123 bash',
  created_at: new Date('2026-03-28T12:00:00Z').toISOString(),
  approved: true,
  shared_codex_enabled: false,
  shared_codex_model: null,
}));
const mockGetAgent = mock(async () => ({
  id: 'agent-1',
  name: 'Agent One',
  avatar: '🤖',
  description: 'Test agent',
  skills: [],
  trigger_label: '',
  status: 'draft',
  sandbox_ids: [],
  forge_sandbox_id: null,
  skill_graph: null,
  workflow: null,
  agent_rules: [],
  workspace_memory: {},
  runtime_inputs: [],
  tool_connections: [],
  triggers: [],
  improvements: [],
  discovery_documents: null,
  agent_credentials: [],
  channels: [],
  created_at: new Date('2026-03-28T12:00:00Z').toISOString(),
  updated_at: new Date('2026-03-28T12:00:00Z').toISOString(),
}));

async function* fakeSuccessGen(): AsyncGenerator<[string, unknown]> {
  yield ['log', 'Creating sandbox...'];
  yield ['result', {
    sandbox_id: 'sb-e2e-001',
    sandbox_state: 'started',
    dashboard_url: null,
    signed_url: null,
    standard_url: 'http://localhost:32769',
    preview_token: null,
    gateway_token: 'gw-tok',
    gateway_port: 32769,
    ssh_command: 'docker exec -it openclaw-sb-e2e-001 bash',
  }];
  yield ['approved', { message: 'Approved device' }];
}

const mockCreateSandbox = mock(fakeSuccessGen);

mock.module('../../../src/auth/middleware', () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: (error?: unknown) => void) => {
    req.user = {
      userId: 'user-test-001',
      email: 'developer@test.dev',
      role: 'developer',
      orgId: 'org-test-001',
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
      id: 'org-test-001',
      name: 'Test Dev Org',
      slug: 'test-dev-org',
      kind: 'developer',
      plan: 'free',
    },
  })),
}));

mock.module('../../../src/systemEventStore', () => ({
  writeSystemEvent: mockWriteSystemEvent,
  listSystemEvents: mockListSystemEvents,
}));

mock.module('../../../src/store', () => ({
  getSandbox: mockGetSandbox,
  deleteSandbox: mock(async () => false),
  listSandboxes: mock(async () => []),
  saveSandbox: mockSaveSandbox,
  markApproved: mockMarkApproved,
  updateSandboxSharedCodex: mock(async () => {}),
}));

mock.module('../../../src/agentStore', () => ({
  listAgents: mock(async () => []),
  saveAgent: mock(async () => ({})),
  getAgent: mockGetAgent,
  getAgentForCreator: mock(async () => mockGetAgent()),
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  removeSandboxFromAgent: mock(async () => ({})),
  clearForgeSandbox: mock(async () => {}),
}));

mock.module('../../../src/conversationStore', () => ({
  getConversation: mock(async () => null),
  listConversationsPage: mock(async () => ({ items: [], has_more: false, next_cursor: null })),
  createConversation: mock(async () => ({})),
  getMessagesPage: mock(async () => ({ messages: [], has_more: false, next_cursor: null })),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
}));

mock.module('../../../src/sandboxManager', () => ({
  PREVIEW_PORTS: [],
  createOpenclawSandbox: mockCreateSandbox,
  reconfigureSandboxLlm: mock(async () => ({ ok: true, provider: 'openai', model: 'gpt-4o', logs: [] })),
  retrofitSandboxToSharedCodex: mock(async () => ({ ok: true, model: 'openai-codex/gpt-5.4', authSource: 'Codex CLI auth' })),
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
  listManagedSandboxContainers: mock(async () => []),
  dockerSpawn: mock(async () => [0, '']),
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (value: string) => value,
}));

mock.module('../../../src/auditStore', () => ({
  writeAuditEvent: mock(async () => {}),
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
}));

const { request, resetStreams } = await import('../../helpers/app');

beforeEach(() => {
  resetStreams();
  mockListSystemEvents.mockReset();
  mockListSystemEvents.mockImplementation(async (filters: Record<string, unknown> = {}) => ({
    items: [{
      event_id: 'evt-1',
      occurred_at: new Date('2026-03-28T12:00:00Z').toISOString(),
      level: 'info',
      category: 'sandbox.lifecycle',
      action: 'sandbox.create.succeeded',
      status: 'success',
      message: 'Sandbox created successfully',
      request_id: filters.request_id ?? null,
      trace_id: filters.trace_id ?? null,
      span_id: null,
      sandbox_id: filters.sandbox_id ?? null,
      agent_id: filters.agent_id ?? null,
      conversation_id: null,
      source: 'ruh-backend:app',
      details: {},
    }],
    has_more: false,
  }));
  mockWriteSystemEvent.mockReset();
  mockWriteSystemEvent.mockImplementation(async () => {});
  mockSaveSandbox.mockReset();
  mockSaveSandbox.mockImplementation(async () => {});
  mockMarkApproved.mockReset();
  mockMarkApproved.mockImplementation(async () => {});
  mockCreateSandbox.mockReset();
  mockCreateSandbox.mockImplementation(fakeSuccessGen);
});

afterEach(() => {
  resetStreams();
});

describe('GET /api/system/events', () => {
  test('returns bounded system events with forwarded query filters', async () => {
    const res = await request()
      .get('/api/system/events')
      .query({
        category: 'sandbox.lifecycle',
        action: 'sandbox.create.succeeded',
        request_id: 'req-123',
        trace_id: 'trace-123',
        limit: '10',
      })
      .expect(200);

    expect(res.body).toEqual(expect.objectContaining({
      items: expect.any(Array),
      has_more: false,
    }));
    expect(mockListSystemEvents).toHaveBeenCalledWith(expect.objectContaining({
      category: 'sandbox.lifecycle',
      action: 'sandbox.create.succeeded',
      request_id: 'req-123',
      trace_id: 'trace-123',
      limit: 10,
    }));
  });
});

describe('GET /api/sandboxes/:sandbox_id/system-events', () => {
  test('forces the sandbox scope when listing events', async () => {
    await request()
      .get('/api/sandboxes/sb-123/system-events')
      .query({ category: 'sandbox.lifecycle', limit: '5' })
      .expect(200);

    expect(mockListSystemEvents).toHaveBeenCalledWith(expect.objectContaining({
      sandbox_id: 'sb-123',
      category: 'sandbox.lifecycle',
      limit: 5,
    }));
  });
});

describe('GET /api/agents/:id/system-events', () => {
  test('forces the agent scope when listing events', async () => {
    await request()
      .get('/api/agents/agent-1/system-events')
      .query({ level: 'warn', limit: '7' })
      .expect(200);

    expect(mockListSystemEvents).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: 'agent-1',
      level: 'warn',
      limit: 7,
    }));
  });
});

describe('GET /api/sandboxes/stream/:stream_id', () => {
  test('persists structured lifecycle events with a stable request id across sandbox creation', async () => {
    const createRes = await request()
      .post('/api/sandboxes/create')
      .send({ sandbox_name: 'evented-sandbox' })
      .expect(200);

    const { stream_id } = createRes.body;

    await request()
      .get(`/api/sandboxes/stream/${stream_id}`)
      .set('x-request-id', 'req-123')
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      })
      .expect(200);

    expect(mockWriteSystemEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'sandbox.create.started',
      request_id: 'req-123',
      status: 'started',
    }));
    expect(mockWriteSystemEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'sandbox.create.succeeded',
      request_id: 'req-123',
      sandbox_id: 'sb-e2e-001',
      status: 'success',
    }));
    expect(mockWriteSystemEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'sandbox.create.approved',
      request_id: 'req-123',
      sandbox_id: 'sb-e2e-001',
      status: 'success',
    }));
  });
});
