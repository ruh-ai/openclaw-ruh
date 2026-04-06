/**
 * Unit tests for src/authIdentityStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as authIdentityStore from '../../../src/authIdentityStore';

// ─────────────────────────────────────────────────────────────────────────────

function makeIdentityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'identity-test-uuid',
    user_id: 'user-123',
    provider: 'google',
    subject: 'google-sub-456',
    created_at: new Date('2025-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── ensureAuthIdentity ───────────────────────────────────────────────────────

describe('authIdentityStore.ensureAuthIdentity', () => {
  test('returns existing identity when provider+subject match', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return { rows: [makeIdentityRow()], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const identity = await authIdentityStore.ensureAuthIdentity('user-123', 'google', 'google-sub-456');
    expect(identity.provider).toBe('google');
    expect(identity.subject).toBe('google-sub-456');
    expect(identity.userId).toBe('user-123');
    // Should only call SELECT, not INSERT
    expect(mockQuery.mock.calls).toHaveLength(1);
  });

  test('creates new identity when not found', async () => {
    let callCount = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      callCount++;
      if (callCount === 1 && sql.includes('SELECT')) {
        // First SELECT returns nothing
        return { rows: [], rowCount: 0 };
      }
      // INSERT RETURNING
      return { rows: [makeIdentityRow({ provider: 'github', subject: 'gh-789' })], rowCount: 1 };
    });

    const identity = await authIdentityStore.ensureAuthIdentity('user-123', 'github', 'gh-789');
    expect(identity.provider).toBe('github');
    expect(identity.subject).toBe('gh-789');
    // Should call SELECT then INSERT
    expect(mockQuery.mock.calls).toHaveLength(2);
  });

  test('serializes row correctly', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeIdentityRow()],
      rowCount: 1,
    }));

    const identity = await authIdentityStore.ensureAuthIdentity('user-123', 'google', 'sub-123');
    expect(identity.id).toBe('identity-test-uuid');
    expect(identity.userId).toBe('user-123');
    expect(identity.provider).toBe('google');
    expect(identity.subject).toBe('google-sub-456');
    expect(typeof identity.createdAt).toBe('string');
  });

  test('INSERT query includes provider and subject params', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT') && !sql.includes('INSERT')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [makeIdentityRow()], rowCount: 1 };
    });

    await authIdentityStore.ensureAuthIdentity('user-123', 'slack', 'slack-sub');
    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('INSERT'),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[1]).toBe('user-123');
    expect(params[2]).toBe('slack');
    expect(params[3]).toBe('slack-sub');
  });
});
