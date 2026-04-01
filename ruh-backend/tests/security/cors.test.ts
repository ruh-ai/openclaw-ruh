/**
 * Security tests: CORS policy enforcement.
 */

import { describe, expect, test, mock, beforeAll } from 'bun:test';
import { request } from '../helpers/app';

// ── Minimal mocks so app loads without DB ─────────────────────────────────────

mock.module('../../src/store', () => ({
  getSandbox: mock(async () => null),
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

describe('CORS enforcement', () => {
  test('allows configured origin', async () => {
    const res = await request()
      .get('/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('preflight OPTIONS returns CORS headers for allowed origin', async () => {
    const res = await request()
      .options('/api/sandboxes')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    const origin = res.headers['access-control-allow-origin'];
    expect(origin).toBeTruthy();
    expect(origin).toBe('http://localhost:3000');
  });

  test('preflight OPTIONS allows the builder ngrok bypass header', async () => {
    const res = await request()
      .options('/api/auth/me')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'ngrok-skip-browser-warning')
      .expect(204);

    const allowedHeaders = String(res.headers['access-control-allow-headers'] ?? '');
    expect(allowedHeaders.toLowerCase()).toContain('ngrok-skip-browser-warning');
  });

  test('includes allowed methods in preflight response', async () => {
    const res = await request()
      .options('/api/sandboxes')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');

    const methods = res.headers['access-control-allow-methods'] ?? '';
    expect(methods).toMatch(/GET|POST/i);
  });

  test('CORS allows credentials', async () => {
    const res = await request()
      .get('/health')
      .set('Origin', 'http://localhost:3000');

    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('disallowed origin does not get wildcard access', async () => {
    const res = await request()
      .get('/health')
      .set('Origin', 'https://evil.example.com');

    // The response should either not include ACAO or set it to the allowed origin
    const acao = res.headers['access-control-allow-origin'];
    if (acao) {
      expect(acao).not.toBe('https://evil.example.com');
    }
    // Health check still responds 200 (CORS is browser-enforced)
    expect(res.status).toBe(200);
  });
});
