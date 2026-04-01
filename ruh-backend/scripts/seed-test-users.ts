import 'dotenv/config';
import { initPool } from '../src/db';
import { runSchemaMigrations } from '../src/schemaMigrations';
import {
  DEFAULT_TEST_USER_PASSWORD,
  formatSeedTestUsersReport,
  seedTestUsers,
} from '../src/testUserSeed';

async function main() {
  initPool();
  await runSchemaMigrations();

  const sharedPassword = process.env.RUH_TEST_USER_PASSWORD?.trim() || DEFAULT_TEST_USER_PASSWORD;
  const result = await seedTestUsers(sharedPassword);
  console.log(formatSeedTestUsersReport(result));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
