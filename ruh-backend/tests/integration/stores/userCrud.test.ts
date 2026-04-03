/**
 * Integration tests for user CRUD — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
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

async function createTestUser(email = 'test@ruh.ai', role: 'admin' | 'developer' | 'end_user' = 'end_user') {
  const hash = await hashPassword('testpass123');
  return userStore.createUser(email, hash, email.split('@')[0], role);
}

describe('User CRUD (integration)', () => {
  test('create user and verify round-trip fields', async () => {
    const user = await createTestUser('alice@ruh.ai');
    expect(user.id).toBeTruthy();
    expect(user.email).toBe('alice@ruh.ai');
    expect(user.displayName).toBe('alice');
    expect(user.role).toBe('end_user');
    expect(user.status).toBe('active');
    expect(user.emailVerified).toBe(false);
    expect(user.orgId).toBeNull();
  });

  test('create user with custom role', async () => {
    const user = await createTestUser('dev@ruh.ai', 'developer');
    expect(user.role).toBe('developer');
  });

  test('getUserByEmail returns user', async () => {
    await createTestUser('lookup@ruh.ai');
    const found = await userStore.getUserByEmail('lookup@ruh.ai');
    expect(found).not.toBeNull();
    expect(found!.email).toBe('lookup@ruh.ai');
  });

  test('getUserByEmail returns null for unknown', async () => {
    const found = await userStore.getUserByEmail('nobody@ruh.ai');
    expect(found).toBeNull();
  });

  test('getUserById returns user', async () => {
    const created = await createTestUser('byid@ruh.ai');
    const found = await userStore.getUserById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  test('getUserById returns null for unknown', async () => {
    const found = await userStore.getUserById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  test('listUsers returns all users', async () => {
    await createTestUser('a@ruh.ai');
    await createTestUser('b@ruh.ai');
    const result = await userStore.listUsers();
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  test('listUsers filters by role', async () => {
    await createTestUser('dev@ruh.ai', 'developer');
    await createTestUser('user@ruh.ai', 'end_user');
    const result = await userStore.listUsers({ role: 'developer' });
    expect(result.total).toBe(1);
    expect(result.items[0].email).toBe('dev@ruh.ai');
  });

  test('listUsers search by email (ILIKE)', async () => {
    await createTestUser('alice@ruh.ai');
    await createTestUser('bob@ruh.ai');
    const result = await userStore.listUsers({ search: 'alice' });
    expect(result.total).toBe(1);
    expect(result.items[0].email).toBe('alice@ruh.ai');
  });

  test('listUsers pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await createTestUser(`user${i}@ruh.ai`);
    }
    const page1 = await userStore.listUsers({ limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await userStore.listUsers({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);
  });

  test('updateUser patches fields', async () => {
    const user = await createTestUser('patch@ruh.ai');
    const updated = await userStore.updateUser(user.id, {
      displayName: 'New Name',
      role: 'admin',
      status: 'suspended',
    });
    expect(updated).not.toBeNull();
    expect(updated!.displayName).toBe('New Name');
    expect(updated!.role).toBe('admin');
    expect(updated!.status).toBe('suspended');
  });

  test('updateUser with empty patch returns unchanged user', async () => {
    const user = await createTestUser('noop@ruh.ai');
    const same = await userStore.updateUser(user.id, {});
    expect(same).not.toBeNull();
    expect(same!.displayName).toBe('noop');
  });

  test('updateUser returns null for nonexistent', async () => {
    const result = await userStore.updateUser('00000000-0000-0000-0000-000000000000', {
      displayName: 'Ghost',
    });
    expect(result).toBeNull();
  });

  test('deleteUser removes user', async () => {
    const user = await createTestUser('delete@ruh.ai');
    const deleted = await userStore.deleteUser(user.id);
    expect(deleted).toBe(true);

    const found = await userStore.getUserById(user.id);
    expect(found).toBeNull();
  });

  test('deleteUser returns false for nonexistent', async () => {
    const deleted = await userStore.deleteUser('00000000-0000-0000-0000-000000000000');
    expect(deleted).toBe(false);
  });
});
