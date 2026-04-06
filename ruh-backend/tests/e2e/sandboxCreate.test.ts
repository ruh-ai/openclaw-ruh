/**
 * E2E tests for the sandbox creation SSE stream endpoints.
 * Mocks sandboxManager so no real Daytona calls are made.
 */

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';

// ── Mock sandboxManager ───────────────────────────────────────────────────────

async function* fakeSuccessGen(): AsyncGenerator<[string, unknown]> {
  yield ['log', 'Creating sandbox...'];
  yield ['result', {
    sandbox_id: 'sb-e2e-001',
    sandbox_state: 'started',
    dashboard_url: 'https://preview.daytona.io/sb-e2e-001',
    signed_url: null,
    standard_url: 'https://preview.daytona.io/sb-e2e-001',
    preview_token: null,
    gateway_token: 'gw-tok',
    gateway_port: 18789,
    ssh_command: 'daytona ssh sb-e2e-001',
  }];
  yield ['approved', { message: 'Approved device' }];
}

async function* fakeErrorGen(): AsyncGenerator<[string, unknown]> {
  yield ['log', 'Starting...'];
  yield ['error', 'Installation failed'];
}

async function* fakeDisconnectResilientGen(): AsyncGenerator<[string, unknown]> {
  yield ['log', 'Creating sandbox...'];
  await Bun.sleep(25);
  yield ['result', {
    sandbox_id: 'sb-e2e-disconnect',
    sandbox_state: 'started',
    dashboard_url: 'https://preview.daytona.io/sb-e2e-disconnect',
    signed_url: null,
    standard_url: 'https://preview.daytona.io/sb-e2e-disconnect',
    preview_token: null,
    gateway_token: 'gw-tok',
    gateway_port: 18789,
    ssh_command: 'daytona ssh sb-e2e-disconnect',
  }];
  yield ['approved', { message: 'Approved device' }];
}

const mockCreateSandbox = mock(fakeSuccessGen);
const mockSaveSandbox = mock(async () => {});
const mockMarkApproved = mock(async () => {});

mock.module('../../src/sandboxManager', () => ({
  PREVIEW_PORTS: [],
  createOpenclawSandbox: mockCreateSandbox,
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, 'true']),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
  waitForGateway: mock(async () => true),
  sandboxExec: mock(async () => [0, '']),
}));

mock.module('../../src/store', () => ({
  saveSandbox: mockSaveSandbox,
  markApproved: mockMarkApproved,
  listSandboxes: mock(async () => []),
  getSandbox: mock(async () => null),
  deleteSandbox: mock(async () => false),
  initDb: mock(async () => {}),
}));

// ─────────────────────────────────────────────────────────────────────────────

const {
  app,
  request,
  resetStreams,
  _streams,
} = await import('../helpers/app.ts?e2eSandboxCreate');

beforeEach(() => {
  resetStreams();
  mockCreateSandbox.mockImplementation(fakeSuccessGen);
  mockSaveSandbox.mockClear();
  mockMarkApproved.mockClear();
});

afterEach(() => {
  resetStreams();
});

describe('POST /api/sandboxes/create', () => {
  test('returns 200 with stream_id', async () => {
    const res = await request()
      .post('/api/sandboxes/create')
      .send({ sandbox_name: 'test-sb' })
      .expect(200);

    expect(res.body.stream_id).toBeTruthy();
    expect(typeof res.body.stream_id).toBe('string');
  });

  test('returns stream_id without sandbox_name', async () => {
    const res = await request()
      .post('/api/sandboxes/create')
      .send({})
      .expect(200);

    expect(res.body.stream_id).toBeTruthy();
  });
});

describe('GET /api/sandboxes/stream/:stream_id', () => {
  test('returns 404 for unknown stream_id', async () => {
    await request()
      .get('/api/sandboxes/stream/nonexistent-stream')
      .expect(404);
  });

  test('streams SSE events for valid stream_id', async () => {
    // First create the stream
    const createRes = await request()
      .post('/api/sandboxes/create')
      .send({ sandbox_name: 'e2e-test' })
      .expect(200);

    const { stream_id } = createRes.body;

    const res = await request()
      .get(`/api/sandboxes/stream/${stream_id}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const body = res.body as string;
    expect(body).toContain('event: log');
    expect(body).toContain('event: result');
    expect(body).toContain('event: approved');
  });

  test('returns 409 when stream already consumed', async () => {
    const createRes = await request()
      .post('/api/sandboxes/create')
      .send({ sandbox_name: 'e2e-test' })
      .expect(200);

    const { stream_id } = createRes.body;

    // First consumption
    await request()
      .get(`/api/sandboxes/stream/${stream_id}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    // Second attempt should fail
    await request()
      .get(`/api/sandboxes/stream/${stream_id}`)
      .expect(409);
  });

  test('streams error event when sandboxManager yields error', async () => {
    mockCreateSandbox.mockImplementation(fakeErrorGen);

    const createRes = await request()
      .post('/api/sandboxes/create')
      .send({ sandbox_name: 'failing-sb' })
      .expect(200);

    const { stream_id } = createRes.body;

    const res = await request()
      .get(`/api/sandboxes/stream/${stream_id}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    const body = res.body as string;
    expect(body).toContain('event: error');
    expect(body).toContain('Installation failed');
  });

  test('continues provisioning after the SSE client disconnects', async () => {
    mockCreateSandbox.mockImplementation(fakeDisconnectResilientGen);

    const createRes = await request()
      .post('/api/sandboxes/create')
      .send({ sandbox_name: 'disconnect-test' })
      .expect(200);

    const { stream_id } = createRes.body;
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind test server');
      }

      const res = await fetch(`http://127.0.0.1:${address.port}/api/sandboxes/stream/${stream_id}`);
      const reader = res.body?.getReader();
      expect(reader).toBeTruthy();

      const firstChunk = await reader!.read();
      expect(firstChunk.done).toBe(false);
      await reader!.cancel();

      await Bun.sleep(80);

      expect(mockSaveSandbox).toHaveBeenCalledTimes(1);
      expect(mockSaveSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ sandbox_id: 'sb-e2e-disconnect' }),
        'disconnect-test',
      );
      expect(mockMarkApproved).toHaveBeenCalledTimes(1);
      expect(_streams.get(stream_id)?.status).toBe('done');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
