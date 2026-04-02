/**
 * Integration tests for webhook delivery dedup — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as webhookStore from '../../../src/webhookDeliveryStore';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

const BASE_INPUT = {
  publicId: 'pub-test-123',
  deliveryId: 'del-test-456',
  agentId: 'agent-test-789',
  triggerId: 'trigger-test-abc',
};

describe('Webhook Delivery CRUD (integration)', () => {
  test('reserve new delivery returns reserved=true', async () => {
    const result = await webhookStore.reserveWebhookDelivery(BASE_INPUT);
    expect(result.reserved).toBe(true);
    expect(result.existingStatus).toBeNull();
  });

  test('re-reserve same delivery returns reserved=false with pending status', async () => {
    await webhookStore.reserveWebhookDelivery(BASE_INPUT);

    const second = await webhookStore.reserveWebhookDelivery(BASE_INPUT);
    expect(second.reserved).toBe(false);
    expect(second.existingStatus).toBe('pending');
  });

  test('mark as delivered, re-reserve returns delivered status', async () => {
    await webhookStore.reserveWebhookDelivery(BASE_INPUT);
    await webhookStore.markWebhookDeliveryStatus('pub-test-123', 'del-test-456', 'delivered');

    const result = await webhookStore.reserveWebhookDelivery(BASE_INPUT);
    expect(result.reserved).toBe(false);
    expect(result.existingStatus).toBe('delivered');
  });

  test('mark as failed updates status', async () => {
    await webhookStore.reserveWebhookDelivery(BASE_INPUT);
    await webhookStore.markWebhookDeliveryStatus('pub-test-123', 'del-test-456', 'failed');

    const result = await webhookStore.reserveWebhookDelivery(BASE_INPUT);
    expect(result.reserved).toBe(false);
    expect(result.existingStatus).toBe('failed');
  });

  test('different delivery IDs are independently reservable', async () => {
    const result1 = await webhookStore.reserveWebhookDelivery(BASE_INPUT);
    expect(result1.reserved).toBe(true);

    const result2 = await webhookStore.reserveWebhookDelivery({
      ...BASE_INPUT,
      deliveryId: 'del-different',
    });
    expect(result2.reserved).toBe(true);
  });

  test('different public IDs are independently reservable', async () => {
    const result1 = await webhookStore.reserveWebhookDelivery(BASE_INPUT);
    expect(result1.reserved).toBe(true);

    const result2 = await webhookStore.reserveWebhookDelivery({
      ...BASE_INPUT,
      publicId: 'pub-different',
    });
    expect(result2.reserved).toBe(true);
  });
});
