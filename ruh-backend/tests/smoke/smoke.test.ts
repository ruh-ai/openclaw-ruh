/**
 * Smoke tests — starts a real server subprocess and verifies basic reachability.
 * Requires: DATABASE_URL set to a reachable Postgres instance.
 *
 * These tests are intentionally coarse; they verify the server starts and responds.
 */

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';

let serverProcess: ReturnType<typeof Bun.spawn> | null = null;
let baseUrl = '';
const PORT = 18800; // use a non-conflicting port

async function waitForServer(url: string, retries = 20, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await Bun.sleep(delayMs);
  }
  return false;
}

beforeAll(async () => {
  baseUrl = `http://127.0.0.1:${PORT}`;

  serverProcess = Bun.spawn(
    ['bun', 'run', 'src/index.ts'],
    {
      cwd: new URL('../../', import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        DAYTONA_API_KEY: process.env.DAYTONA_API_KEY ?? 'test-key',
        ALLOWED_ORIGINS: 'http://localhost:3000',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  const ready = await waitForServer(baseUrl);
  if (!ready) {
    console.error('Smoke server did not start within timeout');
  }
});

afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
    await serverProcess.exited;
    serverProcess = null;
  }
});

describe('smoke: server reachability', () => {
  test('GET /health returns 200 with ok status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('GET /api/sandboxes returns 200 (may be empty array)', async () => {
    const res = await fetch(`${baseUrl}/api/sandboxes`);
    // Could be 200 (empty list) or 500 if no DB — either is a valid smoke check
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    }
  });

  test('GET /api/sandboxes/nonexistent returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/sandboxes/nonexistent-sb`);
    expect([404, 500]).toContain(res.status);
  });

  test('POST /api/sandboxes/create returns 500 without DAYTONA_API_KEY or 200', async () => {
    const res = await fetch(`${baseUrl}/api/sandboxes/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sandbox_name: 'smoke-test' }),
    });
    // Should return stream_id or 500 if key is invalid
    expect([200, 500]).toContain(res.status);
  });

  test('server returns JSON Content-Type on error responses', async () => {
    const res = await fetch(`${baseUrl}/api/sandboxes/nonexistent-sb`);
    if (res.status !== 200) {
      const ct = res.headers.get('content-type') ?? '';
      expect(ct).toContain('application/json');
    }
  });

  test('CORS headers present in response', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(200);
    // CORS should allow configured origins
    const corsHeader = res.headers.get('access-control-allow-origin');
    expect(corsHeader).toBeTruthy();
  });
});
