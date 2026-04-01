import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { UserRecord } from '../../src/userStore';
import type { SessionRecord } from '../../src/sessionStore';
import type { OrganizationMembershipRecord } from '../../src/organizationMembershipStore';
import type { OrgRecord } from '../../src/orgStore';

// ── Test fixtures ───────────────────────────────────────────────────────────

const USER_ID = 'user-abc-123';
const ORG_ID = 'org-dev-456';
const SESSION_ID = 'session-789';
const REFRESH_TOKEN = 'rt-uuid-token';

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: USER_ID,
    email: 'test@example.com',
    passwordHash: '$2a$12$hashedpassword',
    displayName: 'Test User',
    avatarUrl: null,
    role: 'developer',
    orgId: ORG_ID,
    status: 'active',
    emailVerified: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeOrg(overrides: Partial<OrgRecord> = {}): OrgRecord {
  return {
    id: ORG_ID,
    name: 'Dev Org',
    slug: 'dev-org',
    kind: 'developer',
    plan: 'free',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMembership(overrides: Partial<OrganizationMembershipRecord> = {}): OrganizationMembershipRecord {
  return {
    id: 'mem-1',
    orgId: ORG_ID,
    userId: USER_ID,
    role: 'owner',
    status: 'active',
    organizationName: 'Dev Org',
    organizationSlug: 'dev-org',
    organizationKind: 'developer',
    organizationPlan: 'free',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    refreshToken: REFRESH_TOKEN,
    userAgent: 'test-agent',
    ipAddress: '127.0.0.1',
    activeOrgId: ORG_ID,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Mocks (before any app import) ───────────────────────────────────────────

const mockGetUserByEmail = mock(async (_email: string) => null as UserRecord | null);
const mockGetUserById = mock(async (_id: string) => null as UserRecord | null);
const mockCreateUser = mock(async (..._args: unknown[]) => makeUser());
const mockUpdateUser = mock(async (_id: string, _data: Record<string, unknown>) => makeUser() as UserRecord | null);

const mockCreateSession = mock(async (..._args: unknown[]) => makeSession());
const mockGetSessionByRefreshToken = mock(async (_token: string) => null as SessionRecord | null);
const mockDeleteSession = mock(async (_id: string) => {});
const mockDeleteUserSessions = mock(async (_userId: string) => {});
const mockSetActiveOrgId = mock(async (_sessionId: string, _orgId: string) => {});

const mockCreateOrg = mock(async (..._args: unknown[]) => makeOrg());
const mockGetOrg = mock(async (_id: string) => null as OrgRecord | null);

const mockListMembershipsForUser = mock(async (_userId: string) => [] as OrganizationMembershipRecord[]);
const mockCreateMembership = mock(async (..._args: unknown[]) => makeMembership());
const mockGetMembershipForUserOrg = mock(async (_userId: string, _orgId: string) => null as OrganizationMembershipRecord | null);

const mockEnsureAuthIdentity = mock(async (..._args: unknown[]) => ({
  id: 'identity-1',
  userId: USER_ID,
  provider: 'local',
  subject: 'test@example.com',
  createdAt: '2026-01-01T00:00:00Z',
}));

const mockHashPassword = mock(async (_pw: string) => '$2a$12$newhash');
const mockVerifyPassword = mock(async (_pw: string, _hash: string) => true);

const mockSignAccessToken = mock((_payload: unknown) => 'mock-access-token');
const mockVerifyAccessToken = mock((_token: string) => ({
  userId: USER_ID,
  email: 'test@example.com',
  role: 'developer',
  orgId: ORG_ID,
}));

mock.module('../../src/userStore', () => ({
  getUserByEmail: mockGetUserByEmail,
  getUserById: mockGetUserById,
  createUser: mockCreateUser,
  updateUser: mockUpdateUser,
}));

mock.module('../../src/sessionStore', () => ({
  createSession: mockCreateSession,
  getSessionByRefreshToken: mockGetSessionByRefreshToken,
  deleteSession: mockDeleteSession,
  deleteUserSessions: mockDeleteUserSessions,
  setActiveOrgId: mockSetActiveOrgId,
}));

mock.module('../../src/orgStore', () => ({
  createOrg: mockCreateOrg,
  getOrg: mockGetOrg,
}));

mock.module('../../src/organizationMembershipStore', () => ({
  listMembershipsForUser: mockListMembershipsForUser,
  createMembership: mockCreateMembership,
  getMembershipForUserOrg: mockGetMembershipForUserOrg,
}));

mock.module('../../src/authIdentityStore', () => ({
  ensureAuthIdentity: mockEnsureAuthIdentity,
}));

mock.module('../../src/auth/passwords', () => ({
  hashPassword: mockHashPassword,
  verifyPassword: mockVerifyPassword,
}));

mock.module('../../src/auth/tokens', () => ({
  signAccessToken: mockSignAccessToken,
  verifyAccessToken: mockVerifyAccessToken,
}));

mock.module('../../src/db', () => ({
  withConn: mock(async (fn: Function) => fn({
    query: mock(async () => ({ rows: [] })),
  })),
}));

// Disable rate limiting in tests
mock.module('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

// Import after mocking
const { authRouter } = await import('../../src/authRoutes');

// ── Lightweight Express app for testing ─────────────────────────────────────

import express from 'express';
import cookieParser from 'cookie-parser';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  // Error handler to catch httpError throws
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.statusCode || err.status || 500;
    res.status(status).json({ detail: err.message || 'Internal server error' });
  });
  return app;
}

import supertest from 'supertest';

const app = createTestApp();

function request() {
  return supertest(app);
}

// ── Reset mocks ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetUserByEmail.mockReset();
  mockGetUserById.mockReset();
  mockCreateUser.mockReset();
  mockUpdateUser.mockReset();
  mockCreateSession.mockReset();
  mockGetSessionByRefreshToken.mockReset();
  mockDeleteSession.mockReset();
  mockDeleteUserSessions.mockReset();
  mockSetActiveOrgId.mockReset();
  mockCreateOrg.mockReset();
  mockGetOrg.mockReset();
  mockListMembershipsForUser.mockReset();
  mockCreateMembership.mockReset();
  mockGetMembershipForUserOrg.mockReset();
  mockEnsureAuthIdentity.mockReset();
  mockHashPassword.mockReset();
  mockVerifyPassword.mockReset();
  mockSignAccessToken.mockReset();
  mockVerifyAccessToken.mockReset();

  // Restore sensible defaults
  mockHashPassword.mockResolvedValue('$2a$12$newhash');
  mockVerifyPassword.mockResolvedValue(true);
  mockSignAccessToken.mockReturnValue('mock-access-token');
  mockVerifyAccessToken.mockReturnValue({
    userId: USER_ID,
    email: 'test@example.com',
    role: 'developer',
    orgId: ORG_ID,
  });
  mockCreateSession.mockResolvedValue(makeSession());
  mockEnsureAuthIdentity.mockResolvedValue({
    id: 'identity-1',
    userId: USER_ID,
    provider: 'local',
    subject: 'test@example.com',
    createdAt: '2026-01-01T00:00:00Z',
  });
  mockListMembershipsForUser.mockResolvedValue([]);
  mockDeleteUserSessions.mockResolvedValue(undefined);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const VALID_PASSWORD = 'StrongP@ssw0rd!';

  test('returns 400 when email is missing', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ password: VALID_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('Email and password are required');
  });

  test('returns 400 when password is missing', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('Email and password are required');
  });

  test('returns 400 for invalid email format', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: VALID_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('Invalid email format');
  });

  test('returns 400 for weak password (too short)', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Short1!' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('at least 12 characters');
  });

  test('returns 400 for password missing uppercase', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'alllowercase1!' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('uppercase');
  });

  test('returns 400 for password missing lowercase', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'ALLUPPERCASE1!' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('lowercase');
  });

  test('returns 400 for password missing number', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'NoNumberHere!!' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('number');
  });

  test('returns 400 for password missing special character', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'NoSpecialChar1x' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('special character');
  });

  test('returns 409 when email already registered', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser());

    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: VALID_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('already registered');
  });

  test('registers successfully without organization', async () => {
    mockGetUserByEmail.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue(makeUser());
    mockListMembershipsForUser.mockResolvedValue([]);

    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.accessToken).toBe('mock-access-token');
    expect(res.body.refreshToken).toBeDefined();
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockEnsureAuthIdentity).toHaveBeenCalledTimes(1);
  });

  test('registers with organization bootstrap', async () => {
    const org = makeOrg();
    mockGetUserByEmail.mockResolvedValue(null);
    mockCreateOrg.mockResolvedValue(org);
    mockCreateUser.mockResolvedValue(makeUser());
    mockListMembershipsForUser.mockResolvedValue([makeMembership()]);

    const res = await request()
      .post('/api/auth/register')
      .send({
        email: 'new@example.com',
        password: VALID_PASSWORD,
        organizationName: 'My Org',
        organizationKind: 'developer',
      });

    expect(res.status).toBe(201);
    expect(mockCreateOrg).toHaveBeenCalledTimes(1);
    expect(mockCreateMembership).toHaveBeenCalledTimes(1);
  });

  test('normalizes email to lowercase', async () => {
    mockGetUserByEmail.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue(makeUser());
    mockListMembershipsForUser.mockResolvedValue([]);

    await request()
      .post('/api/auth/register')
      .send({ email: '  TEST@EXAMPLE.COM  ', password: VALID_PASSWORD });

    expect(mockGetUserByEmail).toHaveBeenCalledWith('test@example.com');
  });

  test('uses custom membership role when valid', async () => {
    const org = makeOrg();
    mockGetUserByEmail.mockResolvedValue(null);
    mockCreateOrg.mockResolvedValue(org);
    mockCreateUser.mockResolvedValue(makeUser());
    mockListMembershipsForUser.mockResolvedValue([makeMembership()]);

    await request()
      .post('/api/auth/register')
      .send({
        email: 'new@example.com',
        password: VALID_PASSWORD,
        organizationName: 'My Org',
        membershipRole: 'developer',
      });

    // The third arg to createMembership should be 'developer'
    expect(mockCreateMembership).toHaveBeenCalledWith(org.id, expect.any(String), 'developer');
  });

  test('defaults membership role to owner for invalid value', async () => {
    const org = makeOrg();
    mockGetUserByEmail.mockResolvedValue(null);
    mockCreateOrg.mockResolvedValue(org);
    mockCreateUser.mockResolvedValue(makeUser());
    mockListMembershipsForUser.mockResolvedValue([makeMembership()]);

    await request()
      .post('/api/auth/register')
      .send({
        email: 'new@example.com',
        password: VALID_PASSWORD,
        organizationName: 'My Org',
        membershipRole: 'invalid-role',
      });

    expect(mockCreateMembership).toHaveBeenCalledWith(org.id, expect.any(String), 'owner');
  });
});

describe('POST /api/auth/login', () => {
  test('returns 400 when email or password missing', async () => {
    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('Email and password are required');
  });

  test('returns 401 when user not found', async () => {
    mockGetUserByEmail.mockResolvedValue(null);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.detail).toContain('Invalid email or password');
  });

  test('returns 403 when account is not active', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser({ status: 'suspended' }));

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'anything' });
    expect(res.status).toBe(403);
    expect(res.body.detail).toContain('not active');
  });

  test('returns 401 when password is wrong', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser());
    mockVerifyPassword.mockResolvedValue(false);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.detail).toContain('Invalid email or password');
  });

  test('logs in successfully with correct credentials', async () => {
    const user = makeUser();
    mockGetUserByEmail.mockResolvedValue(user);
    mockVerifyPassword.mockResolvedValue(true);
    mockListMembershipsForUser.mockResolvedValue([makeMembership()]);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(USER_ID);
    expect(res.body.accessToken).toBe('mock-access-token');
    expect(res.body.refreshToken).toBeDefined();
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockEnsureAuthIdentity).toHaveBeenCalledTimes(1);
  });

  test('sets httpOnly cookies on successful login', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser());
    mockVerifyPassword.mockResolvedValue(true);
    mockListMembershipsForUser.mockResolvedValue([]);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
    expect(cookieStr).toContain('accessToken');
    expect(cookieStr).toContain('refreshToken');
    expect(cookieStr).toContain('HttpOnly');
  });

  test('normalizes email before lookup', async () => {
    mockGetUserByEmail.mockResolvedValue(null);

    await request()
      .post('/api/auth/login')
      .send({ email: '  TEST@EXAMPLE.COM  ', password: 'pass' });

    expect(mockGetUserByEmail).toHaveBeenCalledWith('test@example.com');
  });
});

describe('POST /api/auth/refresh', () => {
  test('returns 400 when no refresh token provided', async () => {
    const res = await request()
      .post('/api/auth/refresh')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('Refresh token is required');
  });

  test('returns 401 when refresh token is invalid', async () => {
    mockGetSessionByRefreshToken.mockResolvedValue(null);

    const res = await request()
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad-token' });
    expect(res.status).toBe(401);
    expect(res.body.detail).toContain('Invalid refresh token');
  });

  test('returns 401 when user not found or inactive', async () => {
    mockGetSessionByRefreshToken.mockResolvedValue(makeSession());
    mockGetUserById.mockResolvedValue(makeUser({ status: 'suspended' }));

    const res = await request()
      .post('/api/auth/refresh')
      .send({ refreshToken: REFRESH_TOKEN });
    expect(res.status).toBe(401);
    expect(res.body.detail).toContain('not found or inactive');
  });

  test('rotates refresh token on success', async () => {
    const session = makeSession();
    const user = makeUser();
    mockGetSessionByRefreshToken.mockResolvedValue(session);
    mockGetUserById.mockResolvedValue(user);
    mockListMembershipsForUser.mockResolvedValue([makeMembership()]);

    const res = await request()
      .post('/api/auth/refresh')
      .send({ refreshToken: REFRESH_TOKEN });

    expect(res.status).toBe(200);
    expect(mockDeleteSession).toHaveBeenCalledWith(session.id);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(res.body.accessToken).toBe('mock-access-token');
    // New refresh token should be different from old one (it's a uuid)
    expect(res.body.refreshToken).toBeDefined();
  });

  test('accepts refresh token from cookie', async () => {
    const session = makeSession();
    const user = makeUser();
    mockGetSessionByRefreshToken.mockResolvedValue(session);
    mockGetUserById.mockResolvedValue(user);
    mockListMembershipsForUser.mockResolvedValue([]);

    const res = await request()
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${REFRESH_TOKEN}`)
      .send({});

    expect(res.status).toBe(200);
    expect(mockGetSessionByRefreshToken).toHaveBeenCalledWith(REFRESH_TOKEN);
  });
});

describe('POST /api/auth/logout', () => {
  test('returns 401 without auth token', async () => {
    mockVerifyAccessToken.mockReturnValue(null);

    const res = await request()
      .post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  test('deletes all user sessions and clears cookies', async () => {
    const res = await request()
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer mock-access-token');

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Logged out');
    expect(mockDeleteUserSessions).toHaveBeenCalledWith(USER_ID);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
    expect(cookieStr).toContain('accessToken');
    expect(cookieStr).toContain('refreshToken');
  });
});

describe('GET /api/auth/me', () => {
  test('returns 401 without auth', async () => {
    mockVerifyAccessToken.mockReturnValue(null);

    const res = await request().get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue(null);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token');
    expect(res.status).toBe(404);
  });

  test('returns user profile with memberships', async () => {
    const user = makeUser();
    const membership = makeMembership();
    mockGetUserById.mockResolvedValue(user);
    mockListMembershipsForUser.mockResolvedValue([membership]);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(USER_ID);
    expect(res.body.email).toBe('test@example.com');
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].organizationId).toBe(ORG_ID);
    expect(res.body.activeOrganization).toBeDefined();
    expect(res.body.appAccess).toBeDefined();
  });

  test('returns platformRole platform_admin for admin users', async () => {
    mockGetUserById.mockResolvedValue(makeUser({ role: 'admin' }));
    mockListMembershipsForUser.mockResolvedValue([]);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token');

    expect(res.status).toBe(200);
    expect(res.body.platformRole).toBe('platform_admin');
  });

  test('returns platformRole user for non-admin users', async () => {
    mockGetUserById.mockResolvedValue(makeUser({ role: 'developer' }));
    mockListMembershipsForUser.mockResolvedValue([]);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token');

    expect(res.status).toBe(200);
    expect(res.body.platformRole).toBe('user');
  });
});

describe('PATCH /api/auth/me', () => {
  test('returns 401 without auth', async () => {
    mockVerifyAccessToken.mockReturnValue(null);

    const res = await request()
      .patch('/api/auth/me')
      .send({ displayName: 'New Name' });
    expect(res.status).toBe(401);
  });

  test('updates display name', async () => {
    const updated = makeUser({ displayName: 'New Name' });
    mockUpdateUser.mockResolvedValue(updated);

    const res = await request()
      .patch('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token')
      .send({ displayName: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('New Name');
    expect(mockUpdateUser).toHaveBeenCalledWith(USER_ID, {
      displayName: 'New Name',
      avatarUrl: undefined,
    });
  });

  test('returns 404 when user not found', async () => {
    mockUpdateUser.mockResolvedValue(null);

    const res = await request()
      .patch('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token')
      .send({ displayName: 'New Name' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/auth/switch-org', () => {
  test('returns 401 without auth', async () => {
    mockVerifyAccessToken.mockReturnValue(null);

    const res = await request()
      .post('/api/auth/switch-org')
      .send({ organizationId: ORG_ID });
    expect(res.status).toBe(401);
  });

  test('returns 400 when organizationId missing', async () => {
    const res = await request()
      .post('/api/auth/switch-org')
      .set('Authorization', 'Bearer mock-access-token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('organizationId is required');
  });

  test('returns 400 when refreshToken missing', async () => {
    const res = await request()
      .post('/api/auth/switch-org')
      .set('Authorization', 'Bearer mock-access-token')
      .send({ organizationId: ORG_ID });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('Refresh token is required');
  });

  test('returns 401 when refresh token session invalid', async () => {
    mockGetSessionByRefreshToken.mockResolvedValue(null);

    const res = await request()
      .post('/api/auth/switch-org')
      .set('Authorization', 'Bearer mock-access-token')
      .set('Cookie', `refreshToken=${REFRESH_TOKEN}`)
      .send({ organizationId: ORG_ID });
    expect(res.status).toBe(401);
  });

  test('returns 403 when user has no active membership in target org', async () => {
    mockGetSessionByRefreshToken.mockResolvedValue(makeSession());
    mockGetUserById.mockResolvedValue(makeUser());
    mockGetMembershipForUserOrg.mockResolvedValue(null);

    const res = await request()
      .post('/api/auth/switch-org')
      .set('Authorization', 'Bearer mock-access-token')
      .set('Cookie', `refreshToken=${REFRESH_TOKEN}`)
      .send({ organizationId: 'org-other' });
    expect(res.status).toBe(403);
    expect(res.body.detail).toContain('does not have access');
  });

  test('returns 403 for suspended membership', async () => {
    mockGetSessionByRefreshToken.mockResolvedValue(makeSession());
    mockGetUserById.mockResolvedValue(makeUser());
    mockGetMembershipForUserOrg.mockResolvedValue(makeMembership({ status: 'suspended' }));

    const res = await request()
      .post('/api/auth/switch-org')
      .set('Authorization', 'Bearer mock-access-token')
      .set('Cookie', `refreshToken=${REFRESH_TOKEN}`)
      .send({ organizationId: ORG_ID });
    expect(res.status).toBe(403);
  });

  test('switches org successfully', async () => {
    const newOrgId = 'org-new-789';
    mockGetSessionByRefreshToken.mockResolvedValue(makeSession());
    mockGetUserById.mockResolvedValue(makeUser());
    mockGetMembershipForUserOrg.mockResolvedValue(
      makeMembership({ orgId: newOrgId, organizationName: 'New Org' }),
    );
    mockListMembershipsForUser.mockResolvedValue([
      makeMembership({ orgId: newOrgId, organizationName: 'New Org' }),
    ]);

    const res = await request()
      .post('/api/auth/switch-org')
      .set('Authorization', 'Bearer mock-access-token')
      .set('Cookie', `refreshToken=${REFRESH_TOKEN}`)
      .send({ organizationId: newOrgId });

    expect(res.status).toBe(200);
    expect(mockSetActiveOrgId).toHaveBeenCalledWith(SESSION_ID, newOrgId);
    expect(res.body.accessToken).toBe('mock-access-token');
  });
});

describe('DELETE /api/auth/me (GDPR deletion)', () => {
  test('returns 401 without auth', async () => {
    mockVerifyAccessToken.mockReturnValue(null);

    const res = await request().delete('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue(null);

    const res = await request()
      .delete('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token');
    expect(res.status).toBe(404);
  });

  test('deletes user data and clears cookies', async () => {
    mockGetUserById.mockResolvedValue(makeUser());

    const res = await request()
      .delete('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token');

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deleted');

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
    expect(cookieStr).toContain('accessToken');
    expect(cookieStr).toContain('refreshToken');
  });
});

describe('GET /api/auth/me/export (GDPR export)', () => {
  test('returns 401 without auth', async () => {
    mockVerifyAccessToken.mockReturnValue(null);

    const res = await request().get('/api/auth/me/export');
    expect(res.status).toBe(401);
  });

  test('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue(null);

    const res = await request()
      .get('/api/auth/me/export')
      .set('Authorization', 'Bearer mock-access-token');
    expect(res.status).toBe(404);
  });

  test('returns exported user data with correct headers', async () => {
    mockGetUserById.mockResolvedValue(makeUser());

    const res = await request()
      .get('/api/auth/me/export')
      .set('Authorization', 'Bearer mock-access-token');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('ruh-data-export');
    expect(res.body.exportedAt).toBeDefined();
    expect(res.body.platform).toBe('Ruh.ai');
    expect(res.body.profile.id).toBe(USER_ID);
  });
});

describe('legacy membership fallback', () => {
  test('GET /me synthesizes legacy membership when no memberships exist but user has orgId (developer)', async () => {
    const user = makeUser({ orgId: ORG_ID, role: 'developer' });
    const org = makeOrg();
    mockGetUserById.mockResolvedValue(user);
    mockListMembershipsForUser.mockResolvedValue([]); // no real memberships
    mockGetOrg.mockResolvedValue(org);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token');

    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].organizationId).toBe(ORG_ID);
    // inferLegacyMembershipRole: developer user → 'developer' role
    expect(res.body.memberships[0].role).toBe('developer');
  });

  test('GET /me synthesizes legacy membership with employee role for end_user', async () => {
    const user = makeUser({ orgId: ORG_ID, role: 'end_user' });
    const org = makeOrg();
    mockGetUserById.mockResolvedValue(user);
    mockListMembershipsForUser.mockResolvedValue([]);
    mockGetOrg.mockResolvedValue(org);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token');

    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].role).toBe('employee');
  });

  test('GET /me returns empty memberships when no memberships and no orgId', async () => {
    mockGetUserById.mockResolvedValue(makeUser({ orgId: null }));
    mockListMembershipsForUser.mockResolvedValue([]);

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer mock-access-token');

    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(0);
  });
});

describe('auth response shape', () => {
  test('login response includes appAccess, memberships, activeOrganization', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser());
    mockVerifyPassword.mockResolvedValue(true);
    mockListMembershipsForUser.mockResolvedValue([makeMembership()]);

    const res = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'correct' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('appAccess');
    expect(res.body).toHaveProperty('memberships');
    expect(res.body).toHaveProperty('activeOrganization');
    expect(res.body).toHaveProperty('activeMembership');
    expect(res.body).toHaveProperty('platformRole');
    expect(res.body.appAccess).toHaveProperty('admin');
    expect(res.body.appAccess).toHaveProperty('builder');
    expect(res.body.appAccess).toHaveProperty('customer');
  });
});
