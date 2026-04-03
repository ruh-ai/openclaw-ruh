import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Pool } from 'pg';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';

const TEST_URL = process.env.TEST_DATABASE_URL;

const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb('schema migrations (real DB)', () => {
  let pool: Pool;

  beforeAll(async () => {
    await setupTestDb();
    pool = new Pool({ connectionString: TEST_URL! });
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await pool.end();
    await teardownTestDb();
  });

  test('fresh bootstrap creates the migration ledger and latest schema columns', async () => {
    const { runSchemaMigrations, MIGRATIONS } = await import('../../../src/schemaMigrations');

    await pool.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
    await pool.query('DROP TABLE IF EXISTS control_plane_audit_events CASCADE');
    await pool.query('DROP TABLE IF EXISTS webhook_delivery_dedupes CASCADE');
    await pool.query('DROP TABLE IF EXISTS messages CASCADE');
    await pool.query('DROP TABLE IF EXISTS conversations CASCADE');
    await pool.query('DROP TABLE IF EXISTS agents CASCADE');
    await pool.query('DROP TABLE IF EXISTS sandboxes CASCADE');

    await runSchemaMigrations();

    const ledger = await pool.query('SELECT id FROM schema_migrations ORDER BY id ASC');
    expect(ledger.rows.map((row) => row.id)).toEqual(MIGRATIONS.map((migration) => migration.id));

    const sandboxColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sandboxes'
      ORDER BY ordinal_position
    `);
    const columnNames = sandboxColumns.rows.map((row) => row.column_name);
    expect(columnNames).toContain('vnc_port');
    expect(columnNames).toContain('shared_codex_enabled');
    expect(columnNames).toContain('shared_codex_model');

    const agentColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'agents'
      ORDER BY ordinal_position
    `);
    expect(agentColumns.rows.map((row) => row.column_name)).toContain('workspace_memory');

    const webhookLedgerColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'webhook_delivery_dedupes'
      ORDER BY ordinal_position
    `);
    expect(webhookLedgerColumns.rows.map((row) => row.column_name)).toEqual([
      'public_id',
      'delivery_id',
      'agent_id',
      'trigger_id',
      'status',
      'created_at',
      'updated_at',
    ]);
  });

  test('worker cost tracking tables use text agent references', async () => {
    const { runSchemaMigrations } = await import('../../../src/schemaMigrations');

    await runSchemaMigrations();

    const agentColumns = await pool.query(`
      SELECT table_name, data_type
      FROM information_schema.columns
      WHERE table_name IN ('cost_events', 'budget_policies', 'execution_recordings')
        AND column_name = 'agent_id'
      ORDER BY table_name ASC
    `);

    expect(agentColumns.rows).toEqual([
      { table_name: 'budget_policies', data_type: 'text' },
      { table_name: 'cost_events', data_type: 'text' },
      { table_name: 'execution_recordings', data_type: 'text' },
    ]);
  });

  test('applies only the remaining migrations when the ledger is partially populated', async () => {
    const { runSchemaMigrations, MIGRATIONS } = await import('../../../src/schemaMigrations');

    await pool.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
    await pool.query('DROP TABLE IF EXISTS control_plane_audit_events CASCADE');
    await pool.query('DROP TABLE IF EXISTS webhook_delivery_dedupes CASCADE');
    await pool.query('DROP TABLE IF EXISTS messages CASCADE');
    await pool.query('DROP TABLE IF EXISTS conversations CASCADE');
    await pool.query('DROP TABLE IF EXISTS agents CASCADE');
    await pool.query('DROP TABLE IF EXISTS sandboxes CASCADE');

    await runSchemaMigrations();

    const keepId = MIGRATIONS[0]!.id;
    await pool.query('DELETE FROM schema_migrations WHERE id <> $1', [keepId]);
    await pool.query('DROP TABLE IF EXISTS control_plane_audit_events CASCADE');
    await pool.query('ALTER TABLE agents DROP COLUMN IF EXISTS workspace_memory');

    await runSchemaMigrations();

    const ledger = await pool.query('SELECT id FROM schema_migrations ORDER BY id ASC');
    expect(ledger.rows.map((row) => row.id)).toEqual(MIGRATIONS.map((migration) => migration.id));

    const workspaceMemoryColumn = await pool.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'agents' AND column_name = 'workspace_memory'
    `);
    expect(workspaceMemoryColumn.rowCount).toBe(1);
  });

  test('rerunning migrations is idempotent', async () => {
    const { runSchemaMigrations, MIGRATIONS } = await import('../../../src/schemaMigrations');

    await runSchemaMigrations();
    await runSchemaMigrations();

    const counts = await pool.query(`
      SELECT id, COUNT(*)::int AS count
      FROM schema_migrations
      GROUP BY id
      ORDER BY id ASC
    `);

    expect(counts.rows).toHaveLength(MIGRATIONS.length);
    expect(counts.rows.every((row) => row.count === 1)).toBe(true);
  });
});
