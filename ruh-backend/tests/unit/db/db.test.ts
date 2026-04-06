import { beforeEach, describe, expect, mock, test } from 'bun:test';

type MockClient = {
  calls: string[];
  query: ReturnType<typeof mock<(_: string) => Promise<{ rows: unknown[]; rowCount: number }>>>;
  release: ReturnType<typeof mock<() => void>>;
};

const state: {
  poolConfigs: Array<Record<string, unknown>>;
  client: MockClient | null;
} = {
  poolConfigs: [],
  client: null,
};

function makeClient(
  queryImpl?: (sql: string) => Promise<{ rows: unknown[]; rowCount: number }>,
): MockClient {
  const calls: string[] = [];
  const query = mock(async (sql: string) => {
    calls.push(sql);
    if (queryImpl) {
      return queryImpl(sql);
    }
    return { rows: [], rowCount: 0 };
  });

  return {
    calls,
    query,
    release: mock(() => {}),
  };
}

mock.module('pg', () => ({
  Pool: class MockPool {
    constructor(config: Record<string, unknown>) {
      state.poolConfigs.push(config);
    }

    async connect() {
      if (!state.client) {
        throw new Error('Mock client not configured');
      }
      return state.client;
    }
  },
}));

const db = await import('../../src/db?unitDb');

describe('db connection helper', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://openclaw:changeme@localhost:5432/openclaw';
    state.poolConfigs = [];
    state.client = null;
  });

  test('initializes the pool and commits successful work', async () => {
    const client = makeClient();
    state.client = client;

    db.initPool();

    const result = await db.withConn(async (conn) => {
      await conn.query('SELECT 1');
      return 'ok';
    });

    expect(state.poolConfigs).toEqual([
      {
        connectionString: 'postgres://openclaw:changeme@localhost:5432/openclaw',
        min: 2,
        max: 10,
        ssl: { rejectUnauthorized: true },
      },
    ]);
    expect(client.calls).toEqual(['BEGIN', 'SELECT 1', 'COMMIT']);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(result).toBe('ok');
  });

  test('rolls back and rethrows when the transaction body fails', async () => {
    const client = makeClient();
    state.client = client;

    db.initPool();

    await expect(
      db.withConn(async () => {
        throw new Error('query failed');
      }),
    ).rejects.toThrow('query failed');

    expect(client.calls).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('releases the client even when COMMIT fails', async () => {
    const client = makeClient(async (sql) => {
      if (sql === 'COMMIT') {
        throw new Error('commit failed');
      }
      return { rows: [], rowCount: 0 };
    });
    state.client = client;

    db.initPool();

    await expect(db.withConn(async () => 'ok')).rejects.toThrow('commit failed');

    expect(client.calls).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
