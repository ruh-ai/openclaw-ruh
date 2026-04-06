/**
 * Contract tests: /api/admin/* endpoints must return documented response
 * shapes and enforce admin-only access. These tests validate the API contract.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { makeAgentRecord, makeSandboxRecord } from '../helpers/fixtures';
import { signAccessToken } from '../../src/auth/tokens';

// ── Fake data ────────────────────────────────────────────────────────────────

function makeFakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'usr-admin-001',
    email: 'admin@test.dev',
    passwordHash: '$2a$04$dummy',
    displayName: 'Admin User',
    avatarUrl: null,
    role: 'admin',
    orgId: 'org-001',
    status: 'active',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Generate a valid admin JWT for testing. */
function adminToken() {
  return signAccessToken({
    userId: 'usr-admin-001',
    email: 'admin@test.dev',
    role: 'admin',
    orgId: 'org-001',
  });
}

/** Generate a non-admin JWT for testing. */
function developerToken() {
  return signAccessToken({
    userId: 'usr-dev-001',
    email: 'dev@test.dev',
    role: 'developer',
    orgId: 'org-001',
  });
}

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock withConn so admin stats queries work without a real DB
const mockWithConn = mock(async (fn: (client: unknown) => Promise<unknown>) => {
  const fakeClient = {
    query: mock(async (sql: string) => {
      if (sql.includes('FROM users')) return { rows: [{ count: '15' }] };
      if (sql.includes('FROM agents')) return { rows: [{ count: '8' }] };
      if (sql.includes('FROM sandboxes')) return { rows: [{ count: '3' }] };
      return { rows: [] };
    }),
  };
  return fn(fakeClient);
});

mock.module('../../src/db', () => ({
  withConn: mockWithConn,
  initPool: mock(() => {}),
  getPool: mock(() => null),
}));

const mockListUsers = mock(async () => ({
  items: [makeFakeUser(), makeFakeUser({ id: 'usr-002', email: 'user2@test.dev', role: 'developer' })],
  total: 2,
}));
const mockUpdateUser = mock(async () => makeFakeUser());
const mockDeleteUser = mock(async () => true);

mock.module('../../src/userStore', () => ({
  getUserByEmail: mock(async () => null),
  getUserById: mock(async () => makeFakeUser()),
  createUser: mock(async () => makeFakeUser()),
  listUsers: mockListUsers,
  updateUser: mockUpdateUser,
  deleteUser: mockDeleteUser,
}));

mock.module('../../src/sessionStore', () => ({
  createSession: mock(async () => ({})),
  getSessionByRefreshToken: mock(async () => null),
  deleteSession: mock(async () => {}),
  deleteUserSessions: mock(async () => {}),
  cleanExpiredSessions: mock(async () => 0),
}));

mock.module('../../src/agentStore', () => ({
  initDb: mock(async () => {}),
  listAgents: mock(async () => [makeAgentRecord({ sandbox_ids: ['sb-admin-001'] })]),
  listAgentsForCreator: mock(async () => []),
  listAgentsForCreatorInOrg: mock(async () => []),
  saveAgent: mock(async () => makeAgentRecord()),
  getAgent: mock(async () => makeAgentRecord()),
  getAgentForCreator: mock(async () => makeAgentRecord()),
  getAgentForCreatorInOrg: mock(async () => makeAgentRecord()),
  updateAgent: mock(async () => makeAgentRecord()),
  updateAgentConfig: mock(async () => makeAgentRecord()),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => makeAgentRecord()),
  removeSandboxFromAgent: mock(async () => makeAgentRecord()),
  setForgeSandbox: mock(async () => makeAgentRecord()),
  promoteForgeSandbox: mock(async () => makeAgentRecord()),
  clearForgeSandbox: mock(async () => makeAgentRecord()),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
  getAgentCredentials: mock(async () => []),
  getAgentCredentialSummary: mock(async () => []),
  saveAgentCredential: mock(async () => {}),
  deleteAgentCredential: mock(async () => {}),
  getAgentBySandboxId: mock(async () => null),
}));

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
  PREVIEW_PORTS: [],
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, 'true']),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
  waitForGateway: mock(async () => true),
  sandboxExec: mock(async () => [0, '']),
}));

mock.module('axios', () => ({
  default: { get: mock(async () => ({})), post: mock(async () => ({})) },
  get: mock(async () => ({})),
  post: mock(async () => ({})),
}));

// ─────────────────────────────────────────────────────────────────────────────

const { request } = await import('../helpers/app.ts?contractAdminEndpoints');

beforeEach(() => {
  mockListUsers.mockImplementation(async () => ({
    items: [makeFakeUser(), makeFakeUser({ id: 'usr-002', email: 'user2@test.dev', role: 'developer' })],
    total: 2,
  }));
});

// ── GET /api/admin/stats ────────────────────────────────────────────────────

describe('GET /api/admin/stats — response contract', () => {
  test('returns stats object with numeric fields', async () => {
    const res = await request()
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(typeof res.body.totalUsers).toBe('number');
    expect(typeof res.body.totalAgents).toBe('number');
    expect(typeof res.body.activeSandboxes).toBe('number');
    expect(typeof res.body.marketplaceListings).toBe('number');
  });

  test('rejects non-admin with 403', async () => {
    const res = await request()
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${developerToken()}`)
      .expect(403);

    expect(typeof res.body.message).toBe('string');
  });

  test('rejects unauthenticated with 401', async () => {
    const res = await request()
      .get('/api/admin/stats')
      .expect(401);

    expect(typeof res.body.message).toBe('string');
  });
});

// ── GET /api/admin/users ────────────────────────────────────────────────────

describe('GET /api/admin/users — response contract', () => {
  test('returns { items: UserRecord[], total: number }', async () => {
    const res = await request()
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  test('each user item has expected fields', async () => {
    const res = await request()
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    for (const user of res.body.items) {
      expect(typeof user.id).toBe('string');
      expect(typeof user.email).toBe('string');
      expect(typeof user.displayName).toBe('string');
      expect(typeof user.role).toBe('string');
      expect(typeof user.status).toBe('string');
      expect(typeof user.createdAt).toBe('string');
    }
  });

  test('rejects non-admin with 403', async () => {
    const res = await request()
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${developerToken()}`)
      .expect(403);

    expect(typeof res.body.message).toBe('string');
  });

  test('rejects unauthenticated with 401', async () => {
    const res = await request()
      .get('/api/admin/users')
      .expect(401);

    expect(typeof res.body.message).toBe('string');
  });
});

// ── Authorization enforcement ───────────────────────────────────────────────

describe('Admin endpoints — authorization enforcement', () => {
  const adminEndpoints = [
    { method: 'get' as const, path: '/api/admin/stats' },
    { method: 'get' as const, path: '/api/admin/users' },
  ];

  for (const { method, path } of adminEndpoints) {
    test(`${method.toUpperCase()} ${path} returns 401 without auth`, async () => {
      const res = await request()[method](path);
      expect(res.status).toBe(401);
      expect(typeof res.body.message).toBe('string');
    });

    test(`${method.toUpperCase()} ${path} returns 403 for non-admin`, async () => {
      const res = await request()[method](path)
        .set('Authorization', `Bearer ${developerToken()}`);
      expect(res.status).toBe(403);
      expect(typeof res.body.message).toBe('string');
    });
  }
});
