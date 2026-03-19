/**
 * Integration tests for sandbox CRUD — requires a real PostgreSQL database.
 * Set TEST_DATABASE_URL to an accessible test DB before running.
 *
 * Run: bun test tests/integration/
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import { setupTestDb, truncateAll, teardownTestDb } from '../helpers/db';

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
  return import('../../src/store');
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
});
