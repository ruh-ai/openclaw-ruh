/**
 * Bootstraps a real PostgreSQL test database.
 * Call setupTestDb() in beforeAll, truncateAll() in beforeEach, teardownTestDb() in afterAll.
 *
 * truncateAll() uses the app's withConn (same pool as the stores) to avoid
 * cross-pool deadlocks when TRUNCATE acquires AccessExclusiveLock while the
 * app pool still holds connections from the previous test.
 *
 * setupTestDb() is idempotent — multiple test files in the same bun process
 * safely share one app pool and one admin pool.
 */

import { Pool } from 'pg';

/** Dedicated pool used only for teardown. */
let adminPool: Pool | null = null;
let initialized = false;

export async function setupTestDb(): Promise<void> {
  if (initialized) return;

  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for integration tests');

  // Force initPool to use the test URL
  process.env.DATABASE_URL = url;

  // Import and initialize after env is set
  const { initPool } = await import('../../src/db');
  const { runSchemaMigrations } = await import('../../src/schemaMigrations');

  initPool();
  await runSchemaMigrations();

  adminPool = new Pool({ connectionString: url, max: 1 });
  initialized = true;
}

export async function truncateAll(): Promise<void> {
  // Use the app's own connection pool so we don't deadlock with in-flight
  // transactions from the store modules.
  // DELETE FROM (with FK-aware ordering) avoids the AccessExclusiveLock
  // that TRUNCATE requires, preventing deadlocks with concurrent connections.
  const { withConn } = await import('../../src/db');
  await withConn(async (client) => {
    // Single statement with FK-safe ordering via DO block to minimize round-trips.
    await client.query(`
      DO $$ BEGIN
        DELETE FROM marketplace_installs;
        DELETE FROM marketplace_reviews;
        DELETE FROM marketplace_listings;
        DELETE FROM agent_versions;
        DELETE FROM messages;
        DELETE FROM conversations;
        DELETE FROM system_events;
        DELETE FROM control_plane_audit_events;
        DELETE FROM api_keys;
        DELETE FROM sessions;
        DELETE FROM agents;
        DELETE FROM sandboxes;
        DELETE FROM users;
        DELETE FROM organizations;
      END $$`);
  });
}

export async function teardownTestDb(): Promise<void> {
  if (adminPool) {
    await adminPool.end();
    adminPool = null;
  }
  // Note: we don't reset `initialized` because the app pool (in db.ts)
  // is module-level singleton state — tearing it down and re-creating
  // within the same process is unsafe. For multi-file runs the pool
  // stays alive until the process exits.
}
