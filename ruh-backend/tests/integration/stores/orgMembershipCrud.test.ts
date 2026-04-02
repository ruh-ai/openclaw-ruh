/**
 * Integration tests for org and membership lifecycle — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as orgStore from '../../../src/orgStore';
import * as membershipStore from '../../../src/organizationMembershipStore';
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

async function createTestUser(email: string) {
  const hash = await hashPassword('testpass');
  return userStore.createUser(email, hash, email.split('@')[0]);
}

describe('Org CRUD (integration)', () => {
  test('create org and verify round-trip fields', async () => {
    const org = await orgStore.createOrg('Test Org', 'test-org', 'customer');
    expect(org.id).toBeTruthy();
    expect(org.name).toBe('Test Org');
    expect(org.slug).toBe('test-org');
    expect(org.kind).toBe('customer');

    const fetched = await orgStore.getOrg(org.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Test Org');
  });

  test('create developer org', async () => {
    const org = await orgStore.createOrg('Dev Studio', 'dev-studio', 'developer');
    expect(org.kind).toBe('developer');
  });

  test('list orgs returns created orgs', async () => {
    await orgStore.createOrg('Org A', 'org-a');
    await orgStore.createOrg('Org B', 'org-b');

    const orgs = await orgStore.listOrgs();
    expect(orgs.length).toBeGreaterThanOrEqual(2);
  });

  test('getOrg returns null for nonexistent', async () => {
    const org = await orgStore.getOrg('00000000-0000-0000-0000-000000000000');
    expect(org).toBeNull();
  });
});

describe('Membership CRUD (integration)', () => {
  test('create membership with org details', async () => {
    const user = await createTestUser('member@ruh.ai');
    const org = await orgStore.createOrg('Member Org', 'member-org', 'customer');

    const membership = await membershipStore.createMembership(org.id, user.id, 'owner');
    expect(membership.id).toBeTruthy();
    expect(membership.orgId).toBe(org.id);
    expect(membership.userId).toBe(user.id);
    expect(membership.role).toBe('owner');
    expect(membership.status).toBe('active');
    expect(membership.organizationName).toBe('Member Org');
    expect(membership.organizationSlug).toBe('member-org');
    expect(membership.organizationKind).toBe('customer');
  });

  test('list memberships for user returns only that user memberships', async () => {
    const user1 = await createTestUser('user1@ruh.ai');
    const user2 = await createTestUser('user2@ruh.ai');
    const org = await orgStore.createOrg('Shared Org', 'shared-org');

    await membershipStore.createMembership(org.id, user1.id, 'owner');
    await membershipStore.createMembership(org.id, user2.id, 'employee');

    const user1Memberships = await membershipStore.listMembershipsForUser(user1.id);
    expect(user1Memberships).toHaveLength(1);
    expect(user1Memberships[0].role).toBe('owner');

    const user2Memberships = await membershipStore.listMembershipsForUser(user2.id);
    expect(user2Memberships).toHaveLength(1);
    expect(user2Memberships[0].role).toBe('employee');
  });

  test('getMembershipForUserOrg returns correct membership', async () => {
    const user = await createTestUser('specific@ruh.ai');
    const org = await orgStore.createOrg('Specific Org', 'specific-org');
    await membershipStore.createMembership(org.id, user.id, 'admin');

    const membership = await membershipStore.getMembershipForUserOrg(user.id, org.id);
    expect(membership).not.toBeNull();
    expect(membership!.role).toBe('admin');
  });

  test('getMembershipForUserOrg returns null for wrong org', async () => {
    const user = await createTestUser('wrong-org@ruh.ai');
    const org = await orgStore.createOrg('My Org', 'my-org');
    await membershipStore.createMembership(org.id, user.id, 'owner');

    const membership = await membershipStore.getMembershipForUserOrg(user.id, '00000000-0000-0000-0000-000000000000');
    expect(membership).toBeNull();
  });

  test('membership with developer org includes correct kind', async () => {
    const user = await createTestUser('devmember@ruh.ai');
    const org = await orgStore.createOrg('Dev Org', 'dev-org', 'developer');

    const membership = await membershipStore.createMembership(org.id, user.id, 'developer');
    expect(membership.organizationKind).toBe('developer');
  });

  test('create invited membership', async () => {
    const user = await createTestUser('invited@ruh.ai');
    const org = await orgStore.createOrg('Invite Org', 'invite-org');

    const membership = await membershipStore.createMembership(org.id, user.id, 'employee', 'invited');
    expect(membership.status).toBe('invited');
  });
});
