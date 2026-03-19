/**
 * PostgreSQL-backed conversation store.
 *
 * Tables:
 *   conversations — metadata (id, sandbox_id, name, model, session_key, timestamps, message_count)
 *   messages      — individual messages (conversation_id FK, role, content, ordered by id)
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
  role: string;
  content: string;
}

export async function initDb(): Promise<void> {
  await withConn(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id                   TEXT        PRIMARY KEY,
        sandbox_id           TEXT        NOT NULL,
        name                 TEXT        NOT NULL DEFAULT 'New Conversation',
        model                TEXT        NOT NULL DEFAULT 'openclaw-default',
        openclaw_session_key TEXT        NOT NULL,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        message_count        INTEGER     NOT NULL DEFAULT 0
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id              SERIAL      PRIMARY KEY,
        conversation_id TEXT        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT        NOT NULL,
        content         TEXT        NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conv_id
      ON messages (conversation_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_sandbox_id
      ON conversations (sandbox_id)
    `);
  });
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

export async function getConversation(convId: string): Promise<ConversationRecord | null> {
  return withConn(async (client) => {
    const res = await client.query(
      'SELECT * FROM conversations WHERE id = $1',
      [convId],
    );
    return res.rows.length > 0 ? serializeConv(res.rows[0]) : null;
  });
}

export async function getMessages(convId: string): Promise<MessageRecord[]> {
  return withConn(async (client) => {
    const res = await client.query(
      `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY id`,
      [convId],
    );
    return res.rows as MessageRecord[];
  });
}

export async function appendMessages(
  convId: string,
  messages: Array<{ role: string; content?: string }>,
): Promise<boolean> {
  await withConn(async (client) => {
    for (const msg of messages) {
      await client.query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
        [convId, msg.role, msg.content ?? ''],
      );
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
