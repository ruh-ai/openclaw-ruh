import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ── Mock stores ─────────────────────────────────────────────────────────────

const USER_ID = 'user-abc-123';
const ORG_ID = 'org-abc-123';
const REFRESH_TOKEN = 'refresh-token-uuid';

function makeUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'test@example.com',
    passwordHash: '$2b$12$hashedpassword',
    displayName: 'Test User',
    avatarUrl: null,
    role: 'developer',
    orgId: ORG_ID,
    status: 'active',
    emailVerified: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-123',
    userId: USER_ID,
    refreshToken: REFRESH_TOKEN,
    userAgent: 'test-agent',
    ipAddress: '127.0.0.1',
    activeOrgId: ORG_ID,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeOrgRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: ORG_ID,
    name: 'Test Org',
    slug: 'test-org',
    kind: 'developer',
    plan: 'free',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMembershipRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'membership-123',
    orgId: ORG_ID,
    userId: USER_ID,
    role: 'owner',
    status: 'active',
    organizationName: 'Test Org',
    organizationSlug: 'test-org',
    organizationKind: 'developer',
    organizationPlan: 'free',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const mockGetUserByEmail = mock(async () => null);
const mockGetUserById = mock(async () => makeUserRecord());
const mockCreateUser = mock(async () => makeUserRecord());
const mockUpdateUser = mock(async () => makeUserRecord());

mock.module('../../../src/userStore', () => ({
  getUserByEmail: mockGetUserByEmail,
  getUserById: mockGetUserById,
  createUser: mockCreateUser,
  updateUser: mockUpdateUser,
}));

const mockCreateSession = mock(async () => makeSessionRecord());
const mockGetSessionByRefreshToken = mock(async () => makeSessionRecord());
const mockDeleteSession = mock(async () => {});
const mockDeleteUserSessions = mock(async () => {});
const mockSetActiveOrgId = mock(async () => {});

mock.module('../../../src/sessionStore', () => ({
  createSession: mockCreateSession,
  getSessionByRefreshToken: mockGetSessionByRefreshToken,
  deleteSession: mockDeleteSession,
  deleteUserSessions: mockDeleteUserSessions,
  setActiveOrgId: mockSetActiveOrgId,
}));

const mockGetOrg = mock(async () => makeOrgRecord());
const mockCreateOrg = mock(async () => makeOrgRecord());

mock.module('../../../src/orgStore', () => ({
  getOrg: mockGetOrg,
  createOrg: mockCreateOrg,
}));

const mockListMembershipsForUser = mock(async () => [makeMembershipRecord()]);
const mockCreateMembership = mock(async () => makeMembershipRecord());
const mockGetMembershipForUserOrg = mock(async () => makeMembershipRecord());

mock.module('../../../src/organizationMembershipStore', () => ({
  listMembershipsForUser: mockListMembershipsForUser,
  createMembership: mockCreateMembership,
  getMembershipForUserOrg: mockGetMembershipForUserOrg,
}));

const mockEnsureAuthIdentity = mock(async () => {});

mock.module('../../../src/authIdentityStore', () => ({
  ensureAuthIdentity: mockEnsureAuthIdentity,
}));

// Mock hashPassword/verifyPassword
const mockHashPassword = mock(async () => '$2b$12$hashed');
const mockVerifyPassword = mock(async () => true);

mock.module('../../../src/auth/passwords', () => ({
  hashPassword: mockHashPassword,
  verifyPassword: mockVerifyPassword,
}));

// Mock token signing/verification
const mockSignAccessToken = mock(() => 'mock-access-token');

mock.module('../../../src/auth/tokens', () => ({
  signAccessToken: mockSignAccessToken,
  verifyAccessToken: (token: string) => {
    if (token === 'mock-access-token' || token === 'valid-token') {
      return { userId: USER_ID, email: 'test@example.com', role: 'developer', orgId: ORG_ID };
    }
    return null;
  },
}));

// Mock remaining modules that app.ts imports
const mockDockerExec = mock(async () => [true, '']);

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
  dockerExec: mockDockerExec,
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
  dockerExec: mockDockerExec,
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

// Import app AFTER all mocks
const supertest = (await import('supertest')).default;
const { app } = await import('../../../src/app');

function request() {
  return supertest(app);
}

beforeEach(() => {
  mockGetUserByEmail.mockReset();
  mockGetUserByEmail.mockImplementation(async () => null);
  mockGetUserById.mockReset();
  mockGetUserById.mockImplementation(async () => makeUserRecord());
  mockCreateUser.mockReset();
  mockCreateUser.mockImplementation(async () => makeUserRecord());
  mockUpdateUser.mockReset();
  mockUpdateUser.mockImplementation(async () => makeUserRecord());
  mockCreateSession.mockReset();
  mockCreateSession.mockImplementation(async () => makeSessionRecord());
  mockGetSessionByRefreshToken.mockReset();
  mockGetSessionByRefreshToken.mockImplementation(async () => makeSessionRecord());
  mockDeleteSession.mockReset();
  mockDeleteUserSessions.mockReset();
  mockHashPassword.mockReset();
  mockHashPassword.mockImplementation(async () => '$2b$12$hashed');
  mockVerifyPassword.mockReset();
  mockVerifyPassword.mockImplementation(async () => true);
  mockSignAccessToken.mockReset();
  mockSignAccessToken.mockImplementation(() => 'mock-access-token');
  mockListMembershipsForUser.mockReset();
  mockListMembershipsForUser.mockImplementation(async () => [makeMembershipRecord()]);
  mockCreateMembership.mockReset();
  mockCreateMembership.mockImplementation(async () => makeMembershipRecord());
  mockGetOrg.mockReset();
  mockGetOrg.mockImplementation(async () => makeOrgRecord());
  mockCreateOrg.mockReset();
  mockCreateOrg.mockImplementation(async () => makeOrgRecord());
  mockEnsureAuthIdentity.mockReset();
  mockEnsureAuthIdentity.mockImplementation(async () => {});
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  test('returns 400 when email is missing', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ password: 'MyP@ssw0rd123!' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid email format', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'MyP@ssw0rd123!' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when password is too short (< 12 chars)', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Short1!' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('12 characters');
  });

  test('returns 400 when password has no uppercase', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'myp@ssw0rd123!' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('uppercase');
  });

  test('returns 400 when password has no lowercase', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'MYP@SSW0RD123!' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('lowercase');
  });

  test('returns 400 when password has no digit', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'MyP@sswooord!!' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('number');
  });

  test('returns 400 when password has no special char', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'MyPassword1234' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('special character');
  });

  test('returns 409 when email already registered', async () => {
    mockGetUserByEmail.mockImplementation(async () => makeUserRecord());

    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'MyP@ssw0rd123!' });
    expect(res.status).toBe(409);
  });

  test('returns 201 on successful registration', async () => {
    mockGetUserByEmail.mockImplementation(async () => null);

    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'MyP@ssw0rd123!' });
    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  test('registers with organization when organizationName provided', async () => {
    mockGetUserByEmail.mockImplementation(async () => null);

    const res = await request()
      .post('/api/auth/register')
      .send({
        email: 'org@example.com',
        password: 'MyP@ssw0rd123!',
        organizationName: 'My Dev Team',
        organizationKind: 'developer',
      });
    expect(res.status).toBe(201);
    expect(mockCreateOrg).toHaveBeenCalled();
    expect(mockCreateMembership).toHaveBeenCalled();
  });

  test('normalizes email to lowercase and trimmed', async () => {
    mockGetUserByEmail.mockImplementation(async () => null);

    await request()
      .post('/api/auth/register')
      .send({ email: '  Test@EXAMPLE.COM  ', password: 'MyP@ssw0rd123!' });
    expect(mockGetUserByEmail).toHaveBeenCalledWith('test@example.com');
  });
});

describe('POST /api/auth/login', () => {
  test('returns 400 when email or password missing', async () => {
    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
  });

  test('returns 401 for unknown email', async () => {
    mockGetUserByEmail.mockImplementation(async () => null);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'noone@example.com', password: 'MyP@ssw0rd123!' });
    expect(res.status).toBe(401);
  });

  test('returns 401 for wrong password', async () => {
    mockGetUserByEmail.mockImplementation(async () => makeUserRecord());
    mockVerifyPassword.mockImplementation(async () => false);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongP@ssw0rd1!' });
    expect(res.status).toBe(401);
  });

  test('returns 403 for inactive account', async () => {
    mockGetUserByEmail.mockImplementation(async () => makeUserRecord({ status: 'suspended' }));

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'MyP@ssw0rd123!' });
    expect(res.status).toBe(403);
  });

  test('returns 200 on successful login', async () => {
    mockGetUserByEmail.mockImplementation(async () => makeUserRecord());
    mockVerifyPassword.mockImplementation(async () => true);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'MyP@ssw0rd123!' });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.accessToken).toBeDefined();
  });

  test('sets cookies on successful login', async () => {
    mockGetUserByEmail.mockImplementation(async () => makeUserRecord());
    mockVerifyPassword.mockImplementation(async () => true);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'MyP@ssw0rd123!' });
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    expect(cookieStr).toContain('accessToken');
    expect(cookieStr).toContain('refreshToken');
  });
});

describe('POST /api/auth/refresh', () => {
  test('returns 400 when refresh token missing', async () => {
    const res = await request()
      .post('/api/auth/refresh')
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 401 for invalid refresh token', async () => {
    mockGetSessionByRefreshToken.mockImplementation(async () => null);

    const res = await request()
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad-token' });
    expect(res.status).toBe(401);
  });

  test('returns 401 when user is inactive', async () => {
    mockGetSessionByRefreshToken.mockImplementation(async () => makeSessionRecord());
    mockGetUserById.mockImplementation(async () => makeUserRecord({ status: 'suspended' }));

    const res = await request()
      .post('/api/auth/refresh')
      .send({ refreshToken: REFRESH_TOKEN });
    expect(res.status).toBe(401);
  });

  test('returns 200 and rotates token on valid refresh', async () => {
    mockGetSessionByRefreshToken.mockImplementation(async () => makeSessionRecord());
    mockGetUserById.mockImplementation(async () => makeUserRecord());

    const res = await request()
      .post('/api/auth/refresh')
      .send({ refreshToken: REFRESH_TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(mockDeleteSession).toHaveBeenCalled();
    expect(mockCreateSession).toHaveBeenCalled();
  });
});

describe('POST /api/auth/logout', () => {
  test('returns 401 without auth token', async () => {
    const res = await request()
      .post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  test('returns 200 and clears cookies with valid auth', async () => {
    const res = await request()
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Logged out');
    expect(mockDeleteUserSessions).toHaveBeenCalledWith(USER_ID);
  });
});

describe('GET /api/auth/me', () => {
  test('returns 401 without auth token', async () => {
    const res = await request()
      .get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns user profile with valid auth', async () => {
    mockGetUserById.mockImplementation(async () => makeUserRecord());

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(USER_ID);
    expect(res.body.email).toBe('test@example.com');
    expect(res.body.memberships).toBeDefined();
    expect(res.body.appAccess).toBeDefined();
  });

  test('returns 404 when user not found', async () => {
    mockGetUserById.mockImplementation(async () => null);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/auth/me', () => {
  test('updates display name', async () => {
    mockUpdateUser.mockImplementation(async () =>
      makeUserRecord({ displayName: 'New Name' }),
    );

    const res = await request()
      .patch('/api/auth/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ displayName: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('New Name');
  });

  test('returns 404 when user not found for update', async () => {
    mockUpdateUser.mockImplementation(async () => null);

    const res = await request()
      .patch('/api/auth/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ displayName: 'Ghost' });
    expect(res.status).toBe(404);
  });
});
