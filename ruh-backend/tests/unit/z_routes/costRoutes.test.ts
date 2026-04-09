import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ── Mock stores ─────────────────────────────────────────────────────────────

const AGENT_ID = 'agent-cost-123';
const USER_ID = 'user-cost-123';
const ORG_ID = 'org-cost-123';

const mockCreateCostEvent = mock(async (input: Record<string, unknown>) => ({
  id: 'ce-1',
  ...input,
  created_at: '2026-01-01T00:00:00.000Z',
}));

const mockListCostEvents = mock(async () => ({
  items: [{ id: 'ce-1', model: 'gpt-4o', cost_cents: 5 }],
  total: 1,
}));

const mockGetMonthlySummary = mock(async () => ({
  total_cost_cents: 100,
  total_input_tokens: 5000,
  total_output_tokens: 3000,
  event_count: 10,
}));

const mockUpsertBudgetPolicy = mock(async (input: Record<string, unknown>) => ({
  id: 'bp-1',
  ...input,
}));

const mockGetBudgetPolicy = mock(async () => ({
  id: 'bp-1',
  agent_id: AGENT_ID,
  monthly_cap_cents: 1000,
  soft_warning_pct: 80,
  hard_stop: true,
}));

const mockGetBudgetStatus = mock(async () => ({
  spent_cents: 50,
  cap_cents: 1000,
  utilization_pct: 5,
  hard_stop: true,
}));

mock.module('../../../src/costStore', () => ({
  createCostEvent: mockCreateCostEvent,
  listCostEvents: mockListCostEvents,
  getMonthlySummary: mockGetMonthlySummary,
  upsertBudgetPolicy: mockUpsertBudgetPolicy,
  getBudgetPolicy: mockGetBudgetPolicy,
  getBudgetStatus: mockGetBudgetStatus,
}));

const mockCreateExecutionRecording = mock(async (input: Record<string, unknown>) => ({
  id: 'er-1',
  ...input,
  created_at: '2026-01-01T00:00:00.000Z',
}));

const mockListExecutionRecordings = mock(async () => ({
  items: [{ id: 'er-1', run_id: 'run-1' }],
  total: 1,
}));

mock.module('../../../src/executionRecordingStore', () => ({
  createExecutionRecording: mockCreateExecutionRecording,
  listExecutionRecordings: mockListExecutionRecordings,
}));

// Mock auth middleware to inject user
mock.module('../../../src/auth/tokens', () => ({
  signAccessToken: () => 'mock-token',
  verifyAccessToken: (token: string) => {
    if (token === 'valid-token') {
      return { userId: USER_ID, email: 'cost@test.com', role: 'developer', orgId: ORG_ID };
    }
    return null;
  },
}));

mock.module('../../../src/auth/middleware', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const auth = (req.headers?.authorization ?? '') as string;
    if (!auth.startsWith('Bearer ')) {
      return void res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid access token' });
    }
    const token = auth.slice(7);
    if (token !== 'valid-token') {
      return void res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired access token' });
    }
    req.user = { userId: USER_ID, email: 'cost@test.com', role: 'developer', orgId: ORG_ID };
    next();
  },
  optionalAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock remaining app dependencies
mock.module('../../../src/store', () => ({
  getSandbox: mock(async () => null),
  deleteSandbox: mock(async () => true),
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
  listAgents: mock(async () => []),
  listAgentsForCreator: mock(async () => []),
  listAgentsForCreatorInOrg: mock(async () => []),
  saveAgent: mock(async () => ({})),
  getAgent: mock(async () => null),
  getAgentForCreator: mock(async () => null),
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

mock.module('../../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({ ok: true })),
  retrofitSandboxToSharedCodex: mock(async () => ({ ok: true })),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (id: string) => `openclaw-${id}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  waitForGateway: mock(async () => true),
  retrofitContainerToSharedCodex: mock(async () => ({ ok: true })),
  PREVIEW_PORTS: [],
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
  dockerSpawn: mock(async () => [0, '']),
  listManagedSandboxContainers: mock(async () => []),
  parseManagedSandboxContainerList: () => [],
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  getContainerName: (id: string) => `openclaw-${id}`,
  shellQuote: (v: string) => `'${v}'`,
  normalizePathSegment: (v: string) => v,
  readContainerPorts: () => ({ gatewayPort: 18789 }),
}));

mock.module('../../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mock(async () => {}),
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
}));

mock.module('../../../src/userStore', () => ({
  getUserByEmail: mock(async () => null),
  getUserById: mock(async () => null),
  createUser: mock(async () => ({})),
  updateUser: mock(async () => ({})),
}));

mock.module('../../../src/sessionStore', () => ({
  createSession: mock(async () => ({})),
  getSessionByRefreshToken: mock(async () => null),
  deleteSession: mock(async () => {}),
  deleteUserSessions: mock(async () => {}),
}));

mock.module('../../../src/orgStore', () => ({
  getOrg: mock(async () => null),
  createOrg: mock(async () => ({})),
}));

mock.module('../../../src/organizationMembershipStore', () => ({
  listMembershipsForUser: mock(async () => []),
  createMembership: mock(async () => ({})),
  getMembershipForUserOrg: mock(async () => null),
}));

mock.module('../../../src/authIdentityStore', () => ({
  ensureAuthIdentity: mock(async () => {}),
}));

mock.module('../../../src/auth/passwords', () => ({
  hashPassword: mock(async () => ''),
  verifyPassword: mock(async () => false),
}));

mock.module('../../../src/marketplaceStore', () => ({
  listPublishedListings: mock(async () => ({ items: [], total: 0 })),
  getListingBySlug: mock(async () => null),
  getListingById: mock(async () => null),
  createListing: mock(async () => ({})),
}));

mock.module('../../../src/agentVersionStore', () => ({
  getAgentVersionByVersion: mock(async () => null),
  createAgentVersion: mock(async () => ({})),
}));

mock.module('../../../src/marketplaceRuntime', () => ({
  buildInstalledAgentSeed: mock(() => ({})),
  buildPublishedRuntimeSnapshot: mock(() => ({})),
  buildConfigurePayloadFromAgent: mock(() => ({})),
  buildSoulContentFromAgent: mock(() => ''),
  buildCronJobsFromAgent: mock(() => []),
  buildRuntimeSkillsFromAgent: mock(() => []),
}));

const supertest = (await import('supertest')).default;
const { app } = await import('../../../src/app');

function request() {
  return supertest(app);
}

beforeEach(() => {
  mockCreateCostEvent.mockReset();
  mockCreateCostEvent.mockImplementation(async (input: Record<string, unknown>) => ({
    id: 'ce-1',
    ...input,
    created_at: '2026-01-01T00:00:00.000Z',
  }));
  mockListCostEvents.mockReset();
  mockListCostEvents.mockImplementation(async () => ({
    items: [{ id: 'ce-1', model: 'gpt-4o', cost_cents: 5 }],
    total: 1,
  }));
  mockGetMonthlySummary.mockReset();
  mockGetMonthlySummary.mockImplementation(async () => ({
    total_cost_cents: 100,
    total_input_tokens: 5000,
    total_output_tokens: 3000,
    event_count: 10,
  }));
  mockUpsertBudgetPolicy.mockReset();
  mockUpsertBudgetPolicy.mockImplementation(async (input: Record<string, unknown>) => ({
    id: 'bp-1',
    ...input,
  }));
  mockGetBudgetPolicy.mockReset();
  mockGetBudgetPolicy.mockImplementation(async () => ({
    id: 'bp-1',
    agent_id: AGENT_ID,
    monthly_cap_cents: 1000,
    soft_warning_pct: 80,
    hard_stop: true,
  }));
  mockGetBudgetStatus.mockReset();
  mockGetBudgetStatus.mockImplementation(async () => ({
    spent_cents: 50,
    cap_cents: 1000,
    utilization_pct: 5,
    hard_stop: true,
  }));
  mockCreateExecutionRecording.mockReset();
  mockCreateExecutionRecording.mockImplementation(async (input: Record<string, unknown>) => ({
    id: 'er-1',
    ...input,
    created_at: '2026-01-01T00:00:00.000Z',
  }));
  mockListExecutionRecordings.mockReset();
  mockListExecutionRecordings.mockImplementation(async () => ({
    items: [{ id: 'er-1', run_id: 'run-1' }],
    total: 1,
  }));
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/agents/:agentId/cost-events', () => {
  test('returns 401 without auth', async () => {
    const res = await request()
      .post(`/api/agents/${AGENT_ID}/cost-events`)
      .send({ model: 'gpt-4o', input_tokens: 100, output_tokens: 50, cost_cents: 5 });
    expect(res.status).toBe(401);
  });

  test('returns 400 when model is missing', async () => {
    const res = await request()
      .post(`/api/agents/${AGENT_ID}/cost-events`)
      .set('Authorization', 'Bearer valid-token')
      .send({ input_tokens: 100, output_tokens: 50, cost_cents: 5 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when input_tokens is not a number', async () => {
    const res = await request()
      .post(`/api/agents/${AGENT_ID}/cost-events`)
      .set('Authorization', 'Bearer valid-token')
      .send({ model: 'gpt-4o', input_tokens: 'abc', output_tokens: 50, cost_cents: 5 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when output_tokens is not a number', async () => {
    const res = await request()
      .post(`/api/agents/${AGENT_ID}/cost-events`)
      .set('Authorization', 'Bearer valid-token')
      .send({ model: 'gpt-4o', input_tokens: 100, output_tokens: 'abc', cost_cents: 5 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when cost_cents is missing', async () => {
    const res = await request()
      .post(`/api/agents/${AGENT_ID}/cost-events`)
      .set('Authorization', 'Bearer valid-token')
      .send({ model: 'gpt-4o', input_tokens: 100, output_tokens: 50 });
    expect(res.status).toBe(400);
  });

  test('returns 201 on valid cost event creation', async () => {
    const res = await request()
      .post(`/api/agents/${AGENT_ID}/cost-events`)
      .set('Authorization', 'Bearer valid-token')
      .send({ model: 'gpt-4o', input_tokens: 100, output_tokens: 50, cost_cents: 5 });
    expect(res.status).toBe(201);
    expect(res.body.cost_event).toBeDefined();
    expect(mockCreateCostEvent).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: AGENT_ID,
      model: 'gpt-4o',
      input_tokens: 100,
      output_tokens: 50,
      cost_cents: 5,
    }));
  });
});

describe('GET /api/agents/:agentId/cost-events', () => {
  test('returns 401 without auth', async () => {
    const res = await request()
      .get(`/api/agents/${AGENT_ID}/cost-events`);
    expect(res.status).toBe(401);
  });

  test('returns cost events list', async () => {
    const res = await request()
      .get(`/api/agents/${AGENT_ID}/cost-events`)
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
  });

  test('passes pagination params to store', async () => {
    await request()
      .get(`/api/agents/${AGENT_ID}/cost-events?limit=10&offset=5`)
      .set('Authorization', 'Bearer valid-token');
    expect(mockListCostEvents).toHaveBeenCalledWith(AGENT_ID, expect.objectContaining({
      limit: 10,
      offset: 5,
    }));
  });
});

describe('GET /api/agents/:agentId/cost-events/summary', () => {
  test('returns monthly summary', async () => {
    const res = await request()
      .get(`/api/agents/${AGENT_ID}/cost-events/summary`)
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.total_cost_cents).toBe(100);
  });

  test('passes month parameter', async () => {
    await request()
      .get(`/api/agents/${AGENT_ID}/cost-events/summary?month=2026-04`)
      .set('Authorization', 'Bearer valid-token');
    expect(mockGetMonthlySummary).toHaveBeenCalledWith(AGENT_ID, '2026-04');
  });
});

describe('PUT /api/agents/:agentId/budget-policy', () => {
  test('returns 400 for negative monthly_cap_cents', async () => {
    const res = await request()
      .put(`/api/agents/${AGENT_ID}/budget-policy`)
      .set('Authorization', 'Bearer valid-token')
      .send({ monthly_cap_cents: -100 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when monthly_cap_cents is not a number', async () => {
    const res = await request()
      .put(`/api/agents/${AGENT_ID}/budget-policy`)
      .set('Authorization', 'Bearer valid-token')
      .send({ monthly_cap_cents: 'abc' });
    expect(res.status).toBe(400);
  });

  test('upserts budget policy', async () => {
    const res = await request()
      .put(`/api/agents/${AGENT_ID}/budget-policy`)
      .set('Authorization', 'Bearer valid-token')
      .send({ monthly_cap_cents: 500, soft_warning_pct: 80, hard_stop: true });
    expect(res.status).toBe(200);
    expect(res.body.budget_policy).toBeDefined();
    expect(mockUpsertBudgetPolicy).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: AGENT_ID,
      monthly_cap_cents: 500,
    }));
  });
});

describe('GET /api/agents/:agentId/budget-policy', () => {
  test('returns budget policy', async () => {
    const res = await request()
      .get(`/api/agents/${AGENT_ID}/budget-policy`)
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.budget_policy.monthly_cap_cents).toBe(1000);
  });

  test('returns 404 when no policy set', async () => {
    mockGetBudgetPolicy.mockImplementation(async () => null);

    const res = await request()
      .get(`/api/agents/${AGENT_ID}/budget-policy`)
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/agents/:agentId/budget-status', () => {
  test('returns budget status', async () => {
    const res = await request()
      .get(`/api/agents/${AGENT_ID}/budget-status`)
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.budget_status).toBeDefined();
    expect(res.body.budget_status.spent_cents).toBe(50);
  });
});

describe('POST /api/agents/:agentId/execution-recordings', () => {
  test('returns 400 when run_id is missing', async () => {
    const res = await request()
      .post(`/api/agents/${AGENT_ID}/execution-recordings`)
      .set('Authorization', 'Bearer valid-token')
      .send({ success: true });
    expect(res.status).toBe(400);
  });

  test('returns 201 on valid recording creation', async () => {
    const res = await request()
      .post(`/api/agents/${AGENT_ID}/execution-recordings`)
      .set('Authorization', 'Bearer valid-token')
      .send({ run_id: 'run-1', success: true, tool_calls: [] });
    expect(res.status).toBe(201);
    expect(res.body.execution_recording).toBeDefined();
    expect(mockCreateExecutionRecording).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: AGENT_ID,
      run_id: 'run-1',
    }));
  });
});

describe('GET /api/agents/:agentId/execution-recordings', () => {
  test('returns execution recordings list', async () => {
    const res = await request()
      .get(`/api/agents/${AGENT_ID}/execution-recordings`)
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
  });

  test('passes pagination params', async () => {
    await request()
      .get(`/api/agents/${AGENT_ID}/execution-recordings?limit=5&offset=10`)
      .set('Authorization', 'Bearer valid-token');
    expect(mockListExecutionRecordings).toHaveBeenCalledWith(AGENT_ID, expect.objectContaining({
      limit: 5,
      offset: 10,
    }));
  });
});
