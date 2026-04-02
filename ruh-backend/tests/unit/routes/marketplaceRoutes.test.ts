import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ── Mock stores ─────────────────────────────────────────────────────────────

const USER_ID = 'user-mp-123';
const ORG_ID = 'org-mp-123';
const AGENT_ID = 'agent-mp-123';

function makeListingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-1',
    agentId: AGENT_ID,
    publisherId: USER_ID,
    ownerOrgId: ORG_ID,
    title: 'Test Agent Listing',
    slug: 'test-agent-listing',
    summary: 'A test listing',
    description: 'Full description of the listing',
    category: 'general',
    tags: ['test'],
    iconUrl: null,
    screenshots: [],
    version: '1.0.0',
    status: 'published',
    installCount: 0,
    avgRating: null,
    reviewCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const mockListPublishedListings = mock(async () => ({
  items: [makeListingRecord()],
  total: 1,
}));
const mockGetListingBySlug = mock(async () => makeListingRecord());
const mockGetListingById = mock(async () => makeListingRecord());
const mockCreateListing = mock(async () => makeListingRecord({ status: 'draft' }));
const mockUpdateListing = mock(async () => makeListingRecord());
const mockUpdateListingStatus = mock(async () => makeListingRecord());
const mockListReviews = mock(async () => []);
const mockCreateReview = mock(async () => ({ id: 'review-1' }));
const mockGetInstall = mock(async () => null);
const mockCreateInstall = mock(async () => ({ id: 'install-1' }));
const mockIncrementInstallCount = mock(async () => {});
const mockRemoveInstall = mock(async () => true);
const mockListUserInstalls = mock(async () => []);
const mockListInstalledListings = mock(async () => []);
const mockListOrgListings = mock(async () => []);

mock.module('../../../src/marketplaceStore', () => ({
  listPublishedListings: mockListPublishedListings,
  getListingBySlug: mockGetListingBySlug,
  getListingById: mockGetListingById,
  createListing: mockCreateListing,
  updateListing: mockUpdateListing,
  updateListingStatus: mockUpdateListingStatus,
  listReviews: mockListReviews,
  createReview: mockCreateReview,
  getInstall: mockGetInstall,
  createInstall: mockCreateInstall,
  incrementInstallCount: mockIncrementInstallCount,
  removeInstall: mockRemoveInstall,
  listUserInstalls: mockListUserInstalls,
  listInstalledListings: mockListInstalledListings,
  listOrgListings: mockListOrgListings,
}));

const mockGetAgentOwnership = mock(async () => ({
  id: AGENT_ID,
  createdBy: USER_ID,
  orgId: ORG_ID,
}));

mock.module('../../../src/agentStore', () => ({
  initDb: mock(async () => {}),
  listAgents: mock(async () => []),
  saveAgent: mock(async () => ({})),
  getAgent: mock(async () => null),
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  getAgentOwnership: mockGetAgentOwnership,
  getAgentForCreatorInOrg: mock(async () => null),
}));

mock.module('../../../src/agentVersionStore', () => ({
  getAgentVersionByVersion: mock(async () => null),
  createAgentVersion: mock(async () => ({})),
}));

mock.module('../../../src/marketplaceRuntime', () => ({
  buildInstalledAgentSeed: mock(() => ({})),
  buildPublishedRuntimeSnapshot: mock(() => ({})),
  buildConfigurePayloadFromAgent: mock(() => ({})),
}));

// Mock auth — developer with developer org
mock.module('../../../src/auth/tokens', () => ({
  signAccessToken: () => 'mock-token',
  verifyAccessToken: (token: string) => {
    if (token === 'valid-token') {
      return { userId: USER_ID, email: 'mp@test.com', role: 'developer', orgId: ORG_ID };
    }
    return null;
  },
}));

mock.module('../../../src/orgStore', () => ({
  getOrg: mock(async () => ({
    id: ORG_ID,
    name: 'Dev Org',
    slug: 'dev-org',
    kind: 'developer',
    plan: 'free',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })),
  createOrg: mock(async () => ({})),
}));

mock.module('../../../src/organizationMembershipStore', () => ({
  listMembershipsForUser: mock(async () => []),
  createMembership: mock(async () => ({})),
  getMembershipForUserOrg: mock(async () => ({
    id: 'mem-1',
    orgId: ORG_ID,
    userId: USER_ID,
    role: 'owner',
    status: 'active',
  })),
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
  listConversationsPage: mock(async () => ({ items: [], has_more: false, next_cursor: null })),
  createConversation: mock(async () => ({})),
  getMessagesPage: mock(async () => ({ messages: [], has_more: false, next_cursor: null })),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
}));

mock.module('../../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({ ok: true })),
  retrofitSandboxToSharedCodex: mock(async () => ({ ok: true })),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (id: string) => `openclaw-${id}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
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
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (v: string) => v,
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

mock.module('../../../src/authIdentityStore', () => ({
  ensureAuthIdentity: mock(async () => {}),
}));

mock.module('../../../src/auth/passwords', () => ({
  hashPassword: mock(async () => ''),
  verifyPassword: mock(async () => false),
}));

const supertest = (await import('supertest')).default;
const { app } = await import('../../../src/app');
const { CATEGORIES } = await import('../../../src/marketplaceRoutes');

function request() {
  return supertest(app);
}

beforeEach(() => {
  mockListPublishedListings.mockReset();
  mockListPublishedListings.mockImplementation(async () => ({
    items: [makeListingRecord()],
    total: 1,
  }));
  mockGetListingBySlug.mockReset();
  mockGetListingBySlug.mockImplementation(async () => makeListingRecord());
  mockGetListingById.mockReset();
  mockGetListingById.mockImplementation(async () => makeListingRecord());
  mockCreateListing.mockReset();
  mockCreateListing.mockImplementation(async () => makeListingRecord({ status: 'draft' }));
  mockGetAgentOwnership.mockReset();
  mockGetAgentOwnership.mockImplementation(async () => ({
    id: AGENT_ID,
    createdBy: USER_ID,
    orgId: ORG_ID,
  }));
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CATEGORIES export', () => {
  test('exports an array of 10 categories', () => {
    expect(Array.isArray(CATEGORIES)).toBe(true);
    expect(CATEGORIES.length).toBe(10);
  });

  test('includes expected categories', () => {
    expect(CATEGORIES).toContain('general');
    expect(CATEGORIES).toContain('marketing');
    expect(CATEGORIES).toContain('engineering');
    expect(CATEGORIES).toContain('custom');
  });
});

describe('GET /api/marketplace/categories', () => {
  test('returns CATEGORIES array', async () => {
    const res = await request()
      .get('/api/marketplace/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([...CATEGORIES]);
  });
});

describe('GET /api/marketplace/listings', () => {
  test('returns listings without auth', async () => {
    const res = await request()
      .get('/api/marketplace/listings');
    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
  });

  test('passes search parameter', async () => {
    await request()
      .get('/api/marketplace/listings?search=test');
    expect(mockListPublishedListings).toHaveBeenCalledWith(expect.objectContaining({
      search: 'test',
    }));
  });

  test('passes category filter', async () => {
    await request()
      .get('/api/marketplace/listings?category=marketing');
    expect(mockListPublishedListings).toHaveBeenCalledWith(expect.objectContaining({
      category: 'marketing',
    }));
  });

  test('returns 400 for invalid category', async () => {
    const res = await request()
      .get('/api/marketplace/listings?category=bogus');
    expect(res.status).toBe(400);
  });

  test('passes pagination params', async () => {
    await request()
      .get('/api/marketplace/listings?page=2&limit=10');
    expect(mockListPublishedListings).toHaveBeenCalledWith(expect.objectContaining({
      page: 2,
      limit: 10,
    }));
  });

  test('caps limit at 100', async () => {
    await request()
      .get('/api/marketplace/listings?limit=999');
    expect(mockListPublishedListings).toHaveBeenCalledWith(expect.objectContaining({
      limit: 100,
    }));
  });
});

describe('POST /api/marketplace/listings', () => {
  test('returns 401 without auth', async () => {
    const res = await request()
      .post('/api/marketplace/listings')
      .send({ agentId: AGENT_ID, title: 'My Agent' });
    expect(res.status).toBe(401);
  });

  test('returns 400 when agentId is missing', async () => {
    const res = await request()
      .post('/api/marketplace/listings')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'My Agent' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when title is missing', async () => {
    const res = await request()
      .post('/api/marketplace/listings')
      .set('Authorization', 'Bearer valid-token')
      .send({ agentId: AGENT_ID });
    expect(res.status).toBe(400);
  });

  test('returns 400 when title is too short', async () => {
    const res = await request()
      .post('/api/marketplace/listings')
      .set('Authorization', 'Bearer valid-token')
      .send({ agentId: AGENT_ID, title: 'ab' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid category in listing creation', async () => {
    const res = await request()
      .post('/api/marketplace/listings')
      .set('Authorization', 'Bearer valid-token')
      .send({ agentId: AGENT_ID, title: 'Valid Title', category: 'bogus' });
    expect(res.status).toBe(400);
  });

  test('creates listing on valid input', async () => {
    const res = await request()
      .post('/api/marketplace/listings')
      .set('Authorization', 'Bearer valid-token')
      .send({
        agentId: AGENT_ID,
        title: 'My Published Agent',
        summary: 'A great agent',
        category: 'marketing',
      });
    expect(res.status).toBe(201);
    expect(mockCreateListing).toHaveBeenCalled();
  });

  test('returns 404 when agent not found', async () => {
    mockGetAgentOwnership.mockImplementation(async () => null);

    const res = await request()
      .post('/api/marketplace/listings')
      .set('Authorization', 'Bearer valid-token')
      .send({ agentId: 'nonexistent', title: 'My Agent' });
    expect(res.status).toBe(404);
  });

  test('returns 403 when user is not the agent creator', async () => {
    mockGetAgentOwnership.mockImplementation(async () => ({
      id: AGENT_ID,
      createdBy: 'someone-else',
      orgId: ORG_ID,
    }));

    const res = await request()
      .post('/api/marketplace/listings')
      .set('Authorization', 'Bearer valid-token')
      .send({ agentId: AGENT_ID, title: 'Stolen Agent' });
    expect(res.status).toBe(403);
  });
});
