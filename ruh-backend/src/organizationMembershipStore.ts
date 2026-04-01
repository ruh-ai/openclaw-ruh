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
        (SELECT plan FROM organizations WHERE id = org_id) AS organization_plan
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
        o.plan AS organization_plan
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
        o.plan AS organization_plan
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
