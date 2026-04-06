import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (client: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

const webhookDeliveryStore = await import('../../src/webhookDeliveryStore?unitWebhookDeliveryStore');

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('webhookDeliveryStore.reserveWebhookDelivery', () => {
  test('returns reserved=true when the dedupe row is inserted', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }))
      .mockImplementationOnce(async () => ({ rows: [{ status: 'pending' }], rowCount: 1 }));

    const result = await webhookDeliveryStore.reserveWebhookDelivery({
      publicId: 'public-1',
      deliveryId: 'delivery-1',
      agentId: 'agent-1',
      triggerId: 'trigger-1',
    });

    expect(result).toEqual({ reserved: true, existingStatus: null });
    expect(String(mockQuery.mock.calls[0]?.[0])).toContain('DELETE FROM webhook_delivery_dedupes');
    expect(String(mockQuery.mock.calls[1]?.[0])).toContain('INSERT INTO webhook_delivery_dedupes');
  });

  test('returns the existing status when the delivery already exists', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }))
      .mockImplementationOnce(async () => ({ rows: [{ status: 'delivered' }], rowCount: 1 }));

    const result = await webhookDeliveryStore.reserveWebhookDelivery({
      publicId: 'public-1',
      deliveryId: 'delivery-1',
      agentId: 'agent-1',
      triggerId: 'trigger-1',
    });

    expect(result).toEqual({ reserved: false, existingStatus: 'delivered' });
  });

  test('normalizes unknown existing statuses to null', async () => {
    mockQuery
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }))
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }))
      .mockImplementationOnce(async () => ({ rows: [{ status: 'mystery' }], rowCount: 1 }));

    const result = await webhookDeliveryStore.reserveWebhookDelivery({
      publicId: 'public-1',
      deliveryId: 'delivery-1',
      agentId: 'agent-1',
      triggerId: 'trigger-1',
    });

    expect(result).toEqual({ reserved: false, existingStatus: null });
  });
});

describe('webhookDeliveryStore.markWebhookDeliveryStatus', () => {
  test('updates the stored delivery status', async () => {
    await webhookDeliveryStore.markWebhookDeliveryStatus('public-1', 'delivery-1', 'failed');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE webhook_delivery_dedupes'),
      ['public-1', 'delivery-1', 'failed'],
    );
  });
});
