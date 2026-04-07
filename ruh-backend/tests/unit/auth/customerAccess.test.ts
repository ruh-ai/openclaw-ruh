/**
 * Unit tests for src/auth/customerAccess.ts
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockGetOrg = mock(async (_id: string) => null as any);
const mockGetMembershipForUserOrg = mock(async (_userId: string, _orgId: string) => null as any);

mock.module('../../../src/orgStore', () => ({
  getOrg: mockGetOrg,
}));

mock.module('../../../src/organizationMembershipStore', () => ({
  getMembershipForUserOrg: mockGetMembershipForUserOrg,
}));

import { requireActiveCustomerOrg } from '../../../src/auth/customerAccess';

// ─────────────────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-123',
    email: 'user@example.com',
    role: 'end_user' as const,
    orgId: 'org-456',
    ...overrides,
  };
}

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-456',
    name: 'Customer Org',
    slug: 'customer-org',
    kind: 'customer' as const,
    plan: 'free',
    status: 'active' as const,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  };
}

function makeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: 'membership-789',
    orgId: 'org-456',
    userId: 'user-123',
    role: 'owner' as const,
    status: 'active' as const,
    organizationName: 'Customer Org',
    organizationSlug: 'customer-org',
    organizationKind: 'customer',
    organizationPlan: 'free',
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  };
}

beforeEach(() => {
  mockGetOrg.mockReset();
  mockGetMembershipForUserOrg.mockReset();
  mockGetOrg.mockImplementation(async () => null);
  mockGetMembershipForUserOrg.mockImplementation(async () => null);
});

// ── requireActiveCustomerOrg ─────────────────────────────────────────────────

describe('requireActiveCustomerOrg', () => {
  test('throws 401 when no user', async () => {
    try {
      await requireActiveCustomerOrg(undefined);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(401);
    }
  });

  test('throws 403 when no orgId', async () => {
    try {
      await requireActiveCustomerOrg(makeUser({ orgId: null }) as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('throws 403 when org not found', async () => {
    try {
      await requireActiveCustomerOrg(makeUser() as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('throws 403 when org kind is not customer', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg({ kind: 'developer' }));

    try {
      await requireActiveCustomerOrg(makeUser() as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('throws 403 when membership not found', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg());

    try {
      await requireActiveCustomerOrg(makeUser() as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('throws 403 when membership status is not active', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg());
    mockGetMembershipForUserOrg.mockImplementation(async () => makeMembership({ status: 'suspended' }));

    try {
      await requireActiveCustomerOrg(makeUser() as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('throws 403 when membership role is developer', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg());
    mockGetMembershipForUserOrg.mockImplementation(async () => makeMembership({ role: 'developer' }));

    try {
      await requireActiveCustomerOrg(makeUser() as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('returns user, organization, membership for valid owner', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg());
    mockGetMembershipForUserOrg.mockImplementation(async () => makeMembership());

    const result = await requireActiveCustomerOrg(makeUser() as any);
    expect(result.user.userId).toBe('user-123');
    expect(result.organization.id).toBe('org-456');
    expect(result.membership.role).toBe('owner');
  });

  test('returns result for valid employee', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg());
    mockGetMembershipForUserOrg.mockImplementation(async () => makeMembership({ role: 'employee' }));

    const result = await requireActiveCustomerOrg(makeUser() as any);
    expect(result.membership.role).toBe('employee');
  });

  test('returns result for valid admin member', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg());
    mockGetMembershipForUserOrg.mockImplementation(async () => makeMembership({ role: 'admin' }));

    const result = await requireActiveCustomerOrg(makeUser() as any);
    expect(result.membership.role).toBe('admin');
  });
});
