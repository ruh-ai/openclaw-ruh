import { describe, expect, mock, test } from 'bun:test';

const getSandboxMock = mock(async () => null);
const dockerExecMock = mock(async () => [true, '']);
const buildHomeFileWriteCommandMock = (path: string, content: string) => `WRITE ${path}\n${content}`;
const getAgentMock = mock(async () => null);
const getAgentCredentialsMock = mock(async () => []);
const decryptCredentialsMock = mock((_encrypted: string, _iv: string) => ({}));

mock.module('../../../src/store', () => ({
  getSandbox: getSandboxMock,
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
  listAgents: mock(async () => []),
  saveAgent: mock(async () => ({})),
  getAgent: getAgentMock,
  updateAgent: mock(async () => ({})),
  updateAgentConfig: mock(async () => ({})),
  deleteAgent: mock(async () => true),
  addSandboxToAgent: mock(async () => ({})),
  getAgentCredentials: getAgentCredentialsMock,
}));

mock.module('../../../src/credentials', () => ({
  decryptCredentials: decryptCredentialsMock,
}));

mock.module('../../../src/sandboxManager', () => ({
  createOpenclawSandbox: mock(async function* () {}),
  PREVIEW_PORTS: [],
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  restartGateway: mock(async () => ({})),
  dockerExec: dockerExecMock,
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
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
  buildHomeFileWriteCommand: buildHomeFileWriteCommandMock,
  dockerContainerRunning: mock(async () => true),
  dockerExec: dockerExecMock,
  dockerSpawn: mock(async () => ({ child: null, output: Promise.resolve('') })),
  listManagedSandboxContainers: mock(async () => []),
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (value: string) => value,
}));

mock.module('../../../src/auditStore', () => ({
  initDb: mock(async () => {}),
  writeAuditEvent: mock(async () => {}),
  listAuditEvents: mock(async () => ({ items: [], has_more: false })),
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
    const route = entry['route'] as { path?: string; methods?: Record<string, boolean> } | undefined;
    return route?.path === path && route.methods?.[method.toLowerCase()];
  });

  const route = layer?.['route'] as { stack: Array<{ handle: Function }> } | undefined;
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

describe('skill registry routes', () => {
  test('GET /api/skills returns registry entries', async () => {
    const res = await invokeRoute('GET', '/api/skills', makeReq());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        skill_id: 'slack-reader',
        name: 'Slack Reader',
        tags: expect.arrayContaining(['slack', 'messaging']),
      }),
    ]));
  });

  test('GET /api/skills/:skill_id returns one skill entry', async () => {
    const res = await invokeRoute('GET', '/api/skills/:skill_id', makeReq({
      params: { skill_id: 'slack-reader' },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      skill_id: 'slack-reader',
      name: 'Slack Reader',
      description: 'Reads channels, threads, and message context from Slack workspaces.',
      tags: ['slack', 'messaging', 'collaboration'],
    }));
  });

  test('GET /api/skills/:skill_id returns 404 when the skill does not exist', async () => {
    await expect(invokeRoute('GET', '/api/skills/:skill_id', makeReq({
      params: { skill_id: 'missing-skill' },
    }))).rejects.toMatchObject({
      status: 404,
      message: 'Skill not found',
    });
  });

  test('configure-agent writes registry-backed skill content when a match exists', async () => {
    getSandboxMock.mockResolvedValueOnce({ sandbox_id: 'sandbox-1' });

    const res = await invokeRoute('POST', '/api/sandboxes/:sandbox_id/configure-agent', makeReq({
      method: 'POST',
      params: { sandbox_id: 'sandbox-1' },
      body: {
        system_name: 'Skill Agent',
        soul_content: '',
        skills: [
          {
            skill_id: 'slack_reader',
            name: 'Slack Reader',
            description: 'Read Slack channels.',
          },
        ],
        cron_jobs: [],
        runtime_inputs: [
          {
            key: 'GOOGLE_ADS_CUSTOMER_ID',
            label: 'Customer ID',
            description: 'Google Ads customer ID for the target account.',
            required: true,
            source: 'architect_requirement',
            value: '123-456-7890',
          },
        ],
      },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      applied: true,
      steps: expect.arrayContaining([
        expect.objectContaining({
          kind: 'skill',
          target: 'slack_reader',
          ok: true,
          message: 'Skill slack_reader: registry match (slack-reader)',
        }),
        expect.objectContaining({
          kind: 'runtime_env',
          target: '.openclaw/.env',
          ok: true,
        }),
      ]),
    }));
    expect(dockerExecMock).toHaveBeenCalledWith(
      'openclaw-sandbox-1',
      expect.stringContaining('name: slack-reader'),
      20_000,
    );
    expect(dockerExecMock).toHaveBeenCalledWith(
      'openclaw-sandbox-1',
      expect.stringContaining('# Slack Reader'),
      20_000,
    );
    expect(dockerExecMock).toHaveBeenCalledWith(
      'openclaw-sandbox-1',
      expect.stringContaining('GOOGLE_ADS_CUSTOMER_ID=123-456-7890'),
      20_000,
    );
  });

  test('configure-agent fails closed when a required runtime input value is missing', async () => {
    getSandboxMock.mockResolvedValueOnce({ sandbox_id: 'sandbox-3' });

    const res = await invokeRoute('POST', '/api/sandboxes/:sandbox_id/configure-agent', makeReq({
      method: 'POST',
      params: { sandbox_id: 'sandbox-3' },
      body: {
        system_name: 'Skill Agent',
        soul_content: '',
        skills: [],
        cron_jobs: [],
        runtime_inputs: [
          {
            key: 'GOOGLE_ADS_CUSTOMER_ID',
            label: 'Customer ID',
            description: 'Google Ads customer ID for the target account.',
            required: true,
            source: 'architect_requirement',
            value: '',
          },
        ],
      },
    }));

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      ok: false,
      applied: false,
      detail: 'Missing required runtime inputs: GOOGLE_ADS_CUSTOMER_ID',
      steps: [
        {
          kind: 'runtime_env',
          target: 'GOOGLE_ADS_CUSTOMER_ID',
          ok: false,
          message: 'Missing required runtime input: GOOGLE_ADS_CUSTOMER_ID',
        },
      ],
    });
  });

  test('configure-agent falls back to a stub skill when the registry has no match', async () => {
    getSandboxMock.mockResolvedValueOnce({ sandbox_id: 'sandbox-2' });

    const res = await invokeRoute('POST', '/api/sandboxes/:sandbox_id/configure-agent', makeReq({
      method: 'POST',
      params: { sandbox_id: 'sandbox-2' },
      body: {
        system_name: 'Skill Agent',
        soul_content: '',
        skills: [
          {
            skill_id: 'budget-pacing-report',
            name: 'Budget Pacing Report',
            description: 'Track pacing issues.',
          },
        ],
        cron_jobs: [],
      },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      applied: true,
      steps: [
        expect.objectContaining({
          kind: 'skill',
          target: 'budget-pacing-report',
          ok: true,
          message: 'Skill budget-pacing-report: stub (no registry entry)',
        }),
      ],
    }));
    expect(dockerExecMock).toHaveBeenCalledWith(
      'openclaw-sandbox-2',
      expect.stringContaining('# TODO: Implement this skill'),
      20_000,
    );
  });

  test('configure-agent writes MCP config only for selected configured MCP tools and clears stale extras', async () => {
    getSandboxMock.mockResolvedValueOnce({ sandbox_id: 'sandbox-4' });
    getAgentMock.mockResolvedValueOnce({
      id: 'agent-4',
      tool_connections: [
        {
          toolId: 'google-ads',
          name: 'Google Ads',
          description: 'Ads access',
          status: 'configured',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['Configured'],
        },
        {
          toolId: 'github',
          name: 'GitHub',
          description: 'Repo access',
          status: 'available',
          authKind: 'api_key',
          connectorType: 'mcp',
          configSummary: [],
        },
        {
          toolId: 'slack',
          name: 'Slack',
          description: 'Chat access',
          status: 'configured',
          authKind: 'oauth',
          connectorType: 'api',
          configSummary: ['Configured'],
        },
      ],
      triggers: [],
    });
    getAgentCredentialsMock.mockResolvedValueOnce([
      { toolId: 'google-ads', encrypted: 'enc-ads', iv: 'iv-ads', createdAt: '2026-03-27T00:00:00.000Z' },
      { toolId: 'github', encrypted: 'enc-gh', iv: 'iv-gh', createdAt: '2026-03-27T00:00:00.000Z' },
    ]);
    decryptCredentialsMock.mockImplementation((encrypted: string) =>
      encrypted === 'enc-ads'
        ? {
            GOOGLE_ADS_CLIENT_ID: 'client-id',
            GOOGLE_ADS_CLIENT_SECRET: 'client-secret',
          }
        : {
            GITHUB_PERSONAL_ACCESS_TOKEN: 'gh-token',
          },
    );

    const res = await invokeRoute('POST', '/api/sandboxes/:sandbox_id/configure-agent', makeReq({
      method: 'POST',
      params: { sandbox_id: 'sandbox-4' },
      body: {
        system_name: 'Skill Agent',
        soul_content: '',
        skills: [],
        cron_jobs: [],
        agent_id: 'agent-4',
      },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      applied: true,
      steps: expect.arrayContaining([
        expect.objectContaining({
          kind: 'mcp',
          target: '.openclaw/mcp.json',
          ok: true,
          message: 'MCP config written (1 servers)',
        }),
      ]),
    }));
    expect(dockerExecMock).toHaveBeenCalledWith(
      'openclaw-sandbox-4',
      expect.stringContaining('"google-ads"'),
      15_000,
    );
    expect(dockerExecMock).not.toHaveBeenCalledWith(
      'openclaw-sandbox-4',
      expect.stringContaining('"github"'),
      15_000,
    );
    expect(dockerExecMock).not.toHaveBeenCalledWith(
      'openclaw-sandbox-4',
      expect.stringContaining('"slack"'),
      15_000,
    );
  });

  test('configure-agent rewrites MCP config to an empty server map when no MCP tools remain selected', async () => {
    getSandboxMock.mockResolvedValueOnce({ sandbox_id: 'sandbox-4b' });
    getAgentMock.mockResolvedValueOnce({
      id: 'agent-4b',
      tool_connections: [
        {
          toolId: 'github',
          name: 'GitHub',
          description: 'Repo access',
          status: 'available',
          authKind: 'api_key',
          connectorType: 'mcp',
          configSummary: [],
        },
      ],
      triggers: [],
    });
    getAgentCredentialsMock.mockResolvedValueOnce([
      { toolId: 'github', encrypted: 'enc-gh', iv: 'iv-gh', createdAt: '2026-03-27T00:00:00.000Z' },
    ]);

    const res = await invokeRoute('POST', '/api/sandboxes/:sandbox_id/configure-agent', makeReq({
      method: 'POST',
      params: { sandbox_id: 'sandbox-4b' },
      body: {
        system_name: 'Skill Agent',
        soul_content: '',
        skills: [],
        cron_jobs: [],
        agent_id: 'agent-4b',
      },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      applied: true,
      steps: expect.arrayContaining([
        expect.objectContaining({
          kind: 'mcp',
          target: '.openclaw/mcp.json',
          ok: true,
          message: 'MCP config written (0 servers)',
        }),
      ]),
    }));
    expect(dockerExecMock).toHaveBeenCalledWith(
      'openclaw-sandbox-4b',
      expect.stringContaining('"mcpServers": {}'),
      15_000,
    );
  });

  test('configure-agent fails closed when a selected MCP tool credential cannot be decrypted', async () => {
    getSandboxMock.mockResolvedValueOnce({ sandbox_id: 'sandbox-5' });
    getAgentMock.mockResolvedValueOnce({
      id: 'agent-5',
      tool_connections: [
        {
          toolId: 'google-ads',
          name: 'Google Ads',
          description: 'Ads access',
          status: 'configured',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['Configured'],
        },
      ],
      triggers: [],
    });
    getAgentCredentialsMock.mockResolvedValueOnce([
      { toolId: 'google-ads', encrypted: 'enc-ads', iv: 'iv-ads', createdAt: '2026-03-27T00:00:00.000Z' },
    ]);
    decryptCredentialsMock.mockImplementationOnce(() => {
      throw new Error('bad ciphertext');
    });

    const res = await invokeRoute('POST', '/api/sandboxes/:sandbox_id/configure-agent', makeReq({
      method: 'POST',
      params: { sandbox_id: 'sandbox-5' },
      body: {
        system_name: 'Skill Agent',
        soul_content: '',
        skills: [],
        cron_jobs: [],
        agent_id: 'agent-5',
      },
    }));

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      ok: false,
      applied: false,
      detail: 'Agent config apply failed',
      steps: [
        {
          kind: 'mcp',
          target: 'google-ads',
          ok: false,
          message: 'Failed to decrypt credentials for google-ads',
        },
      ],
    });
  });
});
