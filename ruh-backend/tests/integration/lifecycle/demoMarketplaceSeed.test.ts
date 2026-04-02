import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { withConn } from '../../../src/db';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';

process.env.NODE_ENV = 'development';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('demo marketplace seeding (integration)', () => {
  test('creates real published marketplace listings backed by real agents', async () => {
    const { seedTestUsers } = await import('../../../src/testUserSeed');
    const { seedDemoMarketplace } = await import('../../../src/demoMarketplaceSeed');

    await seedTestUsers();
    const result = await seedDemoMarketplace();

    expect(result.agents).toHaveLength(2);
    expect(result.listings).toHaveLength(2);

    const dbState = await withConn(async (client) => {
      const agents = await client.query(`
        SELECT a.name, a.status, u.email AS owner_email, o.slug AS org_slug
        FROM agents a
        LEFT JOIN users u ON u.id = a.created_by
        LEFT JOIN organizations o ON o.id = a.org_id
        ORDER BY a.name ASC
      `);

      const listings = await client.query(`
        SELECT
          l.title,
          l.status,
          l.install_count,
          ROUND(l.avg_rating::numeric, 1) AS avg_rating,
          u.email AS publisher_email,
          o.slug AS owner_org_slug,
          a.name AS agent_name
        FROM marketplace_listings l
        JOIN users u ON u.id = l.publisher_id
        LEFT JOIN organizations o ON o.id = l.owner_org_id
        JOIN agents a ON a.id = l.agent_id
        ORDER BY l.title ASC
      `);

      return {
        agents: agents.rows,
        listings: listings.rows,
      };
    });

    expect(dbState.agents).toEqual([
      {
        name: 'Google Ads Optimizer',
        status: 'active',
        owner_email: 'dev-owner@nova-labs.test',
        org_slug: 'nova-labs',
      },
      {
        name: 'Inventory Alert Bot',
        status: 'active',
        owner_email: 'dev-owner@acme-dev.test',
        org_slug: 'acme-dev',
      },
    ]);

    expect(dbState.listings).toEqual([
      {
        title: 'Google Ads Optimizer',
        status: 'published',
        install_count: 1,
        avg_rating: '4.0',
        publisher_email: 'dev-owner@nova-labs.test',
        owner_org_slug: 'nova-labs',
        agent_name: 'Google Ads Optimizer',
      },
      {
        title: 'Inventory Alert Bot',
        status: 'published',
        install_count: 1,
        avg_rating: '5.0',
        publisher_email: 'dev-owner@acme-dev.test',
        owner_org_slug: 'acme-dev',
        agent_name: 'Inventory Alert Bot',
      },
    ]);
  });

  test('is idempotent and does not duplicate demo agents or listings', async () => {
    const { seedTestUsers } = await import('../../../src/testUserSeed');
    const { seedDemoMarketplace } = await import('../../../src/demoMarketplaceSeed');

    await seedTestUsers();
    await seedDemoMarketplace();
    await seedDemoMarketplace();

    const counts = await withConn(async (client) => {
      const result = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM agents) AS agents_count,
          (SELECT COUNT(*) FROM marketplace_listings) AS listings_count,
          (SELECT COUNT(*) FROM marketplace_reviews) AS reviews_count,
          (SELECT COUNT(*) FROM marketplace_installs) AS installs_count
      `);
      return result.rows[0];
    });

    expect(counts).toEqual({
      agents_count: '2',
      listings_count: '2',
      reviews_count: '2',
      installs_count: '2',
    });
  });
});
