import type { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from './auth/passwords';
import { withConn } from './db';

type SeedOrgDefinition = {
  slug: string;
  name: string;
  kind: 'developer' | 'customer';
};

type SeedMembershipDefinition = {
  orgSlug: string;
  role: 'owner' | 'admin' | 'developer' | 'employee';
};

type SeedUserDefinition = {
  email: string;
  displayName: string;
  role: 'admin' | 'developer' | 'end_user';
  primaryOrgSlug?: string;
  memberships: SeedMembershipDefinition[];
  category: 'platform' | 'developer' | 'customer' | 'switcher';
};

export type SeededTestOrganization = SeedOrgDefinition & { id: string };

export type SeededTestUser = {
  id: string;
  email: string;
  displayName: string;
  role: SeedUserDefinition['role'];
  primaryOrgSlug: string | null;
  memberships: SeedMembershipDefinition[];
  category: SeedUserDefinition['category'];
};

export type SeedTestUsersResult = {
  sharedPassword: string;
  organizations: SeededTestOrganization[];
  users: SeededTestUser[];
};

export const DEFAULT_TEST_USER_PASSWORD = 'RuhTest123';

const TEST_ORGANIZATIONS: SeedOrgDefinition[] = [
  { slug: 'acme-dev', name: 'Acme Developer Studio', kind: 'developer' },
  { slug: 'nova-labs', name: 'Nova Labs', kind: 'developer' },
  { slug: 'globex', name: 'Globex Corporation', kind: 'customer' },
  { slug: 'initech', name: 'Initech', kind: 'customer' },
];

const TEST_USERS: SeedUserDefinition[] = [
  {
    email: 'admin@ruh.test',
    displayName: 'Ruh Platform Admin',
    role: 'admin',
    memberships: [],
    category: 'platform',
  },
  {
    email: 'prasanjit@ruh.ai',
    displayName: 'Prasanjit Ruh',
    role: 'admin',
    primaryOrgSlug: 'acme-dev',
    memberships: [
      { orgSlug: 'acme-dev', role: 'owner' },
      { orgSlug: 'globex', role: 'admin' },
    ],
    category: 'switcher',
  },
  {
    email: 'dev-owner@acme-dev.test',
    displayName: 'Acme Dev Owner',
    role: 'developer',
    primaryOrgSlug: 'acme-dev',
    memberships: [{ orgSlug: 'acme-dev', role: 'owner' }],
    category: 'developer',
  },
  {
    email: 'dev-1@acme-dev.test',
    displayName: 'Acme Developer One',
    role: 'developer',
    primaryOrgSlug: 'acme-dev',
    memberships: [{ orgSlug: 'acme-dev', role: 'developer' }],
    category: 'developer',
  },
  {
    email: 'dev-owner@nova-labs.test',
    displayName: 'Nova Labs Owner',
    role: 'developer',
    primaryOrgSlug: 'nova-labs',
    memberships: [{ orgSlug: 'nova-labs', role: 'owner' }],
    category: 'developer',
  },
  {
    email: 'admin@globex.test',
    displayName: 'Globex Org Admin',
    role: 'end_user',
    primaryOrgSlug: 'globex',
    memberships: [{ orgSlug: 'globex', role: 'admin' }],
    category: 'customer',
  },
  {
    email: 'employee-1@globex.test',
    displayName: 'Globex Employee One',
    role: 'end_user',
    primaryOrgSlug: 'globex',
    memberships: [{ orgSlug: 'globex', role: 'employee' }],
    category: 'customer',
  },
  {
    email: 'employee-2@globex.test',
    displayName: 'Globex Employee Two',
    role: 'end_user',
    primaryOrgSlug: 'globex',
    memberships: [{ orgSlug: 'globex', role: 'employee' }],
    category: 'customer',
  },
  {
    email: 'admin@initech.test',
    displayName: 'Initech Org Admin',
    role: 'end_user',
    primaryOrgSlug: 'initech',
    memberships: [{ orgSlug: 'initech', role: 'admin' }],
    category: 'customer',
  },
  {
    email: 'employee-1@initech.test',
    displayName: 'Initech Employee One',
    role: 'end_user',
    primaryOrgSlug: 'initech',
    memberships: [{ orgSlug: 'initech', role: 'employee' }],
    category: 'customer',
  },
  {
    email: 'switcher@ruh.test',
    displayName: 'Cross Org Switcher',
    role: 'developer',
    primaryOrgSlug: 'acme-dev',
    memberships: [
      { orgSlug: 'acme-dev', role: 'developer' },
      { orgSlug: 'globex', role: 'employee' },
    ],
    category: 'switcher',
  },
];

type SeededOrgRow = {
  id: string;
  slug: string;
  name: string;
  kind: SeedOrgDefinition['kind'];
};

type SeededUserRow = {
  id: string;
  email: string;
  display_name: string;
  role: SeedUserDefinition['role'];
  org_id: string | null;
};

async function ensureOrganization(
  client: PoolClient,
  definition: SeedOrgDefinition,
): Promise<SeededTestOrganization> {
  const existing = await client.query<SeededOrgRow>(
    'SELECT id, slug, name, kind FROM organizations WHERE slug = $1 LIMIT 1',
    [definition.slug],
  );

  if (existing.rows[0]) {
    const updated = await client.query<SeededOrgRow>(
      `
      UPDATE organizations
      SET name = $2, kind = $3, plan = 'free', updated_at = NOW()
      WHERE slug = $1
      RETURNING id, slug, name, kind
      `,
      [definition.slug, definition.name, definition.kind],
    );
    return {
      id: updated.rows[0].id,
      slug: updated.rows[0].slug,
      name: updated.rows[0].name,
      kind: updated.rows[0].kind,
    };
  }

  const inserted = await client.query<SeededOrgRow>(
    `
    INSERT INTO organizations (id, name, slug, kind, plan)
    VALUES ($1, $2, $3, $4, 'free')
    RETURNING id, slug, name, kind
    `,
    [uuidv4(), definition.name, definition.slug, definition.kind],
  );
  return {
    id: inserted.rows[0].id,
    slug: inserted.rows[0].slug,
    name: inserted.rows[0].name,
    kind: inserted.rows[0].kind,
  };
}

async function ensureUser(
  client: PoolClient,
  definition: SeedUserDefinition,
  passwordHash: string,
  organizationsBySlug: Map<string, SeededTestOrganization>,
): Promise<SeededTestUser> {
  const primaryOrgId = definition.primaryOrgSlug
    ? organizationsBySlug.get(definition.primaryOrgSlug)?.id ?? null
    : null;

  const existing = await client.query<SeededUserRow>(
    'SELECT id, email, display_name, role, org_id FROM users WHERE email = $1 LIMIT 1',
    [definition.email],
  );

  let userRow: SeededUserRow;
  if (existing.rows[0]) {
    const updated = await client.query<SeededUserRow>(
      `
      UPDATE users
      SET
        password_hash = $2,
        display_name = $3,
        role = $4,
        org_id = $5,
        status = 'active',
        email_verified = TRUE,
        updated_at = NOW()
      WHERE email = $1
      RETURNING id, email, display_name, role, org_id
      `,
      [definition.email, passwordHash, definition.displayName, definition.role, primaryOrgId],
    );
    userRow = updated.rows[0];
  } else {
    const inserted = await client.query<SeededUserRow>(
      `
      INSERT INTO users (id, email, password_hash, display_name, role, org_id, status, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', TRUE)
      RETURNING id, email, display_name, role, org_id
      `,
      [uuidv4(), definition.email, passwordHash, definition.displayName, definition.role, primaryOrgId],
    );
    userRow = inserted.rows[0];
  }

  for (const membership of definition.memberships) {
    const org = organizationsBySlug.get(membership.orgSlug);
    if (!org) {
      throw new Error(`Seed organization not found for slug ${membership.orgSlug}`);
    }
    await ensureMembership(client, org.id, userRow.id, membership.role);
  }

  await ensureLocalIdentity(client, userRow.id, definition.email);

  return {
    id: userRow.id,
    email: userRow.email,
    displayName: userRow.display_name,
    role: userRow.role,
    primaryOrgSlug: definition.primaryOrgSlug ?? null,
    memberships: definition.memberships,
    category: definition.category,
  };
}

async function ensureMembership(
  client: PoolClient,
  orgId: string,
  userId: string,
  role: SeedMembershipDefinition['role'],
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM organization_memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1',
    [orgId, userId],
  );

  if (existing.rows[0]) {
    await client.query(
      `
      UPDATE organization_memberships
      SET role = $3, status = 'active', updated_at = NOW()
      WHERE org_id = $1 AND user_id = $2
      `,
      [orgId, userId, role],
    );
    return;
  }

  await client.query(
    `
    INSERT INTO organization_memberships (id, org_id, user_id, role, status)
    VALUES ($1, $2, $3, $4, 'active')
    `,
    [uuidv4(), orgId, userId, role],
  );
}

async function ensureLocalIdentity(
  client: PoolClient,
  userId: string,
  email: string,
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    "SELECT id FROM auth_identities WHERE provider = 'local' AND subject = $1 LIMIT 1",
    [email],
  );

  if (existing.rows[0]) {
    await client.query(
      `
      UPDATE auth_identities
      SET user_id = $2
      WHERE provider = 'local' AND subject = $1
      `,
      [email, userId],
    );
    return;
  }

  await client.query(
    `
    INSERT INTO auth_identities (id, user_id, provider, subject)
    VALUES ($1, $2, 'local', $3)
    `,
    [uuidv4(), userId, email],
  );
}

export async function seedTestUsers(
  sharedPassword = DEFAULT_TEST_USER_PASSWORD,
): Promise<SeedTestUsersResult> {
  const passwordHash = await hashPassword(sharedPassword);

  return withConn(async (client) => {
    const organizations: SeededTestOrganization[] = [];
    const organizationsBySlug = new Map<string, SeededTestOrganization>();

    for (const organization of TEST_ORGANIZATIONS) {
      const seededOrganization = await ensureOrganization(client, organization);
      organizations.push(seededOrganization);
      organizationsBySlug.set(seededOrganization.slug, seededOrganization);
    }

    const users: SeededTestUser[] = [];
    for (const user of TEST_USERS) {
      users.push(await ensureUser(client, user, passwordHash, organizationsBySlug));
    }

    return {
      sharedPassword,
      organizations,
      users,
    };
  });
}

export function formatSeedTestUsersReport(result: SeedTestUsersResult): string {
  const lines: string[] = [];
  lines.push('Seeded local test users');
  lines.push(`Shared password: ${result.sharedPassword}`);
  lines.push('');

  const categoryLabels: Array<[SeedUserDefinition['category'], string]> = [
    ['platform', 'Platform'],
    ['developer', 'Developer Orgs'],
    ['customer', 'Customer Orgs'],
    ['switcher', 'Cross-Org'],
  ];

  for (const [category, label] of categoryLabels) {
    const accounts = result.users.filter((user) => user.category === category);
    if (accounts.length === 0) continue;
    lines.push(`${label}:`);
    for (const account of accounts) {
      const memberships = account.memberships
        .map((membership) => `${membership.orgSlug}:${membership.role}`)
        .join(', ') || 'none';
      lines.push(
        `- ${account.email} | ${account.role} | primary=${account.primaryOrgSlug ?? 'none'} | memberships=${memberships}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
