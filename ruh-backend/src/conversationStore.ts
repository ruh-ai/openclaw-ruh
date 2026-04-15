/**
 * PostgreSQL-backed conversation store.
 *
 * Tables:
 *   conversations — metadata (id, sandbox_id, name, model, session_key, timestamps, message_count)
 *   messages      — individual messages (conversation_id FK, role, content, ordered by id)
 *
 * @kb: 007-conversation-store 005-data-models
 */

import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface ConversationRecord {
  id: string;
  sandbox_id: string;
  name: string;
  model: string;
  openclaw_session_key: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface MessageRecord {
  id?: number;
  role: string;
  content: string;
  workspace_state?: unknown;
  created_at?: string;
}

export interface ConversationPage {
  items: ConversationRecord[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface MessagePage {
  messages: MessageRecord[];
  next_cursor: number | null;
  has_more: boolean;
}

export async function createConversation(
  sandboxId: string,
  model = 'openclaw-default',
  name = 'New Conversation',
): Promise<ConversationRecord> {
  const convId = uuidv4();
  const sessionKey = `agent:main:${convId}`;
  await withConn(async (client) => {
    await client.query(
      `INSERT INTO conversations (id, sandbox_id, name, model, openclaw_session_key)
       VALUES ($1, $2, $3, $4, $5)`,
      [convId, sandboxId, name, model, sessionKey],
    );
  });
  const conv = await getConversation(convId);
  if (!conv) throw new Error('Failed to create conversation');
  return conv;
}

export async function listConversations(sandboxId: string): Promise<ConversationRecord[]> {
  return withConn(async (client) => {
    const res = await client.query(
      `SELECT * FROM conversations WHERE sandbox_id = $1 ORDER BY updated_at DESC`,
      [sandboxId],
    );
    return res.rows.map(serializeConv);
  });
}

export async function listConversationsPage(
  sandboxId: string,
  options: { limit: number; cursor?: string | null },
): Promise<ConversationPage> {
  const queryLimit = options.limit + 1;
  const cursor = options.cursor ? decodeConversationCursor(options.cursor) : null;

  return withConn(async (client) => {
    const res = cursor
      ? await client.query(
        `SELECT *
           FROM conversations
          WHERE sandbox_id = $1
            AND (
              updated_at < $2::timestamptz
              OR (updated_at = $2::timestamptz AND id < $3)
            )
          ORDER BY updated_at DESC, id DESC
          LIMIT $4`,
        [sandboxId, cursor.updatedAt, cursor.id, queryLimit],
      )
      : await client.query(
        `SELECT *
           FROM conversations
          WHERE sandbox_id = $1
          ORDER BY updated_at DESC, id DESC
          LIMIT $2`,
        [sandboxId, queryLimit],
      );

    const hasMore = res.rows.length > options.limit;
    const rows = (hasMore ? res.rows.slice(0, options.limit) : res.rows).map(serializeConv);
    const last = rows[rows.length - 1];

    return {
      items: rows,
      next_cursor: hasMore && last ? encodeConversationCursor(last.updated_at, last.id) : null,
      has_more: hasMore,
    };
  });
}

export async function getConversation(convId: string): Promise<ConversationRecord | null> {
  return withConn(async (client) => {
    const res = await client.query(
      'SELECT * FROM conversations WHERE id = $1',
      [convId],
    );
    return res.rows.length > 0 ? serializeConv(res.rows[0]) : null;
  });
}

export async function getConversationForSandbox(
  convId: string,
  sandboxId: string,
): Promise<ConversationRecord | null> {
  const conversation = await getConversation(convId);
  if (!conversation || conversation.sandbox_id !== sandboxId) {
    return null;
  }
  return conversation;
}

export async function getMessages(convId: string): Promise<MessageRecord[]> {
  return withConn(async (client) => {
    const res = await client.query(
      `SELECT role, content, workspace_state FROM messages WHERE conversation_id = $1 ORDER BY id`,
      [convId],
    );
    return res.rows.map(serializeMessage);
  });
}

export async function getMessagesPage(
  convId: string,
  options: { limit: number; before?: number | null },
): Promise<MessagePage> {
  const queryLimit = options.limit + 1;

  return withConn(async (client) => {
    const res = options.before != null
      ? await client.query(
        `SELECT id, role, content, created_at
                , workspace_state
           FROM messages
          WHERE conversation_id = $1 AND id < $2
          ORDER BY id DESC
          LIMIT $3`,
        [convId, options.before, queryLimit],
      )
      : await client.query(
        `SELECT id, role, content, created_at
                , workspace_state
           FROM messages
          WHERE conversation_id = $1
          ORDER BY id DESC
          LIMIT $2`,
        [convId, queryLimit],
      );

    const hasMore = res.rows.length > options.limit;
    const rows = (hasMore ? res.rows.slice(0, options.limit) : res.rows)
      .map(serializeMessage)
      .reverse();
    const first = rows[0];

    return {
      messages: rows,
      next_cursor: hasMore && first?.id != null ? first.id : null,
      has_more: hasMore,
    };
  });
}

export async function appendMessages(
  convId: string,
  messages: Array<{ role: string; content?: string; workspace_state?: unknown }>,
): Promise<boolean> {
  await withConn(async (client) => {
    for (const msg of messages) {
      if (msg.workspace_state !== undefined) {
        await client.query(
          `INSERT INTO messages (conversation_id, role, content, workspace_state) VALUES ($1, $2, $3, $4::jsonb)`,
          [convId, msg.role, msg.content ?? '', msg.workspace_state],
        );
      } else {
        await client.query(
          `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
          [convId, msg.role, msg.content ?? ''],
        );
      }
    }
    await client.query(
      `UPDATE conversations SET message_count = message_count + $1, updated_at = NOW() WHERE id = $2`,
      [messages.length, convId],
    );
  });
  return true;
}

export async function renameConversation(convId: string, name: string): Promise<boolean> {
  return withConn(async (client) => {
    const res = await client.query(
      `UPDATE conversations SET name = $1, updated_at = NOW() WHERE id = $2`,
      [name, convId],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

export async function deleteConversation(convId: string): Promise<boolean> {
  return withConn(async (client) => {
    // messages are deleted via ON DELETE CASCADE
    const res = await client.query(
      'DELETE FROM conversations WHERE id = $1',
      [convId],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

function serializeConv(row: Record<string, unknown>): ConversationRecord {
  for (const key of ['created_at', 'updated_at']) {
    if (row[key] instanceof Date) {
      row[key] = (row[key] as Date).toISOString();
    }
  }
  return row as unknown as ConversationRecord;
}

function serializeMessage(row: Record<string, unknown>): MessageRecord {
  if (row.created_at instanceof Date) {
    row.created_at = row.created_at.toISOString();
  }
  return row as unknown as MessageRecord;
}

function encodeConversationCursor(updatedAt: string, id: string): string {
  return `${updatedAt}|${id}`;
}

function decodeConversationCursor(cursor: string): { updatedAt: string; id: string } {
  const [updatedAt, id] = cursor.split('|');
  if (!updatedAt || !id) {
    throw new Error('Invalid conversation cursor');
  }

  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid conversation cursor');
  }

  return { updatedAt: date.toISOString(), id };
}
