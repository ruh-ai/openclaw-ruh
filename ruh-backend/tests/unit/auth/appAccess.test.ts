/**
 * Unit tests for src/auth/appAccess.ts — deriveAppAccess
 */

import { describe, expect, test } from 'bun:test';
import { deriveAppAccess, type ActiveMembershipContext } from '../../../src/auth/appAccess';

function makeMembership(overrides: Partial<ActiveMembershipContext> = {}): ActiveMembershipContext {
  return {
    id: 'mem-1',
    organizationId: 'org-1',
    organizationName: 'Test Org',
    organizationSlug: 'test-org',
    organizationKind: 'developer',
    organizationPlan: 'pro',
    role: 'owner',
    status: 'active',
    ...overrides,
  };
}

describe('deriveAppAccess', () => {
  test('platform_admin gets admin=true', () => {
    const access = deriveAppAccess({ platformRole: 'platform_admin', memberships: [] });
    expect(access.admin).toBe(true);
    expect(access.builder).toBe(false);
    expect(access.customer).toBe(false);
  });

  test('regular user gets admin=false', () => {
    const access = deriveAppAccess({ platformRole: 'user', memberships: [] });
    expect(access.admin).toBe(false);
  });

  test('developer org owner gets builder=true', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [makeMembership({ organizationKind: 'developer', role: 'owner' })],
    });
    expect(access.builder).toBe(true);
    expect(access.customer).toBe(false);
  });

  test('developer org developer role gets builder=true', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [makeMembership({ organizationKind: 'developer', role: 'developer' })],
    });
    expect(access.builder).toBe(true);
  });

  test('customer org owner gets customer=true', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [makeMembership({ organizationKind: 'customer', role: 'owner' })],
    });
    expect(access.customer).toBe(true);
    expect(access.builder).toBe(false);
  });

  test('customer org admin gets customer=true', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [makeMembership({ organizationKind: 'customer', role: 'admin' })],
    });
    expect(access.customer).toBe(true);
  });

  test('customer org employee gets customer=true', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [makeMembership({ organizationKind: 'customer', role: 'employee' })],
    });
    expect(access.customer).toBe(true);
  });

  test('inactive membership is ignored', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [makeMembership({ organizationKind: 'developer', role: 'owner', status: 'invited' })],
    });
    expect(access.builder).toBe(false);
  });

  test('suspended membership is ignored', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [makeMembership({ organizationKind: 'customer', role: 'owner', status: 'suspended' })],
    });
    expect(access.customer).toBe(false);
  });

  test('user with both dev and customer memberships gets both', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [
        makeMembership({ organizationKind: 'developer', role: 'owner', organizationId: 'org-dev' }),
        makeMembership({ organizationKind: 'customer', role: 'employee', organizationId: 'org-cust' }),
      ],
    });
    expect(access.builder).toBe(true);
    expect(access.customer).toBe(true);
  });

  test('platform admin with memberships gets all three', () => {
    const access = deriveAppAccess({
      platformRole: 'platform_admin',
      memberships: [
        makeMembership({ organizationKind: 'developer', role: 'owner' }),
        makeMembership({ organizationKind: 'customer', role: 'admin', organizationId: 'org-2' }),
      ],
    });
    expect(access.admin).toBe(true);
    expect(access.builder).toBe(true);
    expect(access.customer).toBe(true);
  });

  test('developer org with non-matching role gets builder=false', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [makeMembership({ organizationKind: 'developer', role: 'admin' })],
    });
    expect(access.builder).toBe(false);
  });

  test('customer org with developer role gets customer=false', () => {
    const access = deriveAppAccess({
      platformRole: 'user',
      memberships: [makeMembership({ organizationKind: 'customer', role: 'developer' })],
    });
    expect(access.customer).toBe(false);
  });
});
