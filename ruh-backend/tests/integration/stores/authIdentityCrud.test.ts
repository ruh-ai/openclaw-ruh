/**
 * Integration tests for auth identity store — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as authIdentityStore from '../../../src/authIdentityStore';
import * as userStore from '../../../src/userStore';
import { hashPassword } from '../../../src/auth/passwords';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

async function createTestUser(email = 'identity@ruh.ai') {
  const hash = await hashPassword('testpass');
  return userStore.createUser(email, hash, email.split('@')[0]);
}

describe('Auth Identity CRUD (integration)', () => {
  test('ensureAuthIdentity creates new identity', async () => {
    const user = await createTestUser();
    const identity = await authIdentityStore.ensureAuthIdentity(user.id, 'google', 'goog-sub-123');

    expect(identity.id).toBeTruthy();
    expect(identity.userId).toBe(user.id);
    expect(identity.provider).toBe('google');
    expect(identity.subject).toBe('goog-sub-123');
  });

  test('ensureAuthIdentity returns existing identity on second call', async () => {
    const user = await createTestUser();
    const first = await authIdentityStore.ensureAuthIdentity(user.id, 'google', 'goog-sub-456');
    const second = await authIdentityStore.ensureAuthIdentity(user.id, 'google', 'goog-sub-456');

    expect(second.id).toBe(first.id);
    expect(second.userId).toBe(first.userId);
  });

  test('different providers create separate identities', async () => {
    const user = await createTestUser();
    const google = await authIdentityStore.ensureAuthIdentity(user.id, 'google', 'sub-1');
    const github = await authIdentityStore.ensureAuthIdentity(user.id, 'github', 'sub-2');

    expect(google.id).not.toBe(github.id);
    expect(google.provider).toBe('google');
    expect(github.provider).toBe('github');
  });

  test('same provider with different subjects creates separate identities', async () => {
    const user1 = await createTestUser('user1@ruh.ai');
    const user2 = await createTestUser('user2@ruh.ai');

    const id1 = await authIdentityStore.ensureAuthIdentity(user1.id, 'google', 'subject-A');
    const id2 = await authIdentityStore.ensureAuthIdentity(user2.id, 'google', 'subject-B');

    expect(id1.id).not.toBe(id2.id);
    expect(id1.subject).toBe('subject-A');
    expect(id2.subject).toBe('subject-B');
  });
});
