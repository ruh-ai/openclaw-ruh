import 'dotenv/config';
import { initPool } from '../src/db';
import { runSchemaMigrations } from '../src/schemaMigrations';
import { seedTestUsers } from '../src/testUserSeed';
import { seedDemoMarketplace } from '../src/demoMarketplaceSeed';

const sharedPassword =
  process.env.RUH_TEST_USER_PASSWORD || process.env.TEST_USER_PASSWORD;

async function main() {
  initPool();
  await runSchemaMigrations();

  const userSeed = await seedTestUsers(sharedPassword);
  const marketplaceSeed = await seedDemoMarketplace();

  console.log('Local demo marketplace is ready.');
  console.log(`Shared QA password: ${userSeed.sharedPassword}`);
  console.log('');
  console.table(
    marketplaceSeed.listings.map((listing) => ({
      title: listing.title,
      slug: listing.slug,
      ownerOrg: listing.ownerOrgSlug,
      publisher: listing.publisherEmail,
      status: listing.status,
    })),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed local demo marketplace');
    console.error(error);
    process.exit(1);
  });
