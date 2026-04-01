/**
 * E2E tests for chat proxy, models, and status endpoints.
 * Mocks axios and store so no real network/DB calls are made.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { Readable } from 'node:stream';
import { request } from '../helpers/app';
import {
  makeConversationRecord,
  makeSandboxRecord,
  SANDBOX_ID,
  MOCK_CHAT_RESPONSE,
} from '../helpers/fixtures';

// ── Mock store ────────────────────────────────────────────────────────────────

const mockGetSandbox = mock(async (_id: string) => makeSandboxRecord());
const mockListSandboxes = mock(async () => [makeSandboxRecord()]);
const mockDeleteSandbox = mock(async () => true);
const mockSaveSandbox = mock(async () => {});
const mockMarkApproved = mock(async () => {});
const mockUpdateSandboxSharedCodex = mock(async () => {});
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
const mockDockerContainerRunning = mock(async () => true);

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
  joinShellArgs: (args: Array<string | number>) => args.map(String).join(' '),
  normalizePathSegment: (value: string) => value,
}));

// ── Mock conversationStore ────────────────────────────────────────────────────

const mockGetConversation = mock(async () => null);
const mockListConversations = mock(async () => []);
const mockCreateConversation = mock(async () => ({
  id: 'conv-001', sandbox_id: SANDBOX_ID, name: 'Test', model: 'openclaw-default',
  openclaw_session_key: 'agent:main:conv-001', created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(), message_count: 0,
}));
const mockAppendMessages = mock(async () => true);
const mockRenameConversation = mock(async () => true);
const mockDeleteConversation = mock(async () => true);
const mockGetMessages = mock(async () => []);

mock.module('../../src/conversationStore', () => ({
  getConversation: mockGetConversation,
  listConversations: mockListConversations,
  createConversation: mockCreateConversation,
  appendMessages: mockAppendMessages,
  renameConversation: mockRenameConversation,
  deleteConversation: mockDeleteConversation,
  getMessages: mockGetMessages,
  initDb: mock(async () => {}),
}));

// ── Mock sandboxManager ───────────────────────────────────────────────────────

const mockReconfigureSandboxLlm = mock(async () => ({
  ok: true,
  provider: 'openai',
  model: 'gpt-4o',
  logs: ['Config updated', 'Gateway restarted'],
  configured: { apiKey: 'sk-12***cdef' },
}));
const mockRetrofitSandboxToSharedCodex = mock(async () => ({
  ok: true,
  sandboxId: SANDBOX_ID,
  model: 'openai-codex/gpt-5.4',
  homeDir: '/root',
  authSource: 'Codex CLI auth',
  logs: ['Shared auth ready', 'Default model set', 'Gateway restarted'],
}));
const mockDockerExec = mock(async () => [true, '']);

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mockReconfigureSandboxLlm,
  retrofitSandboxToSharedCodex: mockRetrofitSandboxToSharedCodex,
  dockerExec: mockDockerExec,
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
}));

// ── Mock axios ────────────────────────────────────────────────────────────────

const mockAxiosGet = mock(async () => ({ status: 200, data: { models: [] } }));
const mockAxiosPost = mock(async () => ({ status: 200, data: MOCK_CHAT_RESPONSE }));

mock.module('axios', () => ({
  default: { get: mockAxiosGet, post: mockAxiosPost },
  get: mockAxiosGet,
  post: mockAxiosPost,
}));

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  mockAxiosGet.mockImplementation(async () => ({ status: 200, data: { models: [] } }));
  mockAxiosPost.mockImplementation(async () => ({ status: 200, data: MOCK_CHAT_RESPONSE }));
  mockGetConversation.mockImplementation(async () => null);
  mockUpdateSandboxSharedCodex.mockImplementation(async () => {});
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
  mockReconfigureSandboxLlm.mockImplementation(async () => ({
    ok: true,
    provider: 'openai',
    model: 'gpt-4o',
    logs: ['Config updated', 'Gateway restarted'],
    configured: { apiKey: 'sk-12***cdef' },
  }));
  mockDockerExec.mockReset();
  mockDockerExec.mockImplementation(async () => [true, '']);
  mockRetrofitSandboxToSharedCodex.mockImplementation(async () => ({
    ok: true,
    sandboxId: SANDBOX_ID,
    model: 'openai-codex/gpt-5.4',
    homeDir: '/root',
    authSource: 'Codex CLI auth',
    logs: ['Shared auth ready', 'Default model set', 'Gateway restarted'],
  }));
  mockDockerContainerRunning.mockImplementation(async () => true);
  mockAppendMessages.mockReset();
  mockAppendMessages.mockImplementation(async () => true);
  process.env.OPENCLAW_ADMIN_TOKEN = 'admin-test-token';
});

// ── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 with ok status', async () => {
    const res = await request().get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
});

// ── Sandbox list ──────────────────────────────────────────────────────────────

describe('GET /api/sandboxes', () => {
  test('returns list of sandboxes', async () => {
    const res = await request().get('/api/sandboxes').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('DELETE /api/sandboxes/:sandbox_id', () => {
  test('returns deleted id on success', async () => {
    const res = await request()
      .delete(`/api/sandboxes/${SANDBOX_ID}`)
      .expect(200);
    expect(res.body.deleted).toBe(SANDBOX_ID);
    expect(mockWriteAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action_type: 'sandbox.delete',
      target_type: 'sandbox',
      target_id: SANDBOX_ID,
      outcome: 'success',
    }));
  });

  test('returns 404 when sandbox not found', async () => {
    mockDeleteSandbox.mockImplementation(async () => false);
    await request()
      .delete(`/api/sandboxes/${SANDBOX_ID}`)
      .expect(404);
  });
});

// ── Models endpoint ───────────────────────────────────────────────────────────

describe('GET /api/sandboxes/:sandbox_id/models', () => {
  test('returns model list from gateway', async () => {
    const modelData = { object: 'list', data: [{ id: 'openclaw-default' }] };
    mockAxiosGet.mockImplementation(async () => ({ status: 200, data: modelData }));

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(200);

    expect(res.body.object).toBe('list');
  });

  test('returns synthetic models when gateway unreachable', async () => {
    mockAxiosGet.mockImplementation(async () => { throw new Error('ECONNREFUSED'); });

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(200);

    expect(res.body._synthetic).toBe(true);
    expect(res.body.object).toBe('list');
  });

  test('returns synthetic models when gateway returns 4xx', async () => {
    mockAxiosGet.mockImplementation(async () => ({ status: 401, data: null }));

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(200);

    expect(res.body._synthetic).toBe(true);
  });

  test('returns 404 when sandbox not found', async () => {
    mockGetSandbox.mockImplementation(async () => null);
    await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(404);
  });
});

// ── Status endpoint ───────────────────────────────────────────────────────────

describe('GET /api/sandboxes/:sandbox_id/status', () => {
  test('returns status from gateway when available', async () => {
    const statusData = { status: 'running', models: 3 };
    mockAxiosGet.mockImplementation(async () => ({ status: 200, data: statusData }));

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/status`)
      .expect(200);

    expect(res.body.status).toBe('running');
    expect(res.body.container_running).toBe(true);
    expect(res.body.approved).toBe(false);
  });

  test('returns fallback status when gateway unavailable', async () => {
    mockAxiosGet.mockImplementation(async () => { throw new Error('timeout'); });
    mockDockerContainerRunning.mockImplementation(async () => false);

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/status`)
      .expect(200);

    expect(res.body.sandbox_id).toBe(SANDBOX_ID);
    expect(res.body.gateway_port).toBe(18789);
    expect(res.body.container_running).toBe(false);
  });
});

describe('workspace file routes', () => {
  test('lists bounded workspace files for a sandbox', async () => {
    mockDockerExec.mockImplementation(async () => [true, JSON.stringify({
      root: '',
      items: [
        {
          path: 'reports/daily.md',
          name: 'daily.md',
          type: 'file',
          size: 128,
          modified_at: '2026-03-25T15:30:00.000Z',
          preview_kind: 'text',
          mime_type: 'text/markdown',
          artifact_type: 'document',
          source_conversation_id: 'conv-1',
        },
      ],
    })]);

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/workspace/files`)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].path).toBe('reports/daily.md');
  });

  test('rejects traversal outside the workspace root', async () => {
    await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/workspace/file?path=../secret.txt`)
      .expect(400);
  });

  test('returns inline-safe text file content plus metadata', async () => {
    mockDockerExec.mockImplementation(async () => [true, JSON.stringify({
      path: 'reports/daily.md',
      name: 'daily.md',
      type: 'file',
      size: 21,
      modified_at: '2026-03-25T15:30:00.000Z',
      mime_type: 'text/markdown',
      preview_kind: 'text',
      artifact_type: 'document',
      source_conversation_id: 'conv-1',
      content: '# Daily report\nReady',
      truncated: false,
      download_name: 'daily.md',
    })]);

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/workspace/file?path=reports/daily.md`)
      .expect(200);

    expect(res.body.preview_kind).toBe('text');
    expect(res.body.content).toContain('Daily report');
  });

  test('returns a bounded workspace handoff summary', async () => {
    mockDockerExec.mockImplementation(async () => [true, JSON.stringify({
      summary: '2 code files ready for handoff',
      file_count: 4,
      code_file_count: 2,
      top_level_paths: ['app', 'reports'],
      suggested_paths: ['app/page.tsx', 'reports/daily.md'],
      archive: {
        eligible: true,
        reason: null,
        file_count: 4,
        total_bytes: 4096,
        download_name: 'workspace-bundle.tar.gz',
      },
    })]);

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/workspace/handoff`)
      .expect(200);

    expect(res.body.summary).toContain('handoff');
    expect(res.body.archive.eligible).toBe(true);
    expect(res.body.suggested_paths).toContain('app/page.tsx');
  });

  test('returns a bounded workspace archive download', async () => {
    mockDockerExec.mockImplementation(async () => [true, JSON.stringify({
      mime_type: 'application/gzip',
      download_name: 'workspace bundle.tar.gz',
      base64: Buffer.from('zip-bytes').toString('base64'),
    })]);

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/workspace/archive`)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/gzip');
    expect(res.headers['content-disposition']).toBe('attachment; filename="workspace bundle.tar.gz"');
    expect(res.body.toString('utf8')).toBe('zip-bytes');
  });
});

// ── LLM reconfiguration ───────────────────────────────────────────────────────

describe('POST /api/sandboxes/:sandbox_id/reconfigure-llm', () => {
  test('reconfigures sandbox provider and returns masked summary', async () => {
    let capturedArgs: unknown[] = [];
    mockReconfigureSandboxLlm.mockImplementation(async (...args: unknown[]) => {
      capturedArgs = args;
      return {
        ok: true,
        provider: 'openai',
        model: 'gpt-4o',
        logs: ['Config updated', 'Gateway restarted'],
        configured: { apiKey: 'sk-12***cdef' },
      };
    });

    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/reconfigure-llm`)
      .send({
        provider: 'openai',
        apiKey: 'sk-openai-secret-1234',
        model: 'gpt-4o',
      })
      .expect(200);

    expect(capturedArgs[0]).toBe(SANDBOX_ID);
    expect(capturedArgs[1]).toEqual({
      provider: 'openai',
      apiKey: 'sk-openai-secret-1234',
      model: 'gpt-4o',
    });
    expect(res.body.provider).toBe('openai');
    expect(res.body.model).toBe('gpt-4o');
    expect(res.body.configured.apiKey).toContain('***');
    expect(mockWriteAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action_type: 'sandbox.reconfigure_llm',
      target_type: 'sandbox',
      target_id: SANDBOX_ID,
      outcome: 'success',
    }));
  });

  test('returns 400 when provider is missing', async () => {
    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/reconfigure-llm`)
      .send({ apiKey: 'sk-openai-secret-1234' })
      .expect(400);
  });

  test('returns 409 when sandbox is locked to shared Codex', async () => {
    mockGetSandbox.mockImplementation(async () =>
      makeSandboxRecord({
        shared_codex_enabled: true,
        shared_codex_model: 'openai-codex/gpt-5.4',
      } as never),
    );

    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/reconfigure-llm`)
      .send({
        provider: 'openai',
        apiKey: 'sk-openai-secret-1234',
        model: 'gpt-4o',
      })
      .expect(409);
  });
});

describe('POST /api/admin/sandboxes/:sandbox_id/retrofit-shared-codex', () => {
  test('requires a valid admin bearer token', async () => {
    await request()
      .post(`/api/admin/sandboxes/${SANDBOX_ID}/retrofit-shared-codex`)
      .send({})
      .expect(401);
  });

  test('retrofits a running sandbox and returns the retrofit summary', async () => {
    let capturedArgs: unknown[] = [];
    mockRetrofitSandboxToSharedCodex.mockImplementation(async (...args: unknown[]) => {
      capturedArgs = args;
      return {
        ok: true,
        sandboxId: SANDBOX_ID,
        model: 'openai-codex/gpt-5.4',
        homeDir: '/root',
        authSource: 'Codex CLI auth',
        logs: ['Shared auth ready', 'Default model set', 'Gateway restarted'],
      };
    });

    const res = await request()
      .post(`/api/admin/sandboxes/${SANDBOX_ID}/retrofit-shared-codex`)
      .set('Authorization', 'Bearer admin-test-token')
      .send({})
      .expect(200);

    expect(capturedArgs[0]).toBe(SANDBOX_ID);
    expect(capturedArgs[1]).toEqual({ model: undefined });
    expect(res.body.model).toBe('openai-codex/gpt-5.4');
    expect(res.body.authSource).toBe('Codex CLI auth');
  });
});

describe('GET /api/admin/audit-events', () => {
  test('requires a valid admin bearer token', async () => {
    await request()
      .get('/api/admin/audit-events')
      .expect(401);
  });

  test('returns filtered audit events for admins', async () => {
    const res = await request()
      .get('/api/admin/audit-events?action_type=sandbox.delete&limit=10')
      .set('Authorization', 'Bearer admin-test-token')
      .expect(200);

    expect(mockListAuditEvents).toHaveBeenCalledWith(expect.objectContaining({
      action_type: 'sandbox.delete',
      limit: 10,
    }));
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].action_type).toBe('sandbox.delete');
  });
});

// ── Chat proxy ────────────────────────────────────────────────────────────────

describe('POST /api/sandboxes/:sandbox_id/chat', () => {
  test('proxies non-streaming chat to gateway', async () => {
    mockAxiosPost.mockImplementation(async () => ({ status: 200, data: MOCK_CHAT_RESPONSE }));

    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'openclaw-default',
      })
      .expect(200);

    expect(res.body.id).toBe(MOCK_CHAT_RESPONSE.id);
    expect(res.body.choices[0].message.content).toBe('Hello!');
  });

  test('forwards conversation_id as session key header', async () => {
    let capturedHeaders: Record<string, string> = {};
    mockAxiosPost.mockImplementation(async (_url: string, _body: unknown, opts: { headers: Record<string, string> }) => {
      capturedHeaders = opts.headers;
      return { status: 200, data: MOCK_CHAT_RESPONSE };
    });

    const convId = 'test-conv-id';
    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({
        messages: [{ role: 'user', content: 'Hello' }],
        conversation_id: convId,
      });

    expect(capturedHeaders['x-openclaw-session-key']).toContain(convId);
  });

  test('rejects conversation_id from a different sandbox before contacting the gateway', async () => {
    mockGetConversation.mockImplementation(async () => (
      makeConversationRecord({ sandbox_id: 'different-sandbox-id' })
    ));

    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({
        messages: [{ role: 'user', content: 'Hello' }],
        conversation_id: 'conv-cross-sandbox',
      })
      .expect(404);

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  test('returns 404 when sandbox not found', async () => {
    mockGetSandbox.mockImplementation(async () => null);
    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({ messages: [] })
      .expect(404);
  });

  test('returns 503 when gateway is unreachable', async () => {
    mockAxiosPost.mockImplementation(async () => { throw new Error('ECONNREFUSED'); });

    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({ messages: [{ role: 'user', content: 'hi' }] })
      .expect(503);
  });

  test('persists the delivered exchange when conversation_id is present', async () => {
    const convId = '11111111-1111-4111-8111-111111111111';
    mockGetConversation.mockImplementation(async () => (
      makeConversationRecord({ id: convId, sandbox_id: SANDBOX_ID })
    ));

    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'openclaw-default',
        conversation_id: convId,
      })
      .expect(200);

    expect(mockAppendMessages).toHaveBeenCalledWith(convId, [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hello!' },
    ]);
  });

  test('returns 500 when persistence fails after a non-streaming reply', async () => {
    const convId = '22222222-2222-4222-8222-222222222222';
    mockGetConversation.mockImplementation(async () => (
      makeConversationRecord({ id: convId, sandbox_id: SANDBOX_ID })
    ));
    mockAppendMessages.mockImplementation(async () => {
      throw new Error('db down');
    });

    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'openclaw-default',
        conversation_id: convId,
      });

    expect(res.status).toBe(500);
    expect(String(res.body.detail ?? '')).toContain('persist');
  });

  test('persists the streamed exchange once the assistant stream completes', async () => {
    const convId = '33333333-3333-4333-8333-333333333333';
    mockGetConversation.mockImplementation(async () => (
      makeConversationRecord({ id: convId, sandbox_id: SANDBOX_ID })
    ));
    mockAxiosPost.mockImplementation(async () => ({
      status: 200,
      data: Readable.from([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" there!"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }));

    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'openclaw-default',
        conversation_id: convId,
        stream: true,
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(mockAppendMessages).toHaveBeenCalledWith(convId, [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello there!' },
    ]);
  });

  test('emits a persistence_error event when streamed persistence fails after the reply', async () => {
    const convId = '44444444-4444-4444-8444-444444444444';
    mockGetConversation.mockImplementation(async () => (
      makeConversationRecord({ id: convId, sandbox_id: SANDBOX_ID })
    ));
    mockAppendMessages.mockImplementation(async () => {
      throw new Error('db down');
    });
    mockAxiosPost.mockImplementation(async () => ({
      status: 200,
      data: Readable.from([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }));

    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'openclaw-default',
        conversation_id: convId,
        stream: true,
      })
      .expect(200);

    expect(res.text).toContain('event: persistence_error');
    expect(res.text).toContain('chat_exchange_persistence_failed');
  });
});
