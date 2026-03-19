/**
 * Contract tests: /api/sandboxes/:id/models endpoint must return a response
 * shape compatible with the OpenAI GET /v1/models API contract.
 *
 * Reference: https://platform.openai.com/docs/api-reference/models/list
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { request } from '../helpers/app';
import { makeSandboxRecord, SANDBOX_ID } from '../helpers/fixtures';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSandbox = mock(async () => makeSandboxRecord());
const mockAxiosGet = mock(async () => ({
  status: 200,
  data: {
    object: 'list',
    data: [
      { id: 'openclaw-default', object: 'model', created: 1700000000, owned_by: 'openclaw' },
      { id: 'gpt-4o', object: 'model', created: 1700000001, owned_by: 'openai' },
    ],
  },
}));

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
  default: { get: mockAxiosGet, post: mock(async () => ({})) },
  get: mockAxiosGet,
}));

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  mockAxiosGet.mockImplementation(async () => ({
    status: 200,
    data: {
      object: 'list',
      data: [
        { id: 'openclaw-default', object: 'model', created: 1700000000, owned_by: 'openclaw' },
      ],
    },
  }));
});

/** Validates that a model object matches the OpenAI model schema. */
function assertModelShape(model: Record<string, unknown>) {
  expect(typeof model['id']).toBe('string');
  expect(model['object']).toBe('model');
  expect(typeof model['created']).toBe('number');
  expect(typeof model['owned_by']).toBe('string');
}

describe('GET /api/sandboxes/:id/models — OpenAI models list contract', () => {
  test('returns object: "list" at top level', async () => {
    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(200);

    expect(res.body.object).toBe('list');
  });

  test('data field is an array', async () => {
    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('each model in data has required OpenAI fields', async () => {
    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(200);

    for (const model of res.body.data) {
      assertModelShape(model as Record<string, unknown>);
    }
  });

  test('synthetic fallback also conforms to OpenAI contract', async () => {
    mockAxiosGet.mockImplementation(async () => { throw new Error('unreachable'); });

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(200);

    expect(res.body.object).toBe('list');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const model of res.body.data) {
      assertModelShape(model as Record<string, unknown>);
    }
  });

  test('contains at least one model ID', async () => {
    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].id).toBeTruthy();
  });

  test('model IDs are non-empty strings', async () => {
    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/models`)
      .expect(200);

    for (const model of res.body.data) {
      expect(typeof model.id).toBe('string');
      expect(model.id.length).toBeGreaterThan(0);
    }
  });
});
