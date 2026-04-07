import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { SANDBOX_ID, makeSandboxRecord } from '../../helpers/fixtures';

const mockGetSandbox = mock(async () => makeSandboxRecord());
const mockDeleteSandbox = mock(async () => true);
const mockWriteAuditEvent = mock(async () => {});
const mockListAuditEvents = mock(async () => ({
  items: [{
    event_id: 'evt-1',
    occurred_at: new Date('2026-03-25T12:00:00Z').toISOString(),
    request_id: 'req-1',
    action_type: 'sandbox.delete',
    target_type: 'sandbox',
    target_id: SANDBOX_ID,
    outcome: 'success',
    actor_type: 'anonymous',
    actor_id: 'anonymous',
    origin: 'iphash:test',
    details: { deleted: true },
  }],
  has_more: false,
}));
const mockReconfigureSandboxLlm = mock(async () => ({
  ok: true,
  provider: 'openai',
  model: 'gpt-4o',
  logs: ['Config updated'],
  configured: { apiKey: 'sk-12***cdef' },
}));
import { dockerExecMock as mockDockerExec } from '../../helpers/mockDocker';

mock.module('../../../src/store', () => ({
  getSandbox: mockGetSandbox,
  deleteSandbox: mockDeleteSandbox,
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
  getAgentForCreator: mock(async () => null),
  getAgentForCreatorInOrg: mock(async () => null),
  getAgentOwnership: mock(async () => null),
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  addSandboxToAgent: mock(async () => ({})),
  removeSandboxFromAgent: mock(async () => ({})),
  setForgeSandbox: mock(async () => ({})),
  promoteForgeSandbox: mock(async () => ({})),
  clearForgeSandbox: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
  updatePaperclipMapping: mock(async () => null),
  getAgentBySandboxId: mock(async () => null),
  saveAgentCredential: mock(async () => {}),
  deleteAgentCredential: mock(async () => {}),
  getAgentCredentials: mock(async () => []),
  getAgentCredentialSummary: mock(async () => []),
}));

mock.module('../../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mockReconfigureSandboxLlm,
  retrofitSandboxToSharedCodex: mock(async () => ({ ok: true, model: 'openai-codex/gpt-5.4', authSource: 'Codex CLI auth' })),
  dockerExec: mockDockerExec,
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
  PREVIEW_PORTS: [],
}));

mock.module('../../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  setTelegramConfig: mock(async () => ({ ok: true, logs: [] })),
  setSlackConfig: mock(async () => ({ ok: true, logs: [] })),
  probeChannelStatus: mock(async () => ({ ok: true })),
  listPairingRequests: mock(async () => ({ ok: true, codes: [] })),
  approvePairing: mock(async () => ({ ok: true })),
}));

mock.module('../../../src/backendReadiness', () => ({
  getBackendReadiness: () => ({ status: 'ready', ready: true, reason: null }),
}));

import '../../helpers/mockDocker';

mock.module('../../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mockWriteAuditEvent,
  listAuditEvents: mockListAuditEvents,
}));

const { app } = await import('../../../src/app');

type MockReq = {
  method: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  ip: string;
  socket: { remoteAddress: string };
};

function makeReq(overrides: Partial<MockReq> = {}): MockReq {
  return {
    method: 'GET',
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function makeRes() {
  let resolveJson: ((value: unknown) => void) | null = null;
  const done = new Promise<unknown>((resolve) => {
    resolveJson = resolve;
  });

  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    done,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      resolveJson?.(payload);
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      resolveJson?.(payload);
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

function getRouteHandler(method: string, path: string) {
  const router = (app as unknown as { _router?: { stack: Array<Record<string, unknown>> } })._router;
  if (!router) {
    throw new Error('Express router not initialized');
  }

  const layer = router.stack
    .find((entry) => {
      const route = entry['route'] as { path?: string; methods?: Record<string, boolean> } | undefined;
      return route?.path === path && route.methods?.[method.toLowerCase()];
    });

  const route = layer?.['route'] as { stack: Array<{ handle: Function }> } | undefined;
  const handle = route?.stack?.[0]?.handle;
  if (!handle) {
    throw new Error(`Route not found: ${method} ${path}`);
  }
  return handle as (req: MockReq, res: ReturnType<typeof makeRes>, next: (error?: unknown) => void) => void;
}

async function invokeRoute(method: string, path: string, req: MockReq) {
  const handler = getRouteHandler(method, path);
  const res = makeRes();

  const nextResult = new Promise<unknown>((resolve, reject) => {
    handler(req, res, (error?: unknown) => {
      if (error) reject(error);
      else resolve(undefined);
    });
  });

  await Promise.race([res.done, nextResult]);
  return res;
}

beforeEach(() => {
  mockGetSandbox.mockReset();
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  mockDeleteSandbox.mockReset();
  mockDeleteSandbox.mockImplementation(async () => true);
  mockWriteAuditEvent.mockReset();
  mockWriteAuditEvent.mockImplementation(async () => {});
  mockListAuditEvents.mockReset();
  mockListAuditEvents.mockImplementation(async () => ({
    items: [{
      event_id: 'evt-1',
      occurred_at: new Date('2026-03-25T12:00:00Z').toISOString(),
      request_id: 'req-1',
      action_type: 'sandbox.delete',
      target_type: 'sandbox',
      target_id: SANDBOX_ID,
      outcome: 'success',
      actor_type: 'anonymous',
      actor_id: 'anonymous',
      origin: 'iphash:test',
      details: { deleted: true },
    }],
    has_more: false,
  }));
  mockReconfigureSandboxLlm.mockReset();
  mockReconfigureSandboxLlm.mockImplementation(async () => ({
    ok: true,
    provider: 'openai',
    model: 'gpt-4o',
    logs: ['Config updated'],
    configured: { apiKey: 'sk-12***cdef' },
  }));
  mockDockerExec.mockReset();
  mockDockerExec.mockImplementation(async () => [true, '']);
  process.env.OPENCLAW_ADMIN_TOKEN = 'admin-test-token';
});

describe('audit route wiring', () => {
  test('deleting a sandbox emits an audit event', async () => {
    const res = await invokeRoute('DELETE', '/api/sandboxes/:sandbox_id', makeReq({
      method: 'DELETE',
      params: { sandbox_id: SANDBOX_ID },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: SANDBOX_ID });
    expect(mockWriteAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action_type: 'sandbox.delete',
      target_type: 'sandbox',
      target_id: SANDBOX_ID,
      outcome: 'success',
    }));
  });

  test('reconfiguring llm settings emits an audit event', async () => {
    const res = await invokeRoute('POST', '/api/sandboxes/:sandbox_id/reconfigure-llm', makeReq({
      method: 'POST',
      params: { sandbox_id: SANDBOX_ID },
      body: { provider: 'openai', apiKey: 'sk-secret', model: 'gpt-4o' },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockWriteAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action_type: 'sandbox.reconfigure_llm',
      target_type: 'sandbox',
      target_id: SANDBOX_ID,
      outcome: 'success',
    }));
  });

  test('configure-agent fails closed with structured step results when a mutation fails', async () => {
    mockDockerExec
      .mockResolvedValueOnce([true, ''])
      .mockResolvedValueOnce([false, 'permission denied']);

    const res = await invokeRoute('POST', '/api/sandboxes/:sandbox_id/configure-agent', makeReq({
      method: 'POST',
      params: { sandbox_id: SANDBOX_ID },
      body: {
        system_name: 'Worker Agent',
        soul_content: '# You are Worker Agent',
        skills: [{ skill_id: 'web-search', name: 'Web Search', description: 'Search the web' }],
        cron_jobs: [],
      },
    }));

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      ok: false,
      applied: false,
      detail: 'Agent config apply failed',
      steps: [
        {
          kind: 'soul',
          target: 'SOUL.md',
          ok: true,
          message: 'SOUL.md written',
        },
        {
          kind: 'skill',
          target: 'web-search',
          ok: false,
          message: 'Skill web-search failed: permission denied',
        },
      ],
    });
    expect(mockWriteAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action_type: 'sandbox.configure_agent',
      target_type: 'sandbox',
      target_id: SANDBOX_ID,
      outcome: 'failure',
    }));
  });

  test('admin audit-event query requires a token', async () => {
    const handler = getRouteHandler('GET', '/api/admin/audit-events');
    const res = makeRes();

    await expect(new Promise((resolve, reject) => {
      handler(makeReq({
        params: {},
        query: {},
        headers: {},
      }), res, (error?: unknown) => {
        if (error) reject(error);
        else resolve(undefined);
      });
    })).rejects.toMatchObject({ status: 401 });
  });

  test('admin audit-event query returns filtered rows', async () => {
    const res = await invokeRoute('GET', '/api/admin/audit-events', makeReq({
      headers: { authorization: 'Bearer admin-test-token' },
      query: { action_type: 'sandbox.delete', limit: '10' },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockListAuditEvents).toHaveBeenCalledWith(expect.objectContaining({
      action_type: 'sandbox.delete',
      limit: 10,
    }));
    expect((res.body as { items: unknown[] }).items).toHaveLength(1);
  });

  test('workspace file route rejects traversal outside the workspace root', async () => {
    await expect(invokeRoute('GET', '/api/sandboxes/:sandbox_id/workspace/file', makeReq({
      params: { sandbox_id: SANDBOX_ID },
      query: { path: '../secret.txt' },
    }))).rejects.toMatchObject({ status: 400 });
  });

  test('workspace file route returns inline-safe text metadata and content', async () => {
    mockDockerExec.mockImplementation(async () => [true, JSON.stringify({
      path: 'reports/daily.md',
      name: 'daily.md',
      type: 'file',
      size: 24,
      modified_at: '2026-03-25T15:30:00.000Z',
      mime_type: 'text/markdown',
      preview_kind: 'text',
      artifact_type: 'document',
      source_conversation_id: 'conv-1',
      content: '# Daily report\nReady now',
      truncated: false,
      download_name: 'daily.md',
    })]);

    const res = await invokeRoute('GET', '/api/sandboxes/:sandbox_id/workspace/file', makeReq({
      params: { sandbox_id: SANDBOX_ID },
      query: { path: 'reports/daily.md' },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      path: 'reports/daily.md',
      preview_kind: 'text',
      content: '# Daily report\nReady now',
    }));
  });

  test('workspace download route returns binary bytes with safe inline headers', async () => {
    mockDockerExec.mockImplementation(async () => [true, JSON.stringify({
      path: 'artifacts/report "final".pdf',
      name: 'report "final".pdf',
      mime_type: 'application/pdf',
      download_name: 'report "final".pdf',
      base64: Buffer.from('pdf-bytes').toString('base64'),
    })]);

    const res = await invokeRoute('GET', '/api/sandboxes/:sandbox_id/workspace/file/download', makeReq({
      params: { sandbox_id: SANDBOX_ID },
      query: { path: 'artifacts/report-final.pdf' },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toBe('inline; filename="report final.pdf"');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).toString('utf8')).toBe('pdf-bytes');
  });

  test('workspace handoff route returns summary payload', async () => {
    mockDockerExec.mockImplementation(async () => [true, JSON.stringify({
      summary: 'Workspace has exportable code',
      file_count: 6,
      code_file_count: 3,
      top_level_paths: ['app', 'public'],
      suggested_paths: ['app/page.tsx', 'app/layout.tsx'],
      archive: {
        eligible: true,
        reason: null,
        file_count: 6,
        total_bytes: 8192,
        download_name: 'workspace-bundle.tar.gz',
      },
    })]);

    const res = await invokeRoute('GET', '/api/sandboxes/:sandbox_id/workspace/handoff', makeReq({
      params: { sandbox_id: SANDBOX_ID },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      summary: 'Workspace has exportable code',
      code_file_count: 3,
      top_level_paths: ['app', 'public'],
    }));
  });

  test('workspace archive route returns attachment headers', async () => {
    mockDockerExec.mockImplementation(async () => [true, JSON.stringify({
      mime_type: 'application/gzip',
      download_name: 'workspace "bundle".tar.gz',
      base64: Buffer.from('zip-archive').toString('base64'),
    })]);

    const res = await invokeRoute('GET', '/api/sandboxes/:sandbox_id/workspace/archive', makeReq({
      params: { sandbox_id: SANDBOX_ID },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/gzip');
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="workspace bundle.tar.gz"');
    expect((res.body as Buffer).toString('utf8')).toBe('zip-archive');
  });
});
