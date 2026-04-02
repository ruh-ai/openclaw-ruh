/**
 * Integration tests for session lifecycle — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as userStore from '../../../src/userStore';
import * as sessionStore from '../../../src/sessionStore';
import * as orgStore from '../../../src/orgStore';
import { hashPassword } from '../../../src/auth/passwords';
import { withConn } from '../../../src/db';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

async function createTestUser(email = 'session-test@ruh.ai') {
  const hash = await hashPassword('testpass');
  return userStore.createUser(email, hash, 'Session Tester');
}

describe('Session Lifecycle (integration)', () => {
  test('create session and lookup by refresh token', async () => {
    const user = await createTestUser();

    const session = await sessionStore.createSession(
      user.id,
      'rt-test-abc123',
      'Chrome/120',
      '127.0.0.1',
    );
    expect(session.id).toBeTruthy();
    expect(session.userId).toBe(user.id);
    expect(session.refreshToken).toBe('rt-test-abc123');

    const fetched = await sessionStore.getSessionByRefreshToken('rt-test-abc123');
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(session.id);
    expect(fetched!.userId).toBe(user.id);
  });

  test('delete session makes lookup return null', async () => {
    const user = await createTestUser();
    const session = await sessionStore.createSession(user.id, 'rt-delete-me');

    await sessionStore.deleteSession(session.id);

    const fetched = await sessionStore.getSessionByRefreshToken('rt-delete-me');
    expect(fetched).toBeNull();
  });

  test('deleteUserSessions removes all sessions for user', async () => {
    const user = await createTestUser();
    await sessionStore.createSession(user.id, 'rt-1');
    await sessionStore.createSession(user.id, 'rt-2');
    await sessionStore.createSession(user.id, 'rt-3');

    await sessionStore.deleteUserSessions(user.id);

    const s1 = await sessionStore.getSessionByRefreshToken('rt-1');
    const s2 = await sessionStore.getSessionByRefreshToken('rt-2');
    const s3 = await sessionStore.getSessionByRefreshToken('rt-3');
    expect(s1).toBeNull();
    expect(s2).toBeNull();
    expect(s3).toBeNull();
  });

  test('setActiveOrgId updates and returns session', async () => {
    const user = await createTestUser();
    const org = await orgStore.createOrg('Session Org', 'session-org');
    const session = await sessionStore.createSession(user.id, 'rt-org-switch');

    const updated = await sessionStore.setActiveOrgId(session.id, org.id);
    expect(updated).not.toBeNull();
    expect(updated!.activeOrgId).toBe(org.id);

    // Clear it
    const cleared = await sessionStore.setActiveOrgId(session.id, null);
    expect(cleared!.activeOrgId).toBeNull();
  });

  test('setActiveOrgId returns null for nonexistent session', async () => {
    const result = await sessionStore.setActiveOrgId('nonexistent-session-id', 'some-org');
    expect(result).toBeNull();
  });

  test('cleanExpiredSessions deletes expired but not active sessions', async () => {
    const user = await createTestUser();
    const active = await sessionStore.createSession(user.id, 'rt-active');

    // Insert an already-expired session directly via raw SQL
    await withConn(async (client) => {
      await client.query(
        `INSERT INTO sessions (id, user_id, refresh_token, expires_at)
         VALUES ($1, $2, $3, NOW() - INTERVAL '1 day')`,
        ['expired-session-id', user.id, 'rt-expired'],
      );
    });

    const cleaned = await sessionStore.cleanExpiredSessions();
    expect(cleaned).toBe(1);

    // Active session should still be findable
    const stillActive = await sessionStore.getSessionByRefreshToken('rt-active');
    expect(stillActive).not.toBeNull();

    // Expired session should be gone
    // (getSessionByRefreshToken won't find it anyway due to expires_at check,
    //  but cleanExpiredSessions should have deleted the row)
  });

  test('getSessionByRefreshToken returns null for expired session', async () => {
    const user = await createTestUser('expired-test@ruh.ai');

    // Insert expired session directly
    await withConn(async (client) => {
      await client.query(
        `INSERT INTO sessions (id, user_id, refresh_token, expires_at)
         VALUES ($1, $2, $3, NOW() - INTERVAL '1 hour')`,
        ['expired-id', user.id, 'rt-already-expired'],
      );
    });

    const session = await sessionStore.getSessionByRefreshToken('rt-already-expired');
    expect(session).toBeNull();
  });
});
