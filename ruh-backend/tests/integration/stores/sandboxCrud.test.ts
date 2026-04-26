/**
 * Integration tests for sandbox CRUD — requires a real PostgreSQL database.
 * Set TEST_DATABASE_URL to an accessible test DB before running.
 *
 * Run: bun test tests/integration/
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import { setupTestDb, truncateAll, teardownTestDb } from '../../helpers/db';

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

// ── Lazy module import so DB is initialised first ─────────────────────────────

async function getStore() {
  return import('../../../src/store');
}

async function getConversationStore() {
  return import('../../../src/conversationStore');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sandbox CRUD (real DB)', () => {
  test('saveSandbox persists a record and getSandbox retrieves it', async () => {
    const store = await getStore();

    const record = {
      sandbox_id: 'sb-int-001',
      sandbox_state: 'started',
      dashboard_url: 'https://dash.example.com',
      signed_url: null,
      standard_url: 'https://std.example.com',
      preview_token: null,
      gateway_token: 'gw-tok-abc',
      gateway_port: 18789,
      ssh_command: 'daytona ssh sb-int-001',
    };

    await store.saveSandbox(record, 'openclaw-gateway');

    const retrieved = await store.getSandbox('sb-int-001');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.sandbox_id).toBe('sb-int-001');
    expect(retrieved!.sandbox_name).toBe('openclaw-gateway');
    expect(retrieved!.gateway_token).toBe('gw-tok-abc');
    expect(retrieved!.approved).toBe(false);
  });

  test('saveSandbox persists shared Codex retrofit metadata', async () => {
    const store = await getStore();

    await store.saveSandbox({
      sandbox_id: 'sb-shared-codex',
      sandbox_state: 'running',
      dashboard_url: null,
      signed_url: null,
      standard_url: 'http://localhost:18789',
      preview_token: null,
      gateway_token: 'gw-shared-codex',
      gateway_port: 18789,
      ssh_command: 'docker exec -it openclaw-sb-shared-codex bash',
      shared_codex_enabled: true,
      shared_codex_model: 'openai-codex/gpt-5.5',
    }, 'shared-codex-sandbox');

    const retrieved = await store.getSandbox('sb-shared-codex');
    expect(retrieved).not.toBeNull();
    expect((retrieved as Record<string, unknown>).shared_codex_enabled).toBe(true);
    expect((retrieved as Record<string, unknown>).shared_codex_model).toBe('openai-codex/gpt-5.5');
  });

  test('listSandboxes returns all saved records ordered by created_at DESC', async () => {
    const store = await getStore();

    await store.saveSandbox({ sandbox_id: 'sb-a', sandbox_state: 'started', gateway_port: 18789, ssh_command: '', dashboard_url: null, signed_url: null, standard_url: null, preview_token: null, gateway_token: null }, 'sandbox-a');
    await store.saveSandbox({ sandbox_id: 'sb-b', sandbox_state: 'started', gateway_port: 18789, ssh_command: '', dashboard_url: null, signed_url: null, standard_url: null, preview_token: null, gateway_token: null }, 'sandbox-b');

    const list = await store.listSandboxes();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ids = list.map((s) => s.sandbox_id);
    expect(ids).toContain('sb-a');
    expect(ids).toContain('sb-b');
  });

  test('getSandbox returns null for unknown id', async () => {
    const store = await getStore();
    const result = await store.getSandbox('nonexistent-sb');
    expect(result).toBeNull();
  });

  test('markApproved sets approved=true', async () => {
    const store = await getStore();

    await store.saveSandbox({
      sandbox_id: 'sb-approve',
      sandbox_state: 'started',
      gateway_port: 18789,
      ssh_command: '',
      dashboard_url: null,
      signed_url: null,
      standard_url: null,
      preview_token: null,
      gateway_token: null,
    }, 'test');

    let sb = await store.getSandbox('sb-approve');
    expect(sb!.approved).toBe(false);

    await store.markApproved('sb-approve');

    sb = await store.getSandbox('sb-approve');
    expect(sb!.approved).toBe(true);
  });

  test('deleteSandbox removes the record and returns true', async () => {
    const store = await getStore();

    await store.saveSandbox({
      sandbox_id: 'sb-delete',
      sandbox_state: 'started',
      gateway_port: 18789,
      ssh_command: '',
      dashboard_url: null,
      signed_url: null,
      standard_url: null,
      preview_token: null,
      gateway_token: null,
    }, 'test');

    const deleted = await store.deleteSandbox('sb-delete');
    expect(deleted).toBe(true);

    const retrieved = await store.getSandbox('sb-delete');
    expect(retrieved).toBeNull();
  });

  test('deleteSandbox returns false for unknown id', async () => {
    const store = await getStore();
    const result = await store.deleteSandbox('nonexistent');
    expect(result).toBe(false);
  });

  test('deleteSandbox removes dependent conversations and cascaded messages', async () => {
    const store = await getStore();
    const conversationStore = await getConversationStore();

    await store.saveSandbox({
      sandbox_id: 'sb-delete-conversations',
      sandbox_state: 'started',
      gateway_port: 18789,
      ssh_command: '',
      dashboard_url: null,
      signed_url: null,
      standard_url: null,
      preview_token: null,
      gateway_token: null,
    }, 'delete-with-history');

    const conversation = await conversationStore.createConversation(
      'sb-delete-conversations',
      'openclaw-default',
      'History to purge',
    );
    await conversationStore.appendMessages(conversation.id, [
      { role: 'user', content: 'keep me only while sandbox exists' },
    ]);

    const deleted = await store.deleteSandbox('sb-delete-conversations');
    expect(deleted).toBe(true);

    const remainingConversation = await conversationStore.getConversation(conversation.id);
    expect(remainingConversation).toBeNull();

    const remainingMessages = await conversationStore.getMessages(conversation.id);
    expect(remainingMessages).toEqual([]);
  });

  test('saveSandbox upserts on duplicate sandbox_id', async () => {
    const store = await getStore();

    const base = {
      sandbox_id: 'sb-upsert',
      sandbox_state: 'starting',
      gateway_port: 18789,
      ssh_command: '',
      dashboard_url: null,
      signed_url: null,
      standard_url: null,
      preview_token: null,
      gateway_token: null,
    };

    await store.saveSandbox(base, 'original-name');
    await store.saveSandbox({ ...base, sandbox_state: 'started' }, 'updated-name');

    const result = await store.getSandbox('sb-upsert');
    expect(result!.sandbox_state).toBe('started');
    expect(result!.sandbox_name).toBe('updated-name');
  });

  test('updateSandboxSharedCodex marks an existing sandbox as shared Codex', async () => {
    const store = await getStore();

    await store.saveSandbox({
      sandbox_id: 'sb-retrofit',
      sandbox_state: 'running',
      gateway_port: 18789,
      ssh_command: '',
      dashboard_url: null,
      signed_url: null,
      standard_url: null,
      preview_token: null,
      gateway_token: null,
    }, 'retrofit-target');

    await (store as Record<string, unknown>).updateSandboxSharedCodex?.(
      'sb-retrofit',
      true,
      'openai-codex/gpt-5.5',
    );

    const retrieved = await store.getSandbox('sb-retrofit');
    expect((retrieved as Record<string, unknown>).shared_codex_enabled).toBe(true);
    expect((retrieved as Record<string, unknown>).shared_codex_model).toBe('openai-codex/gpt-5.5');
  });
});
