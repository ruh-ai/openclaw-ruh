import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { verifyPassword } from '../../../src/auth/passwords';
import { withConn } from '../../../src/db';
import { truncateAll, setupTestDb, teardownTestDb } from '../../helpers/db';


beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('test user seeding (integration)', () => {
  test('uses the documented default shared QA password when none is provided', async () => {
    const { seedTestUsers, DEFAULT_TEST_USER_PASSWORD } = await import('../../../src/testUserSeed');

    const result = await seedTestUsers();

    expect(DEFAULT_TEST_USER_PASSWORD).toBe('RuhTest123');
    expect(result.sharedPassword).toBe('RuhTest123');

    const dbState = await withConn(async (client) => {
      const adminResult = await client.query(
        "SELECT password_hash FROM users WHERE email = 'admin@ruh.test'",
      );

      return {
        adminPasswordHash: String(adminResult.rows[0].password_hash),
      };
    });

    expect(await verifyPassword('RuhTest123', dbState.adminPasswordHash)).toBe(true);
  });

  test('seeds the full local QA account matrix', async () => {
    const { seedTestUsers } = await import('../../../src/testUserSeed');

    const result = await seedTestUsers('RuhQaPass1!');

    expect(result.sharedPassword).toBe('RuhQaPass1!');
    expect(result.organizations).toHaveLength(4);
    expect(result.users).toHaveLength(11);

    const dbState = await withConn(async (client) => {
      const usersResult = await client.query(
        'SELECT email, role, org_id, password_hash FROM users ORDER BY email ASC',
      );
      const organizationsResult = await client.query(
        'SELECT slug, kind FROM organizations ORDER BY slug ASC',
      );
      const membershipsResult = await client.query(
        'SELECT user_id, org_id, role, status FROM organization_memberships',
      );
      const identitiesResult = await client.query(
        "SELECT user_id, provider, subject FROM auth_identities WHERE provider = 'local'",
      );
      const switcherMembershipsResult = await client.query(`
        SELECT o.slug, m.role
        FROM organization_memberships m
        JOIN organizations o ON o.id = m.org_id
        JOIN users u ON u.id = m.user_id
        WHERE u.email = 'switcher@ruh.test'
        ORDER BY o.slug ASC
      `);
      const platformAdminResult = await client.query(
        "SELECT role, org_id, password_hash FROM users WHERE email = 'admin@ruh.test'",
      );
      const globexAdminResult = await client.query(`
        SELECT u.role AS user_role, m.role AS membership_role, o.slug
        FROM users u
        JOIN organization_memberships m ON m.user_id = u.id
        JOIN organizations o ON o.id = m.org_id
        WHERE u.email = 'admin@globex.test'
      `);
      const prasanjitMembershipsResult = await client.query(`
        SELECT u.role AS user_role, u.org_id, o.slug, m.role AS membership_role
        FROM users u
        LEFT JOIN organization_memberships m ON m.user_id = u.id
        LEFT JOIN organizations o ON o.id = m.org_id
        WHERE u.email = 'prasanjit@ruh.ai'
        ORDER BY o.slug ASC
      `);

      return {
        users: usersResult.rows,
        organizations: organizationsResult.rows,
        memberships: membershipsResult.rows,
        identities: identitiesResult.rows,
        switcherMemberships: switcherMembershipsResult.rows,
        platformAdmin: platformAdminResult.rows[0],
        globexAdmin: globexAdminResult.rows[0],
        prasanjitMemberships: prasanjitMembershipsResult.rows,
      };
    });

    expect(dbState.organizations).toEqual([
      { slug: 'acme-dev', kind: 'developer' },
      { slug: 'globex', kind: 'customer' },
      { slug: 'initech', kind: 'customer' },
      { slug: 'nova-labs', kind: 'developer' },
    ]);
    expect(dbState.users).toHaveLength(11);
    expect(dbState.memberships).toHaveLength(12);
    expect(dbState.identities).toHaveLength(11);
    expect(dbState.platformAdmin.role).toBe('admin');
    expect(dbState.platformAdmin.org_id).toBeNull();
    expect(await verifyPassword('RuhQaPass1!', String(dbState.platformAdmin.password_hash))).toBe(true);
    expect(dbState.globexAdmin).toEqual({
      user_role: 'end_user',
      membership_role: 'admin',
      slug: 'globex',
    });
    expect(dbState.prasanjitMemberships).toEqual([
      {
        user_role: 'admin',
        org_id: expect.any(String),
        slug: 'acme-dev',
        membership_role: 'owner',
      },
      {
        user_role: 'admin',
        org_id: expect.any(String),
        slug: 'globex',
        membership_role: 'admin',
      },
    ]);
    expect(dbState.switcherMemberships).toEqual([
      { slug: 'acme-dev', role: 'developer' },
      { slug: 'globex', role: 'employee' },
    ]);
  });

  test('is idempotent and rotates the shared password on rerun', async () => {
    const { seedTestUsers } = await import('../../../src/testUserSeed');

    await seedTestUsers('RuhQaPass1!');
    await seedTestUsers('RuhQaPass2!');

    const dbState = await withConn(async (client) => {
      const countsResult = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM users) AS users_count,
          (SELECT COUNT(*) FROM organizations) AS orgs_count,
          (SELECT COUNT(*) FROM organization_memberships) AS memberships_count,
          (SELECT COUNT(*) FROM auth_identities) AS identities_count
      `);
      const adminResult = await client.query(
        "SELECT password_hash FROM users WHERE email = 'admin@ruh.test'",
      );

      return {
        counts: countsResult.rows[0],
        adminPasswordHash: String(adminResult.rows[0].password_hash),
      };
    });

    expect(dbState.counts).toEqual({
      users_count: '11',
      orgs_count: '4',
      memberships_count: '12',
      identities_count: '11',
    });
    expect(await verifyPassword('RuhQaPass1!', dbState.adminPasswordHash)).toBe(false);
    expect(await verifyPassword('RuhQaPass2!', dbState.adminPasswordHash)).toBe(true);
  });
});
