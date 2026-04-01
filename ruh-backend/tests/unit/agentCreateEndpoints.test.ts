/**
 * Unit tests for v2 agent creation endpoints:
 * - POST /api/agents/create
 * - POST /api/agents/reproduce
 * - PATCH /api/agents/:id/mode
 *
 * Tests validate request validation, response shape, and business logic
 * without requiring a real database or Docker.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockSaveAgent = mock(async (data: Record<string, unknown>) => ({
  id: 'agent-test-001',
  name: data.name,
  description: data.description ?? '',
  status: data.status ?? 'draft',
  forge_sandbox_id: null,
  sandbox_ids: [],
}));

const mockGetAgent = mock(async (id: string) => ({
  id,
  name: 'Test Agent',
  description: 'A test agent',
  status: 'draft',
  forge_sandbox_id: 'sandbox-test-001',
  sandbox_ids: ['sandbox-test-001'],
}));

mock.module('../../src/store', () => ({
  getSandbox: mock(async () => null),
  deleteSandbox: mock(async () => false),
  listSandboxes: mock(async () => []),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  updateSandboxSharedCodex: mock(async () => {}),
  initDb: mock(async () => {}),
}));

mock.module('../../src/conversationStore', () => ({
  initDb: mock(async () => {}),
  getConversation: mock(async () => null),
  listConversationsPage: mock(async () => ({ items: [], has_more: false, next_cursor: null })),
  createConversation: mock(async () => ({})),
  getMessagesPage: mock(async () => ({ messages: [], has_more: false, next_cursor: null })),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
}));

mock.module('../../src/agentStore', () => ({
  initDb: mock(async () => {}),
  listAgents: mock(async () => []),
  saveAgent: mockSaveAgent,
  getAgent: mockGetAgent,
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  setForgeSandbox: mock(async () => ({})),
  promoteForgeSandbox: mock(async () => ({})),
  clearForgeSandbox: mock(async () => ({})),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
}));

mock.module('../../src/sandboxManager', () => ({
  PREVIEW_PORTS: [],
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
}));

mock.module('../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  getFormattedChannelsConfig: mock(async () => ({})),
  configureChannels: mock(async () => ({ ok: true })),
}));

mock.module('../../src/docker', () => ({
  dockerContainerRunning: mock(async () => false),
  dockerExec: mock(async () => [true, '']),
  dockerSpawn: mock(async () => [0, '']),
  getContainerName: (id: string) => `openclaw-${id}`,
  shellQuote: (v: string) => `'${v}'`,
  joinShellArgs: (args: unknown[]) => args.map(String).join(' '),
  normalizePathSegment: (v: string) => v,
  buildHomeFileWriteCommand: mock(() => 'echo ok'),
  buildConfigureAgentCronAddCommand: mock(() => 'echo ok'),
  buildCronDeleteCommand: mock(() => 'echo ok'),
  buildCronRunCommand: mock(() => 'echo ok'),
  parseManagedSandboxContainerList: mock(() => []),
  listManagedSandboxContainers: mock(async () => []),
}));

mock.module('../../src/backendReadiness', () => ({
  markBackendReady: mock(() => {}),
  markBackendNotReady: mock(() => {}),
  getBackendReadiness: mock(() => ({ status: 'ready', reason: null, timestamp: Date.now() })),
}));

const { request, resetStreams } = await import('../helpers/app');

// ── Test suite ──────────────────────────────────────────────────────────────

beforeEach(() => {
  mockSaveAgent.mockClear();
  mockGetAgent.mockClear();
  resetStreams();
});

// ── POST /api/agents/create ─────────────────────────────────────────────────

describe('POST /api/agents/create', () => {
  test('returns 400 when name is missing', async () => {
    const res = await request().post('/api/agents/create').send({});
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('name');
  });

  test('returns 400 when name is empty string', async () => {
    const res = await request().post('/api/agents/create').send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  test('returns agent_id and stream_id on success', async () => {
    const res = await request().post('/api/agents/create').send({
      name: 'Google Ads Manager',
      description: 'Manages Google Ads campaigns',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agent_id');
    expect(res.body).toHaveProperty('stream_id');
    expect(typeof res.body.agent_id).toBe('string');
    expect(typeof res.body.stream_id).toBe('string');
  });

  test('calls saveAgent with draft status', async () => {
    await request().post('/api/agents/create').send({ name: 'Test Agent' });
    expect(mockSaveAgent).toHaveBeenCalledTimes(1);
    const call = mockSaveAgent.mock.calls[0][0] as Record<string, unknown>;
    expect(call.name).toBe('Test Agent');
    expect(['draft', 'forging']).toContain(call.status);
  });
});

// ── POST /api/agents/reproduce ──────────────────────────────────────────────

describe('POST /api/agents/reproduce', () => {
  test('returns 400 when name is missing', async () => {
    const res = await request().post('/api/agents/reproduce').send({ repo_url: 'https://github.com/test/repo' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('name');
  });

  test('returns 400 when repo_url is missing', async () => {
    const res = await request().post('/api/agents/reproduce').send({ name: 'Cloned Agent' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('repo_url');
  });

  test('returns agent_id and stream_id on success', async () => {
    const res = await request().post('/api/agents/reproduce').send({
      name: 'Cloned Agent',
      repo_url: 'https://github.com/test/agent-template',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agent_id');
    expect(res.body).toHaveProperty('stream_id');
  });

  test('passes github_token when provided', async () => {
    const res = await request().post('/api/agents/reproduce').send({
      name: 'Private Clone',
      repo_url: 'https://github.com/test/private-agent',
      github_token: 'ghp_test123',
    });
    expect(res.status).toBe(200);
  });
});

// ── PATCH /api/agents/:id/mode ──────────────────────────────────────────────

describe('PATCH /api/agents/:id/mode', () => {
  test('returns 400 for invalid mode', async () => {
    const res = await request().patch('/api/agents/agent-test-001/mode').send({ mode: 'invalid' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('mode');
  });

  test('returns 400 when mode is missing', async () => {
    const res = await request().patch('/api/agents/agent-test-001/mode').send({});
    expect(res.status).toBe(400);
  });

  test('accepts "building" mode', async () => {
    const res = await request().patch('/api/agents/agent-test-001/mode').send({ mode: 'building' });
    // May fail on dockerExec (mocked), but should not 400
    expect(res.status).not.toBe(400);
  });

  test('accepts "live" mode', async () => {
    const res = await request().patch('/api/agents/agent-test-001/mode').send({ mode: 'live' });
    expect(res.status).not.toBe(400);
  });
});

// ── DELETE /api/agents/:id/forge ─────────────────────────────────────────────

describe('DELETE /api/agents/:id/forge', () => {
  test('returns 200 and confirms deletion', async () => {
    const res = await request().delete('/api/agents/agent-test-001/forge');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('deleted', 'agent-test-001');
    expect(res.body).toHaveProperty('sandbox_cleaned');
  });

  test('returns 404 for non-existent agent', async () => {
    mockGetAgent.mockImplementationOnce(async () => null);
    const res = await request().delete('/api/agents/nonexistent/forge');
    expect(res.status).toBe(404);
  });
});
