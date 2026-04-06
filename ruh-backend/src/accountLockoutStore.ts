import { withConn } from './db';

export interface AccountLockoutRecord {
  email: string;
  attemptCount: number;
  lockedUntil: Date | null;
  updatedAt: Date;
}

/**
 * Get the current lockout record for an email, or null if none exists.
 */
export async function getLockout(email: string): Promise<AccountLockoutRecord | null> {
  return withConn(async (client) => {
    const result = await client.query(
      'SELECT email, attempt_count, locked_until, updated_at FROM account_lockouts WHERE email = $1',
      [email],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      email: String(row.email),
      attemptCount: Number(row.attempt_count),
      lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
      updatedAt: new Date(row.updated_at),
    };
  });
}

/**
 * Increment the failed attempt count. If the count reaches maxAttempts,
 * set locked_until to now + lockoutDurationMs.
 */
export async function recordFailedAttempt(
  email: string,
  maxAttempts: number,
  lockoutDurationMs: number,
): Promise<{ attemptCount: number; locked: boolean }> {
  return withConn(async (client) => {
    const lockedUntil = new Date(Date.now() + lockoutDurationMs);
    // Upsert: insert or increment. Lock if threshold reached.
    const result = await client.query(
      `INSERT INTO account_lockouts (email, attempt_count, locked_until, updated_at)
       VALUES ($1, 1, NULL, NOW())
       ON CONFLICT (email) DO UPDATE SET
         attempt_count = account_lockouts.attempt_count + 1,
         locked_until = CASE
           WHEN account_lockouts.attempt_count + 1 >= $2 THEN $3::timestamptz
           ELSE account_lockouts.locked_until
         END,
         updated_at = NOW()
       RETURNING attempt_count, locked_until`,
      [email, maxAttempts, lockedUntil.toISOString()],
    );
    const row = result.rows[0];
    return {
      attemptCount: Number(row.attempt_count),
      locked: row.locked_until != null && new Date(row.locked_until) > new Date(),
    };
  });
}

/**
 * Clear all failed attempts for an email (on successful login).
 */
export async function clearLockout(email: string): Promise<void> {
  await withConn(async (client) => {
    await client.query('DELETE FROM account_lockouts WHERE email = $1', [email]);
  });
}
