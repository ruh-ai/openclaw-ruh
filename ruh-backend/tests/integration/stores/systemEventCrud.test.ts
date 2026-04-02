/**
 * Integration tests for system event store — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as systemEventStore from '../../../src/systemEventStore';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

const BASE_EVENT: systemEventStore.WriteSystemEventInput = {
  level: 'info',
  category: 'sandbox',
  action: 'sandbox.create',
  status: 'success',
  message: 'Sandbox created successfully',
  source: 'backend',
};

describe('System Event CRUD (integration)', () => {
  test('write and list system event', async () => {
    await systemEventStore.writeSystemEvent(BASE_EVENT);
    const result = await systemEventStore.listSystemEvents();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].level).toBe('info');
    expect(result.items[0].category).toBe('sandbox');
    expect(result.items[0].action).toBe('sandbox.create');
    expect(result.items[0].message).toBe('Sandbox created successfully');
    expect(result.has_more).toBe(false);
  });

  test('filters by level', async () => {
    await systemEventStore.writeSystemEvent(BASE_EVENT);
    await systemEventStore.writeSystemEvent({ ...BASE_EVENT, level: 'error', message: 'Failed' });

    const result = await systemEventStore.listSystemEvents({ level: 'error' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].message).toBe('Failed');
  });

  test('filters by category', async () => {
    await systemEventStore.writeSystemEvent(BASE_EVENT);
    await systemEventStore.writeSystemEvent({ ...BASE_EVENT, category: 'auth' });

    const result = await systemEventStore.listSystemEvents({ category: 'auth' });
    expect(result.items).toHaveLength(1);
  });

  test('filters by sandbox_id', async () => {
    await systemEventStore.writeSystemEvent({ ...BASE_EVENT, sandbox_id: 'sb-001' });
    await systemEventStore.writeSystemEvent({ ...BASE_EVENT, sandbox_id: 'sb-002' });

    const result = await systemEventStore.listSystemEvents({ sandbox_id: 'sb-001' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sandbox_id).toBe('sb-001');
  });

  test('filters by agent_id', async () => {
    await systemEventStore.writeSystemEvent({ ...BASE_EVENT, agent_id: 'agent-A' });
    await systemEventStore.writeSystemEvent(BASE_EVENT);

    const result = await systemEventStore.listSystemEvents({ agent_id: 'agent-A' });
    expect(result.items).toHaveLength(1);
  });

  test('has_more flag with pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await systemEventStore.writeSystemEvent({ ...BASE_EVENT, message: `Event ${i}` });
    }

    const result = await systemEventStore.listSystemEvents({ limit: 3 });
    expect(result.items).toHaveLength(3);
    expect(result.has_more).toBe(true);
  });

  test('sensitive keys stripped from details', async () => {
    await systemEventStore.writeSystemEvent({
      ...BASE_EVENT,
      details: {
        user: 'test',
        api_key: 'secret-value',
        authorization: 'Bearer xxx',
        soul: 'should-be-stripped',
        prompt: 'also-stripped',
        normal_field: 'kept',
      },
    });

    const result = await systemEventStore.listSystemEvents();
    const details = result.items[0].details;
    expect(details.user).toBe('test');
    expect(details.normal_field).toBe('kept');
    expect(details.api_key).toBeUndefined();
    expect(details.authorization).toBeUndefined();
    expect(details.soul).toBeUndefined();
    expect(details.prompt).toBeUndefined();
  });

  test('long messages are truncated', async () => {
    const longMessage = 'x'.repeat(600);
    await systemEventStore.writeSystemEvent({ ...BASE_EVENT, message: longMessage });

    const result = await systemEventStore.listSystemEvents();
    expect(result.items[0].message.length).toBeLessThanOrEqual(500);
    expect(result.items[0].message.endsWith('...')).toBe(true);
  });

  test('contextual IDs are stored', async () => {
    await systemEventStore.writeSystemEvent({
      ...BASE_EVENT,
      request_id: 'req-123',
      trace_id: 'trace-456',
      span_id: 'span-789',
      sandbox_id: 'sb-001',
      agent_id: 'agent-002',
      conversation_id: 'conv-003',
    });

    const result = await systemEventStore.listSystemEvents();
    const evt = result.items[0];
    expect(evt.request_id).toBe('req-123');
    expect(evt.trace_id).toBe('trace-456');
    expect(evt.span_id).toBe('span-789');
    expect(evt.sandbox_id).toBe('sb-001');
    expect(evt.agent_id).toBe('agent-002');
    expect(evt.conversation_id).toBe('conv-003');
  });
});
