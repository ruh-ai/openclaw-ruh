/**
 * Shared PostgreSQL connection pool for OpenClaw backend.
 * Call initPool() once at startup before using withConn().
 */

import { Pool, PoolClient } from 'pg';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { getConfig } from './config';

let pool: Pool | null = null;

export function initPool(dsn = getConfig(process.env, { requireDatabaseUrl: true }).databaseUrl): void {
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
  const span = trace.getTracer('ruh-backend').startSpan('db.transaction');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    throw err;
  } finally {
    span.end();
    client.release();
  }
}
