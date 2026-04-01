/**
 * Integration tests for the auth lifecycle (users, sessions, orgs) — requires a real PostgreSQL database.
 * Set TEST_DATABASE_URL to an accessible test DB before running.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../helpers/db';
import * as userStore from '../../src/userStore';
import * as sessionStore from '../../src/sessionStore';
import * as orgStore from '../../src/orgStore';
import { hashPassword, verifyPassword } from '../../src/auth/passwords';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('Auth CRUD (integration)', () => {
  test('register: create user with hashed password', async () => {
    const hash = await hashPassword('testpass123');
    const user = await userStore.createUser('test@ruh.ai', hash, 'Test User', 'developer');
    expect(user.id).toBeTruthy();
    expect(user.email).toBe('test@ruh.ai');
    expect(user.displayName).toBe('Test User');
    expect(user.role).toBe('developer');
    expect(user.status).toBe('active');
    expect(user.passwordHash).not.toBe('testpass123'); // should be hashed
  });

  test('login: verify password against stored hash', async () => {
    const hash = await hashPassword('mypassword');
    await userStore.createUser('login@ruh.ai', hash, 'Login User');
    const user = await userStore.getUserByEmail('login@ruh.ai');
    expect(user).not.toBeNull();
    expect(await verifyPassword('mypassword', user!.passwordHash)).toBe(true);
    expect(await verifyPassword('wrongpass', user!.passwordHash)).toBe(false);
  });

  test('duplicate email rejected', async () => {
    const hash = await hashPassword('pass1');
    await userStore.createUser('dup@ruh.ai', hash, 'User 1');
    await expect(userStore.createUser('dup@ruh.ai', hash, 'User 2')).rejects.toThrow();
  });

  test('session lifecycle: create, lookup, delete', async () => {
    const hash = await hashPassword('pass');
    const user = await userStore.createUser('session@ruh.ai', hash, 'Session User');

    const session = await sessionStore.createSession(user.id, 'refresh-token-123', 'TestAgent', '127.0.0.1');
    expect(session.userId).toBe(user.id);
    expect(session.refreshToken).toBe('refresh-token-123');

    const found = await sessionStore.getSessionByRefreshToken('refresh-token-123');
    expect(found).not.toBeNull();
    expect(found!.id).toBe(session.id);

    await sessionStore.deleteSession(session.id);
    const deleted = await sessionStore.getSessionByRefreshToken('refresh-token-123');
    expect(deleted).toBeNull();
  });

  test('delete user cascades sessions', async () => {
    const hash = await hashPassword('pass');
    const user = await userStore.createUser('cascade@ruh.ai', hash, 'Cascade User');
    await sessionStore.createSession(user.id, 'token-1');
    await sessionStore.createSession(user.id, 'token-2');

    await userStore.deleteUser(user.id);

    const s1 = await sessionStore.getSessionByRefreshToken('token-1');
    const s2 = await sessionStore.getSessionByRefreshToken('token-2');
    expect(s1).toBeNull();
    expect(s2).toBeNull();
  });

  test('organization: create and link user', async () => {
    const org = await orgStore.createOrg('Test Org', 'test-org');
    expect(org.id).toBeTruthy();
    expect(org.slug).toBe('test-org');

    const hash = await hashPassword('pass');
    const user = await userStore.createUser('orguser@ruh.ai', hash, 'Org User', 'developer', org.id);
    expect(user.orgId).toBe(org.id);
  });

  test('listUsers with filters', async () => {
    const hash = await hashPassword('pass');
    await userStore.createUser('admin@ruh.ai', hash, 'Admin', 'admin');
    await userStore.createUser('dev@ruh.ai', hash, 'Developer', 'developer');
    await userStore.createUser('user@ruh.ai', hash, 'End User', 'end_user');

    const all = await userStore.listUsers();
    expect(all.total).toBe(3);

    const devs = await userStore.listUsers({ role: 'developer' });
    expect(devs.total).toBe(1);
    expect(devs.items[0].email).toBe('dev@ruh.ai');

    const search = await userStore.listUsers({ search: 'admin' });
    expect(search.total).toBe(1);
  });

  test('updateUser changes role and status', async () => {
    const hash = await hashPassword('pass');
    const user = await userStore.createUser('update@ruh.ai', hash, 'Updatable');

    const updated = await userStore.updateUser(user.id, { role: 'admin', status: 'suspended' });
    expect(updated).not.toBeNull();
    expect(updated!.role).toBe('admin');
    expect(updated!.status).toBe('suspended');
  });

  test('getUserById returns correct user', async () => {
    const hash = await hashPassword('pass');
    const user = await userStore.createUser('byid@ruh.ai', hash, 'ById User', 'developer');

    const found = await userStore.getUserById(user.id);
    expect(found).not.toBeNull();
    expect(found!.email).toBe('byid@ruh.ai');
  });

  test('getUserById returns null for nonexistent id', async () => {
    const found = await userStore.getUserById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  test('deleteUserSessions removes all sessions for a user', async () => {
    const hash = await hashPassword('pass');
    const user = await userStore.createUser('multisession@ruh.ai', hash, 'Multi Session');
    await sessionStore.createSession(user.id, 'tok-a');
    await sessionStore.createSession(user.id, 'tok-b');

    await sessionStore.deleteUserSessions(user.id);

    expect(await sessionStore.getSessionByRefreshToken('tok-a')).toBeNull();
    expect(await sessionStore.getSessionByRefreshToken('tok-b')).toBeNull();
  });

  test('listOrgs returns created orgs', async () => {
    await orgStore.createOrg('Org A', 'org-a');
    await orgStore.createOrg('Org B', 'org-b');

    const orgs = await orgStore.listOrgs();
    expect(orgs.length).toBe(2);
    const slugs = orgs.map((o) => o.slug).sort();
    expect(slugs).toEqual(['org-a', 'org-b']);
  });
});
