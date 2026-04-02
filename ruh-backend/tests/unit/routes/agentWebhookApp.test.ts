import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';

import { SANDBOX_ID, makeAgentRecord, makeSandboxRecord } from '../../helpers/fixtures';

const webhookSecret = 'whsec_test_secret';
const webhookSecretHash = createHash('sha256').update(webhookSecret).digest('hex');

const mockGetSandbox = mock(async () => makeSandboxRecord());
const mockListAgents = mock(async () => [
  makeAgentRecord({
    id: 'agent-1',
    sandbox_ids: [SANDBOX_ID],
    triggers: [
      {
        id: 'webhook-post',
        title: 'Webhook POST',
        kind: 'webhook',
        status: 'supported',
        description: 'Accept signed inbound POST events.',
        webhookPublicId: 'public-webhook-1',
        webhookSecretHash,
        webhookSecretLastFour: 'cret',
      },
    ],
  }),
]);
const mockUpdateAgentConfig = mock(async () => makeAgentRecord());
const mockAxiosPost = mock(async () => ({ status: 200, data: { ok: true } }));
const mockReserveWebhookDelivery = mock(async () => ({ reserved: true, existingStatus: null }));
const mockMarkWebhookDeliveryStatus = mock(async () => {});

mock.module('../../../src/store', () => ({
  getSandbox: mockGetSandbox,
  deleteSandbox: mock(async () => false),
  listSandboxes: mock(async () => []),
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
  listAgents: mockListAgents,
  saveAgent: mock(async () => ({})),
  getAgent: mock(async () => null),
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mockUpdateAgentConfig,
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
}));

mock.module('../../../src/sandboxManager', () => ({
  PREVIEW_PORTS: [],
  createOpenclawSandbox: mock(async function* () {}),
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, '']),
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
  dockerContainerRunning: mock(async () => true),
  dockerExec: mock(async () => [true, '']),
  dockerSpawn: mock(async () => ({ code: 0, stdout: '', stderr: '' })),
  listManagedSandboxContainers: mock(async () => []),
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (value: string) => value,
}));

mock.module('../../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mock(async () => {}),
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
}));

mock.module('../../../src/webhookDeliveryStore', () => ({
  reserveWebhookDelivery: mockReserveWebhookDelivery,
  markWebhookDeliveryStatus: mockMarkWebhookDeliveryStatus,
}));

mock.module('axios', () => ({
  default: { get: mock(async () => ({ status: 200, data: {} })), post: mockAxiosPost },
  get: mock(async () => ({ status: 200, data: {} })),
  post: mockAxiosPost,
}));

const { app } = await import('../../../src/app');

type MockReq = {
  method: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  ip: string;
  protocol: string;
  get: (name: string) => string | undefined;
  socket: { remoteAddress: string };
};

function makeReq(overrides: Partial<MockReq> = {}): MockReq {
  return {
    method: 'POST',
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    protocol: 'http',
    get: (name: string) => (name.toLowerCase() === 'host' ? 'localhost:8000' : undefined),
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
  mockGetSandbox.mockReset();
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  mockListAgents.mockReset();
  mockListAgents.mockImplementation(async () => [
    makeAgentRecord({
      id: 'agent-1',
      sandbox_ids: [SANDBOX_ID],
      triggers: [
        {
          id: 'webhook-post',
          title: 'Webhook POST',
          kind: 'webhook',
          status: 'supported',
          description: 'Accept signed inbound POST events.',
          webhookPublicId: 'public-webhook-1',
          webhookSecretHash,
          webhookSecretLastFour: 'cret',
        },
      ],
    }),
  ]);
  mockUpdateAgentConfig.mockReset();
  mockUpdateAgentConfig.mockImplementation(async () => makeAgentRecord());
  mockAxiosPost.mockReset();
  mockAxiosPost.mockImplementation(async () => ({ status: 200, data: { ok: true } }));
  mockReserveWebhookDelivery.mockReset();
  mockReserveWebhookDelivery.mockImplementation(async () => ({ reserved: true, existingStatus: null }));
  mockMarkWebhookDeliveryStatus.mockReset();
  mockMarkWebhookDeliveryStatus.mockImplementation(async () => {});
});

describe('agent webhook delivery route', () => {
  test('accepts a valid signed webhook and forwards it into the active sandbox session', async () => {
    const res = await invokeRoute('POST', '/api/triggers/webhooks/:public_id', makeReq({
      params: { public_id: 'public-webhook-1' },
      headers: {
        'x-openclaw-webhook-secret': webhookSecret,
        'x-openclaw-delivery-id': 'delivery-1',
      },
      body: { campaignId: 'cmp_123', event: 'budget_alert' },
    }));

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({
      ok: true,
      accepted: true,
      agent_id: 'agent-1',
      trigger_id: 'webhook-post',
      delivery_id: 'delivery-1',
      sandbox_id: SANDBOX_ID,
    });
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost.mock.calls[0]?.[0]).toContain('/v1/chat/completions');
    expect(mockAxiosPost.mock.calls[0]?.[1]).toMatchObject({
      model: 'openclaw',
      stream: false,
    });
    expect(mockAxiosPost.mock.calls[0]?.[2]).toMatchObject({
      headers: expect.objectContaining({
        'x-openclaw-session-key': 'agent:trigger:agent-1:webhook-post',
      }),
    });
    expect(mockUpdateAgentConfig).toHaveBeenCalled();
    expect(mockReserveWebhookDelivery).toHaveBeenCalledWith({
      publicId: 'public-webhook-1',
      deliveryId: 'delivery-1',
      agentId: 'agent-1',
      triggerId: 'webhook-post',
    });
    expect(mockMarkWebhookDeliveryStatus).toHaveBeenCalledWith('public-webhook-1', 'delivery-1', 'delivered');
  });

  test('rejects invalid webhook secrets before invoking the sandbox', async () => {
    const resPromise = invokeRoute('POST', '/api/triggers/webhooks/:public_id', makeReq({
      params: { public_id: 'public-webhook-1' },
      headers: {
        'x-openclaw-webhook-secret': 'wrong-secret',
        'x-openclaw-delivery-id': 'delivery-2',
      },
      body: { event: 'budget_alert' },
    }));

    await expect(resPromise).rejects.toMatchObject({
      status: 401,
      message: 'Invalid webhook secret',
    });
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  test('rejects duplicate delivery ids before invoking the sandbox again', async () => {
    mockReserveWebhookDelivery.mockImplementation(async () => ({ reserved: false, existingStatus: 'delivered' }));

    const res = await invokeRoute('POST', '/api/triggers/webhooks/:public_id', makeReq({
      params: { public_id: 'public-webhook-1' },
      headers: {
        'x-openclaw-webhook-secret': webhookSecret,
        'x-openclaw-delivery-id': 'delivery-3',
      },
      body: { event: 'budget_alert' },
    }));

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      ok: false,
      accepted: false,
      duplicate: true,
      agent_id: 'agent-1',
      trigger_id: 'webhook-post',
      delivery_id: 'delivery-3',
      delivery_status: 'delivered',
    });
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockMarkWebhookDeliveryStatus).not.toHaveBeenCalled();
  });

  test('requires a delivery id header', async () => {
    const resPromise = invokeRoute('POST', '/api/triggers/webhooks/:public_id', makeReq({
      params: { public_id: 'public-webhook-1' },
      headers: { 'x-openclaw-webhook-secret': webhookSecret },
      body: { event: 'budget_alert' },
    }));

    await expect(resPromise).rejects.toMatchObject({
      status: 400,
      message: 'x-openclaw-delivery-id header is required',
    });
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockReserveWebhookDelivery).not.toHaveBeenCalled();
  });

  test('rejects oversized payloads before sandbox delivery', async () => {
    const resPromise = invokeRoute('POST', '/api/triggers/webhooks/:public_id', makeReq({
      params: { public_id: 'public-webhook-1' },
      headers: {
        'x-openclaw-webhook-secret': webhookSecret,
        'x-openclaw-delivery-id': 'delivery-4',
      },
      body: { payload: 'x'.repeat(70 * 1024) },
    }));

    await expect(resPromise).rejects.toMatchObject({
      status: 413,
      message: 'Webhook payload exceeds 65536 bytes',
    });
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockReserveWebhookDelivery).not.toHaveBeenCalled();
  });
});
