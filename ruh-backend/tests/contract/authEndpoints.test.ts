/**
 * Contract tests: /api/auth/* endpoints must return the documented response
 * shapes regardless of business-logic details (which are covered by
 * integration tests).
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { request } from '../helpers/app';
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

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetUserByEmail = mock(async () => null as ReturnType<typeof makeFakeUser> | null);
const mockGetUserById = mock(async () => makeFakeUser());
const mockCreateUser = mock(async () => makeFakeUser());
const mockListUsers = mock(async () => ({ items: [makeFakeUser()], total: 1 }));
const mockUpdateUser = mock(async () => makeFakeUser());
const mockDeleteUser = mock(async () => true);

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
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
}));
const mockGetSessionByRefreshToken = mock(async () => null);
const mockDeleteSession = mock(async () => {});
const mockDeleteUserSessions = mock(async () => {});

mock.module('../../src/sessionStore', () => ({
  createSession: mockCreateSession,
  getSessionByRefreshToken: mockGetSessionByRefreshToken,
  deleteSession: mockDeleteSession,
  deleteUserSessions: mockDeleteUserSessions,
  cleanExpiredSessions: mock(async () => 0),
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
  listConversations: mock(async () => []),
  createConversation: mock(async () => ({})),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
  getMessages: mock(async () => []),
  initDb: mock(async () => {}),
}));

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
}));

mock.module('axios', () => ({
  default: { get: mock(async () => ({})), post: mock(async () => ({})) },
  get: mock(async () => ({})),
  post: mock(async () => ({})),
}));

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetUserByEmail.mockImplementation(async () => null);
  mockGetUserById.mockImplementation(async () => makeFakeUser());
  mockCreateUser.mockImplementation(async () => makeFakeUser());
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
    mockGetUserByEmail.mockImplementation(async () => makeFakeUser());

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
    // First register to get a valid token
    const registerRes = await request()
      .post('/api/auth/register')
      .send({ email: 'me@test.dev', password: 'SecurePass1!' });

    const token = registerRes.body.accessToken;

    const res = await request()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
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
    const responses = await Promise.all([
      request().post('/api/auth/register').send({}),
      request().post('/api/auth/login').send({}),
    ]);

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
