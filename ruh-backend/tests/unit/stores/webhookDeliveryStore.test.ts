/**
 * Unit tests for src/webhookDeliveryStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as webhookStore from '../../../src/webhookDeliveryStore';

// ─────────────────────────────────────────────────────────────────────────────

const DELIVERY_INPUT = {
  publicId: 'pub-123',
  deliveryId: 'del-456',
  agentId: 'agent-789',
  triggerId: 'trigger-abc',
};

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── reserveWebhookDelivery ───────────────────────────────────────────────────

describe('webhookStore.reserveWebhookDelivery', () => {
  test('first deletes expired records', async () => {
    // INSERT succeeds (new delivery)
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE')) return { rows: [], rowCount: 3 };
      if (sql.includes('INSERT')) return { rows: [{ status: 'pending' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await webhookStore.reserveWebhookDelivery(DELIVERY_INPUT);
    const firstSql = mockQuery.mock.calls[0][0] as string;
    expect(firstSql).toContain('DELETE FROM webhook_delivery_dedupes');
    expect(firstSql).toContain('7 days');
  });

  test('returns reserved=true on successful INSERT', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT')) return { rows: [{ status: 'pending' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await webhookStore.reserveWebhookDelivery(DELIVERY_INPUT);
    expect(result.reserved).toBe(true);
    expect(result.existingStatus).toBeNull();
  });

  test('returns reserved=false with existingStatus on conflict', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT')) return { rows: [], rowCount: 0 }; // DO NOTHING
      if (sql.includes('SELECT')) return { rows: [{ status: 'pending' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await webhookStore.reserveWebhookDelivery(DELIVERY_INPUT);
    expect(result.reserved).toBe(false);
    expect(result.existingStatus).toBe('pending');
  });

  test('returns existingStatus=delivered when already delivered', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT')) return { rows: [{ status: 'delivered' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await webhookStore.reserveWebhookDelivery(DELIVERY_INPUT);
    expect(result.reserved).toBe(false);
    expect(result.existingStatus).toBe('delivered');
  });

  test('returns existingStatus=failed when previously failed', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT')) return { rows: [{ status: 'failed' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await webhookStore.reserveWebhookDelivery(DELIVERY_INPUT);
    expect(result.reserved).toBe(false);
    expect(result.existingStatus).toBe('failed');
  });

  test('returns null existingStatus for unknown status value', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT')) return { rows: [{ status: 'unknown_status' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await webhookStore.reserveWebhookDelivery(DELIVERY_INPUT);
    expect(result.reserved).toBe(false);
    expect(result.existingStatus).toBeNull();
  });
});

// ── markWebhookDeliveryStatus ────────────────────────────────────────────────

describe('webhookStore.markWebhookDeliveryStatus', () => {
  test('executes UPDATE with correct params for delivered', async () => {
    await webhookStore.markWebhookDeliveryStatus('pub-123', 'del-456', 'delivered');
    const sql = mockQuery.mock.calls[0][0] as string;
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(sql).toContain('UPDATE webhook_delivery_dedupes');
    expect(params[0]).toBe('pub-123');
    expect(params[1]).toBe('del-456');
    expect(params[2]).toBe('delivered');
  });

  test('marks status as failed', async () => {
    await webhookStore.markWebhookDeliveryStatus('pub-123', 'del-456', 'failed');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe('failed');
  });
});
