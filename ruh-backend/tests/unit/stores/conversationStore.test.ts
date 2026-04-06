/**
 * Unit tests for src/conversationStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as convStore from '../../../src/conversationStore';

// ─────────────────────────────────────────────────────────────────────────────

const SANDBOX_ID = 'sb-test';
const CONV_ID = 'conv-test-uuid';

function makeConvRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    sandbox_id: SANDBOX_ID,
    name: 'Test Conv',
    model: 'openclaw-default',
    openclaw_session_key: `agent:main:${CONV_ID}`,
    created_at: new Date(),
    updated_at: new Date(),
    message_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('conversationStore.createConversation', () => {
  test('inserts conversation and returns record', async () => {
    // First call: INSERT, second call: SELECT (via getConversation)
    let callCount = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      callCount++;
      if (sql.includes('SELECT')) {
        return { rows: [makeConvRow()], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const conv = await convStore.createConversation(SANDBOX_ID, 'openclaw-default', 'Test Conv');
    expect(conv.sandbox_id).toBe(SANDBOX_ID);
    expect(conv.name).toBe('Test Conv');
    expect(conv.openclaw_session_key).toMatch(/^agent:main:/);
  });

  test('INSERT includes correct columns', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [makeConvRow()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    await convStore.createConversation(SANDBOX_ID);
    const insertCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('INSERT INTO conversations'));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain(SANDBOX_ID);
  });
});

describe('conversationStore.listConversations', () => {
  test('returns empty array when none exist', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await convStore.listConversations(SANDBOX_ID);
    expect(result).toEqual([]);
  });

  test('returns serialized conversations', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeConvRow(), makeConvRow({ id: 'conv-2' })],
      rowCount: 2,
    }));
    const result = await convStore.listConversations(SANDBOX_ID);
    expect(result.length).toBe(2);
    expect(typeof result[0].created_at).toBe('string');
    expect(typeof result[0].updated_at).toBe('string');
  });
});

describe('conversationStore.listConversationsPage', () => {
  test('returns a bounded page plus pagination metadata', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeConvRow(), makeConvRow({ id: 'conv-2' }), makeConvRow({ id: 'conv-3' })],
      rowCount: 3,
    }));

    const result = await convStore.listConversationsPage(SANDBOX_ID, { limit: 2 });

    expect(result.items.length).toBe(2);
    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toContain('|');
  });

  test('applies a cursor filter when fetching older conversations', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeConvRow()],
      rowCount: 1,
    }));

    await convStore.listConversationsPage(SANDBOX_ID, {
      limit: 20,
      cursor: `${new Date('2026-03-25T10:00:00.000Z').toISOString()}|conv-9`,
    });

    const selectCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('FROM conversations'),
    );

    expect(selectCall).toBeDefined();
    expect(selectCall![0]).toContain('updated_at < $2::timestamptz');
    expect(selectCall![1]).toEqual([
      SANDBOX_ID,
      '2026-03-25T10:00:00.000Z',
      'conv-9',
      21,
    ]);
  });
});

describe('conversationStore.getConversation', () => {
  test('returns null when not found', async () => {
    const result = await convStore.getConversation('nonexistent');
    expect(result).toBeNull();
  });

  test('returns conversation when found', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeConvRow()],
      rowCount: 1,
    }));
    const result = await convStore.getConversation(CONV_ID);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(CONV_ID);
  });
});

describe('conversationStore.getConversationForSandbox', () => {
  test('returns null when the conversation belongs to a different sandbox', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeConvRow({ sandbox_id: 'sb-other' })],
      rowCount: 1,
    }));

    const result = await convStore.getConversationForSandbox(CONV_ID, SANDBOX_ID);
    expect(result).toBeNull();
  });

  test('returns the conversation when both conversation and sandbox ids match', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeConvRow()],
      rowCount: 1,
    }));

    const result = await convStore.getConversationForSandbox(CONV_ID, SANDBOX_ID);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(CONV_ID);
    expect(result!.sandbox_id).toBe(SANDBOX_ID);
  });
});

describe('conversationStore.getMessages', () => {
  test('returns empty array when no messages', async () => {
    const result = await convStore.getMessages(CONV_ID);
    expect(result).toEqual([]);
  });

  test('returns messages in order', async () => {
    const msgs = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    mockQuery.mockImplementation(async () => ({ rows: msgs, rowCount: 2 }));
    const result = await convStore.getMessages(CONV_ID);
    expect(result.length).toBe(2);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
  });

  test('returns persisted workspace_state when present', async () => {
    const workspaceState = {
      version: 1,
      browser: {
        items: [
          {
            id: 0,
            kind: 'navigation',
            label: 'Example',
            url: 'https://example.com',
            timestamp: 1_711_111_111_000,
          },
        ],
        previewUrl: 'https://example.com',
        takeover: null,
      },
    };
    mockQuery.mockImplementation(async () => ({
      rows: [{ role: 'assistant', content: 'Hi there', workspace_state: workspaceState }],
      rowCount: 1,
    }));

    const result = await convStore.getMessages(CONV_ID);
    expect(result[0].workspace_state).toEqual(workspaceState);
  });
});

describe('conversationStore.getMessagesPage', () => {
  test('returns chronological messages plus older-page metadata', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [
        {
          id: 12,
          role: 'assistant',
          content: 'Newest',
          created_at: new Date('2026-03-25T10:02:00.000Z').toISOString(),
          workspace_state: { version: 1, browser: { items: [], previewUrl: 'https://example.com', takeover: null } },
        },
        { id: 11, role: 'assistant', content: 'Newest', created_at: new Date('2026-03-25T10:01:00.000Z').toISOString() },
        { id: 10, role: 'user', content: 'Older', created_at: new Date('2026-03-25T10:00:00.000Z').toISOString() },
      ],
      rowCount: 3,
    }));

    const result = await convStore.getMessagesPage(CONV_ID, { limit: 2 });

    expect(result.messages.map((message) => message.id)).toEqual([11, 12]);
    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toBe(11);
    expect(result.messages[1].workspace_state).toEqual({
      version: 1,
      browser: { items: [], previewUrl: 'https://example.com', takeover: null },
    });
  });

  test('uses the before cursor when fetching older transcript pages', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [],
      rowCount: 0,
    }));

    await convStore.getMessagesPage(CONV_ID, { limit: 50, before: 25 });

    const selectCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('FROM messages'),
    );

    expect(selectCall).toBeDefined();
    expect(selectCall![0]).toContain('conversation_id = $1 AND id < $2');
    expect(selectCall![1]).toEqual([CONV_ID, 25, 51]);
  });
});

describe('conversationStore.appendMessages', () => {
  test('inserts each message and updates count', async () => {
    await convStore.appendMessages(CONV_ID, [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'msg2' },
    ]);
    const sqls = mockQuery.mock.calls.map((c) => c[0] as string);
    const inserts = sqls.filter((s) => s.includes('INSERT INTO messages'));
    expect(inserts.length).toBe(2);
    const updateSql = sqls.find((s) => s.includes('UPDATE conversations'));
    expect(updateSql).toBeDefined();
    const updateCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('UPDATE conversations'));
    expect(updateCall![1]).toContain(2); // message_count increment
  });

  test('returns true', async () => {
    const result = await convStore.appendMessages(CONV_ID, [{ role: 'user', content: 'hi' }]);
    expect(result).toBe(true);
  });

  test('stores an empty string when a message omits content', async () => {
    await convStore.appendMessages(CONV_ID, [{ role: 'assistant' }]);

    const insertCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO messages'),
    );

    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([CONV_ID, 'assistant', '']);
  });

  test('stores workspace_state JSON when provided', async () => {
    const workspaceState = {
      version: 1,
      browser: {
        items: [],
        previewUrl: 'https://example.com',
        takeover: {
          status: 'requested',
          reason: 'Need operator login',
          actionLabel: 'Resume agent run',
          updatedAt: 1_711_111_111_000,
        },
      },
    };

    await convStore.appendMessages(CONV_ID, [
      { role: 'assistant', content: 'Stateful reply', workspace_state: workspaceState },
    ]);

    const insertCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO messages'),
    );

    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([CONV_ID, 'assistant', 'Stateful reply', workspaceState]);
  });
});

describe('conversationStore.renameConversation', () => {
  test('returns true when updated', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 1 }));
    const result = await convStore.renameConversation(CONV_ID, 'New Name');
    expect(result).toBe(true);
  });

  test('returns false when not found', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await convStore.renameConversation('nonexistent', 'Name');
    expect(result).toBe(false);
  });

  test('passes new name to UPDATE query', async () => {
    await convStore.renameConversation(CONV_ID, 'Renamed');
    const updateCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('UPDATE conversations SET name'));
    expect(updateCall![1]).toContain('Renamed');
  });
});

describe('conversationStore.deleteConversation', () => {
  test('returns true when deleted', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 1 }));
    const result = await convStore.deleteConversation(CONV_ID);
    expect(result).toBe(true);
  });

  test('returns false when not found', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await convStore.deleteConversation('nonexistent');
    expect(result).toBe(false);
  });

  test('executes DELETE FROM conversations', async () => {
    await convStore.deleteConversation(CONV_ID);
    const sqls = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('DELETE FROM conversations'))).toBe(true);
  });
});
