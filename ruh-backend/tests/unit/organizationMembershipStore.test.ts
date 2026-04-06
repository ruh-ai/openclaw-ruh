import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({
  rows: [],
  rowCount: 0,
}));
const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (client: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

mock.module('uuid', () => ({
  v4: () => 'membership-uuid',
}));

const membershipStore = await import('../../src/organizationMembershipStore?unitOrganizationMembershipStore');

function makeMembershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'membership-1',
    org_id: 'org-1',
    user_id: 'user-1',
    role: 'owner',
    status: 'active',
    organization_name: 'Globex',
    organization_slug: 'globex',
    organization_kind: 'customer',
    organization_plan: 'enterprise',
    organization_status: 'active',
    created_at: '2026-04-02T00:00:00Z',
    updated_at: '2026-04-02T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('createMembership', () => {
  test('inserts a membership row and serializes organization metadata', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeMembershipRow({ id: 'membership-uuid', role: 'admin', status: 'invited' })],
      rowCount: 1,
    });

    const membership = await membershipStore.createMembership('org-9', 'user-9', 'admin', 'invited');

    expect(membership).toEqual({
      id: 'membership-uuid',
      orgId: 'org-1',
      userId: 'user-1',
      role: 'admin',
      status: 'invited',
      organizationName: 'Globex',
      organizationSlug: 'globex',
      organizationKind: 'customer',
      organizationPlan: 'enterprise',
      organizationStatus: 'active',
      createdAt: '2026-04-02T00:00:00Z',
      updatedAt: '2026-04-02T00:00:00Z',
    });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO organization_memberships');
    expect(sql).toContain('AS organization_name');
    expect(params).toEqual(['membership-uuid', 'org-9', 'user-9', 'admin', 'invited']);
  });
});

describe('listMembershipsForUser', () => {
  test('joins organization metadata and returns serialized memberships', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeMembershipRow(), makeMembershipRow({ id: 'membership-2', role: 'employee' })],
      rowCount: 2,
    });

    const memberships = await membershipStore.listMembershipsForUser('user-1');

    expect(memberships).toHaveLength(2);
    expect(memberships[0]?.organizationName).toBe('Globex');
    expect(memberships[1]?.role).toBe('employee');
    expect(mockQuery.mock.calls[0]?.[0]).toContain('JOIN organizations o ON o.id = m.org_id');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1']);
  });
});

describe('getMembershipForUserOrg', () => {
  test('returns null when the membership is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const membership = await membershipStore.getMembershipForUserOrg('user-404', 'org-404');

    expect(membership).toBeNull();
    expect(mockQuery.mock.calls[0]?.[0]).toContain('WHERE m.user_id = $1 AND m.org_id = $2');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-404', 'org-404']);
  });
});

describe('listMembershipsForOrg', () => {
  test('orders memberships by role priority and creation time', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeMembershipRow()],
      rowCount: 1,
    });

    const memberships = await membershipStore.listMembershipsForOrg('org-1');

    expect(memberships[0]?.id).toBe('membership-1');
    expect(mockQuery.mock.calls[0]?.[0]).toContain("WHEN 'owner' THEN 0");
    expect(mockQuery.mock.calls[0]?.[0]).toContain('m.created_at ASC');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['org-1']);
  });
});

describe('getMembershipById', () => {
  test('returns the serialized membership when found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeMembershipRow({ id: 'membership-9', organization_kind: null, organization_plan: null, organization_status: null })],
      rowCount: 1,
    });

    const membership = await membershipStore.getMembershipById('membership-9');

    expect(membership).toEqual({
      id: 'membership-9',
      orgId: 'org-1',
      userId: 'user-1',
      role: 'owner',
      status: 'active',
      organizationName: 'Globex',
      organizationSlug: 'globex',
      organizationKind: 'customer',
      organizationPlan: 'free',
      organizationStatus: 'active',
      createdAt: '2026-04-02T00:00:00Z',
      updatedAt: '2026-04-02T00:00:00Z',
    });
  });
});

describe('updateMembership', () => {
  test('falls back to getMembershipById when the patch is empty', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeMembershipRow({ id: 'membership-empty' })],
      rowCount: 1,
    });

    const membership = await membershipStore.updateMembership('membership-empty', {});

    expect(membership?.id).toBe('membership-empty');
    expect(mockQuery.mock.calls).toHaveLength(1);
    expect(mockQuery.mock.calls[0]?.[0]).toContain('WHERE m.id = $1');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['membership-empty']);
  });

  test('updates provided fields and refetches the full membership row', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'membership-1' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [makeMembershipRow({ role: 'employee', status: 'suspended' })],
        rowCount: 1,
      });

    const membership = await membershipStore.updateMembership('membership-1', {
      role: 'employee',
      status: 'suspended',
    });

    expect(membership?.role).toBe('employee');
    expect(membership?.status).toBe('suspended');

    const [updateSql, updateParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(updateSql).toContain('UPDATE organization_memberships');
    expect(updateSql).toContain('role = $1');
    expect(updateSql).toContain('status = $2');
    expect(updateSql).toContain('updated_at = NOW()');
    expect(updateParams).toEqual(['employee', 'suspended', 'membership-1']);
    expect(mockQuery.mock.calls[1]?.[0]).toContain('WHERE m.id = $1');
    expect(mockQuery.mock.calls[1]?.[1]).toEqual(['membership-1']);
  });
});

describe('deleteMembership', () => {
  test('reports whether a membership row was removed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(membershipStore.deleteMembership('membership-1')).resolves.toBe(true);

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(membershipStore.deleteMembership('missing-membership')).resolves.toBe(false);
  });
});
