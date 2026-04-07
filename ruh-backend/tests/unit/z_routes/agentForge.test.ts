/**
 * Unit tests for agent forge HTTP routes:
 * - DELETE /api/agents/:id/forge
 * - POST   /api/agents/:id/forge/promote
 *
 * Uses mocked agentStore (consistent with other z_routes tests) so these
 * tests remain pollution-free when run alongside other route test files.
 * Actual agentStore SQL logic is tested in tests/unit/stores/agentForge.test.ts.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock helpers ─────────────────────────────────────────────────────────────

const mockGetAgentForCreator = mock(async (id: string) => ({
  id,
  name: 'Forge Test Agent',
  description: 'An agent being forged',
  status: 'forging',
  forge_sandbox_id: 'sandbox-forge-001',
  sandbox_ids: ['sandbox-forge-001'],
}));

const mockDeleteAgent = mock(async () => true);
const mockPromoteForgeSandbox = mock(async (id: string) => ({
  id,
  name: 'Forge Test Agent',
  description: 'An agent being forged',
  status: 'active',
  forge_sandbox_id: null,
  sandbox_ids: ['sandbox-forge-001'],
  triggers: [],
  skills: [],
  agent_rules: [],
  tool_connections: [],
  improvements: [],
  channels: [],
}));
const mockClearForgeSandbox = mock(async () => ({}));

// ── Module mocks ─────────────────────────────────────────────────────────────

mock.module('../../../src/store', () => ({
  getSandbox: mock(async () => null),
  deleteSandbox: mock(async () => false),
  listSandboxes: mock(async () => []),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  updateSandboxSharedCodex: mock(async () => {}),
  initDb: mock(async () => {}),
}));

mock.module('../../../src/conversationStore', () => ({
  initDb: mock(async () => {}),
  getConversation: mock(async () => null),
  getConversationForSandbox: mock(async () => null),
  listConversationsPage: mock(async () => ({ items: [], has_more: false, next_cursor: null })),
  createConversation: mock(async () => ({})),
  getMessagesPage: mock(async () => ({ messages: [], has_more: false, next_cursor: null })),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
}));

mock.module('../../../src/agentStore', () => ({
  initDb: mock(async () => {}),
  listAgents: mock(async () => []),
  listAgentsForCreator: mock(async () => []),
  listAgentsForCreatorInOrg: mock(async () => []),
  saveAgent: mock(async () => ({})),
  getAgent: mock(async () => null),
  getAgentForCreator: mockGetAgentForCreator,
  getAgentForCreatorInOrg: mock(async () => null),
  getAgentOwnership: mock(async () => null),
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  addSandboxToAgent: mock(async () => ({})),
  removeSandboxFromAgent: mock(async () => ({})),
  setForgeSandbox: mock(async () => ({})),
  promoteForgeSandbox: mockPromoteForgeSandbox,
  clearForgeSandbox: mockClearForgeSandbox,
  deleteAgent: mockDeleteAgent,
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
  updatePaperclipMapping: mock(async () => null),
  getAgentBySandboxId: mock(async () => null),
  saveAgentCredential: mock(async () => {}),
  deleteAgentCredential: mock(async () => {}),
  getAgentCredentials: mock(async () => []),
  getAgentCredentialSummary: mock(async () => []),
}));

mock.module('../../../src/auth/middleware', () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: (error?: unknown) => void) => {
    req.user = {
      userId: 'user-test-001',
      email: 'developer@test.dev',
      role: 'developer',
      orgId: 'org-test-001',
    };
    next();
  },
  optionalAuth: (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
}));

mock.module('../../../src/auth/builderAccess', () => ({
  requireActiveDeveloperOrg: mock(async (user?: Record<string, unknown>) => ({
    user,
    organization: {
      id: 'org-test-001',
      name: 'Test Dev Org',
      slug: 'test-dev-org',
      kind: 'developer',
      plan: 'free',
    },
  })),
}));

mock.module('../../../src/sandboxManager', () => ({
  PREVIEW_PORTS: [],
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  waitForGateway: mock(async () => true),
  retrofitContainerToSharedCodex: mock(async () => ({ ok: true })),
}));

mock.module('../../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  getFormattedChannelsConfig: mock(async () => ({})),
  configureChannels: mock(async () => ({ ok: true })),
}));

mock.module('../../../src/docker', () => ({
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

mock.module('../../../src/backendReadiness', () => ({
  markBackendReady: mock(() => {}),
  markBackendNotReady: mock(() => {}),
  getBackendReadiness: mock(() => ({ status: 'ready', reason: null, timestamp: Date.now() })),
}));

const { request, resetStreams } = await import('../../helpers/app');

// ── Test suite ───────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetAgentForCreator.mockClear();
  mockDeleteAgent.mockClear();
  mockPromoteForgeSandbox.mockClear();
  mockClearForgeSandbox.mockClear();
  resetStreams();
});

// ── DELETE /api/agents/:id/forge ─────────────────────────────────────────────

describe('DELETE /api/agents/:id/forge', () => {
  test('returns 200 and deletes agent when forge sandbox exists', async () => {
    const res = await request().delete('/api/agents/agent-test-001/forge');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('deleted', 'agent-test-001');
    expect(mockDeleteAgent).toHaveBeenCalledTimes(1);
  });

  test('returns 404 when agent is not found', async () => {
    mockGetAgentForCreator.mockImplementationOnce(async () => null);
    const res = await request().delete('/api/agents/nonexistent/forge');
    expect(res.status).toBe(404);
  });
});

// ── POST /api/agents/:id/forge/promote ───────────────────────────────────────

describe('POST /api/agents/:id/forge/promote', () => {
  test('returns 200 and promotes the forge sandbox', async () => {
    const res = await request().post('/api/agents/agent-test-001/forge/promote');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'active');
    expect(res.body.forge_sandbox_id).toBeNull();
    expect(mockPromoteForgeSandbox).toHaveBeenCalledWith('agent-test-001');
  });

  test('returns 400 when agent has no forge sandbox', async () => {
    mockGetAgentForCreator.mockImplementationOnce(async (id: string) => ({
      id,
      name: 'No Forge Agent',
      description: '',
      status: 'draft',
      forge_sandbox_id: null,
      sandbox_ids: [],
    }));
    const res = await request().post('/api/agents/agent-test-001/forge/promote');
    expect(res.status).toBe(400);
  });

  test('returns 404 when agent is not found', async () => {
    mockGetAgentForCreator.mockImplementationOnce(async () => null);
    const res = await request().post('/api/agents/nonexistent/forge/promote');
    expect(res.status).toBe(404);
  });
});
