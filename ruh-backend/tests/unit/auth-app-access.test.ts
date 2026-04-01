import { describe, expect, test } from 'bun:test';

import { deriveAppAccess } from '../../src/auth/appAccess';

function membership(overrides: {
  kind: 'developer' | 'customer';
  role: string;
  status?: string;
}) {
  return {
    id: `mem-${overrides.role}`,
    organizationId: `org-${overrides.kind}`,
    organizationName: `${overrides.kind} Org`,
    organizationSlug: `${overrides.kind}-org`,
    organizationKind: overrides.kind,
    organizationPlan: 'free',
    role: overrides.role,
    status: overrides.status ?? 'active',
  };
}

describe('deriveAppAccess', () => {
  test('grants only admin-ui access to platform admins without memberships', () => {
    expect(
      deriveAppAccess({
        platformRole: 'platform_admin',
        memberships: [],
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
          memberships: [membership({ kind: 'developer', role })],
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
          memberships: [membership({ kind: 'customer', role })],
        }),
      ).toEqual({
        admin: false,
        builder: false,
        customer: true,
      });
    }
  });

  test('grants both builder and customer when user has memberships in both org kinds', () => {
    expect(
      deriveAppAccess({
        platformRole: 'user',
        memberships: [
          membership({ kind: 'developer', role: 'owner' }),
          membership({ kind: 'customer', role: 'admin' }),
        ],
      }),
    ).toEqual({
      admin: false,
      builder: true,
      customer: true,
    });
  });

  test('grants admin + builder + customer for platform admin with both memberships', () => {
    expect(
      deriveAppAccess({
        platformRole: 'platform_admin',
        memberships: [
          membership({ kind: 'developer', role: 'owner' }),
          membership({ kind: 'customer', role: 'admin' }),
        ],
      }),
    ).toEqual({
      admin: true,
      builder: true,
      customer: true,
    });
  });

  test('fails closed for inactive memberships', () => {
    expect(
      deriveAppAccess({
        platformRole: 'user',
        memberships: [
          membership({ kind: 'developer', role: 'developer', status: 'invited' }),
        ],
      }),
    ).toEqual({
      admin: false,
      builder: false,
      customer: false,
    });
  });

  test('fails closed when membership role does not grant the surface', () => {
    expect(
      deriveAppAccess({
        platformRole: 'user',
        memberships: [
          membership({ kind: 'customer', role: 'developer' }),
        ],
      }),
    ).toEqual({
      admin: false,
      builder: false,
      customer: false,
    });
  });
});
