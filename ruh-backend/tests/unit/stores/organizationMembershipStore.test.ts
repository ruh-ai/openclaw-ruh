/**
 * Unit tests for src/organizationMembershipStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

import { mockQuery, mockClient } from '../../helpers/mockDb';

import * as membershipStore from '../../../src/organizationMembershipStore';

// ─────────────────────────────────────────────────────────────────────────────

function makeMembershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'membership-test-uuid',
    org_id: 'org-123',
    user_id: 'user-456',
    role: 'owner',
    status: 'active',
    organization_name: 'Test Org',
    organization_slug: 'test-org',
    organization_kind: 'customer',
    organization_plan: 'free',
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── createMembership ─────────────────────────────────────────────────────────

describe('membershipStore.createMembership', () => {
  test('inserts membership and returns serialized record with org details', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeMembershipRow()],
      rowCount: 1,
    }));

    const membership = await membershipStore.createMembership('org-123', 'user-456', 'owner');
    expect(membership.orgId).toBe('org-123');
    expect(membership.userId).toBe('user-456');
    expect(membership.role).toBe('owner');
    expect(membership.status).toBe('active');
    expect(membership.organizationName).toBe('Test Org');
    expect(membership.organizationSlug).toBe('test-org');
    expect(membership.organizationKind).toBe('customer');
  });

  test('defaults status to active', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeMembershipRow()],
      rowCount: 1,
    }));

    await membershipStore.createMembership('org-123', 'user-456', 'employee');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe('active');
  });

  test('passes custom status when specified', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeMembershipRow({ status: 'invited' })],
      rowCount: 1,
    }));

    await membershipStore.createMembership('org-123', 'user-456', 'employee', 'invited');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe('invited');
  });

  test('INSERT includes subqueries for org details', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeMembershipRow()],
      rowCount: 1,
    }));

    await membershipStore.createMembership('org-123', 'user-456', 'owner');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('SELECT name FROM organizations');
    expect(sql).toContain('SELECT slug FROM organizations');
  });
});

// ── listMembershipsForUser ───────────────────────────────────────────────────

describe('membershipStore.listMembershipsForUser', () => {
  test('returns array of memberships with org details', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [
        makeMembershipRow(),
        makeMembershipRow({ id: 'membership-2', org_id: 'org-789', organization_name: 'Other Org' }),
      ],
      rowCount: 2,
    }));

    const memberships = await membershipStore.listMembershipsForUser('user-456');
    expect(memberships).toHaveLength(2);
    expect(memberships[0].organizationName).toBe('Test Org');
    expect(memberships[1].organizationName).toBe('Other Org');
  });

  test('returns empty array when user has no memberships', async () => {
    const memberships = await membershipStore.listMembershipsForUser('user-no-orgs');
    expect(memberships).toHaveLength(0);
  });

  test('SQL joins organizations table', async () => {
    await membershipStore.listMembershipsForUser('user-456');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('JOIN organizations');
  });
});

// ── getMembershipForUserOrg ──────────────────────────────────────────────────

describe('membershipStore.getMembershipForUserOrg', () => {
  test('returns membership when found', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeMembershipRow()],
      rowCount: 1,
    }));

    const membership = await membershipStore.getMembershipForUserOrg('user-456', 'org-123');
    expect(membership).not.toBeNull();
    expect(membership!.userId).toBe('user-456');
    expect(membership!.orgId).toBe('org-123');
  });

  test('returns null when not found', async () => {
    const membership = await membershipStore.getMembershipForUserOrg('user-456', 'org-nonexistent');
    expect(membership).toBeNull();
  });

  test('SQL includes LIMIT 1', async () => {
    await membershipStore.getMembershipForUserOrg('user-456', 'org-123');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('LIMIT 1');
  });
});
