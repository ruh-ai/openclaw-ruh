import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (client: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import { MIGRATIONS, runSchemaMigrations } from '../../src/schemaMigrations';

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id FROM schema_migrations')) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
});

describe('schema migrations', () => {
  test('defines migrations in deterministic ascending id order', () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual([...ids].sort());
  });

  test('worker cost tracking uses TEXT agent references consistent with agents.id', () => {
    const migration = MIGRATIONS.find((entry) => entry.id === '0022_worker_cost_tracking');
    expect(migration).toBeDefined();

    const sql = migration!.statements.join('\n');

    expect(sql).toContain('agent_id        TEXT');
    expect(sql).not.toContain('agent_id        UUID');
  });

  test('creates the ledger and applies each pending migration once in order', async () => {
    await runSchemaMigrations();

    const sqls = mockQuery.mock.calls.map((call) => String(call[0]));

    expect(sqls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('SELECT id FROM schema_migrations ORDER BY id ASC'))).toBe(true);

    const insertedIds = mockQuery.mock.calls
      .filter((call) => String(call[0]).includes('INSERT INTO schema_migrations'))
      .map((call) => call[1]?.[0]);

    expect(insertedIds).toEqual(MIGRATIONS.map((migration) => migration.id));
  });

  test('skips migrations already recorded in the ledger', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM schema_migrations')) {
        return {
          rows: MIGRATIONS.map((migration) => ({ id: migration.id })),
          rowCount: MIGRATIONS.length,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await runSchemaMigrations();

    const insertedIds = mockQuery.mock.calls.filter((call) =>
      String(call[0]).includes('INSERT INTO schema_migrations'),
    );
    expect(insertedIds).toHaveLength(0);
  });

  test('does not mark a migration as applied when one of its statements fails', async () => {
    const failingMigration = MIGRATIONS[0];
    let failed = false;

    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id FROM schema_migrations')) {
        return { rows: [], rowCount: 0 };
      }
      if (!failed && String(sql).includes('CREATE TABLE IF NOT EXISTS sandboxes')) {
        failed = true;
        throw new Error('boom');
      }
      if (String(sql).includes('INSERT INTO schema_migrations') && params?.[0] === failingMigration?.id) {
        throw new Error('migration should not be marked applied after failure');
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(runSchemaMigrations()).rejects.toThrow('boom');
  });
});
