/**
 * Contract tests: /api/auth/* endpoints must return the documented response
 * shapes regardless of business-logic details (which are covered by
 * integration tests).
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { makeSandboxRecord } from '../helpers/fixtures';

// ── Fake data ────────────────────────────────────────────────────────────────

const FAKE_USER_ID = 'usr-contract-001';
const FAKE_EMAIL = 'contract@test.dev';
const FAKE_DISPLAY_NAME = 'Contract Tester';
// bcrypt hash of "SecurePass1!" (pre-computed to avoid slow hashing in tests)
const FAKE_PASSWORD_HASH = '$2a$04$dummyhashforcontracttestsonly00000000000000000000000';

function makeFakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: FAKE_USER_ID,
    email: FAKE_EMAIL,
    passwordHash: FAKE_PASSWORD_HASH,
    displayName: FAKE_DISPLAY_NAME,
    avatarUrl: 'https://example.com/avatar.png',
    role: 'developer',
    orgId: 'org-001',
    status: 'active',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFakeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-001',
    name: 'Contract Org',
    slug: 'contract-org',
    kind: 'customer',
    plan: 'free',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetUserByEmail = mock(async () => null as ReturnType<typeof makeFakeUser> | null);
const mockGetUserById = mock(async () => makeFakeUser());
const mockCreateUser = mock(async () => makeFakeUser());
const mockListUsers = mock(async () => ({ items: [makeFakeUser()], total: 1 }));
const mockUpdateUser = mock(async () => makeFakeUser());
const mockDeleteUser = mock(async () => true);

let usersById = new Map<string, ReturnType<typeof makeFakeUser>>();
let orgsById = new Map<string, ReturnType<typeof makeFakeOrg>>();
let memberships: Array<Record<string, unknown>> = [];
let sessionsByRefreshToken = new Map<string, Record<string, unknown>>();

function withActiveOrgStatus(membership: Record<string, unknown>) {
  return {
    ...membership,
    organizationStatus:
      membership.organizationStatus
      ?? orgsById.get(String(membership.orgId ?? ''))?.status
      ?? 'active',
  };
}

mock.module('../../src/userStore', () => ({
  getUserByEmail: mockGetUserByEmail,
  getUserById: mockGetUserById,
  createUser: mockCreateUser,
  listUsers: mockListUsers,
  updateUser: mockUpdateUser,
  deleteUser: mockDeleteUser,
}));

const mockCreateSession = mock(async () => ({
  id: 'sess-001',
  userId: FAKE_USER_ID,
  refreshToken: 'refresh-tok-xyz',
  userAgent: null,
  ipAddress: null,
  activeOrgId: 'org-001',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
}));
const mockGetSessionByRefreshToken = mock(async () => null);
const mockDeleteSession = mock(async () => {});
const mockDeleteUserSessions = mock(async () => {});
const mockSetActiveOrgId = mock(async () => null);

mock.module('../../src/sessionStore', () => ({
  createSession: mockCreateSession,
  getSessionByRefreshToken: mockGetSessionByRefreshToken,
  deleteSession: mockDeleteSession,
  deleteUserSessions: mockDeleteUserSessions,
  setActiveOrgId: mockSetActiveOrgId,
  cleanExpiredSessions: mock(async () => 0),
}));

const mockCreateOrg = mock(async (name: string, slug: string, kind = 'customer') =>
  makeFakeOrg({ id: `org-${slug}`, name, slug, kind }),
);
const mockGetOrg = mock(async (id: string) => orgsById.get(id) ?? null);
const mockListOrgs = mock(async () => Array.from(orgsById.values()));

mock.module('../../src/orgStore', () => ({
  createOrg: mockCreateOrg,
  getOrg: mockGetOrg,
  listOrgs: mockListOrgs,
}));

const mockCreateMembership = mock(async () => null);
const mockListMembershipsForUser = mock(async () => []);
const mockGetMembershipForUserOrg = mock(async () => null);

mock.module('../../src/organizationMembershipStore', () => ({
  createMembership: mockCreateMembership,
  listMembershipsForUser: mockListMembershipsForUser,
  getMembershipForUserOrg: mockGetMembershipForUserOrg,
}));

const mockEnsureAuthIdentity = mock(async (userId: string, provider: string, subject: string) => ({
  id: `ident-${provider}-${subject}`,
  userId,
  provider,
  subject,
  createdAt: '2026-01-01T00:00:00.000Z',
}));

mock.module('../../src/authIdentityStore', () => ({
  ensureAuthIdentity: mockEnsureAuthIdentity,
}));

// Mock bcrypt so password verification succeeds without real hashing
mock.module('bcryptjs', () => ({
  default: {
    hash: mock(async () => FAKE_PASSWORD_HASH),
    compare: mock(async () => true),
  },
  hash: mock(async () => FAKE_PASSWORD_HASH),
  compare: mock(async () => true),
}));

// Mock store (required by app.ts)
mock.module('../../src/store', () => ({
  getSandbox: mock(async () => makeSandboxRecord()),
  listSandboxes: mock(async () => []),
  deleteSandbox: mock(async () => false),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  initDb: mock(async () => {}),
}));

mock.module('../../src/conversationStore', () => ({
  getConversation: mock(async () => null),
  getConversationForSandbox: mock(async () => null),
  listConversations: mock(async () => []),
  listConversationsPage: mock(async () => ({ items: [], has_more: false, next_cursor: null })),
  createConversation: mock(async () => ({})),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
  getMessages: mock(async () => []),
  getMessagesPage: mock(async () => ({ messages: [], has_more: false, next_cursor: null })),
  initDb: mock(async () => {}),
}));

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  dockerExec: mock(async () => [true, 'true']),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  getContainerName: mock((sandboxId: string) => `openclaw-${sandboxId}`),
  PREVIEW_PORTS: [],
  reconfigureSandboxLlm: mock(async () => ({
    configPath: '/tmp/config.json',
    configuredModel: 'openai/gpt-5.1',
    healthStatus: 'healthy',
    result: 'success',
  })),
  restartGateway: mock(async () => {}),
  retrofitSandboxToSharedCodex: mock(async () => ({
    success: true,
    runtimePath: '/workspace/.codex',
    codexHome: '/workspace/.codex/home',
  })),
  sandboxExec: mock(async () => [0, '']),
  stopAndRemoveContainer: mock(async () => {}),
  waitForGateway: mock(async () => true),
}));

mock.module('axios', () => ({
  default: { get: mock(async () => ({})), post: mock(async () => ({})) },
  get: mock(async () => ({})),
  post: mock(async () => ({})),
}));

mock.module('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ─────────────────────────────────────────────────────────────────────────────

const { request } = await import('../helpers/app.ts?contractAuthEndpoints');

beforeEach(() => {
  const baseUser = makeFakeUser();
  const baseOrg = makeFakeOrg({ id: 'org-001', slug: 'contract-org', name: 'Contract Org', kind: 'customer' });
  usersById = new Map([[baseUser.id, baseUser]]);
  orgsById = new Map([[baseOrg.id, baseOrg]]);
  memberships = [];
  sessionsByRefreshToken = new Map();

  mockGetUserByEmail.mockImplementation(async (email: string) =>
    Array.from(usersById.values()).find((user) => user.email === email) ?? null,
  );
  mockGetUserById.mockImplementation(async (id: string) => usersById.get(id) ?? null);
  mockCreateUser.mockImplementation(async (
    email: string,
    passwordHash: string,
    displayName: string,
    role = 'end_user',
    orgId?: string,
  ) => {
    const user = makeFakeUser({
      id: `usr-${usersById.size + 1}`,
      email,
      passwordHash,
      displayName,
      role,
      orgId: orgId ?? null,
    });
    usersById.set(user.id, user);
    return user;
  });
  mockUpdateUser.mockImplementation(async (id: string, patch: Record<string, unknown>) => {
    const current = usersById.get(id);
    if (!current) return null;
    const updated = makeFakeUser({ ...current, ...patch, id });
    usersById.set(id, updated);
    return updated;
  });

  mockCreateOrg.mockImplementation(async (name: string, slug: string, kind = 'customer') => {
    const org = makeFakeOrg({ id: `org-${slug}`, name, slug, kind });
    orgsById.set(org.id, org);
    return org;
  });
  mockGetOrg.mockImplementation(async (id: string) => orgsById.get(id) ?? null);
  mockListOrgs.mockImplementation(async () => Array.from(orgsById.values()));

  mockCreateMembership.mockImplementation(async (
    orgId: string,
    userId: string,
    role: string,
    status = 'active',
  ) => {
    const org = orgsById.get(orgId) ?? makeFakeOrg({ id: orgId });
    const membership = {
      id: `mem-${memberships.length + 1}`,
      orgId,
      userId,
      role,
      status,
      organizationName: org.name,
      organizationSlug: org.slug,
      organizationKind: org.kind,
      organizationPlan: org.plan,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    memberships.push(membership);
    return membership;
  });
  mockListMembershipsForUser.mockImplementation(async (userId: string) =>
    memberships
      .filter((membership) => membership.userId === userId)
      .map(withActiveOrgStatus),
  );
  mockGetMembershipForUserOrg.mockImplementation(async (userId: string, orgId: string) => {
    const membership =
      memberships.find((record) => record.userId === userId && record.orgId === orgId) ?? null;
    return membership ? withActiveOrgStatus(membership) : null;
  });

  mockCreateSession.mockImplementation(async (
    userId: string,
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
    activeOrgId?: string | null,
  ) => {
    const session = {
      id: `sess-${sessionsByRefreshToken.size + 1}`,
      userId,
      refreshToken,
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
      activeOrgId: activeOrgId ?? null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    sessionsByRefreshToken.set(refreshToken, session);
    return session;
  });
  mockGetSessionByRefreshToken.mockImplementation(async (token: string) =>
    sessionsByRefreshToken.get(token) ?? null,
  );
  mockDeleteSession.mockImplementation(async (id: string) => {
    for (const [token, session] of sessionsByRefreshToken.entries()) {
      if (session.id === id) {
        sessionsByRefreshToken.delete(token);
      }
    }
  });
  mockDeleteUserSessions.mockImplementation(async (userId: string) => {
    for (const [token, session] of sessionsByRefreshToken.entries()) {
      if (session.userId === userId) {
        sessionsByRefreshToken.delete(token);
      }
    }
  });
  mockSetActiveOrgId.mockImplementation(async (sessionId: string, activeOrgId: string | null) => {
    for (const session of sessionsByRefreshToken.values()) {
      if (session.id === sessionId) {
        session.activeOrgId = activeOrgId;
        return session;
      }
    }
    return null;
  });
});

// ── POST /api/auth/register ─────────────────────────────────────────────────

describe('POST /api/auth/register — response contract', () => {
  test('returns { user, accessToken, refreshToken } on success', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'new@test.dev', password: 'SecurePass1!', displayName: 'Newbie' })
      .expect(201);

    // user shape
    expect(typeof res.body.user).toBe('object');
    expect(typeof res.body.user.id).toBe('string');
    expect(typeof res.body.user.email).toBe('string');
    expect(typeof res.body.user.displayName).toBe('string');
    expect(typeof res.body.user.role).toBe('string');

    // tokens
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(0);
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken.length).toBeGreaterThan(0);
  });

  test('can bootstrap an organization and returns active org session context', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({
        email: 'founder@test.dev',
        password: 'SecurePass1!',
        displayName: 'Founder',
        organizationName: 'Acme Dev',
        organizationSlug: 'acme-dev',
        organizationKind: 'developer',
        membershipRole: 'owner',
      })
      .expect(201);

    expect(Array.isArray(res.body.memberships)).toBe(true);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0]).toEqual(
      expect.objectContaining({
        organizationSlug: 'acme-dev',
        organizationKind: 'developer',
        role: 'owner',
      }),
    );
    expect(res.body.activeOrganization).toEqual(
      expect.objectContaining({
        slug: 'acme-dev',
        kind: 'developer',
      }),
    );
    expect(res.body.activeMembership).toEqual(
      expect.objectContaining({
        organizationSlug: 'acme-dev',
        organizationKind: 'developer',
        role: 'owner',
      }),
    );
    expect(res.body.appAccess).toEqual({
      admin: false,
      builder: true,
      customer: false,
    });
  });

  test('returns { detail } on validation error', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: '', password: '' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(typeof res.body.detail).toBe('string');
  });

  test('returns 409 when email already registered', async () => {
    mockGetUserByEmail.mockImplementation(async () => makeFakeUser());

    const res = await request()
      .post('/api/auth/register')
      .send({ email: FAKE_EMAIL, password: 'SecurePass1!' })
      .expect(409);

    expect(typeof res.body.detail).toBe('string');
  });
});

// ── POST /api/auth/login ────────────────────────────────────────────────────

describe('POST /api/auth/login — response contract', () => {
  test('returns { user, accessToken, refreshToken } on success', async () => {
    orgsById.set(
      'developer-org-id',
      makeFakeOrg({
        id: 'developer-org-id',
        name: 'Developer Org',
        slug: 'developer-org',
        kind: 'developer',
      }),
    );
    memberships.push({
      id: 'mem-dev',
      orgId: 'developer-org-id',
      userId: FAKE_USER_ID,
      role: 'developer',
      status: 'active',
      organizationName: 'Developer Org',
      organizationSlug: 'developer-org',
      organizationKind: 'developer',
      organizationPlan: 'free',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetUserByEmail.mockImplementation(async () =>
      makeFakeUser({ orgId: 'developer-org-id', role: 'developer' }),
    );

    const res = await request()
      .post('/api/auth/login')
      .send({ email: FAKE_EMAIL, password: 'SecurePass1!' })
      .expect(200);

    expect(typeof res.body.user).toBe('object');
    expect(typeof res.body.user.id).toBe('string');
    expect(typeof res.body.user.email).toBe('string');
    expect(typeof res.body.user.displayName).toBe('string');
    expect(typeof res.body.user.role).toBe('string');

    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.activeMembership).toEqual(
      expect.objectContaining({
        organizationSlug: 'developer-org',
        organizationKind: 'developer',
        role: 'developer',
      }),
    );
    expect(res.body.appAccess).toEqual({
      admin: false,
      builder: true,
      customer: false,
    });
  });

  test('scopes customer access to the active organization when mixed memberships exist', async () => {
    orgsById.set(
      'developer-org-id',
      makeFakeOrg({
        id: 'developer-org-id',
        name: 'Developer Org',
        slug: 'developer-org',
        kind: 'developer',
      }),
    );
    orgsById.set(
      'customer-org-id',
      makeFakeOrg({
        id: 'customer-org-id',
        name: 'Customer Org',
        slug: 'customer-org',
        kind: 'customer',
      }),
    );
    memberships.push(
      {
        id: 'mem-dev',
        orgId: 'developer-org-id',
        userId: FAKE_USER_ID,
        role: 'owner',
        status: 'active',
        organizationName: 'Developer Org',
        organizationSlug: 'developer-org',
        organizationKind: 'developer',
        organizationPlan: 'free',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'mem-customer',
        orgId: 'customer-org-id',
        userId: FAKE_USER_ID,
        role: 'admin',
        status: 'active',
        organizationName: 'Customer Org',
        organizationSlug: 'customer-org',
        organizationKind: 'customer',
        organizationPlan: 'free',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    mockGetUserByEmail.mockImplementation(async () =>
      makeFakeUser({ orgId: 'developer-org-id', role: 'admin' }),
    );

    const res = await request()
      .post('/api/auth/login')
      .send({ email: FAKE_EMAIL, password: 'SecurePass1!' })
      .expect(200);

    expect(res.body.activeOrganization).toEqual(
      expect.objectContaining({
        id: 'developer-org-id',
        kind: 'developer',
      }),
    );
    expect(res.body.activeMembership).toEqual(
      expect.objectContaining({
        organizationId: 'developer-org-id',
        organizationKind: 'developer',
      }),
    );
    expect(res.body.appAccess).toEqual({
      admin: true,
      builder: true,
      customer: false,
    });
  });

  test('does not mark auth cookies as Secure outside production', async () => {
    mockGetUserByEmail.mockImplementation(async () => makeFakeUser());

    const res = await request()
      .post('/api/auth/login')
      .send({ email: FAKE_EMAIL, password: 'SecurePass1!' })
      .expect(200);

    const cookies = res.headers['set-cookie'];
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies as string[]) {
      expect(cookie).not.toContain('Secure');
    }
  });

  test('returns { detail } on invalid credentials', async () => {
    mockGetUserByEmail.mockImplementation(async () => null);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'nope@test.dev', password: 'wrong' })
      .expect(401);

    expect(typeof res.body.detail).toBe('string');
  });

  test('returns { detail } on missing fields', async () => {
    const res = await request()
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(typeof res.body.detail).toBe('string');
  });
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────

describe('GET /api/auth/me — response contract', () => {
  test('returns full profile shape when authenticated', async () => {
    mockGetUserByEmail.mockImplementation(async () => makeFakeUser());

    const loginRes = await request()
      .post('/api/auth/login')
      .send({ email: FAKE_EMAIL, password: 'SecurePass1!' })
      .expect(200);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(typeof res.body.id).toBe('string');
    expect(typeof res.body.email).toBe('string');
    expect(typeof res.body.displayName).toBe('string');
    // avatarUrl can be string or null
    expect(['string', 'object'].includes(typeof res.body.avatarUrl)).toBe(true);
    expect(typeof res.body.role).toBe('string');
    // orgId can be string or null
    expect(['string', 'object'].includes(typeof res.body.orgId)).toBe(true);
    expect(typeof res.body.emailVerified).toBe('boolean');
    expect(typeof res.body.createdAt).toBe('string');
  });

  test('returns active organization and memberships when authenticated', async () => {
    orgsById.set(
      'tenant-org-id',
      makeFakeOrg({
        id: 'tenant-org-id',
        name: 'Tenant Org',
        slug: 'tenant-org',
        kind: 'customer',
      }),
    );
    memberships.push({
      id: 'mem-tenant',
      orgId: 'tenant-org-id',
      userId: FAKE_USER_ID,
      role: 'employee',
      status: 'active',
      organizationName: 'Tenant Org',
      organizationSlug: 'tenant-org',
      organizationKind: 'customer',
      organizationPlan: 'free',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetUserByEmail.mockImplementation(async () =>
      makeFakeUser({ orgId: 'tenant-org-id', role: 'end_user' }),
    );
    mockGetUserById.mockImplementation(async () =>
      makeFakeUser({ orgId: 'tenant-org-id', role: 'end_user' }),
    );

    const loginRes = await request()
      .post('/api/auth/login')
      .send({ email: FAKE_EMAIL, password: 'SecurePass1!' })
      .expect(200);

    const token = loginRes.body.accessToken;

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.memberships)).toBe(true);
    expect(res.body.activeOrganization).toEqual(
      expect.objectContaining({
        slug: 'tenant-org',
        kind: 'customer',
      }),
    );
    expect(res.body.activeMembership).toEqual(
      expect.objectContaining({
        organizationSlug: 'tenant-org',
        organizationKind: 'customer',
        role: 'employee',
      }),
    );
    expect(res.body.appAccess).toEqual({
      admin: false,
      builder: false,
      customer: true,
    });
  });

  test('does not advertise customer access from a developer-active session', async () => {
    orgsById.set(
      'developer-org-id',
      makeFakeOrg({
        id: 'developer-org-id',
        name: 'Developer Org',
        slug: 'developer-org',
        kind: 'developer',
      }),
    );
    orgsById.set(
      'customer-org-id',
      makeFakeOrg({
        id: 'customer-org-id',
        name: 'Customer Org',
        slug: 'customer-org',
        kind: 'customer',
      }),
    );
    memberships.push(
      {
        id: 'mem-dev',
        orgId: 'developer-org-id',
        userId: FAKE_USER_ID,
        role: 'owner',
        status: 'active',
        organizationName: 'Developer Org',
        organizationSlug: 'developer-org',
        organizationKind: 'developer',
        organizationPlan: 'free',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'mem-customer',
        orgId: 'customer-org-id',
        userId: FAKE_USER_ID,
        role: 'admin',
        status: 'active',
        organizationName: 'Customer Org',
        organizationSlug: 'customer-org',
        organizationKind: 'customer',
        organizationPlan: 'free',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    mockGetUserByEmail.mockImplementation(async () =>
      makeFakeUser({ orgId: 'developer-org-id', role: 'admin' }),
    );
    mockGetUserById.mockImplementation(async () =>
      makeFakeUser({ orgId: 'developer-org-id', role: 'admin' }),
    );

    const loginRes = await request()
      .post('/api/auth/login')
      .send({ email: FAKE_EMAIL, password: 'SecurePass1!' })
      .expect(200);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(res.body.activeOrganization).toEqual(
      expect.objectContaining({
        id: 'developer-org-id',
        kind: 'developer',
      }),
    );
    expect(res.body.appAccess).toEqual({
      admin: true,
      builder: true,
      customer: false,
    });
  });

  test('accepts an access token from cookies as well as bearer auth', async () => {
    orgsById.set(
      'cookie-org-id',
      makeFakeOrg({
        id: 'cookie-org-id',
        name: 'Cookie Customer',
        slug: 'cookie-customer',
        kind: 'customer',
      }),
    );
    memberships.push({
      id: 'mem-cookie',
      orgId: 'cookie-org-id',
      userId: FAKE_USER_ID,
      role: 'admin',
      status: 'active',
      organizationName: 'Cookie Customer',
      organizationSlug: 'cookie-customer',
      organizationKind: 'customer',
      organizationPlan: 'free',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetUserByEmail.mockImplementation(async () =>
      makeFakeUser({ orgId: 'cookie-org-id', role: 'end_user' }),
    );
    mockGetUserById.mockImplementation(async () =>
      makeFakeUser({ orgId: 'cookie-org-id', role: 'end_user' }),
    );

    const loginRes = await request()
      .post('/api/auth/login')
      .send({ email: FAKE_EMAIL, password: 'SecurePass1!' })
      .expect(200);

    const res = await request()
      .get('/api/auth/me')
      .set('Cookie', [`accessToken=${loginRes.body.accessToken}`])
      .expect(200);

    expect(res.body.activeOrganization).toEqual(
      expect.objectContaining({
        slug: 'cookie-customer',
        kind: 'customer',
      }),
    );
    expect(res.body.appAccess).toEqual({
      admin: false,
      builder: false,
      customer: true,
    });
  });

  test('returns 401 when no auth header', async () => {
    const res = await request()
      .get('/api/auth/me')
      .expect(401);

    expect(typeof res.body.message).toBe('string');
  });

  test('returns 401 when invalid token', async () => {
    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token-xyz')
      .expect(401);

    expect(typeof res.body.message).toBe('string');
  });
});

// ── Error response shape ────────────────────────────────────────────────────

describe('Auth error responses — shape contract', () => {
  test('route-level errors include a detail string', async () => {
    // httpError errors go through the Express error handler which returns { detail }
    const responses = [
      await request().post('/api/auth/register').send({ email: '', password: '' }),
      await request().post('/api/auth/login').send({ email: '', password: '' }),
    ];

    for (const res of responses) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(typeof res.body.detail).toBe('string');
      expect(res.body.detail.length).toBeGreaterThan(0);
    }
  });

  test('auth middleware errors include a message string', async () => {
    // requireAuth middleware returns { error, message } directly
    const res = await request().get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });
});

describe('POST /api/auth/switch-org — response contract', () => {
  test('returns active organization details after a valid switch', async () => {
    orgsById.set(
      'org-002',
      makeFakeOrg({
        id: 'org-002',
        name: 'Org Two',
        slug: 'org-two',
        kind: 'developer',
      }),
    );
    memberships.push({
      id: 'mem-org-two',
      orgId: 'org-002',
      userId: FAKE_USER_ID,
      role: 'developer',
      status: 'active',
      organizationName: 'Org Two',
      organizationSlug: 'org-two',
      organizationKind: 'developer',
      organizationPlan: 'free',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetUserByEmail.mockImplementation(async () =>
      makeFakeUser({ orgId: 'org-001', role: 'end_user' }),
    );
    mockGetUserById.mockImplementation(async () =>
      makeFakeUser({ orgId: 'org-001', role: 'end_user' }),
    );

    const loginRes = await request()
      .post('/api/auth/login')
      .send({ email: FAKE_EMAIL, password: 'SecurePass1!' })
      .expect(200);

    const res = await request()
      .post('/api/auth/switch-org')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .set('Cookie', [`refreshToken=${loginRes.body.refreshToken}`])
      .send({ organizationId: 'org-002' })
      .expect(200);

    expect(res.body.activeOrganization).toEqual(
      expect.objectContaining({
        id: 'org-002',
      }),
    );
    expect(res.body.activeMembership).toEqual(
      expect.objectContaining({
        organizationSlug: 'org-two',
        organizationKind: 'developer',
        role: 'developer',
      }),
    );
    expect(res.body.appAccess).toEqual({
      admin: false,
      builder: true,
      customer: false,
    });
  });
});
