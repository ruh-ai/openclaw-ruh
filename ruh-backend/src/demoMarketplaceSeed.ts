import type { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

type DemoAgentDefinition = {
  name: string;
  ownerEmail: string;
  ownerOrgSlug: string;
  avatar: string;
  description: string;
  skills: string[];
  triggerLabel: string;
  listing: {
    title: string;
    summary: string;
    description: string;
    category: string;
    tags: string[];
    version: string;
    review: {
      userEmail: string;
      rating: number;
      title: string;
      body: string;
    };
    installUserEmails: string[];
  };
};

type SeededDemoAgent = {
  id: string;
  name: string;
  ownerEmail: string;
  ownerOrgSlug: string;
};

type SeededDemoListing = {
  id: string;
  title: string;
  slug: string;
  ownerOrgSlug: string;
  publisherEmail: string;
  status: 'published';
};

export type SeedDemoMarketplaceResult = {
  agents: SeededDemoAgent[];
  listings: SeededDemoListing[];
};

const DEMO_AGENTS: DemoAgentDefinition[] = [
  {
    name: 'Inventory Alert Bot',
    ownerEmail: 'dev-owner@acme-dev.test',
    ownerOrgSlug: 'acme-dev',
    avatar: '📦',
    description:
      'Monitors Shopify inventory every hour, identifies low-stock products, ranks urgent restocks, and posts Slack alerts for the operations team.',
    skills: ['inventory_monitoring', 'restock_prioritization', 'slack_reporting'],
    triggerLabel: 'Runs hourly inventory checks',
    listing: {
      title: 'Inventory Alert Bot',
      summary:
        'Shopify inventory monitoring with ranked low-stock alerts delivered to Slack.',
      description:
        'A production-ready operations agent that checks Shopify inventory on a schedule, flags products under threshold, groups the most urgent restocks, and sends a clear Slack summary for the warehouse and purchasing teams.',
      category: 'operations',
      tags: ['shopify', 'inventory', 'slack', 'operations'],
      version: '1.0.0',
      review: {
        userEmail: 'admin@globex.test',
        rating: 5,
        title: 'Instantly useful for our ops team',
        body:
          'The alerts are clear, the prioritization is sensible, and it catches restock risk before it becomes a customer issue.',
      },
      installUserEmails: ['admin@globex.test'],
    },
  },
  {
    name: 'Google Ads Optimizer',
    ownerEmail: 'dev-owner@nova-labs.test',
    ownerOrgSlug: 'nova-labs',
    avatar: '📈',
    description:
      'Audits Google Ads campaign performance, highlights budget waste, recommends bid and keyword adjustments, and produces an executive-friendly daily summary.',
    skills: ['campaign_auditing', 'performance_reporting', 'budget_anomaly_detection'],
    triggerLabel: 'Runs daily Google Ads audits',
    listing: {
      title: 'Google Ads Optimizer',
      summary:
        'Daily Google Ads auditing with actionable spend, bid, and keyword recommendations.',
      description:
        'A marketing operations agent for growth teams that inspects Google Ads performance, spots overspend and conversion drops, and turns the findings into a concise optimization brief leaders can act on quickly.',
      category: 'marketing',
      tags: ['google-ads', 'marketing', 'ppc', 'optimization'],
      version: '1.0.0',
      review: {
        userEmail: 'admin@initech.test',
        rating: 4,
        title: 'Strong daily reporting baseline',
        body:
          'The optimization summary is sharp and saves us a first-pass audit every morning.',
      },
      installUserEmails: ['admin@initech.test'],
    },
  },
];

type UserRow = { id: string; email: string };
type OrganizationRow = { id: string; slug: string };
type AgentRow = { id: string; name: string; created_by: string | null; org_id: string | null };
type ListingRow = { id: string; title: string; slug: string; owner_org_id: string | null; publisher_id: string };

export async function seedDemoMarketplace(): Promise<SeedDemoMarketplaceResult> {
  return withConn(async (client) => {
    const platformAdminId = await requireUserId(client, 'admin@ruh.test');
    const seededAgents: SeededDemoAgent[] = [];
    const seededListings: SeededDemoListing[] = [];

    for (const definition of DEMO_AGENTS) {
      const ownerId = await requireUserId(client, definition.ownerEmail);
      const ownerOrg = await requireOrganization(client, definition.ownerOrgSlug);

      const agent = await ensureAgent(client, definition, ownerId, ownerOrg.id);
      const listing = await ensureListing(
        client,
        definition,
        agent.id,
        ownerId,
        ownerOrg.id,
        platformAdminId,
      );

      await ensureReview(client, listing.id, definition.listing.review);
      await ensureInstalls(client, listing.id, definition.listing.version, definition.listing.installUserEmails);
      await syncListingAggregateMetrics(client, listing.id);

      seededAgents.push({
        id: agent.id,
        name: agent.name,
        ownerEmail: definition.ownerEmail,
        ownerOrgSlug: definition.ownerOrgSlug,
      });
      seededListings.push({
        id: listing.id,
        title: listing.title,
        slug: listing.slug,
        ownerOrgSlug: definition.ownerOrgSlug,
        publisherEmail: definition.ownerEmail,
        status: 'published',
      });
    }

    return { agents: seededAgents, listings: seededListings };
  });
}

async function requireUserId(client: PoolClient, email: string): Promise<string> {
  const result = await client.query<UserRow>(
    'SELECT id, email FROM users WHERE email = $1 LIMIT 1',
    [email],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Demo marketplace seed requires user ${email}. Run seed:test-users first.`);
  }
  return row.id;
}

async function requireOrganization(client: PoolClient, slug: string): Promise<OrganizationRow> {
  const result = await client.query<OrganizationRow>(
    'SELECT id, slug FROM organizations WHERE slug = $1 LIMIT 1',
    [slug],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Demo marketplace seed requires organization ${slug}. Run seed:test-users first.`);
  }
  return row;
}

async function ensureAgent(
  client: PoolClient,
  definition: DemoAgentDefinition,
  ownerId: string,
  ownerOrgId: string,
): Promise<AgentRow> {
  const existing = await client.query<AgentRow>(
    `
    SELECT id, name, created_by, org_id
    FROM agents
    WHERE name = $1 AND created_by = $2
    LIMIT 1
    `,
    [definition.name, ownerId],
  );

  if (existing.rows[0]) {
    const updated = await client.query<AgentRow>(
      `
      UPDATE agents
      SET
        avatar = $3,
        description = $4,
        skills = $5::jsonb,
        trigger_label = $6,
        status = 'active',
        created_by = $7,
        org_id = $8,
        updated_at = NOW()
      WHERE id = $1 AND created_by = $2
      RETURNING id, name, created_by, org_id
      `,
      [
        existing.rows[0].id,
        ownerId,
        definition.avatar,
        definition.description,
        JSON.stringify(definition.skills),
        definition.triggerLabel,
        ownerId,
        ownerOrgId,
      ],
    );
    return updated.rows[0];
  }

  const inserted = await client.query<AgentRow>(
    `
    INSERT INTO agents (
      id,
      name,
      avatar,
      description,
      skills,
      trigger_label,
      status,
      created_by,
      org_id
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'active', $7, $8)
    RETURNING id, name, created_by, org_id
    `,
    [
      uuidv4(),
      definition.name,
      definition.avatar,
      definition.description,
      JSON.stringify(definition.skills),
      definition.triggerLabel,
      ownerId,
      ownerOrgId,
    ],
  );
  return inserted.rows[0];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function ensureListing(
  client: PoolClient,
  definition: DemoAgentDefinition,
  agentId: string,
  publisherId: string,
  ownerOrgId: string,
  reviewerId: string,
): Promise<ListingRow> {
  const existing = await client.query<ListingRow>(
    `
    SELECT id, title, slug, owner_org_id, publisher_id
    FROM marketplace_listings
    WHERE agent_id = $1
    LIMIT 1
    `,
    [agentId],
  );

  if (existing.rows[0]) {
    const updated = await client.query<ListingRow>(
      `
      UPDATE marketplace_listings
      SET
        publisher_id = $2,
        owner_org_id = $3,
        title = $4,
        slug = $5,
        summary = $6,
        description = $7,
        category = $8,
        tags = $9::jsonb,
        version = $10,
        status = 'published',
        review_notes = $11,
        reviewed_by = $12,
        reviewed_at = COALESCE(reviewed_at, NOW()),
        published_at = COALESCE(published_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, title, slug, owner_org_id, publisher_id
      `,
      [
        existing.rows[0].id,
        publisherId,
        ownerOrgId,
        definition.listing.title,
        slugify(definition.listing.title),
        definition.listing.summary,
        definition.listing.description,
        definition.listing.category,
        JSON.stringify(definition.listing.tags),
        definition.listing.version,
        'Seeded local demo listing',
        reviewerId,
      ],
    );
    return updated.rows[0];
  }

  const inserted = await client.query<ListingRow>(
    `
    INSERT INTO marketplace_listings (
      id,
      agent_id,
      publisher_id,
      owner_org_id,
      title,
      slug,
      summary,
      description,
      category,
      tags,
      version,
      status,
      review_notes,
      reviewed_by,
      reviewed_at,
      published_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, 'published', $12, $13, NOW(), NOW())
    RETURNING id, title, slug, owner_org_id, publisher_id
    `,
    [
      uuidv4(),
      agentId,
      publisherId,
      ownerOrgId,
      definition.listing.title,
      slugify(definition.listing.title),
      definition.listing.summary,
      definition.listing.description,
      definition.listing.category,
      JSON.stringify(definition.listing.tags),
      definition.listing.version,
      'Seeded local demo listing',
      reviewerId,
    ],
  );
  return inserted.rows[0];
}

async function ensureReview(
  client: PoolClient,
  listingId: string,
  review: DemoAgentDefinition['listing']['review'],
): Promise<void> {
  const reviewerId = await requireUserId(client, review.userEmail);
  const existing = await client.query(
    `
    SELECT id
    FROM marketplace_reviews
    WHERE listing_id = $1 AND user_id = $2
    LIMIT 1
    `,
    [listingId, reviewerId],
  );

  if (existing.rows[0]) {
    await client.query(
      `
      UPDATE marketplace_reviews
      SET rating = $3, title = $4, body = $5, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      `,
      [existing.rows[0].id, reviewerId, review.rating, review.title, review.body],
    );
    return;
  }

  await client.query(
    `
    INSERT INTO marketplace_reviews (id, listing_id, user_id, rating, title, body)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [uuidv4(), listingId, reviewerId, review.rating, review.title, review.body],
  );
}

async function ensureInstalls(
  client: PoolClient,
  listingId: string,
  version: string,
  installUserEmails: string[],
): Promise<void> {
  for (const email of installUserEmails) {
    const userId = await requireUserId(client, email);
    const existing = await client.query(
      `
      SELECT id
      FROM marketplace_installs
      WHERE listing_id = $1 AND user_id = $2
      LIMIT 1
      `,
      [listingId, userId],
    );

    if (existing.rows[0]) {
      await client.query(
        `
        UPDATE marketplace_installs
        SET version = $3
        WHERE id = $1 AND user_id = $2
        `,
        [existing.rows[0].id, userId, version],
      );
      continue;
    }

    await client.query(
      `
      INSERT INTO marketplace_installs (id, listing_id, user_id, version)
      VALUES ($1, $2, $3, $4)
      `,
      [uuidv4(), listingId, userId, version],
    );
  }
}

async function syncListingAggregateMetrics(client: PoolClient, listingId: string): Promise<void> {
  await client.query(
    `
    UPDATE marketplace_listings
    SET
      install_count = (
        SELECT COUNT(*)
        FROM marketplace_installs
        WHERE listing_id = $1
      ),
      avg_rating = (
        SELECT COALESCE(AVG(rating), 0)
        FROM marketplace_reviews
        WHERE listing_id = $1
      ),
      updated_at = NOW()
    WHERE id = $1
    `,
    [listingId],
  );
}
