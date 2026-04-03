/**
 * Integration tests for the auth lifecycle (users, sessions, orgs) — requires a real PostgreSQL database.
 * Set TEST_DATABASE_URL to an accessible test DB before running.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as userStore from '../../../src/userStore';
import * as sessionStore from '../../../src/sessionStore';
import * as orgStore from '../../../src/orgStore';
import { hashPassword, verifyPassword } from '../../../src/auth/passwords';
import { withConn } from '../../../src/db';

process.env.NODE_ENV = 'development';

let requestFn: typeof import('../../helpers/app').request;

beforeAll(async () => {
  await setupTestDb();
  ({ request: requestFn } = await import('../../helpers/app'));
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

  test('register endpoint can bootstrap an organization and return tenant context', async () => {
    const res = await requestFn()
      .post('/api/auth/register')
      .send({
        email: 'bootstrap@ruh.ai',
        password: 'SecurePass1!',
        displayName: 'Bootstrap User',
        organizationName: 'Bootstrap Org',
        organizationSlug: 'bootstrap-org',
        organizationKind: 'developer',
        membershipRole: 'owner',
      })
      .expect(201);

    expect(res.body.activeOrganization).toEqual(
      expect.objectContaining({
        slug: 'bootstrap-org',
        kind: 'developer',
      }),
    );
    expect(res.body.activeMembership).toEqual(
      expect.objectContaining({
        organizationSlug: 'bootstrap-org',
        organizationKind: 'developer',
        role: 'owner',
      }),
    );
    expect(res.body.appAccess).toEqual({
      admin: false,
      builder: true,
      customer: false,
    });
    expect(res.body.memberships).toEqual([
      expect.objectContaining({
        organizationSlug: 'bootstrap-org',
        organizationKind: 'developer',
        role: 'owner',
      }),
    ]);
  });

  test('switch-org updates the active organization on the current session', async () => {
    const hash = await hashPassword('SecurePass1!');
    const user = await userStore.createUser('switcher@ruh.ai', hash, 'Switcher');
    const orgA = await orgStore.createOrg('Org A', 'org-a');
    const orgB = await orgStore.createOrg('Org B', 'org-b');

    await withConn(async (client) => {
      await client.query(
        `INSERT INTO organization_memberships (id, org_id, user_id, role, status)
         VALUES
         ('mem-a', $1, $3, 'employee', 'active'),
         ('mem-b', $2, $3, 'employee', 'active')`,
        [orgA.id, orgB.id, user.id],
      );
    });

    const loginRes = await requestFn()
      .post('/api/auth/login')
      .send({ email: 'switcher@ruh.ai', password: 'SecurePass1!' })
      .expect(200);

    const refreshToken = String(loginRes.body.refreshToken);

    const switchRes = await requestFn()
      .post('/api/auth/switch-org')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .set('Cookie', [`refreshToken=${refreshToken}`])
      .send({ organizationId: orgB.id })
      .expect(200);

    expect(switchRes.body.activeOrganization).toEqual(
      expect.objectContaining({
        id: orgB.id,
        slug: 'org-b',
      }),
    );
    expect(switchRes.body.activeMembership).toEqual(
      expect.objectContaining({
        organizationSlug: 'org-b',
        organizationKind: 'customer',
        role: 'employee',
      }),
    );
    expect(switchRes.body.appAccess).toEqual({
      admin: false,
      builder: false,
      customer: true,
    });

    const sessionRow = await withConn(async (client) => {
      const result = await client.query(
        'SELECT active_org_id FROM sessions WHERE refresh_token = $1',
        [refreshToken],
      );
      return result.rows[0];
    });

    expect(sessionRow.active_org_id).toBe(orgB.id);
  });

  test('me endpoint accepts cookie-backed auth and returns app-access context', async () => {
    const res = await requestFn()
      .post('/api/auth/register')
      .send({
        email: 'customer-admin@ruh.ai',
        password: 'SecurePass1!',
        displayName: 'Customer Admin',
        organizationName: 'Customer Org',
        organizationSlug: 'customer-org',
        organizationKind: 'customer',
        membershipRole: 'admin',
      })
      .expect(201);

    const meRes = await requestFn()
      .get('/api/auth/me')
      .set('Cookie', [`accessToken=${res.body.accessToken}`, `refreshToken=${res.body.refreshToken}`])
      .expect(200);

    expect(meRes.body.activeOrganization).toEqual(
      expect.objectContaining({
        slug: 'customer-org',
        kind: 'customer',
      }),
    );
    expect(meRes.body.activeMembership).toEqual(
      expect.objectContaining({
        organizationSlug: 'customer-org',
        role: 'admin',
      }),
    );
    expect(meRes.body.appAccess).toEqual({
      admin: false,
      builder: false,
      customer: true,
    });
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
