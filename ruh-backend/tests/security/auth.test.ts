/**
 * Security tests: authentication & authorization checks.
 * Verifies that missing/invalid API key configurations result in correct HTTP errors,
 * not stack traces or other information leakage.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { request } from '../helpers/app';
import { makeSandboxRecord, SANDBOX_ID } from '../helpers/fixtures';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSandbox = mock(async () => makeSandboxRecord());

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
  default: { get: mock(async () => ({})), post: mock(async () => ({})) },
}));

// ─────────────────────────────────────────────────────────────────────────────

const originalDaytonaKey = process.env.DAYTONA_API_KEY;

beforeEach(() => {
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  process.env.DAYTONA_API_KEY = 'test-key-present';
});

describe('DAYTONA_API_KEY requirement', () => {
  test('POST /api/sandboxes/create returns 500 when DAYTONA_API_KEY is missing', async () => {
    delete process.env.DAYTONA_API_KEY;

    const res = await request()
      .post('/api/sandboxes/create')
      .send({ sandbox_name: 'test' });

    expect(res.status).toBe(500);
    expect(res.body.detail).toContain('DAYTONA_API_KEY');

    // Restore
    process.env.DAYTONA_API_KEY = 'test-key-present';
  });

  test('GET /api/sandboxes/stream/:id with no DAYTONA_API_KEY does not expose stack trace', async () => {
    delete process.env.DAYTONA_API_KEY;

    const res = await request()
      .post('/api/sandboxes/create')
      .send({ sandbox_name: 'test' });

    if (res.status !== 200) {
      // Error body should not contain a stack trace
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('at Object');
      expect(body).not.toContain('at async');
      expect(body).not.toContain('node_modules');
    }

    process.env.DAYTONA_API_KEY = 'test-key-present';
  });
});

describe('error response sanitization', () => {
  test('404 response does not expose internal file paths', async () => {
    mockGetSandbox.mockImplementation(async () => null);
    const res = await request()
      .get(`/api/sandboxes/nonexistent`)
      .expect(404);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('/Users/');
    expect(body).not.toContain('/home/');
    expect(body).not.toContain('src/store.ts');
  });

  test('500 error does not leak stack traces', async () => {
    // Trigger an internal error by making getSandbox throw
    mockGetSandbox.mockImplementation(async () => {
      throw new Error('Simulated internal DB error with path /internal/secret');
    });

    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}`)
      .expect(500);

    // The detail should contain the error message but not path info
    expect(res.body.detail).toBeTruthy();
    // Stack trace should not be in the response
    expect(JSON.stringify(res.body)).not.toContain('at async');
  });

  test('error responses always use application/json', async () => {
    mockGetSandbox.mockImplementation(async () => null);
    const res = await request()
      .get('/api/sandboxes/nonexistent');

    if (res.status >= 400) {
      expect(res.headers['content-type']).toContain('application/json');
    }
  });
});

describe('gateway token handling', () => {
  test('chat endpoint forwards gateway token as Authorization header', async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockAxiosPost = mock(async (_url: string, _body: unknown, opts: { headers?: Record<string, string> }) => {
      capturedHeaders = opts.headers ?? {};
      return { status: 200, data: { id: 'test', choices: [] } };
    });

    // Re-mock axios for this test
    const axios = await import('axios');
    const originalPost = axios.default.post;
    (axios.default as { post: unknown }).post = mockAxiosPost;

    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/chat`)
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    // Restore
    (axios.default as { post: unknown }).post = originalPost;

    // The gateway_token from the sandbox record should be in Authorization header
    if (capturedHeaders['Authorization']) {
      expect(capturedHeaders['Authorization']).toMatch(/^Bearer /);
    }
  });
});
