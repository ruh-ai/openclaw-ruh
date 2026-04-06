/**
 * Integration tests for conversation + message CRUD — requires real PostgreSQL.
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import { setupTestDb, truncateAll, teardownTestDb } from '../../helpers/db';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

const SANDBOX_ID = 'sb-conv-int-001';

async function getStore() {
  return import('../../../src/store');
}

async function getConvStore() {
  return import('../../../src/conversationStore');
}

async function ensureSandbox() {
  const store = await getStore();
  await store.saveSandbox({
    sandbox_id: SANDBOX_ID,
    sandbox_state: 'started',
    gateway_port: 18789,
    ssh_command: '',
    dashboard_url: null,
    signed_url: null,
    standard_url: null,
    preview_token: null,
    gateway_token: null,
  }, 'test-sandbox');
}

describe('conversation CRUD (real DB)', () => {
  test('createConversation creates and returns a record', async () => {
    await ensureSandbox();
    const convStore = await getConvStore();

    const conv = await convStore.createConversation(SANDBOX_ID, 'openclaw-default', 'My Conversation');
    expect(conv.id).toBeTruthy();
    expect(conv.sandbox_id).toBe(SANDBOX_ID);
    expect(conv.name).toBe('My Conversation');
    expect(conv.model).toBe('openclaw-default');
    expect(conv.openclaw_session_key).toBe(`agent:main:${conv.id}`);
    expect(conv.message_count).toBe(0);
  });

  test('listConversations returns conversations for sandbox', async () => {
    await ensureSandbox();
    const convStore = await getConvStore();

    await convStore.createConversation(SANDBOX_ID, 'openclaw-default', 'Conv 1');
    await convStore.createConversation(SANDBOX_ID, 'openclaw-default', 'Conv 2');

    const list = await convStore.listConversations(SANDBOX_ID);
    expect(list.length).toBe(2);
    const names = list.map((c) => c.name);
    expect(names).toContain('Conv 1');
    expect(names).toContain('Conv 2');
  });

  test('listConversations returns empty for unknown sandbox', async () => {
    const convStore = await getConvStore();
    const list = await convStore.listConversations('nonexistent-sb');
    expect(list).toEqual([]);
  });

  test('getConversation returns null for unknown id', async () => {
    const convStore = await getConvStore();
    const result = await convStore.getConversation('nonexistent-id');
    expect(result).toBeNull();
  });

  test('appendMessages and getMessages round-trip', async () => {
    await ensureSandbox();
    const convStore = await getConvStore();

    const conv = await convStore.createConversation(SANDBOX_ID);
    await convStore.appendMessages(conv.id, [
      { role: 'user', content: 'Hello, world!' },
      { role: 'assistant', content: 'Hi there!' },
    ]);

    const messages = await convStore.getMessages(conv.id);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello, world!');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('Hi there!');
  });

  test('appendMessages increments message_count', async () => {
    await ensureSandbox();
    const convStore = await getConvStore();

    const conv = await convStore.createConversation(SANDBOX_ID);
    await convStore.appendMessages(conv.id, [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'msg2' },
    ]);

    const updated = await convStore.getConversation(conv.id);
    expect(updated!.message_count).toBe(2);
  });

  test('renameConversation updates the name', async () => {
    await ensureSandbox();
    const convStore = await getConvStore();

    const conv = await convStore.createConversation(SANDBOX_ID, 'openclaw-default', 'Original');
    const result = await convStore.renameConversation(conv.id, 'Renamed');
    expect(result).toBe(true);

    const updated = await convStore.getConversation(conv.id);
    expect(updated!.name).toBe('Renamed');
  });

  test('renameConversation returns false for unknown id', async () => {
    const convStore = await getConvStore();
    const result = await convStore.renameConversation('nonexistent', 'New Name');
    expect(result).toBe(false);
  });

  test('deleteConversation removes conversation and cascades messages', async () => {
    await ensureSandbox();
    const convStore = await getConvStore();

    const conv = await convStore.createConversation(SANDBOX_ID);
    await convStore.appendMessages(conv.id, [{ role: 'user', content: 'test' }]);

    const deleted = await convStore.deleteConversation(conv.id);
    expect(deleted).toBe(true);

    const retrieved = await convStore.getConversation(conv.id);
    expect(retrieved).toBeNull();

    // Messages should also be gone (cascade)
    const messages = await convStore.getMessages(conv.id);
    expect(messages).toEqual([]);
  });

  test('deleteConversation returns false for unknown id', async () => {
    const convStore = await getConvStore();
    const result = await convStore.deleteConversation('nonexistent');
    expect(result).toBe(false);
  });

  test('conversations have ISO string timestamps', async () => {
    await ensureSandbox();
    const convStore = await getConvStore();

    const conv = await convStore.createConversation(SANDBOX_ID);
    expect(typeof conv.created_at).toBe('string');
    expect(typeof conv.updated_at).toBe('string');
    // Validate ISO 8601 format
    expect(new Date(conv.created_at).toISOString()).toBeTruthy();
  });
});
