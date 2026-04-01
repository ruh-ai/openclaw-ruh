import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as systemEventStore from '../../src/systemEventStore';

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('systemEventStore.writeSystemEvent', () => {
  test('redacts secret-bearing detail fields and truncates long strings before persisting', async () => {
    await systemEventStore.writeSystemEvent({
      level: 'error',
      category: 'sandbox.lifecycle',
      action: 'sandbox.create.failed',
      status: 'failure',
      message: 'Sandbox create failed because bootstrap verification returned a secret-bearing payload',
      source: 'ruh-backend:app',
      details: {
        provider: 'openai',
        apiKey: 'sk-secret-value',
        preview_token: 'preview-secret',
        nested: {
          botToken: 'bot-secret',
          safe: 'keep-me',
          longOutput: 'x'.repeat(600),
        },
      },
    });

    const insertCall = mockQuery.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO system_events'),
    );

    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] as unknown[];
    const details = params[13] as Record<string, unknown>;

    expect(details['provider']).toBe('openai');
    expect(details['apiKey']).toBeUndefined();
    expect(details['preview_token']).toBeUndefined();
    expect((details['nested'] as Record<string, unknown>)['botToken']).toBeUndefined();
    expect((details['nested'] as Record<string, unknown>)['safe']).toBe('keep-me');
    expect(String((details['nested'] as Record<string, unknown>)['longOutput']).length).toBeLessThanOrEqual(500);
  });
});

describe('systemEventStore.listSystemEvents', () => {
  test('returns serialized rows for the agent-readable event query surface', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (!sql.includes('SELECT')) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [{
          event_id: 'evt-1',
          occurred_at: new Date('2026-03-28T12:00:00Z'),
          level: 'info',
          category: 'sandbox.lifecycle',
          action: 'sandbox.create.succeeded',
          status: 'success',
          message: 'Sandbox created successfully',
          request_id: 'req-1',
          trace_id: 'trace-1',
          span_id: 'span-1',
          sandbox_id: 'sb-123',
          agent_id: null,
          conversation_id: null,
          source: 'ruh-backend:app',
          details: { sandbox_name: 'Test Sandbox' },
        }],
        rowCount: 1,
      };
    });

    const result = await systemEventStore.listSystemEvents({
      category: 'sandbox.lifecycle',
      sandbox_id: 'sb-123',
      request_id: 'req-1',
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.event_id).toBe('evt-1');
    expect(result.items[0]?.category).toBe('sandbox.lifecycle');
    expect(result.items[0]?.sandbox_id).toBe('sb-123');
    expect(typeof result.items[0]?.occurred_at).toBe('string');
  });
});
