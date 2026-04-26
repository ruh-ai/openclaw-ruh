/**
 * Unit tests for src/store.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────
// mock.module must be called before the module under test is loaded.

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as store from '../../../src/store';

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('store.saveSandbox', () => {
  test('calls INSERT ... ON CONFLICT with sandbox_id', async () => {
    const result = {
      sandbox_id: 'sb-001',
      sandbox_state: 'started',
      dashboard_url: 'https://dash.example.com',
      signed_url: null,
      standard_url: 'https://std.example.com',
      preview_token: null,
      gateway_token: 'gw-tok',
      gateway_port: 18789,
      ssh_command: 'daytona ssh sb-001',
    };
    await store.saveSandbox(result, 'my-sandbox');
    const sqls = mockQuery.mock.calls.map((c) => (c[0] as string).trim());
    expect(sqls.some((s) => s.includes('INSERT INTO sandboxes'))).toBe(true);
    const insertCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('INSERT INTO sandboxes'));
    expect(insertCall![1]).toContain('sb-001');
    expect(insertCall![1]).toContain('my-sandbox');
  });

  test('serializes shared-Codex metadata for sandbox upserts', async () => {
    const result = {
      sandbox_id: 'sb-shared',
      sandbox_name: 'shared-sandbox',
      sandbox_state: 'started',
      dashboard_url: null,
      signed_url: null,
      standard_url: 'https://std.example.com',
      preview_token: null,
      gateway_token: 'gw-tok',
      gateway_port: 18789,
      ssh_command: 'daytona ssh sb-shared',
      shared_codex_enabled: true,
      shared_codex_model: 'openai-codex/gpt-5.5',
    };

    await store.saveSandbox(result);

    const insertCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('INSERT INTO sandboxes'));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      'sb-shared',
      'shared-sandbox',
      'started',
      null,
      null,
      'https://std.example.com',
      null,
      'gw-tok',
      18789,
      null,
      'daytona ssh sb-shared',
      true,
      'openai-codex/gpt-5.5',
    ]);
  });
});

describe('store.markApproved', () => {
  test('runs UPDATE sandboxes SET approved = TRUE', async () => {
    await store.markApproved('sb-001');
    const sqls = mockQuery.mock.calls.map((c) => (c[0] as string).trim());
    expect(sqls.some((s) => s.includes('UPDATE sandboxes SET approved = TRUE'))).toBe(true);
    const updateCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('UPDATE sandboxes SET approved'));
    expect(updateCall![1]).toContain('sb-001');
  });
});

describe('store.updateSandboxSharedCodex', () => {
  test('updates shared-Codex metadata and normalizes empty sandbox_state to running', async () => {
    await store.updateSandboxSharedCodex('sb-001', true, 'openai-codex/gpt-5.5');

    const updateCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('UPDATE sandboxes'),
    );

    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain('shared_codex_enabled = $2');
    expect(updateCall![0]).toContain('shared_codex_model = $3');
    expect(updateCall![0]).toContain(
      "sandbox_state = COALESCE(NULLIF(sandbox_state, ''), 'running')",
    );
    expect(updateCall![1]).toEqual(['sb-001', true, 'openai-codex/gpt-5.5']);
  });
});

describe('store.listSandboxes', () => {
  test('returns empty array when no rows', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await store.listSandboxes();
    expect(result).toEqual([]);
  });

  test('returns serialized rows', async () => {
    const row = {
      sandbox_id: 'sb-001',
      sandbox_name: 'test',
      sandbox_state: 'started',
      dashboard_url: null,
      signed_url: null,
      standard_url: 'https://example.com',
      preview_token: null,
      gateway_token: null,
      gateway_port: 18789,
      ssh_command: '',
      created_at: new Date('2025-01-01T00:00:00Z'),
      approved: false,
    };
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [row], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const result = await store.listSandboxes();
    expect(result.length).toBe(1);
    expect(result[0].sandbox_id).toBe('sb-001');
    // Date should be serialized to ISO string
    expect(typeof result[0].created_at).toBe('string');
  });
});

describe('store.getSandbox', () => {
  test('returns null when not found', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await store.getSandbox('nonexistent');
    expect(result).toBeNull();
  });

  test('returns sandbox record when found', async () => {
    const row = {
      sandbox_id: 'sb-001',
      sandbox_name: 'test',
      sandbox_state: 'started',
      dashboard_url: null,
      signed_url: null,
      standard_url: null,
      preview_token: null,
      gateway_token: null,
      gateway_port: 18789,
      ssh_command: '',
      created_at: new Date(),
      approved: true,
    };
    mockQuery.mockImplementation(async () => ({ rows: [row], rowCount: 1 }));
    const result = await store.getSandbox('sb-001');
    expect(result).not.toBeNull();
    expect(result!.sandbox_id).toBe('sb-001');
    expect(result!.approved).toBe(true);
  });
});

describe('store.deleteSandbox', () => {
  test('returns true when row is deleted', async () => {
    mockQuery.mockImplementation(async (sql: string) => ({
      rows: [],
      rowCount: sql.includes('DELETE FROM sandboxes') ? 1 : 0,
    }));
    const result = await store.deleteSandbox('sb-001');
    expect(result).toBe(true);
  });

  test('returns false when no row deleted', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await store.deleteSandbox('nonexistent');
    expect(result).toBe(false);
  });

  test('executes DELETE FROM sandboxes', async () => {
    await store.deleteSandbox('sb-abc');
    const sqls = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('DELETE FROM conversations'))).toBe(true);
    expect(sqls.some((s) => s.includes('DELETE FROM sandboxes'))).toBe(true);
    const deleteCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('DELETE FROM sandboxes'));
    expect(deleteCall![1]).toContain('sb-abc');
  });

  test('deletes dependent conversations before the sandbox row', async () => {
    await store.deleteSandbox('sb-abc');
    const sqls = mockQuery.mock.calls.map((c) => c[0] as string);
    const conversationDeleteIndex = sqls.findIndex((sql) => sql.includes('DELETE FROM conversations'));
    const sandboxDeleteIndex = sqls.findIndex((sql) => sql.includes('DELETE FROM sandboxes'));

    expect(conversationDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(sandboxDeleteIndex).toBeGreaterThan(conversationDeleteIndex);
  });
});
