import { Pool, PoolClient } from 'pg';
import { getConfig } from './config';

let pool: Pool | null = null;

export function initPool(): void {
  const config = getConfig();
  pool = new Pool({
    connectionString: config.databaseUrl,
    min: 2,
    max: 10,
  });
}

export async function withConn<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) throw new Error('DB pool not initialized — call initPool() first');
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

export async function query(text: string, params?: unknown[]) {
  if (!pool) throw new Error('DB pool not initialized');
  return pool.query(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) await pool.end();
}
