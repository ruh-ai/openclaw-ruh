/**
 * Unit tests for src/sessionStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

import { mockQuery, mockClient } from '../../helpers/mockDb';

import * as sessionStore from '../../../src/sessionStore';

// ─────────────────────────────────────────────────────────────────────────────

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-test-uuid',
    user_id: 'user-123',
    refresh_token: 'rt-abc-def',
    user_agent: 'Mozilla/5.0',
    ip_address: '127.0.0.1',
    active_org_id: null,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    created_at: new Date('2025-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── createSession ────────────────────────────────────────────────────────────

describe('sessionStore.createSession', () => {
  test('inserts session and returns serialized SessionRecord', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeSessionRow()],
      rowCount: 1,
    }));

    const session = await sessionStore.createSession('user-123', 'rt-abc-def');
    expect(session.userId).toBe('user-123');
    expect(session.refreshToken).toBe('rt-abc-def');
    expect(session.id).toBe('session-test-uuid');
  });

  test('passes userAgent and ipAddress when provided', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeSessionRow()],
      rowCount: 1,
    }));

    await sessionStore.createSession('user-123', 'rt', 'Chrome/120', '192.168.1.1');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('Chrome/120');
    expect(params[4]).toBe('192.168.1.1');
  });

  test('passes null for optional fields when not provided', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeSessionRow({ user_agent: null, ip_address: null })],
      rowCount: 1,
    }));

    await sessionStore.createSession('user-123', 'rt');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
    expect(params[6]).toBeNull(); // activeOrgId
  });

  test('passes activeOrgId when provided', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeSessionRow({ active_org_id: 'org-456' })],
      rowCount: 1,
    }));

    await sessionStore.createSession('user-123', 'rt', undefined, undefined, 'org-456');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[6]).toBe('org-456');
  });

  test('sets 7-day expiry', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeSessionRow()],
      rowCount: 1,
    }));

    await sessionStore.createSession('user-123', 'rt');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    const expiresAt = new Date(params[5] as string);
    const now = Date.now();
    // Should be roughly 7 days from now (within 5 seconds tolerance)
    expect(expiresAt.getTime() - now).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(expiresAt.getTime() - now).toBeLessThan(8 * 24 * 60 * 60 * 1000);
  });
});

// ── getSessionByRefreshToken ─────────────────────────────────────────────────

describe('sessionStore.getSessionByRefreshToken', () => {
  test('returns session when found and not expired', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeSessionRow()],
      rowCount: 1,
    }));

    const session = await sessionStore.getSessionByRefreshToken('rt-abc-def');
    expect(session).not.toBeNull();
    expect(session!.refreshToken).toBe('rt-abc-def');
  });

  test('returns null when no matching token', async () => {
    const session = await sessionStore.getSessionByRefreshToken('nonexistent');
    expect(session).toBeNull();
  });

  test('SQL includes expires_at > NOW() check', async () => {
    await sessionStore.getSessionByRefreshToken('rt');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('expires_at > NOW()');
  });
});

// ── deleteSession ────────────────────────────────────────────────────────────

describe('sessionStore.deleteSession', () => {
  test('executes DELETE with correct id', async () => {
    await sessionStore.deleteSession('session-abc');
    const sql = mockQuery.mock.calls[0][0] as string;
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(sql).toContain('DELETE FROM sessions WHERE id');
    expect(params[0]).toBe('session-abc');
  });
});

// ── deleteUserSessions ───────────────────────────────────────────────────────

describe('sessionStore.deleteUserSessions', () => {
  test('executes DELETE WHERE user_id', async () => {
    await sessionStore.deleteUserSessions('user-123');
    const sql = mockQuery.mock.calls[0][0] as string;
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(sql).toContain('DELETE FROM sessions WHERE user_id');
    expect(params[0]).toBe('user-123');
  });
});

// ── setActiveOrgId ───────────────────────────────────────────────────────────

describe('sessionStore.setActiveOrgId', () => {
  test('updates and returns session', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeSessionRow({ active_org_id: 'org-new' })],
      rowCount: 1,
    }));

    const session = await sessionStore.setActiveOrgId('session-1', 'org-new');
    expect(session).not.toBeNull();
    expect(session!.activeOrgId).toBe('org-new');
  });

  test('returns null when session not found', async () => {
    const session = await sessionStore.setActiveOrgId('nonexistent', 'org-1');
    expect(session).toBeNull();
  });

  test('accepts null to clear activeOrgId', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeSessionRow({ active_org_id: null })],
      rowCount: 1,
    }));

    await sessionStore.setActiveOrgId('session-1', null);
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBeNull();
  });
});

// ── cleanExpiredSessions ─────────────────────────────────────────────────────

describe('sessionStore.cleanExpiredSessions', () => {
  test('returns rowCount of deleted sessions', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 5 }));

    const count = await sessionStore.cleanExpiredSessions();
    expect(count).toBe(5);
  });

  test('returns 0 when no expired sessions', async () => {
    const count = await sessionStore.cleanExpiredSessions();
    expect(count).toBe(0);
  });

  test('SQL deletes where expires_at < NOW()', async () => {
    await sessionStore.cleanExpiredSessions();
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('expires_at < NOW()');
  });
});
