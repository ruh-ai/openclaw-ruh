/**
 * E2E tests for chat proxy, models, and status endpoints.
 * Mocks axios and store so no real network/DB calls are made.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { request } from '../helpers/app';
import { makeSandboxRecord, SANDBOX_ID, MOCK_CHAT_RESPONSE } from '../helpers/fixtures';

// ── Mock store ────────────────────────────────────────────────────────────────

const mockGetSandbox = mock(async (_id: string) => makeSandboxRecord());
const mockListSandboxes = mock(async () => [makeSandboxRecord()]);
const mockDeleteSandbox = mock(async () => true);
const mockSaveSandbox = mock(async () => {});
const mockMarkApproved = mock(async () => {});

mock.module('../../src/store', () => ({
  getSandbox: mockGetSandbox,
  listSandboxes: mockListSandboxes,
  deleteSandbox: mockDeleteSandbox,
  saveSandbox: mockSaveSandbox,
  markApproved: mockMarkApproved,
  initDb: mock(async () => {}),
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

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
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
  });

  test('returns fallback status when gateway unavailable', async () => {
    mockAxiosGet.mockImplementation(async () => { throw new Error('timeout'); });

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/status`)
      .expect(200);

    expect(res.body.sandbox_id).toBe(SANDBOX_ID);
    expect(res.body.gateway_port).toBe(18789);
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
});
