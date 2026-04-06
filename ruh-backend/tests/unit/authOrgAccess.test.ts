import { beforeEach, describe, expect, mock, test } from 'bun:test';

let orgRows: Record<string, unknown>[] = [];
let membershipRows: Record<string, unknown>[] = [];

mock.module('../../src/orgStore', () => ({
  getOrg: mock(async (_id: string) => {
    const row = orgRows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      kind: row.kind,
      plan: row.plan,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }),
}));

mock.module('../../src/organizationMembershipStore', () => ({
  getMembershipForUserOrg: mock(async (_userId: string, _orgId: string) => {
    const row = membershipRows[0];
    if (!row) return null;
    return {
      id: row.id,
      orgId: row.org_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      organizationName: row.organization_name,
      organizationSlug: row.organization_slug,
      organizationKind: row.organization_kind,
      organizationPlan: row.organization_plan,
      organizationStatus: row.organization_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }),
}));

const { requireActiveDeveloperOrg } = await import('../../src/auth/builderAccess.ts?authOrgAccessUnit');
const { requireActiveCustomerOrg } = await import('../../src/auth/customerAccess.ts?authOrgAccessUnit');

beforeEach(() => {
  orgRows = [];
  membershipRows = [];
});

describe('requireActiveDeveloperOrg', () => {
  test('requires an authenticated user', async () => {
    await expect(requireActiveDeveloperOrg()).rejects.toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
  });

  test('rejects non-builder roles', async () => {
    await expect(
      requireActiveDeveloperOrg({
        userId: 'user-1',
        email: 'user@ruh.ai',
        role: 'end_user',
        orgId: 'org-1',
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Builder access requires a developer account',
    });
  });

  test('rejects missing active organization context', async () => {
    await expect(
      requireActiveDeveloperOrg({
        userId: 'user-1',
        email: 'dev@ruh.ai',
        role: 'developer',
        orgId: null,
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Builder access requires an active developer organization',
    });
  });

  test('rejects non-developer or inactive organizations', async () => {
    orgRows = [{
      id: 'org-1',
      name: 'Globex Customer',
      slug: 'globex',
      kind: 'customer',
      plan: 'free',
      status: 'active',
      created_at: '2026-04-02T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
    }];

    await expect(
      requireActiveDeveloperOrg({
        userId: 'user-1',
        email: 'dev@ruh.ai',
        role: 'developer',
        orgId: 'org-1',
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Builder access requires an active developer organization',
    });
  });

  test('returns the authenticated user plus active developer organization', async () => {
    orgRows = [{
      id: 'org-1',
      name: 'Acme Dev',
      slug: 'acme-dev',
      kind: 'developer',
      plan: 'pro',
      status: 'active',
      created_at: '2026-04-02T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
    }];

    await expect(
      requireActiveDeveloperOrg({
        userId: 'user-1',
        email: 'admin@ruh.ai',
        role: 'admin',
        orgId: 'org-1',
      }),
    ).resolves.toMatchObject({
      user: {
        userId: 'user-1',
        email: 'admin@ruh.ai',
        role: 'admin',
        orgId: 'org-1',
      },
      organization: {
        id: 'org-1',
        name: 'Acme Dev',
        kind: 'developer',
        status: 'active',
      },
    });
  });
});

describe('requireActiveCustomerOrg', () => {
  test('requires an authenticated user', async () => {
    await expect(requireActiveCustomerOrg()).rejects.toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
  });

  test('rejects missing active organization context', async () => {
    await expect(
      requireActiveCustomerOrg({
        userId: 'user-1',
        email: 'customer@ruh.ai',
        role: 'end_user',
        orgId: null,
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Customer access requires an active customer organization',
    });
  });

  test('rejects non-customer or inactive organizations', async () => {
    orgRows = [{
      id: 'org-1',
      name: 'Acme Dev',
      slug: 'acme-dev',
      kind: 'developer',
      plan: 'pro',
      status: 'active',
      created_at: '2026-04-02T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
    }];

    await expect(
      requireActiveCustomerOrg({
        userId: 'user-1',
        email: 'customer@ruh.ai',
        role: 'end_user',
        orgId: 'org-1',
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Customer access requires an active customer organization',
    });
  });

  test('rejects missing or inactive memberships', async () => {
    orgRows = [{
      id: 'org-1',
      name: 'Globex',
      slug: 'globex',
      kind: 'customer',
      plan: 'enterprise',
      status: 'active',
      created_at: '2026-04-02T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
    }];

    await expect(
      requireActiveCustomerOrg({
        userId: 'user-1',
        email: 'customer@ruh.ai',
        role: 'end_user',
        orgId: 'org-1',
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Customer access requires an active organization membership',
    });
  });

  test('rejects memberships with roles outside the customer surface', async () => {
    orgRows = [{
      id: 'org-1',
      name: 'Globex',
      slug: 'globex',
      kind: 'customer',
      plan: 'enterprise',
      status: 'active',
      created_at: '2026-04-02T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
    }];
    membershipRows = [{
      id: 'membership-1',
      org_id: 'org-1',
      user_id: 'user-1',
      role: 'developer',
      status: 'active',
      organization_name: 'Globex',
      organization_slug: 'globex',
      organization_kind: 'customer',
      organization_plan: 'enterprise',
      organization_status: 'active',
      created_at: '2026-04-02T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
    }];

    await expect(
      requireActiveCustomerOrg({
        userId: 'user-1',
        email: 'customer@ruh.ai',
        role: 'end_user',
        orgId: 'org-1',
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Customer access requires a customer organization membership',
    });
  });

  test('returns the user, organization, and membership for active customer access', async () => {
    orgRows = [{
      id: 'org-1',
      name: 'Globex',
      slug: 'globex',
      kind: 'customer',
      plan: 'enterprise',
      status: 'active',
      created_at: '2026-04-02T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
    }];
    membershipRows = [{
      id: 'membership-1',
      org_id: 'org-1',
      user_id: 'user-1',
      role: 'employee',
      status: 'active',
      organization_name: 'Globex',
      organization_slug: 'globex',
      organization_kind: 'customer',
      organization_plan: 'enterprise',
      organization_status: 'active',
      created_at: '2026-04-02T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
    }];

    await expect(
      requireActiveCustomerOrg({
        userId: 'user-1',
        email: 'customer@ruh.ai',
        role: 'end_user',
        orgId: 'org-1',
      }),
    ).resolves.toMatchObject({
      user: {
        userId: 'user-1',
        email: 'customer@ruh.ai',
        role: 'end_user',
        orgId: 'org-1',
      },
      organization: {
        id: 'org-1',
        name: 'Globex',
        kind: 'customer',
        status: 'active',
      },
      membership: {
        id: 'membership-1',
        role: 'employee',
        status: 'active',
      },
    });
  });
});
