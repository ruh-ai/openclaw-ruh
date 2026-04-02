/**
 * Unit tests for src/userStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as userStore from '../../../src/userStore';

// ─────────────────────────────────────────────────────────────────────────────

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-test-uuid',
    email: 'test@example.com',
    password_hash: '$2b$12$hashedpassword',
    display_name: 'Test User',
    avatar_url: null,
    role: 'end_user',
    org_id: null,
    status: 'active',
    email_verified: false,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── createUser ───────────────────────────────────────────────────────────────

describe('userStore.createUser', () => {
  test('inserts user and returns serialized UserRecord', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeUserRow()],
      rowCount: 1,
    }));

    const user = await userStore.createUser('test@example.com', '$2b$12$hashedpassword', 'Test User');
    expect(user.email).toBe('test@example.com');
    expect(user.displayName).toBe('Test User');
    expect(user.passwordHash).toBe('$2b$12$hashedpassword');
    expect(user.role).toBe('end_user');
    expect(user.status).toBe('active');
  });

  test('passes default role end_user when not specified', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeUserRow()],
      rowCount: 1,
    }));

    await userStore.createUser('test@example.com', 'hash', 'User');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe('end_user');
  });

  test('passes custom role when specified', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeUserRow({ role: 'developer' })],
      rowCount: 1,
    }));

    const user = await userStore.createUser('dev@example.com', 'hash', 'Dev', 'developer');
    expect(user.role).toBe('developer');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe('developer');
  });

  test('passes orgId when provided', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeUserRow({ org_id: 'org-123' })],
      rowCount: 1,
    }));

    await userStore.createUser('test@example.com', 'hash', 'User', 'end_user', 'org-123');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[5]).toBe('org-123');
  });

  test('passes null orgId when not provided', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeUserRow()],
      rowCount: 1,
    }));

    await userStore.createUser('test@example.com', 'hash', 'User');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[5]).toBeNull();
  });
});

// ── getUserByEmail ───────────────────────────────────────────────────────────

describe('userStore.getUserByEmail', () => {
  test('returns user when found', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeUserRow({ email: 'found@example.com' })],
      rowCount: 1,
    }));

    const user = await userStore.getUserByEmail('found@example.com');
    expect(user).not.toBeNull();
    expect(user!.email).toBe('found@example.com');
  });

  test('returns null when no rows', async () => {
    const user = await userStore.getUserByEmail('missing@example.com');
    expect(user).toBeNull();
  });
});

// ── getUserById ──────────────────────────────────────────────────────────────

describe('userStore.getUserById', () => {
  test('returns user when found', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeUserRow({ id: 'user-abc' })],
      rowCount: 1,
    }));

    const user = await userStore.getUserById('user-abc');
    expect(user).not.toBeNull();
    expect(user!.id).toBe('user-abc');
  });

  test('returns null when not found', async () => {
    const user = await userStore.getUserById('nonexistent');
    expect(user).toBeNull();
  });
});

// ── listUsers ────────────────────────────────────────────────────────────────

describe('userStore.listUsers', () => {
  test('returns items and total without filters', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT')) return { rows: [{ count: '2' }], rowCount: 1 };
      return { rows: [makeUserRow(), makeUserRow({ id: 'user-2' })], rowCount: 2 };
    });

    const result = await userStore.listUsers();
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  test('applies role filter', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT')) return { rows: [{ count: '1' }], rowCount: 1 };
      return { rows: [makeUserRow({ role: 'admin' })], rowCount: 1 };
    });

    await userStore.listUsers({ role: 'admin' });
    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('role = $1');
  });

  test('applies status filter', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT')) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await userStore.listUsers({ status: 'suspended' });
    const countParams = mockQuery.mock.calls[0][1] as unknown[];
    expect(countParams).toContain('suspended');
  });

  test('applies search filter with ILIKE', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT')) return { rows: [{ count: '1' }], rowCount: 1 };
      return { rows: [makeUserRow()], rowCount: 1 };
    });

    await userStore.listUsers({ search: 'test' });
    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('ILIKE');
  });

  test('respects limit and offset', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT')) return { rows: [{ count: '50' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await userStore.listUsers({ limit: 10, offset: 20 });
    const selectParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(selectParams).toContain(10);
    expect(selectParams).toContain(20);
  });

  test('uses default limit 50 and offset 0', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT')) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await userStore.listUsers();
    const selectParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(selectParams).toContain(50);
    expect(selectParams).toContain(0);
  });
});

// ── updateUser ───────────────────────────────────────────────────────────────

describe('userStore.updateUser', () => {
  test('updates displayName and returns user', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeUserRow({ display_name: 'Updated Name' })],
      rowCount: 1,
    }));

    const user = await userStore.updateUser('user-1', { displayName: 'Updated Name' });
    expect(user).not.toBeNull();
    expect(user!.displayName).toBe('Updated Name');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('UPDATE users SET');
    expect(sql).toContain('display_name');
  });

  test('updates multiple fields', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeUserRow({ role: 'admin', status: 'suspended' })],
      rowCount: 1,
    }));

    const user = await userStore.updateUser('user-1', { role: 'admin', status: 'suspended' });
    expect(user!.role).toBe('admin');
    expect(user!.status).toBe('suspended');
  });

  test('returns null when user not found', async () => {
    const user = await userStore.updateUser('nonexistent', { displayName: 'X' });
    expect(user).toBeNull();
  });

  test('delegates to getUserById when patch is empty', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [],
      rowCount: 0,
    }));

    const user = await userStore.updateUser('user-1', {});
    // Empty patch falls through to getUserById which returns null for no rows
    expect(user).toBeNull();
  });
});

// ── deleteUser ───────────────────────────────────────────────────────────────

describe('userStore.deleteUser', () => {
  test('returns true when rowCount > 0', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 1 }));

    const result = await userStore.deleteUser('user-1');
    expect(result).toBe(true);
  });

  test('returns false when rowCount is 0', async () => {
    const result = await userStore.deleteUser('nonexistent');
    expect(result).toBe(false);
  });
});
