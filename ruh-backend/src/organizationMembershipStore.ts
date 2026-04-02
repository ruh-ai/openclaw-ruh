import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface OrganizationMembershipRecord {
  id: string;
  orgId: string;
  userId: string;
  role: 'owner' | 'admin' | 'developer' | 'employee';
  status: 'active' | 'invited' | 'suspended';
  organizationName: string;
  organizationSlug: string;
  organizationKind: 'developer' | 'customer';
  organizationPlan: string;
  organizationStatus: 'active' | 'suspended' | 'archived';
  createdAt: string;
  updatedAt: string;
}

function serializeMembershipRow(row: Record<string, unknown>): OrganizationMembershipRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    userId: String(row.user_id),
    role: String(row.role) as OrganizationMembershipRecord['role'],
    status: String(row.status) as OrganizationMembershipRecord['status'],
    organizationName: String(row.organization_name),
    organizationSlug: String(row.organization_slug),
    organizationKind: String(row.organization_kind ?? 'customer') as OrganizationMembershipRecord['organizationKind'],
    organizationPlan: String(row.organization_plan ?? 'free'),
    organizationStatus: String(row.organization_status ?? 'active') as OrganizationMembershipRecord['organizationStatus'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createMembership(
  orgId: string,
  userId: string,
  role: OrganizationMembershipRecord['role'],
  status: OrganizationMembershipRecord['status'] = 'active',
): Promise<OrganizationMembershipRecord> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `
      INSERT INTO organization_memberships (id, org_id, user_id, role, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        org_id,
        user_id,
        role,
        status,
        created_at,
        updated_at,
        (SELECT name FROM organizations WHERE id = org_id) AS organization_name,
        (SELECT slug FROM organizations WHERE id = org_id) AS organization_slug,
        (SELECT kind FROM organizations WHERE id = org_id) AS organization_kind,
        (SELECT plan FROM organizations WHERE id = org_id) AS organization_plan,
        (SELECT status FROM organizations WHERE id = org_id) AS organization_status
      `,
      [id, orgId, userId, role, status],
    );
    return serializeMembershipRow(result.rows[0]);
  });
}

export async function listMembershipsForUser(userId: string): Promise<OrganizationMembershipRecord[]> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      SELECT
        m.id,
        m.org_id,
        m.user_id,
        m.role,
        m.status,
        m.created_at,
        m.updated_at,
        o.name AS organization_name,
        o.slug AS organization_slug,
        o.kind AS organization_kind,
        o.plan AS organization_plan,
        o.status AS organization_status
      FROM organization_memberships m
      JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1
      ORDER BY m.created_at ASC
      `,
      [userId],
    );
    return result.rows.map(serializeMembershipRow);
  });
}

export async function getMembershipForUserOrg(
  userId: string,
  orgId: string,
): Promise<OrganizationMembershipRecord | null> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      SELECT
        m.id,
        m.org_id,
        m.user_id,
        m.role,
        m.status,
        m.created_at,
        m.updated_at,
        o.name AS organization_name,
        o.slug AS organization_slug,
        o.kind AS organization_kind,
        o.plan AS organization_plan,
        o.status AS organization_status
      FROM organization_memberships m
      JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1 AND m.org_id = $2
      LIMIT 1
      `,
      [userId, orgId],
    );
    return result.rows[0] ? serializeMembershipRow(result.rows[0]) : null;
  });
}

export async function listMembershipsForOrg(orgId: string): Promise<OrganizationMembershipRecord[]> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      SELECT
        m.id,
        m.org_id,
        m.user_id,
        m.role,
        m.status,
        m.created_at,
        m.updated_at,
        o.name AS organization_name,
        o.slug AS organization_slug,
        o.kind AS organization_kind,
        o.plan AS organization_plan,
        o.status AS organization_status
      FROM organization_memberships m
      JOIN organizations o ON o.id = m.org_id
      WHERE m.org_id = $1
      ORDER BY
        CASE m.role
          WHEN 'owner' THEN 0
          WHEN 'admin' THEN 1
          WHEN 'developer' THEN 2
          ELSE 3
        END,
        m.created_at ASC
      `,
      [orgId],
    );
    return result.rows.map(serializeMembershipRow);
  });
}

export async function getMembershipById(id: string): Promise<OrganizationMembershipRecord | null> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      SELECT
        m.id,
        m.org_id,
        m.user_id,
        m.role,
        m.status,
        m.created_at,
        m.updated_at,
        o.name AS organization_name,
        o.slug AS organization_slug,
        o.kind AS organization_kind,
        o.plan AS organization_plan,
        o.status AS organization_status
      FROM organization_memberships m
      JOIN organizations o ON o.id = m.org_id
      WHERE m.id = $1
      LIMIT 1
      `,
      [id],
    );
    return result.rows[0] ? serializeMembershipRow(result.rows[0]) : null;
  });
}

export async function updateMembership(
  id: string,
  patch: Partial<
    Pick<OrganizationMembershipRecord, 'role' | 'status'>
  >,
): Promise<OrganizationMembershipRecord | null> {
  return withConn(async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.role !== undefined) {
      sets.push(`role = $${idx++}`);
      params.push(patch.role);
    }
    if (patch.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(patch.status);
    }

    if (sets.length === 0) {
      return getMembershipById(id);
    }

    sets.push(`updated_at = NOW()`);
    const result = await client.query(
      `
      UPDATE organization_memberships
      SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING
        id,
        org_id,
        user_id,
        role,
        status,
        created_at,
        updated_at
      `,
      [...params, id],
    );

    if (!result.rows[0]) {
      return null;
    }

    return getMembershipById(String(result.rows[0].id));
  });
}

export async function deleteMembership(id: string): Promise<boolean> {
  return withConn(async (client) => {
    const result = await client.query(
      'DELETE FROM organization_memberships WHERE id = $1',
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  });
}
