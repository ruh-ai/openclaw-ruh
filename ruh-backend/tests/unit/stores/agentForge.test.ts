/**
 * Unit tests for agent forge lifecycle — setForgeSandbox, promoteForgeSandbox, clearForgeSandbox.
 * Mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as agentStore from '../../../src/agentStore';

// ─────────────────────────────────────────────────────────────────────────────

const AGENT_ID = 'agent-forge-test';
const SANDBOX_ID = 'sandbox-forge-test';

function makeAgentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    name: 'Forge Test Agent',
    avatar: '🔨',
    description: 'An agent being forged',
    skills: [],
    trigger_label: '',
    status: 'draft',
    sandbox_ids: [],
    forge_sandbox_id: null,
    skill_graph: null,
    workflow: null,
    agent_rules: [],
    tool_connections: [],
    triggers: [],
    improvements: [],
    workspace_memory: {
      instructions: '',
      continuity_summary: '',
      pinned_paths: [],
      updated_at: null,
    },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── setForgeSandbox ──────────────────────────────────────────────────────────

describe('agentStore.setForgeSandbox', () => {
  test('sets forge_sandbox_id, status to forging, and adds to sandbox_ids', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [makeAgentRow({ status: 'forging', forge_sandbox_id: SANDBOX_ID, sandbox_ids: [SANDBOX_ID] })],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await agentStore.setForgeSandbox(AGENT_ID, SANDBOX_ID);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('forging');
    expect(result!.forge_sandbox_id).toBe(SANDBOX_ID);

    // Verify the UPDATE was called with correct SQL
    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('forge_sandbox_id'),
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![0] as string)).toContain("status = 'forging'");
    expect(updateCall![1]).toContain(SANDBOX_ID);
  });
});

// ── promoteForgeSandbox ──────────────────────────────────────────────────────

describe('agentStore.promoteForgeSandbox', () => {
  test('clears forge_sandbox_id and sets status to active', async () => {
    let selectCallCount = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        selectCallCount++;
        // First SELECT (getAgent before UPDATE): return agent WITH forge_sandbox_id set
        // Second SELECT (getAgent after UPDATE): return the updated state
        if (selectCallCount === 1) {
          return {
            rows: [makeAgentRow({ status: 'forging', forge_sandbox_id: SANDBOX_ID, sandbox_ids: [SANDBOX_ID] })],
            rowCount: 1,
          };
        }
        return {
          rows: [makeAgentRow({ status: 'active', forge_sandbox_id: null, sandbox_ids: [SANDBOX_ID] })],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await agentStore.promoteForgeSandbox(AGENT_ID);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('active');
    expect(result!.forge_sandbox_id).toBeNull();

    // Verify an UPDATE was issued (not just SELECTs)
    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![0] as string)).toContain('active');
    expect((updateCall![0] as string)).toContain('forge_sandbox_id');
  });

  test('returns early without UPDATE when agent has no forge_sandbox_id', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return { rows: [makeAgentRow({ status: 'draft', forge_sandbox_id: null })], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await agentStore.promoteForgeSandbox(AGENT_ID);
    // Returns the agent as-is (no forge_sandbox_id → early return before UPDATE)
    expect(result).not.toBeNull();
    expect(result!.forge_sandbox_id).toBeNull();
    // No UPDATE should have been issued — only the initial SELECT
    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes('UPDATE'),
    );
    expect(updateCall).toBeUndefined();
  });
});

// ── clearForgeSandbox ────────────────────────────────────────────────────────

describe('agentStore.clearForgeSandbox', () => {
  test('clears forge_sandbox_id and reverts status to draft', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [makeAgentRow({ status: 'draft', forge_sandbox_id: null })],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await agentStore.clearForgeSandbox(AGENT_ID);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('draft');
    expect(result!.forge_sandbox_id).toBeNull();

    const updateCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes("status = 'draft'") && (c[0] as string).includes('forge_sandbox_id = NULL'),
    );
    expect(updateCall).toBeDefined();
  });
});

// ── AgentRecord.forge_sandbox_id serialization ──────────────────────────────

describe('AgentRecord serialization', () => {
  test('forge_sandbox_id is null when not present in DB row', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return { rows: [makeAgentRow({ forge_sandbox_id: undefined })], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const agent = await agentStore.getAgent(AGENT_ID);
    expect(agent).not.toBeNull();
    expect(agent!.forge_sandbox_id).toBeNull();
  });

  test('forge_sandbox_id is preserved when set', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return { rows: [makeAgentRow({ forge_sandbox_id: SANDBOX_ID })], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const agent = await agentStore.getAgent(AGENT_ID);
    expect(agent).not.toBeNull();
    expect(agent!.forge_sandbox_id).toBe(SANDBOX_ID);
  });
});
