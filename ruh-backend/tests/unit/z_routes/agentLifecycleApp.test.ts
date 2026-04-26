import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Readable, Writable } from 'node:stream';

const mockGetAgentForCreator = mock(async (id: string) => ({
  id,
  name: 'Lifecycle Agent',
  description: 'An agent moving through forge stages',
  status: 'forging',
  forge_sandbox_id: 'sandbox-lifecycle-001',
  sandbox_ids: ['sandbox-lifecycle-001'],
  repo_url: null,
  active_branch: 'main',
}));
const mockUpdateAgent = mock(async () => ({}));
const mockReadWorkspaceCopilotFile = mock(async () => null as string | null);
const mockListEvalResults = mock(async () => ({ items: [], total: 0 }));

mock.module('../../../src/store', () => ({
  getSandbox: mock(async () => null),
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
  getConversationForSandbox: mock(async () => null),
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
  listAgentsForCreator: mock(async () => []),
  listAgentsForCreatorInOrg: mock(async () => []),
  saveAgent: mock(async () => ({})),
  getAgent: mock(async () => null),
  getAgentForCreator: mockGetAgentForCreator,
  getAgentForCreatorInOrg: mock(async () => null),
  getAgentOwnership: mock(async () => null),
  updateAgent: mockUpdateAgent,
  updateAgentConfig: mock(async () => ({})),
  addSandboxToAgent: mock(async () => ({})),
  removeSandboxFromAgent: mock(async () => ({})),
  setForgeSandbox: mock(async () => ({})),
  promoteForgeSandbox: mock(async () => ({})),
  clearForgeSandbox: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  getAgentWorkspaceMemory: mock(async () => null),
  updateAgentWorkspaceMemory: mock(async () => null),
  updatePaperclipMapping: mock(async () => null),
  getAgentBySandboxId: mock(async () => null),
  saveAgentCredential: mock(async () => {}),
  deleteAgentCredential: mock(async () => {}),
  getAgentCredentials: mock(async () => []),
  getAgentCredentialSummary: mock(async () => []),
}));

mock.module('../../../src/evalResultStore', () => ({
  createEvalResult: mock(async () => ({})),
  getEvalResult: mock(async () => null),
  listEvalResults: mockListEvalResults,
  deleteEvalResult: mock(async () => true),
}));

mock.module('../../../src/auth/middleware', () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: (error?: unknown) => void) => {
    req.user = {
      userId: 'user-test-001',
      email: 'developer@test.dev',
      role: 'developer',
      orgId: 'org-test-001',
    };
    next();
  },
  optionalAuth: (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
}));

mock.module('../../../src/auth/builderAccess', () => ({
  requireActiveDeveloperOrg: mock(async (user?: Record<string, unknown>) => ({
    user,
    organization: {
      id: 'org-test-001',
      name: 'Test Dev Org',
      slug: 'test-dev-org',
      kind: 'developer',
      plan: 'free',
    },
  })),
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
  ensureInteractiveRuntimeServices: mock(async () => {}),
  waitForGateway: mock(async () => true),
  retrofitContainerToSharedCodex: mock(async () => ({ ok: true })),
}));

mock.module('../../../src/channelManager', () => ({
  getChannelsConfig: mock(async () => ({})),
  getFormattedChannelsConfig: mock(async () => ({})),
  configureChannels: mock(async () => ({ ok: true })),
}));

mock.module('../../../src/docker', () => ({
  dockerContainerRunning: mock(async () => false),
  dockerExec: mock(async () => [true, '']),
  dockerSpawn: mock(async () => [0, '']),
  getContainerName: (id: string) => `openclaw-${id}`,
  shellQuote: (v: string) => `'${v}'`,
  joinShellArgs: (args: unknown[]) => args.map(String).join(' '),
  normalizePathSegment: (v: string) => v,
  buildHomeFileWriteCommand: mock(() => 'echo ok'),
  buildConfigureAgentCronAddCommand: mock(() => 'echo ok'),
  buildCronDeleteCommand: mock(() => 'echo ok'),
  buildCronRunCommand: mock(() => 'echo ok'),
  parseManagedSandboxContainerList: mock(() => []),
  listManagedSandboxContainers: mock(async () => []),
  readContainerPorts: () => ({ gatewayPort: 18789 }),
}));

mock.module('../../../src/backendReadiness', () => ({
  markBackendReady: mock(() => {}),
  markBackendNotReady: mock(() => {}),
  getBackendReadiness: mock(() => ({ status: 'ready', reason: null, timestamp: Date.now() })),
}));

mock.module('../../../src/workspaceWriter', () => ({
  writeWorkspaceFile: mock(async () => ({ ok: true })),
  writeWorkspaceFiles: mock(async () => []),
  mergeWorkspaceCopilotToMain: mock(async () => true),
  readWorkspaceCopilotFile: mockReadWorkspaceCopilotFile,
}));

mock.module('../../../src/gitWorkspace', () => ({
  commitWorkspace: mock(async () => ({ sha: 'abc123' })),
  pushBranch: mock(async () => ({})),
}));

mock.module('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { app, _streams } = await import('../../../src/app.ts?unitAgentLifecycleApp');

async function patchForgeStage(agentId: string, body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  const req = new Readable({
    read() {
      this.push(payload);
      this.push(null);
    },
  }) as Readable & {
    method: string;
    url: string;
    originalUrl: string;
    headers: Record<string, string>;
    connection: Record<string, unknown>;
    socket: Record<string, unknown>;
  };
  req.method = 'PATCH';
  req.url = `/api/agents/${agentId}/forge/stage`;
  req.originalUrl = req.url;
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(payload)),
  };
  req.connection = { destroy: () => {} };
  req.socket = { destroy: () => {} };

  const chunks: Buffer[] = [];
  const headers = new Map<string, unknown>();
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      callback();
    },
  }) as Writable & {
    statusCode: number;
    statusMessage: string;
    headersSent: boolean;
    setHeader: (name: string, value: unknown) => void;
    getHeader: (name: string) => unknown;
    getHeaders: () => Record<string, unknown>;
    removeHeader: (name: string) => void;
    writeHead: (statusCode: number, statusMessageOrHeaders?: string | Record<string, unknown>, headerValues?: Record<string, unknown>) => typeof res;
  };
  res.statusCode = 200;
  res.statusMessage = 'OK';
  res.headersSent = false;
  const emit = res.emit.bind(res);
  const on = res.on.bind(res);
  (res as unknown as { on: typeof res.on }).on = on;
  (res as unknown as { emit: typeof res.emit }).emit = emit;
  (res as unknown as { write: (chunk: unknown) => boolean }).write = (chunk) => {
    if (chunk !== undefined) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return true;
  };
  (res as unknown as { end: (chunk?: unknown) => typeof res }).end = (chunk) => {
    if (chunk !== undefined) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    res.headersSent = true;
    queueMicrotask(() => emit('finish'));
    return res;
  };
  res.setHeader = (name, value) => {
    headers.set(name.toLowerCase(), value);
  };
  res.getHeader = (name) => headers.get(name.toLowerCase());
  res.getHeaders = () => Object.fromEntries(headers);
  res.removeHeader = (name) => {
    headers.delete(name.toLowerCase());
  };
  res.writeHead = (statusCode, statusMessageOrHeaders, headerValues) => {
    res.statusCode = statusCode;
    res.headersSent = true;
    const nextHeaders = typeof statusMessageOrHeaders === 'string' ? headerValues : statusMessageOrHeaders;
    for (const [name, value] of Object.entries(nextHeaders ?? {})) {
      res.setHeader(name, value);
    }
    return res;
  };

  await new Promise<void>((resolve, reject) => {
    res.on('finish', resolve);
    res.on('error', reject);
    app.handle(req as never, res as never);
  });

  const text = Buffer.concat(chunks).toString('utf8');
  const json = text ? JSON.parse(text) : {};
  return { status: res.statusCode, body: json };
}

beforeEach(() => {
  mockGetAgentForCreator.mockClear();
  mockUpdateAgent.mockClear();
  mockReadWorkspaceCopilotFile.mockClear();
  mockReadWorkspaceCopilotFile.mockResolvedValue(null);
  mockListEvalResults.mockClear();
  mockListEvalResults.mockResolvedValue({ items: [], total: 0 });
  _streams.clear();
});

afterEach(() => {
  _streams.clear();
});

describe('PATCH /api/agents/:id/forge/stage lifecycle guards', () => {
  test('rejects review stage when build report is missing', async () => {
    const res = await patchForgeStage('agent-lifecycle-001', { stage: 'review' });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('build report');
    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });

  test('allows review stage when build report is test-ready', async () => {
    mockReadWorkspaceCopilotFile.mockResolvedValue(JSON.stringify({
      readiness: 'test-ready',
      blockers: [],
    }));

    const res = await patchForgeStage('agent-lifecycle-001', { stage: 'review' });

    expect(res.status).toBe(200);
    expect(res.body.forge_stage).toBe('review');
    expect(mockUpdateAgent).toHaveBeenCalledWith(
      'agent-lifecycle-001',
      { forge_stage: 'review' },
    );
  });

  test('rejects test stage when build report is blocked', async () => {
    mockReadWorkspaceCopilotFile.mockResolvedValue(JSON.stringify({
      readiness: 'blocked',
      blockers: ['Required setup failed: dashboard-build'],
    }));

    const res = await patchForgeStage('agent-lifecycle-001', { stage: 'test' });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('Required setup failed');
    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });

  test('rejects ship stage when no passing eval result exists', async () => {
    const res = await patchForgeStage('agent-lifecycle-001', { stage: 'ship' });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('passing test');
    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });

  test('allows ship stage when a passing eval result exists', async () => {
    mockListEvalResults.mockResolvedValue({
      total: 1,
      items: [{
        id: 'eval-1',
        agent_id: 'agent-lifecycle-001',
        sandbox_id: 'sandbox-lifecycle-001',
        mode: 'live',
        tasks: [],
        loop_state: null,
        pass_rate: 1,
        avg_score: 0.9,
        total_tasks: 2,
        passed_tasks: 2,
        failed_tasks: 0,
        iterations: 1,
        stop_reason: null,
        created_at: new Date().toISOString(),
      }],
    });

    const res = await patchForgeStage('agent-lifecycle-001', { stage: 'ship' });

    expect(res.status).toBe(200);
    expect(res.body.forge_stage).toBe('ship');
  });

  test('rejects direct complete stage updates', async () => {
    const res = await patchForgeStage('agent-lifecycle-001', { stage: 'complete' });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('Ship endpoint');
    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });
});
