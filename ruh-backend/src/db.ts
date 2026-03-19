/**
 * Shared PostgreSQL connection pool for OpenClaw backend.
 * Call initPool() once at startup before using withConn().
 */

import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

export function initPool(): void {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  pool = new Pool({
    connectionString: dsn,
    min: 2,
    max: 10,
  });
}

/**
 * Acquire a connection from the pool, run fn inside an explicit transaction,
 * and commit on success or rollback on error — mirroring the Python context manager.
 */
export async function withConn<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) {
    throw new Error('DB pool not initialized — call initPool() first');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
