/**
 * Bootstraps a real PostgreSQL test database.
 * Call setupTestDb() in beforeAll, truncateAll() in beforeEach, teardownTestDb() in afterAll.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

export async function setupTestDb(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for integration tests');

  // Force initPool to use the test URL
  process.env.DATABASE_URL = url;

  // Import and initialize after env is set
  const { initPool } = await import('../../src/db');
  const store = await import('../../src/store');
  const convStore = await import('../../src/conversationStore');

  initPool();
  await store.initDb();
  await convStore.initDb();

  pool = new Pool({ connectionString: url });
}

export async function truncateAll(): Promise<void> {
  if (!pool) return;
  await pool.query('TRUNCATE sandboxes, conversations, messages RESTART IDENTITY CASCADE');
}

export async function teardownTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
