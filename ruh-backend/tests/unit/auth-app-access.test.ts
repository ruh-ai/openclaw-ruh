import { describe, expect, test } from 'bun:test';

import { deriveAppAccess } from '../../src/auth/appAccess';

describe('deriveAppAccess', () => {
  test('grants only admin-ui access to platform admins without an active membership', () => {
    expect(
      deriveAppAccess({
        platformRole: 'platform_admin',
        activeOrganization: null,
        activeMembership: null,
      }),
    ).toEqual({
      admin: true,
      builder: false,
      customer: false,
    });
  });

  test('grants builder access to developer-org owners and developers', () => {
    for (const role of ['owner', 'developer'] as const) {
      expect(
        deriveAppAccess({
          platformRole: 'user',
          activeOrganization: {
            id: 'org-dev',
            name: 'Dev Org',
            slug: 'dev-org',
            kind: 'developer',
            plan: 'free',
          },
          activeMembership: {
            id: `mem-${role}`,
            organizationId: 'org-dev',
            organizationName: 'Dev Org',
            organizationSlug: 'dev-org',
            organizationKind: 'developer',
            organizationPlan: 'free',
            role,
            status: 'active',
          },
        }),
      ).toEqual({
        admin: false,
        builder: true,
        customer: false,
      });
    }
  });

  test('grants customer access to customer-org owners, admins, and employees', () => {
    for (const role of ['owner', 'admin', 'employee'] as const) {
      expect(
        deriveAppAccess({
          platformRole: 'user',
          activeOrganization: {
            id: 'org-customer',
            name: 'Customer Org',
            slug: 'customer-org',
            kind: 'customer',
            plan: 'free',
          },
          activeMembership: {
            id: `mem-${role}`,
            organizationId: 'org-customer',
            organizationName: 'Customer Org',
            organizationSlug: 'customer-org',
            organizationKind: 'customer',
            organizationPlan: 'free',
            role,
            status: 'active',
          },
        }),
      ).toEqual({
        admin: false,
        builder: false,
        customer: true,
      });
    }
  });

  test('fails closed for inactive memberships', () => {
    expect(
      deriveAppAccess({
        platformRole: 'user',
        activeOrganization: {
          id: 'org-dev',
          name: 'Dev Org',
          slug: 'dev-org',
          kind: 'developer',
          plan: 'free',
        },
        activeMembership: {
          id: 'mem-inactive',
          organizationId: 'org-dev',
          organizationName: 'Dev Org',
          organizationSlug: 'dev-org',
          organizationKind: 'developer',
          organizationPlan: 'free',
          role: 'developer',
          status: 'invited',
        },
      }),
    ).toEqual({
      admin: false,
      builder: false,
      customer: false,
    });
  });

  test('fails closed when org kind and membership role do not grant the surface', () => {
    expect(
      deriveAppAccess({
        platformRole: 'user',
        activeOrganization: {
          id: 'org-customer',
          name: 'Customer Org',
          slug: 'customer-org',
          kind: 'customer',
          plan: 'free',
        },
        activeMembership: {
          id: 'mem-dev-on-customer',
          organizationId: 'org-customer',
          organizationName: 'Customer Org',
          organizationSlug: 'customer-org',
          organizationKind: 'customer',
          organizationPlan: 'free',
          role: 'developer',
          status: 'active',
        },
      }),
    ).toEqual({
      admin: false,
      builder: false,
      customer: false,
    });
  });
});
