/**
 * Contract tests: /api/sandboxes/:id/chat endpoint must return a response
 * shape compatible with the OpenAI POST /v1/chat/completions API contract.
 *
 * Reference: https://platform.openai.com/docs/api-reference/chat/create
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { request } from '../helpers/app';
import { makeSandboxRecord, SANDBOX_ID, MOCK_CHAT_RESPONSE } from '../helpers/fixtures';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSandbox = mock(async () => makeSandboxRecord());
const mockAxiosPost = mock(async () => ({ status: 200, data: MOCK_CHAT_RESPONSE }));

mock.module('../../src/store', () => ({
  getSandbox: mockGetSandbox,
  listSandboxes: mock(async () => []),
  deleteSandbox: mock(async () => false),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  initDb: mock(async () => {}),
}));

mock.module('../../src/conversationStore', () => ({
  getConversation: mock(async () => null),
  listConversations: mock(async () => []),
  createConversation: mock(async () => ({})),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
  getMessages: mock(async () => []),
  initDb: mock(async () => {}),
}));

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
}));

mock.module('axios', () => ({
  default: {
    get: mock(async () => ({})),
    post: mockAxiosPost,
  },
  post: mockAxiosPost,
}));

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  mockAxiosPost.mockImplementation(async () => ({ status: 200, data: MOCK_CHAT_RESPONSE }));
});

/** Validates a chat completion choice object. */
function assertChoice(choice: Record<string, unknown>) {
  expect(typeof choice['index']).toBe('number');
  const msg = choice['message'] as Record<string, unknown>;
  expect(typeof msg['role']).toBe('string');
  expect(['assistant', 'user', 'system', 'tool']).toContain(msg['role']);
  // content can be string or null (for tool calls)
  expect(['string', 'object'].includes(typeof msg['content'])).toBe(true);
  expect(typeof choice['finish_reason']).toBe('string');
}

/** Validates a usage object. */
function assertUsage(usage: Record<string, unknown>) {
  expect(typeof usage['prompt_tokens']).toBe('number');
  expect(typeof usage['completion_tokens']).toBe('number');
  expect(typeof usage['total_tokens']).toBe('number');
  expect(usage['total_tokens']).toBe(
    (usage['prompt_tokens'] as number) + (usage['completion_tokens'] as number),
  );
}

const CHAT_REQUEST = {
  model: 'openclaw-default',
  messages: [{ role: 'user', content: 'Hello, world!' }],
};

describe('POST /api/sandboxes/:id/chat — OpenAI chat completions contract', () => {
  test('returns a chat completion object with id', async () => {
    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send(CHAT_REQUEST)
      .expect(200);

    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);
  });

  test('returns object: "chat.completion"', async () => {
    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send(CHAT_REQUEST)
      .expect(200);

    expect(res.body.object).toBe('chat.completion');
  });

  test('returns created timestamp as a number', async () => {
    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send(CHAT_REQUEST)
      .expect(200);

    expect(typeof res.body.created).toBe('number');
    expect(res.body.created).toBeGreaterThan(0);
  });

  test('returns a non-empty choices array', async () => {
    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send(CHAT_REQUEST)
      .expect(200);

    expect(Array.isArray(res.body.choices)).toBe(true);
    expect(res.body.choices.length).toBeGreaterThan(0);
  });

  test('each choice conforms to OpenAI choice schema', async () => {
    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send(CHAT_REQUEST)
      .expect(200);

    for (const choice of res.body.choices) {
      assertChoice(choice as Record<string, unknown>);
    }
  });

  test('usage object conforms to OpenAI usage schema', async () => {
    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send(CHAT_REQUEST)
      .expect(200);

    assertUsage(res.body.usage as Record<string, unknown>);
  });

  test('model field is present in response', async () => {
    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send(CHAT_REQUEST)
      .expect(200);

    expect(typeof res.body.model).toBe('string');
    expect(res.body.model.length).toBeGreaterThan(0);
  });

  test('gateway error is proxied as 4xx/5xx (not exposed as 200)', async () => {
    mockAxiosPost.mockImplementation(async () => ({
      status: 429,
      data: { error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } },
    }));

    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send(CHAT_REQUEST);

    expect(res.status).toBe(429);
  });

  test('gateway unreachable returns 503', async () => {
    mockAxiosPost.mockImplementation(async () => { throw new Error('ECONNREFUSED'); });

    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send(CHAT_REQUEST);

    expect(res.status).toBe(503);
    expect(res.body.detail).toContain('Gateway unreachable');
  });

  test('conversation_id is stripped from proxied request body', async () => {
    let capturedBody: Record<string, unknown> = {};
    mockAxiosPost.mockImplementation(async (_url: string, body: unknown) => {
      capturedBody = body as Record<string, unknown>;
      return { status: 200, data: MOCK_CHAT_RESPONSE };
    });

    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({
        ...CHAT_REQUEST,
        conversation_id: 'conv-should-be-stripped',
      });

    // conversation_id must not be forwarded to the gateway
    expect(capturedBody['conversation_id']).toBeUndefined();
  });
});
