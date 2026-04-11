/**
 * Unit / route tests for GET /api/templates, /api/templates/categories,
 * and GET /api/templates/:id.
 *
 * Uses the same mock harness pattern as skillRegistryApp.test.ts.
 */
import { describe, expect, mock, test } from 'bun:test';

mock.module('../../src/store', () => ({
  getSandbox: mock(async () => null),
  deleteSandbox: mock(async () => false),
  listSandboxes: mock(async () => []),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  updateSandboxSharedCodex: mock(async () => {}),
  initDb: mock(async () => {}),
}));

mock.module('../../src/conversationStore', () => ({
  initDb: mock(async () => {}),
  getConversation: mock(async () => null),
  getConversationForSandbox: mock(async () => null),
  listConversationsPage: mock(async () => ({ items: [], has_more: false, next_cursor: null })),
  createConversation: mock(async () => ({})),
  getMessagesPage: mock(async () => ({ messages: [], has_more: false, next_cursor: null })),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
}));

mock.module('../../src/agentStore', () => ({
  initDb: mock(async () => {}),
  listAgents: mock(async () => []),
  listAgentsForCreator: mock(async () => []),
  listAgentsForCreatorInOrg: mock(async () => []),
  saveAgent: mock(async () => ({})),
  getAgent: mock(async () => null),
  getAgentForCreator: mock(async () => null),
  getAgentForCreatorInOrg: mock(async () => null),
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  setForgeSandbox: mock(async () => ({})),
  promoteForgeSandbox: mock(async () => ({})),
  clearForgeSandbox: mock(async () => ({})),
  removeSandboxFromAgent: mock(async () => ({})),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
  getAgentCredentials: mock(async () => []),
  getAgentCredentialSummary: mock(async () => []),
  saveAgentCredential: mock(async () => {}),
  deleteAgentCredential: mock(async () => {}),
  getAgentBySandboxId: mock(async () => null),
}));

mock.module('../../src/credentials', () => ({
  decryptCredentials: mock(() => ({})),
  encryptCredentials: mock(() => ({ encrypted: 'ciphertext', iv: 'nonce' })),
}));

mock.module('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

mock.module('../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  PREVIEW_PORTS: [],
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  restartGateway: mock(async () => ({})),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  dockerExec: mock(async () => [true, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  waitForGateway: mock(async () => true),
  sandboxExec: mock(async () => [0, '']),
}));

mock.module('../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  setTelegramConfig: mock(async () => ({ ok: true, logs: [] })),
  setSlackConfig: mock(async () => ({ ok: true, logs: [] })),
  probeChannelStatus: mock(async () => ({ ok: true })),
  listPairingRequests: mock(async () => ({ ok: true, codes: [] })),
  approvePairing: mock(async () => ({ ok: true })),
}));

mock.module('../../src/backendReadiness', () => ({
  markBackendReady: () => {},
  markBackendNotReady: () => {},
  getBackendReadiness: () => ({ status: 'ready', ready: true, reason: null }),
}));

mock.module('../../src/docker', () => ({
  buildConfigureAgentCronAddCommand: () => '',
  buildCronDeleteCommand: () => '',
  buildCronRunCommand: () => '',
  buildHomeFileWriteCommand: (path: string, content: string) => `WRITE ${path}\n${content}`,
  dockerContainerRunning: mock(async () => true),
  dockerExec: mock(async () => [true, '']),
  dockerSpawn: mock(async () => [0, '']),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  listManagedSandboxContainers: mock(async () => []),
  normalizePathSegment: (value: string) => value,
  parseManagedSandboxContainerList: mock(() => []),
  readContainerPorts: () => ({ gatewayPort: 18789 }),
  shellQuote: (v: string) => `'${v}'`,
}));

mock.module('../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mock(async () => {}),
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
}));

const { app } = await import('../../src/app.ts?unitTemplateRegistryApp');

// ─── Route invocation helpers (same pattern as skillRegistryApp.test.ts) ─────

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
  const done = new Promise<unknown>((resolve) => { resolveJson = resolve; });
  return {
    statusCode: 200,
    body: undefined as unknown,
    done,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; resolveJson?.(payload); return this; },
    setHeader() {},
  };
}

function getRouteHandler(method: string, path: string) {
  const router = (app as unknown as { _router?: { stack: Array<Record<string, unknown>> } })._router;
  if (!router) throw new Error('Express router not initialized');
  const layer = router.stack.find((entry) => {
    const route = entry['route'] as { path?: string; methods?: Record<string, boolean> } | undefined;
    return route?.path === path && route.methods?.[method.toLowerCase()];
  });
  const route = layer?.['route'] as { stack: Array<{ handle: Function }> } | undefined;
  const handle = route?.stack?.[0]?.handle;
  if (!handle) throw new Error(`Route not found: ${method} ${path}`);
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/templates', () => {
  test('returns all templates as a lightweight array (no architecturePlan)', async () => {
    const res = await invokeRoute('GET', '/api/templates', makeReq());

    expect(res.statusCode).toBe(200);
    const body = res.body as unknown[];
    expect(body.length).toBe(8);

    for (const item of body) {
      const t = item as Record<string, unknown>;
      // Metadata fields present
      expect(typeof t['id']).toBe('string');
      expect(typeof t['name']).toBe('string');
      expect(typeof t['category']).toBe('string');
      expect(typeof t['difficulty']).toBe('string');
      expect(typeof t['skillCount']).toBe('number');
      // architecturePlan stripped from list response
      expect(t['architecturePlan']).toBeUndefined();
    }
  });

  test('?category= filters results to the matching category only', async () => {
    const res = await invokeRoute('GET', '/api/templates', makeReq({
      query: { category: 'Engineering' },
    }));

    expect(res.statusCode).toBe(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(body.length).toBeGreaterThanOrEqual(1);
    for (const t of body) {
      expect(t['category']).toBe('Engineering');
    }
  });

  test('?q= search filters by keyword and strips architecturePlan', async () => {
    const res = await invokeRoute('GET', '/api/templates', makeReq({
      query: { q: 'shopify' },
    }));

    expect(res.statusCode).toBe(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]['id']).toBe('shopify-inventory-tracker');
    expect((body[0] as Record<string, unknown>)['architecturePlan']).toBeUndefined();
  });

  test('?q= combined with ?category= returns intersection', async () => {
    const res = await invokeRoute('GET', '/api/templates', makeReq({
      query: { q: 'news', category: 'Productivity' },
    }));

    expect(res.statusCode).toBe(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(body.length).toBeGreaterThanOrEqual(1);
    for (const t of body) {
      expect(t['category']).toBe('Productivity');
    }
  });

  test('returns empty array for an unmatched search query', async () => {
    const res = await invokeRoute('GET', '/api/templates', makeReq({
      query: { q: 'zzznomatchzzz' },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/templates/categories', () => {
  test('returns category list with counts', async () => {
    const res = await invokeRoute('GET', '/api/templates/categories', makeReq());

    expect(res.statusCode).toBe(200);
    const body = res.body as Array<{ category: string; count: number }>;
    expect(body.length).toBeGreaterThanOrEqual(4);

    for (const entry of body) {
      expect(typeof entry.category).toBe('string');
      expect(entry.count).toBeGreaterThan(0);
    }

    // Total count should match total templates
    const total = body.reduce((acc, e) => acc + e.count, 0);
    expect(total).toBe(8);
  });
});

describe('GET /api/templates/:id', () => {
  test('returns the full template with architecturePlan for a valid id', async () => {
    const res = await invokeRoute('GET', '/api/templates/:id', makeReq({
      params: { id: 'weather-reporter' },
    }));

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body['id']).toBe('weather-reporter');
    expect(body['name']).toBe('Weather Reporter');

    // architecturePlan must be present on single-template fetch
    const plan = body['architecturePlan'] as Record<string, unknown>;
    expect(typeof plan['soulContent']).toBe('string');
    expect((plan['soulContent'] as string).length).toBeGreaterThan(50);
    expect(Array.isArray(plan['skills'])).toBe(true);
    expect((plan['skills'] as unknown[]).length).toBe(3);
  });

  test('each skill in the returned plan has a non-empty skill_md', async () => {
    const res = await invokeRoute('GET', '/api/templates/:id', makeReq({
      params: { id: 'daily-news-briefer' },
    }));

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    const plan = body['architecturePlan'] as { skills: Array<{ skill_id: string; skill_md: string }> };
    for (const skill of plan.skills) {
      expect(skill.skill_md.trim().length).toBeGreaterThan(50);
    }
  });

  test('returns 404 for an unknown template id', async () => {
    await expect(
      invokeRoute('GET', '/api/templates/:id', makeReq({
        params: { id: 'nonexistent-xyz' },
      }))
    ).rejects.toMatchObject({
      status: 404,
      message: 'Template not found',
    });
  });

  test('customer-support-bot includes requiredEnvVars and runtimeInputs', async () => {
    const res = await invokeRoute('GET', '/api/templates/:id', makeReq({
      params: { id: 'customer-support-bot' },
    }));

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    const envVars = body['requiredEnvVars'] as Array<{ key: string }>;
    const keys = envVars.map((e) => e.key);
    expect(keys).toContain('SMTP_HOST');
    expect(keys).toContain('SLACK_BOT_TOKEN');

    const inputs = body['runtimeInputs'] as Array<{ key: string }>;
    expect(inputs.some((i) => i.key === 'SUPPORT_EMAIL_TO')).toBe(true);
  });

  test('data-pipeline-monitor has a scheduled cron job defined', async () => {
    const res = await invokeRoute('GET', '/api/templates/:id', makeReq({
      params: { id: 'data-pipeline-monitor' },
    }));

    const body = res.body as Record<string, unknown>;
    const plan = body['architecturePlan'] as { cronJobs: Array<{ name: string; schedule: string; message: string }> };
    expect(plan.cronJobs.length).toBeGreaterThanOrEqual(1);
    const job = plan.cronJobs[0];
    expect(typeof job.name).toBe('string');
    expect(typeof job.schedule).toBe('string');
    expect(typeof job.message).toBe('string');
  });
});
