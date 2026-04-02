/**
 * Integration tests for audit event store — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as auditStore from '../../../src/auditStore';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

const BASE_EVENT: auditStore.WriteAuditEventInput = {
  action_type: 'user.login',
  target_type: 'user',
  target_id: 'user-123',
  outcome: 'success',
  actor_type: 'user',
  actor_id: 'user-123',
};

describe('Audit Event CRUD (integration)', () => {
  test('write and list audit event', async () => {
    await auditStore.writeAuditEvent(BASE_EVENT);
    const result = await auditStore.listAuditEvents();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].action_type).toBe('user.login');
    expect(result.items[0].target_id).toBe('user-123');
    expect(result.items[0].outcome).toBe('success');
    expect(result.has_more).toBe(false);
  });

  test('filters by action_type', async () => {
    await auditStore.writeAuditEvent(BASE_EVENT);
    await auditStore.writeAuditEvent({ ...BASE_EVENT, action_type: 'user.logout' });

    const result = await auditStore.listAuditEvents({ action_type: 'user.logout' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].action_type).toBe('user.logout');
  });

  test('filters by actor_id', async () => {
    await auditStore.writeAuditEvent(BASE_EVENT);
    await auditStore.writeAuditEvent({ ...BASE_EVENT, actor_id: 'user-456' });

    const result = await auditStore.listAuditEvents({ actor_id: 'user-456' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].actor_id).toBe('user-456');
  });

  test('filters by outcome', async () => {
    await auditStore.writeAuditEvent(BASE_EVENT);
    await auditStore.writeAuditEvent({ ...BASE_EVENT, outcome: 'failure' });

    const result = await auditStore.listAuditEvents({ outcome: 'failure' });
    expect(result.items).toHaveLength(1);
  });

  test('has_more flag with pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await auditStore.writeAuditEvent({ ...BASE_EVENT, target_id: `user-${i}` });
    }

    const result = await auditStore.listAuditEvents({ limit: 3 });
    expect(result.items).toHaveLength(3);
    expect(result.has_more).toBe(true);
  });

  test('details are stored and sanitized', async () => {
    await auditStore.writeAuditEvent({
      ...BASE_EVENT,
      details: {
        ip: '127.0.0.1',
        user_agent: 'Chrome/120',
        api_key: 'should-be-stripped',
        secret_token: 'also-stripped',
      },
    });

    const result = await auditStore.listAuditEvents();
    const details = result.items[0].details;
    expect(details.ip).toBe('127.0.0.1');
    expect(details.user_agent).toBe('Chrome/120');
    expect(details.api_key).toBeUndefined();
    expect(details.secret_token).toBeUndefined();
  });

  test('request_id and origin are optional', async () => {
    await auditStore.writeAuditEvent({
      ...BASE_EVENT,
      request_id: 'req-abc',
      origin: 'admin-ui',
    });

    const result = await auditStore.listAuditEvents();
    expect(result.items[0].request_id).toBe('req-abc');
    expect(result.items[0].origin).toBe('admin-ui');
  });

  test('events ordered by occurred_at DESC', async () => {
    await auditStore.writeAuditEvent({ ...BASE_EVENT, target_id: 'first' });
    await auditStore.writeAuditEvent({ ...BASE_EVENT, target_id: 'second' });

    const result = await auditStore.listAuditEvents();
    // Most recent first
    expect(result.items[0].target_id).toBe('second');
    expect(result.items[1].target_id).toBe('first');
  });
});
