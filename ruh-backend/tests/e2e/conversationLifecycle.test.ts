/**
 * E2E tests for conversation lifecycle — uses supertest against the Express app
 * with mocked store and conversationStore (no real DB required).
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { request } from '../helpers/app';
import { makeSandboxRecord, makeConversationRecord, SANDBOX_ID, CONV_ID } from '../helpers/fixtures';

// ── Mocked stores ─────────────────────────────────────────────────────────────

const mockGetSandbox = mock(async () => makeSandboxRecord());
mock.module('../../src/store', () => ({
  getSandbox: mockGetSandbox,
  listSandboxes: mock(async () => [makeSandboxRecord()]),
  deleteSandbox: mock(async () => true),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  initDb: mock(async () => {}),
}));

const mockGetConversation = mock(async (_id: string) => makeConversationRecord());
const mockListConversations = mock(async () => [makeConversationRecord()]);
const mockCreateConversation = mock(async () => makeConversationRecord());
const mockAppendMessages = mock(async () => true);
const mockRenameConversation = mock(async () => true);
const mockDeleteConversation = mock(async () => true);
const mockGetMessages = mock(async () => [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi!' },
]);

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

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
}));

mock.module('axios', () => ({
  default: { get: mock(async () => ({})), post: mock(async () => ({})) },
}));

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  mockGetConversation.mockImplementation(async () => makeConversationRecord());
  mockListConversations.mockImplementation(async () => [makeConversationRecord()]);
  mockCreateConversation.mockImplementation(async () => makeConversationRecord());
  mockAppendMessages.mockImplementation(async () => true);
  mockRenameConversation.mockImplementation(async () => true);
  mockDeleteConversation.mockImplementation(async () => true);
  mockGetMessages.mockImplementation(async () => [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi!' },
  ]);
});

// ── List conversations ────────────────────────────────────────────────────────

describe('GET /api/sandboxes/:sandbox_id/conversations', () => {
  test('returns list of conversations', async () => {
    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/conversations`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].sandbox_id).toBe(SANDBOX_ID);
  });

  test('returns 404 when sandbox not found', async () => {
    mockGetSandbox.mockImplementation(async () => null);
    await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/conversations`)
      .expect(404);
  });
});

// ── Create conversation ───────────────────────────────────────────────────────

describe('POST /api/sandboxes/:sandbox_id/conversations', () => {
  test('creates and returns a conversation', async () => {
    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/conversations`)
      .send({ model: 'openclaw-default', name: 'New Chat' })
      .expect(200);

    expect(res.body.id).toBe(CONV_ID);
    expect(res.body.sandbox_id).toBe(SANDBOX_ID);
  });

  test('returns 404 when sandbox not found', async () => {
    mockGetSandbox.mockImplementation(async () => null);
    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/conversations`)
      .send({ name: 'Test' })
      .expect(404);
  });
});

// ── Get messages ──────────────────────────────────────────────────────────────

describe('GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages', () => {
  test('returns messages for conversation', async () => {
    const res = await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].role).toBe('user');
    expect(res.body[1].role).toBe('assistant');
  });

  test('returns 404 when conversation not found', async () => {
    mockGetConversation.mockImplementation(async () => null);
    await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`)
      .expect(404);
  });

  test('returns 404 when conversation belongs to different sandbox', async () => {
    mockGetConversation.mockImplementation(async () =>
      makeConversationRecord({ sandbox_id: 'other-sandbox' }),
    );
    await request()
      .get(`/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`)
      .expect(404);
  });
});

// ── Append messages ───────────────────────────────────────────────────────────

describe('POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages', () => {
  test('appends messages and returns ok', async () => {
    const res = await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`)
      .send({ messages: [{ role: 'user', content: 'Hi' }] })
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  test('returns 404 when conversation not found', async () => {
    mockGetConversation.mockImplementation(async () => null);
    await request()
      .post(`/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`)
      .send({ messages: [] })
      .expect(404);
  });
});

// ── Rename conversation ───────────────────────────────────────────────────────

describe('PATCH /api/sandboxes/:sandbox_id/conversations/:conv_id', () => {
  test('renames conversation and returns ok', async () => {
    const res = await request()
      .patch(`/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}`)
      .send({ name: 'New Name' })
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  test('returns 404 when conversation not found', async () => {
    mockGetConversation.mockImplementation(async () => null);
    await request()
      .patch(`/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}`)
      .send({ name: 'New Name' })
      .expect(404);
  });
});

// ── Delete conversation ───────────────────────────────────────────────────────

describe('DELETE /api/sandboxes/:sandbox_id/conversations/:conv_id', () => {
  test('deletes conversation and returns deleted id', async () => {
    const res = await request()
      .delete(`/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}`)
      .expect(200);

    expect(res.body.deleted).toBe(CONV_ID);
  });

  test('returns 404 when conversation not found', async () => {
    mockGetConversation.mockImplementation(async () => null);
    await request()
      .delete(`/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}`)
      .expect(404);
  });
});
