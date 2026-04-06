/**
 * E2E tests for the Agent Forge lifecycle endpoints.
 * Tests: POST /api/agents/:id/forge, GET .../forge/status, POST .../forge/promote
 * Mocks store and docker so no real containers/DB are needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { signAccessToken } from '../../src/auth/tokens';
import {
  makeAgentRecord,
  makeSandboxRecord,
  AGENT_ID,
  SANDBOX_ID,
  FORGE_SANDBOX_ID,
} from '../helpers/fixtures';

// ── Mock store ────────────────────────────────────────────────────────────────

const mockGetSandbox = mock(async (_id: string) => makeSandboxRecord());
const mockListSandboxes = mock(async () => [makeSandboxRecord()]);
const mockDeleteSandbox = mock(async () => true);
const mockSaveSandbox = mock(async () => {});
const mockMarkApproved = mock(async () => {});
const mockUpdateSandboxSharedCodex = mock(async () => {});
const mockWriteAuditEvent = mock(async () => {});
const mockListAuditEvents = mock(async () => ({ items: [], has_more: false }));
const mockDockerContainerRunning = mock(async () => true);
const mockFindSkill = mock((_skillId: string) => null);
const mockListSkills = mock(() => []);

mock.module('../../src/store', () => ({
  getSandbox: mockGetSandbox,
  listSandboxes: mockListSandboxes,
  deleteSandbox: mockDeleteSandbox,
  saveSandbox: mockSaveSandbox,
  markApproved: mockMarkApproved,
  updateSandboxSharedCodex: mockUpdateSandboxSharedCodex,
  initDb: mock(async () => {}),
}));

mock.module('../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mockWriteAuditEvent,
  listAuditEvents: mockListAuditEvents,
}));

mock.module('../../src/docker', () => ({
  buildConfigureAgentCronAddCommand: (job: { name: string; schedule: string; message: string }) =>
    `openclaw cron add --name ${job.name} --cron ${job.schedule} --message ${job.message}`,
  buildCronDeleteCommand: (jobId: string) => `openclaw cron rm ${jobId}`,
  buildCronRunCommand: (jobId: string) => `openclaw cron run ${jobId}`,
  buildHomeFileWriteCommand: (relativePath: string, content: string) =>
    `mkdir -p $HOME && printf %s '${content}' > $HOME/${relativePath}`,
  dockerContainerRunning: mockDockerContainerRunning,
  dockerExec: mock(async () => [true, 'true']),
  dockerSpawn: mock(async () => [0, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  joinShellArgs: (args: Array<string | number>) => args.map(String).join(' '),
  listManagedSandboxContainers: mock(async () => []),
  normalizePathSegment: (value: string) => value,
  parseManagedSandboxContainerList: mock(() => []),
}));

// ── Mock agentStore ──────────────────────────────────────────────────────────

const mockGetAgent = mock(async (_id: string) => makeAgentRecord());
const mockListAgents = mock(async () => [makeAgentRecord()]);
const mockSaveAgent = mock(async () => makeAgentRecord());
const mockUpdateAgent = mock(async () => makeAgentRecord());
const mockUpdateAgentConfig = mock(async () => makeAgentRecord());
const mockDeleteAgent = mock(async () => true);
const mockAddSandboxToAgent = mock(async () => makeAgentRecord());
const mockRemoveSandboxFromAgent = mock(async () => makeAgentRecord());
const mockSetForgeSandbox = mock(async () => makeAgentRecord({ status: 'forging', forge_sandbox_id: FORGE_SANDBOX_ID }));
const mockPromoteForgeSandbox = mock(async () => makeAgentRecord({ status: 'active', forge_sandbox_id: null }));
const mockClearForgeSandbox = mock(async () => makeAgentRecord({ status: 'draft', forge_sandbox_id: null }));
const mockGetAgentWorkspaceMemory = mock(async () => ({ instructions: '', continuity_summary: '', pinned_paths: [], updated_at: null }));
const mockUpdateAgentWorkspaceMemory = mock(async () => ({ instructions: '', continuity_summary: '', pinned_paths: [], updated_at: null }));
const mockSaveAgentCredential = mock(async () => {});
const mockDeleteAgentCredential = mock(async () => {});
const mockGetAgentCredentials = mock(async () => []);
const mockGetAgentCredentialSummary = mock(async () => []);

mock.module('../../src/agentStore', () => ({
  initDb: mock(async () => {}),
  getAgent: mockGetAgent,
  listAgents: mockListAgents,
  listAgentsForCreator: mockListAgents,
  listAgentsForCreatorInOrg: mockListAgents,
  saveAgent: mockSaveAgent,
  updateAgent: mockUpdateAgent,
  updateAgentConfig: mockUpdateAgentConfig,
  deleteAgent: mockDeleteAgent,
  addSandboxToAgent: mockAddSandboxToAgent,
  getAgentForCreator: mockGetAgent,
  getAgentForCreatorInOrg: mockGetAgent,
  removeSandboxFromAgent: mockRemoveSandboxFromAgent,
  setForgeSandbox: mockSetForgeSandbox,
  promoteForgeSandbox: mockPromoteForgeSandbox,
  clearForgeSandbox: mockClearForgeSandbox,
  getAgentWorkspaceMemory: mockGetAgentWorkspaceMemory,
  updateAgentWorkspaceMemory: mockUpdateAgentWorkspaceMemory,
  saveAgentCredential: mockSaveAgentCredential,
  deleteAgentCredential: mockDeleteAgentCredential,
  getAgentCredentials: mockGetAgentCredentials,
  getAgentCredentialSummary: mockGetAgentCredentialSummary,
  getAgentBySandboxId: mock(async () => makeAgentRecord({ sandbox_ids: [SANDBOX_ID] })),
}));

// ── Mock conversationStore ────────────────────────────────────────────────────

mock.module('../../src/conversationStore', () => ({
  getConversation: mock(async () => null),
  getConversationForSandbox: mock(async () => null),
  listConversations: mock(async () => []),
  listConversationsPage: mock(async () => ({ items: [], has_more: false })),
  createConversation: mock(async () => ({
    id: 'conv-001', sandbox_id: SANDBOX_ID, name: 'Test', model: 'openclaw-default',
    openclaw_session_key: 'agent:main:conv-001', created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), message_count: 0,
  })),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
  getMessages: mock(async () => []),
  getMessagesPage: mock(async () => ({ items: [], has_more: false })),
  initDb: mock(async () => {}),
}));

// ── Mock sandboxManager ──────────────────────────────────────────────────────

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(function* () {
    yield ['log', 'Creating forge sandbox...'];
    yield ['result', { sandbox_id: FORGE_SANDBOX_ID, gateway_token: 'forge-tok', gateway_port: 18789, standard_url: 'http://localhost:18789' }];
    yield ['log', 'Done'];
  }),
  PREVIEW_PORTS: [],
  reconfigureSandboxLlm: mock(async () => true),
  retrofitSandboxToSharedCodex: mock(async () => ({ ok: true })),
  dockerExec: mock(async () => [true, '']),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
  waitForGateway: mock(async () => true),
  sandboxExec: mock(async () => [0, '']),
}));

// ── Mock other modules ───────────────────────────────────────────────────────

mock.module('../../src/auth/builderAccess', () => ({
  requireActiveDeveloperOrg: mock(async (user?: Record<string, unknown>) => ({
    user,
    organization: {
      id: 'org-001',
      name: 'Developer Org',
      slug: 'developer-org',
      kind: 'developer',
      plan: 'free',
    },
  })),
}));

mock.module('../../src/skillRegistry', () => ({
  findSkill: mockFindSkill,
  listSkills: mockListSkills,
  getSkillRegistryRouter: () => {
    const { Router } = require('express');
    return Router();
  },
}));

// ── Import app after all mocks ──────────────────────────────────────────────

const { request } = await import('../helpers/app.ts?e2eAgentForge');

function developerAuthHeader() {
  return `Bearer ${signAccessToken({
    userId: 'usr-dev-001',
    email: 'dev@test.dev',
    role: 'developer',
    orgId: 'org-001',
  })}`;
}

beforeEach(() => {
  mockGetAgent.mockReset();
  mockGetAgent.mockImplementation(async () => makeAgentRecord());
  mockGetSandbox.mockReset();
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  mockDockerContainerRunning.mockReset();
  mockDockerContainerRunning.mockImplementation(async () => true);
  mockFindSkill.mockReset();
  mockFindSkill.mockImplementation((_skillId: string) => null);
  mockListSkills.mockReset();
  mockListSkills.mockImplementation(() => []);
  mockSetForgeSandbox.mockReset();
  mockSetForgeSandbox.mockImplementation(async () => makeAgentRecord({ status: 'forging', forge_sandbox_id: FORGE_SANDBOX_ID }));
  mockPromoteForgeSandbox.mockReset();
  mockPromoteForgeSandbox.mockImplementation(async () => makeAgentRecord({ status: 'active', forge_sandbox_id: null }));
  mockClearForgeSandbox.mockReset();
  mockClearForgeSandbox.mockImplementation(async () => makeAgentRecord({ status: 'draft', forge_sandbox_id: null }));
  mockWriteAuditEvent.mockReset();
  mockWriteAuditEvent.mockImplementation(async () => {});
});

// ── Forge endpoint tests ────────────────────────────────────────────────────

describe('POST /api/agents/:id/forge', () => {
  test('returns existing forge sandbox when already running', async () => {
    mockGetAgent.mockImplementation(async () =>
      makeAgentRecord({ forge_sandbox_id: FORGE_SANDBOX_ID })
    );
    mockGetSandbox.mockImplementation(async () =>
      makeSandboxRecord({ sandbox_id: FORGE_SANDBOX_ID })
    );

    const res = await request()
      .post(`/api/agents/${AGENT_ID}/forge`)
      .set('Authorization', developerAuthHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.forge_sandbox_id).toBe(FORGE_SANDBOX_ID);
    expect(res.body.status).toBe('ready');
  });

  test('returns stream_id when no forge sandbox exists', async () => {
    mockGetAgent.mockImplementation(async () =>
      makeAgentRecord({ forge_sandbox_id: null })
    );

    const res = await request()
      .post(`/api/agents/${AGENT_ID}/forge`)
      .set('Authorization', developerAuthHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.stream_id).toBeDefined();
    expect(typeof res.body.stream_id).toBe('string');
  });

  test('returns 404 for unknown agent', async () => {
    mockGetAgent.mockImplementation(async () => null);

    const res = await request()
      .post('/api/agents/nonexistent/forge')
      .set('Authorization', developerAuthHeader())
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('GET /api/agents/:id/forge/status', () => {
  test('returns active when forge sandbox is running', async () => {
    mockGetAgent.mockImplementation(async () =>
      makeAgentRecord({ forge_sandbox_id: FORGE_SANDBOX_ID })
    );
    mockGetSandbox.mockImplementation(async () =>
      makeSandboxRecord({ sandbox_id: FORGE_SANDBOX_ID, vnc_port: 6080 })
    );
    mockDockerContainerRunning.mockImplementation(async () => true);

    const res = await request().get(`/api/agents/${AGENT_ID}/forge/status`).set('Authorization', developerAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
    expect(res.body.status).toBe('ready');
    expect(res.body.vnc_port).toBe(6080);
  });

  test('returns inactive when no forge sandbox', async () => {
    mockGetAgent.mockImplementation(async () =>
      makeAgentRecord({ forge_sandbox_id: null })
    );

    const res = await request().get(`/api/agents/${AGENT_ID}/forge/status`).set('Authorization', developerAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(res.body.status).toBe('none');
  });

  test('returns stopped when container is not running', async () => {
    mockGetAgent.mockImplementation(async () =>
      makeAgentRecord({ forge_sandbox_id: FORGE_SANDBOX_ID })
    );
    mockGetSandbox.mockImplementation(async () =>
      makeSandboxRecord({ sandbox_id: FORGE_SANDBOX_ID })
    );
    mockDockerContainerRunning.mockImplementation(async () => false);

    const res = await request().get(`/api/agents/${AGENT_ID}/forge/status`).set('Authorization', developerAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(res.body.status).toBe('stopped');
  });
});

describe('POST /api/agents/:id/forge/promote', () => {
  test('promotes forge sandbox and returns updated agent', async () => {
    mockGetAgent.mockImplementation(async () =>
      makeAgentRecord({ forge_sandbox_id: FORGE_SANDBOX_ID, status: 'forging' })
    );

    const res = await request()
      .post(`/api/agents/${AGENT_ID}/forge/promote`)
      .set('Authorization', developerAuthHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.forge_sandbox_id).toBeNull();
    expect(mockPromoteForgeSandbox).toHaveBeenCalledWith(AGENT_ID);
  });

  test('returns 400 when agent has no forge sandbox', async () => {
    mockGetAgent.mockImplementation(async () =>
      makeAgentRecord({ forge_sandbox_id: null })
    );

    const res = await request()
      .post(`/api/agents/${AGENT_ID}/forge/promote`)
      .set('Authorization', developerAuthHeader())
      .send({});

    expect(res.status).toBe(400);
  });

  test('records audit event on successful promotion', async () => {
    mockGetAgent.mockImplementation(async () =>
      makeAgentRecord({ forge_sandbox_id: FORGE_SANDBOX_ID, status: 'forging' })
    );

    await request()
      .post(`/api/agents/${AGENT_ID}/forge/promote`)
      .set('Authorization', developerAuthHeader())
      .send({});

    expect(mockWriteAuditEvent).toHaveBeenCalled();
    const auditCall = mockWriteAuditEvent.mock.calls[0];
    expect(auditCall[0].action_type).toBe('agent.forge_promote');
  });
});
