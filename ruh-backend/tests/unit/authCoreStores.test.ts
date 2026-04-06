import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({
  rows: [],
  rowCount: 0,
}));
const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (client: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

mock.module('uuid', () => ({
  v4: () => 'test-uuid',
}));

const authIdentityStore = await import('../../src/authIdentityStore.ts?authCoreStoresUnit');
const orgStore = await import('../../src/orgStore.ts?authCoreStoresUnit');
const sessionStore = await import('../../src/sessionStore.ts?authCoreStoresUnit');
const userStore = await import('../../src/userStore.ts?authCoreStoresUnit');

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@ruh.ai',
    password_hash: 'hash-1',
    display_name: 'User One',
    avatar_url: null,
    role: 'developer',
    org_id: 'org-1',
    status: 'active',
    email_verified: false,
    created_at: '2026-04-02T00:00:00Z',
    updated_at: '2026-04-02T00:00:00Z',
    ...overrides,
  };
}

function makeOrgRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-1',
    name: 'Acme Dev',
    slug: 'acme-dev',
    kind: 'developer',
    plan: 'pro',
    status: 'active',
    created_at: '2026-04-02T00:00:00Z',
    updated_at: '2026-04-02T00:00:00Z',
    ...overrides,
  };
}

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    user_id: 'user-1',
    refresh_token: 'refresh-1',
    user_agent: 'BunTest',
    ip_address: '127.0.0.1',
    active_org_id: 'org-1',
    expires_at: '2026-04-09T00:00:00Z',
    created_at: '2026-04-02T00:00:00Z',
    ...overrides,
  };
}

function makeIdentityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'identity-1',
    user_id: 'user-1',
    provider: 'local',
    subject: 'user@ruh.ai',
    created_at: '2026-04-02T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('userStore', () => {
  test('createUser inserts a row and serializes the result', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeUserRow({ id: 'test-uuid' })],
      rowCount: 1,
    });

    const user = await userStore.createUser(
      'builder@ruh.ai',
      'hash-123',
      'Builder User',
      'developer',
      'org-9',
    );

    expect(user).toEqual({
      id: 'test-uuid',
      email: 'user@ruh.ai',
      passwordHash: 'hash-1',
      displayName: 'User One',
      avatarUrl: null,
      role: 'developer',
      orgId: 'org-1',
      status: 'active',
      emailVerified: false,
      createdAt: '2026-04-02T00:00:00Z',
      updatedAt: '2026-04-02T00:00:00Z',
    });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO users');
    expect(params).toEqual([
      'test-uuid',
      'builder@ruh.ai',
      'hash-123',
      'Builder User',
      'developer',
      'org-9',
    ]);
  });

  test('getUserByEmail returns null when the row is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const user = await userStore.getUserByEmail('missing@ruh.ai');

    expect(user).toBeNull();
    expect(mockQuery.mock.calls[0]?.[0]).toContain('SELECT * FROM users WHERE email = $1');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['missing@ruh.ai']);
  });

  test('listUsers builds filters and pagination parameters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [makeUserRow()],
        rowCount: 1,
      });

    const result = await userStore.listUsers({
      role: 'developer',
      status: 'active',
      search: 'ruh',
      limit: 10,
      offset: 20,
    });

    expect(result.total).toBe(3);
    expect(result.items[0]?.email).toBe('user@ruh.ai');

    const [countSql, countParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    const [selectSql, selectParams] = mockQuery.mock.calls[1] as [string, unknown[]];

    expect(countSql).toContain('SELECT COUNT(*) FROM users WHERE role = $1 AND status = $2 AND (email ILIKE $3 OR display_name ILIKE $3)');
    expect(countParams).toEqual(['developer', 'active', '%ruh%']);
    expect(selectSql).toContain('ORDER BY created_at DESC LIMIT $4 OFFSET $5');
    expect(selectParams).toEqual(['developer', 'active', '%ruh%', 10, 20]);
  });

  test('updateUser falls back to getUserById when the patch is empty', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeUserRow({ id: 'user-77' })],
      rowCount: 1,
    });

    const user = await userStore.updateUser('user-77', {});

    expect(user?.id).toBe('user-77');
    expect(mockQuery.mock.calls).toHaveLength(1);
    expect(mockQuery.mock.calls[0]?.[0]).toContain('SELECT * FROM users WHERE id = $1');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-77']);
  });

  test('updateUser updates only the provided fields', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeUserRow({
          display_name: 'Updated User',
          avatar_url: 'https://cdn.ruh.ai/avatar.png',
          role: 'admin',
          status: 'suspended',
          email_verified: true,
        }),
      ],
      rowCount: 1,
    });

    const user = await userStore.updateUser('user-1', {
      displayName: 'Updated User',
      avatarUrl: 'https://cdn.ruh.ai/avatar.png',
      role: 'admin',
      status: 'suspended',
      emailVerified: true,
    });

    expect(user?.displayName).toBe('Updated User');
    expect(user?.avatarUrl).toBe('https://cdn.ruh.ai/avatar.png');
    expect(user?.role).toBe('admin');
    expect(user?.status).toBe('suspended');
    expect(user?.emailVerified).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('display_name = $1');
    expect(sql).toContain('avatar_url = $2');
    expect(sql).toContain('role = $3');
    expect(sql).toContain('status = $4');
    expect(sql).toContain('email_verified = $5');
    expect(sql).toContain('updated_at = NOW()');
    expect(params).toEqual([
      'Updated User',
      'https://cdn.ruh.ai/avatar.png',
      'admin',
      'suspended',
      true,
      'user-1',
    ]);
  });

  test('deleteUser reports whether a row was removed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(userStore.deleteUser('missing-user')).resolves.toBe(false);

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(userStore.deleteUser('user-1')).resolves.toBe(true);
  });
});

describe('orgStore', () => {
  test('createOrg trims optional plan and includes status when provided', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeOrgRow({ id: 'test-uuid', plan: 'enterprise', status: 'suspended' })],
      rowCount: 1,
    });

    const org = await orgStore.createOrg('Globex', 'globex', 'customer', {
      plan: ' enterprise ',
      status: 'suspended',
    });

    expect(org.plan).toBe('enterprise');
    expect(org.status).toBe('suspended');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO organizations (id, name, slug, kind, plan, status)');
    expect(params).toEqual(['test-uuid', 'Globex', 'globex', 'customer', 'enterprise', 'suspended']);
  });

  test('listOrgs serializes rows from the database', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeOrgRow(), makeOrgRow({ id: 'org-2', name: 'Globex', slug: 'globex' })],
      rowCount: 2,
    });

    const orgs = await orgStore.listOrgs();

    expect(orgs).toHaveLength(2);
    expect(orgs[0]?.name).toBe('Acme Dev');
    expect(mockQuery.mock.calls[0]?.[0]).toContain('ORDER BY created_at DESC');
  });

  test('updateOrg falls back to getOrg when the patch is empty', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeOrgRow({ id: 'org-22' })],
      rowCount: 1,
    });

    const org = await orgStore.updateOrg('org-22', {});

    expect(org?.id).toBe('org-22');
    expect(mockQuery.mock.calls).toHaveLength(1);
    expect(mockQuery.mock.calls[0]?.[0]).toContain('SELECT * FROM organizations WHERE id = $1');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['org-22']);
  });

  test('updateOrg updates only provided fields', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeOrgRow({ name: 'Acme Updated', slug: 'acme-updated', plan: 'enterprise', status: 'archived' })],
      rowCount: 1,
    });

    const org = await orgStore.updateOrg('org-1', {
      name: 'Acme Updated',
      slug: 'acme-updated',
      plan: 'enterprise',
      status: 'archived',
    });

    expect(org?.name).toBe('Acme Updated');
    expect(org?.slug).toBe('acme-updated');
    expect(org?.plan).toBe('enterprise');
    expect(org?.status).toBe('archived');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('name = $1');
    expect(sql).toContain('slug = $2');
    expect(sql).toContain('plan = $3');
    expect(sql).toContain('status = $4');
    expect(sql).toContain('updated_at = NOW()');
    expect(params).toEqual(['Acme Updated', 'acme-updated', 'enterprise', 'archived', 'org-1']);
  });

  test('deleteOrg reports whether a row was removed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(orgStore.deleteOrg('org-1')).resolves.toBe(true);

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(orgStore.deleteOrg('missing-org')).resolves.toBe(false);
  });
});

describe('sessionStore', () => {
  test('createSession inserts a row with optional metadata and serializes the result', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeSessionRow({ id: 'test-uuid' })],
      rowCount: 1,
    });

    const session = await sessionStore.createSession(
      'user-9',
      'refresh-9',
      'Safari',
      '10.0.0.1',
      'org-9',
    );

    expect(session.userId).toBe('user-1');
    expect(session.refreshToken).toBe('refresh-1');
    expect(session.activeOrgId).toBe('org-1');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO sessions');
    expect(params[0]).toBe('test-uuid');
    expect(params[1]).toBe('user-9');
    expect(params[2]).toBe('refresh-9');
    expect(params[3]).toBe('Safari');
    expect(params[4]).toBe('10.0.0.1');
    expect(typeof params[5]).toBe('string');
    expect(params[6]).toBe('org-9');
  });

  test('getSessionByRefreshToken filters out expired rows and returns null when missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const session = await sessionStore.getSessionByRefreshToken('missing-token');

    expect(session).toBeNull();
    expect(mockQuery.mock.calls[0]?.[0]).toContain('expires_at > NOW()');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['missing-token']);
  });

  test('deleteSession and deleteUserSessions issue the expected delete statements', async () => {
    await sessionStore.deleteSession('session-1');
    await sessionStore.deleteUserSessions('user-1');

    expect(mockQuery.mock.calls[0]?.[0]).toContain('DELETE FROM sessions WHERE id = $1');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['session-1']);
    expect(mockQuery.mock.calls[1]?.[0]).toContain('DELETE FROM sessions WHERE user_id = $1');
    expect(mockQuery.mock.calls[1]?.[1]).toEqual(['user-1']);
  });

  test('setActiveOrgId returns the updated session when found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeSessionRow({ active_org_id: 'org-99' })],
      rowCount: 1,
    });

    const session = await sessionStore.setActiveOrgId('session-1', 'org-99');

    expect(session?.activeOrgId).toBe('org-99');
    expect(mockQuery.mock.calls[0]?.[0]).toContain('UPDATE sessions SET active_org_id = $1');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['org-99', 'session-1']);
  });

  test('clearActiveOrgForOrganization and cleanExpiredSessions return affected row counts', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 4 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });

    await expect(sessionStore.clearActiveOrgForOrganization('org-1')).resolves.toBe(4);
    await expect(sessionStore.cleanExpiredSessions()).resolves.toBe(2);
  });
});

describe('authIdentityStore', () => {
  test('ensureAuthIdentity returns the existing row without inserting a duplicate', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeIdentityRow()],
      rowCount: 1,
    });

    const identity = await authIdentityStore.ensureAuthIdentity('user-1', 'local', 'user@ruh.ai');

    expect(identity.id).toBe('identity-1');
    expect(mockQuery.mock.calls).toHaveLength(1);
    expect(mockQuery.mock.calls[0]?.[0]).toContain('SELECT * FROM auth_identities WHERE provider = $1 AND subject = $2');
  });

  test('ensureAuthIdentity inserts a new row when the subject is unknown', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [makeIdentityRow({ id: 'test-uuid', user_id: 'user-9', provider: 'google', subject: 'sub-9' })],
        rowCount: 1,
      });

    const identity = await authIdentityStore.ensureAuthIdentity('user-9', 'google', 'sub-9');

    expect(identity).toEqual({
      id: 'test-uuid',
      userId: 'user-9',
      provider: 'google',
      subject: 'sub-9',
      createdAt: '2026-04-02T00:00:00Z',
    });
    expect(mockQuery.mock.calls[1]?.[0]).toContain('INSERT INTO auth_identities');
    expect(mockQuery.mock.calls[1]?.[1]).toEqual(['test-uuid', 'user-9', 'google', 'sub-9']);
  });
});
