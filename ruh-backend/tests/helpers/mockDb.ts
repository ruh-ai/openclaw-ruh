/**
 * Shared mock for src/db — used by all unit tests that need to mock withConn.
 *
 * bun's mock.module() is process-global: the first call for a given resolved
 * module path wins and all subsequent calls are silently ignored.  When many
 * test files each declare their own mockQuery + mock.module('src/db', …), only
 * one file's mockQuery is wired up; the rest never receive calls and assertions
 * fail.
 *
 * This helper solves the problem by being the ONE place that calls
 * mock.module('src/db', …).  Every test file imports `mockQuery` from here
 * and resets it in beforeEach.
 */

import { mock } from 'bun:test';

export const mockQuery = mock(
  async (_sql: string, _params?: unknown[]) => ({ rows: [] as unknown[], rowCount: 0 }),
);

export const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));
