import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { SANDBOX_ID, makeSandboxRecord } from '../../helpers/fixtures';

const mockGetSandbox = mock(async () => makeSandboxRecord());
const mockListSandboxes = mock(async () => [makeSandboxRecord()]);
const mockDeleteSandbox = mock(async () => true);
const mockWriteAuditEvent = mock(async () => {});
const mockAxiosGet = mock(async () => ({ status: 200, data: { status: 'running' } }));
const mockDockerContainerRunning = mock(async () => true);
const mockListManagedSandboxContainers = mock(async () => []);
const mockStopAndRemoveContainer = mock(async () => {});

mock.module('../../../src/store', () => ({
  getSandbox: mockGetSandbox,
  listSandboxes: mockListSandboxes,
  deleteSandbox: mockDeleteSandbox,
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  updateSandboxSharedCodex: mock(async () => {}),
  initDb: mock(async () => {}),
}));

mock.module('../../../src/conversationStore', () => ({
  initDb: mock(async () => {}),
  getConversation: mock(async () => null),
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
  saveAgent: mock(async () => ({})),
  getAgent: mock(async () => null),
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
}));

mock.module('../../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({ ok: true })),
  retrofitSandboxToSharedCodex: mock(async () => ({ ok: true })),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  restartGateway: mock(async () => [true, '']),
  PREVIEW_PORTS: [],
  stopAndRemoveContainer: mockStopAndRemoveContainer,
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

mock.module('../../../src/docker', () => ({
  buildConfigureAgentCronAddCommand: () => '',
  buildCronDeleteCommand: () => '',
  buildCronRunCommand: () => '',
  buildHomeFileWriteCommand: () => '',
  dockerContainerRunning: mockDockerContainerRunning,
  dockerExec: mock(async () => [true, '']),
  dockerSpawn: mock(async () => [0, '']),
  listManagedSandboxContainers: mockListManagedSandboxContainers,
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (value: string) => value,
}));

mock.module('../../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mockWriteAuditEvent,
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
}));

mock.module('axios', () => ({
  default: { get: mockAxiosGet, post: mock(async () => ({ status: 200, data: {} })) },
  get: mockAxiosGet,
  post: mock(async () => ({ status: 200, data: {} })),
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
    setHeader() {},
  };
}

function getRouteHandler(method: string, path: string) {
  const router = (app as unknown as { _router?: { stack: Array<Record<string, unknown>> } })._router;
  if (!router) {
    throw new Error('Express router not initialized');
  }

  const layer = router.stack.find((entry) => {
    const route = entry.route as { path?: string; methods?: Record<string, boolean> } | undefined;
    return route?.path === path && route.methods?.[method.toLowerCase()];
  });

  const route = layer?.route as { stack: Array<{ handle: Function }> } | undefined;
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
  process.env.OPENCLAW_ADMIN_TOKEN = 'admin-test-token';
  mockGetSandbox.mockReset();
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  mockListSandboxes.mockReset();
  mockListSandboxes.mockImplementation(async () => [makeSandboxRecord()]);
  mockDeleteSandbox.mockReset();
  mockDeleteSandbox.mockImplementation(async () => true);
  mockWriteAuditEvent.mockReset();
  mockWriteAuditEvent.mockImplementation(async () => {});
  mockAxiosGet.mockReset();
  mockAxiosGet.mockImplementation(async () => ({ status: 200, data: { status: 'running' } }));
  mockDockerContainerRunning.mockReset();
  mockDockerContainerRunning.mockImplementation(async () => true);
  mockListManagedSandboxContainers.mockReset();
  mockListManagedSandboxContainers.mockImplementation(async () => []);
  mockStopAndRemoveContainer.mockReset();
  mockStopAndRemoveContainer.mockImplementation(async () => {});
});

describe('sandbox reconciliation routes', () => {
  test('status route surfaces db_only drift when the DB record has no container', async () => {
    mockAxiosGet.mockImplementation(async () => {
      throw new Error('timeout');
    });
    mockDockerContainerRunning.mockImplementation(async () => false);

    const res = await invokeRoute('GET', '/api/sandboxes/:sandbox_id/status', makeReq({
      params: { sandbox_id: SANDBOX_ID },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      sandbox_id: SANDBOX_ID,
      drift_state: 'db_only',
      container_exists: false,
      gateway_reachable: false,
    });
  });

  test('admin reconcile route requires a valid token', async () => {
    const handler = getRouteHandler('GET', '/api/admin/sandboxes/reconcile');

    await expect(new Promise((resolve, reject) => {
      handler(makeReq({
        headers: {},
      }), makeRes(), (error?: unknown) => {
        if (error) reject(error);
        else resolve(undefined);
      });
    })).rejects.toMatchObject({ status: 401 });
  });

  test('admin reconcile route reports DB-only and container-only sandboxes', async () => {
    mockListSandboxes.mockImplementation(async () => [
      makeSandboxRecord({ sandbox_id: SANDBOX_ID, sandbox_name: 'Tracked Sandbox' }),
    ]);
    mockListManagedSandboxContainers.mockImplementation(async () => [
      {
        sandbox_id: 'orphan-sandbox',
        container_name: 'openclaw-orphan-sandbox',
        state: 'exited',
        running: false,
        status: 'Exited (0) 2 minutes ago',
      },
    ]);

    const res = await invokeRoute('GET', '/api/admin/sandboxes/reconcile', makeReq({
      headers: { authorization: 'Bearer admin-test-token' },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      summary: {
        db_only: 1,
        container_only: 1,
      },
    });
    expect((res.body as { items: Array<{ sandbox_id: string; drift_state: string }> }).items).toEqual([
      expect.objectContaining({ sandbox_id: SANDBOX_ID, drift_state: 'db_only' }),
      expect.objectContaining({ sandbox_id: 'orphan-sandbox', drift_state: 'container_only' }),
    ]);
  });

  test('admin repair route deletes a stale DB-only record', async () => {
    mockListSandboxes.mockImplementation(async () => [
      makeSandboxRecord({ sandbox_id: SANDBOX_ID, sandbox_name: 'Tracked Sandbox' }),
    ]);
    mockListManagedSandboxContainers.mockImplementation(async () => []);

    const res = await invokeRoute('POST', '/api/admin/sandboxes/:sandbox_id/reconcile/repair', makeReq({
      method: 'POST',
      params: { sandbox_id: SANDBOX_ID },
      headers: { authorization: 'Bearer admin-test-token' },
      body: { action: 'delete_db_record' },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockDeleteSandbox).toHaveBeenCalledWith(SANDBOX_ID);
    expect(res.body).toMatchObject({
      ok: true,
      action: 'delete_db_record',
      sandbox_id: SANDBOX_ID,
    });
  });
});
