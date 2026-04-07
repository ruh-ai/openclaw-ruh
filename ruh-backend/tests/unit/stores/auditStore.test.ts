import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { mockQuery, mockClient } from '../../helpers/mockDb';

import * as auditStore from '../../../src/auditStore';

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('auditStore.writeAuditEvent', () => {
  test('redacts secret-bearing detail fields before persisting', async () => {
    await auditStore.writeAuditEvent({
      action_type: 'sandbox.reconfigure_llm',
      target_type: 'sandbox',
      target_id: 'sb-123',
      outcome: 'success',
      actor_type: 'anonymous',
      actor_id: 'anonymous',
      details: {
        provider: 'openai',
        apiKey: 'sk-secret-value',
        preview_token: 'preview-secret',
        nested: {
          botToken: 'bot-secret',
          safe: 'keep-me',
        },
      },
    });

    const insertCall = mockQuery.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO control_plane_audit_events'),
    );

    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] as unknown[];
    const details = params[9] as Record<string, unknown>;
    expect(details['provider']).toBe('openai');
    expect(details['apiKey']).toBeUndefined();
    expect(details['preview_token']).toBeUndefined();
    expect((details['nested'] as Record<string, unknown>)['botToken']).toBeUndefined();
    expect((details['nested'] as Record<string, unknown>)['safe']).toBe('keep-me');
  });
});

describe('auditStore.listAuditEvents', () => {
  test('returns serialized rows for the admin query surface', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (!sql.includes('SELECT')) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [{
          event_id: 'evt-1',
          occurred_at: new Date('2026-03-25T12:00:00Z'),
          request_id: 'req-1',
          action_type: 'sandbox.delete',
          target_type: 'sandbox',
          target_id: 'sb-123',
          outcome: 'success',
          actor_type: 'anonymous',
          actor_id: 'anonymous',
          origin: 'iphash:1234',
          details: { deleted: true },
        }],
        rowCount: 1,
      };
    });

    const result = await auditStore.listAuditEvents({ action_type: 'sandbox.delete', limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.event_id).toBe('evt-1');
    expect(typeof result.items[0]?.occurred_at).toBe('string');
  });
});
