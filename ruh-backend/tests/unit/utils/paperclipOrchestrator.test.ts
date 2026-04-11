import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ── Mock dependencies ───────────────────────────────────────────────────────

const mockIsAvailable = mock(async () => false);
const mockCreateCompany = mock(async () => null);
const mockCreateWorker = mock(async () => null);
const mockLogCostEvent = mock(async () => true);

mock.module('../../../src/paperclipClient', () => ({
  isAvailable: mockIsAvailable,
  createCompany: mockCreateCompany,
  createWorker: mockCreateWorker,
  logCostEvent: mockLogCostEvent,
}));

const mockRecordAndAnalyzeExecution = mock(async () => null);

mock.module('../../../src/openspaceClient', () => ({
  isEnabled: () => true,
  recordAndAnalyzeExecution: mockRecordAndAnalyzeExecution,
}));

const mockGetAgent = mock(async () => null);
const mockUpdatePaperclipMapping = mock(async () => null);

mock.module('../../../src/agentStore', () => ({
  getAgent: mockGetAgent,
  updatePaperclipMapping: mockUpdatePaperclipMapping,
}));

const {
  provisionPaperclipCompany,
  logPostChatMetrics,
  recordAndAnalyze,
  teardownPaperclipCompany,
} = await import('../../../src/paperclipOrchestrator');

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'A test agent',
    avatar: '',
    skills: [],
    trigger_label: '',
    status: 'active',
    sandbox_ids: [],
    forge_sandbox_id: null,
    skill_graph: null,
    workflow: null,
    agent_rules: [],
    tool_connections: [],
    triggers: [],
    improvements: [],
    workspace_memory: { instructions: '', continuity_summary: '', pinned_paths: [], updated_at: null },
    agent_credentials: [],
    channels: [],
    discovery_documents: null,
    paperclip_company_id: null,
    paperclip_workers: [],
    creation_session: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    responseContent: 'Hello, here is the analysis result.',
    toolCalls: [
      { tool: 'web_search', detail: 'query', elapsedMs: 150, status: 'success' },
    ],
    totalToolCalls: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mockIsAvailable.mockReset();
  mockIsAvailable.mockImplementation(async () => false);
  mockCreateCompany.mockReset();
  mockCreateCompany.mockImplementation(async () => null);
  mockCreateWorker.mockReset();
  mockCreateWorker.mockImplementation(async () => null);
  mockLogCostEvent.mockReset();
  mockLogCostEvent.mockImplementation(async () => true);
  mockRecordAndAnalyzeExecution.mockReset();
  mockRecordAndAnalyzeExecution.mockImplementation(async () => null);
  mockGetAgent.mockReset();
  mockGetAgent.mockImplementation(async () => null);
  mockUpdatePaperclipMapping.mockReset();
  mockUpdatePaperclipMapping.mockImplementation(async () => null);
});

// ── provisionPaperclipCompany ───────────────────────────────────────────────

describe('provisionPaperclipCompany', () => {
  test('skips when Paperclip is unavailable', async () => {
    mockIsAvailable.mockImplementation(async () => false);
    await provisionPaperclipCompany(makeAgent() as any);
    expect(mockCreateCompany).not.toHaveBeenCalled();
  });

  test('skips when agent already has a Paperclip company', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    await provisionPaperclipCompany(makeAgent({ paperclip_company_id: 'existing-co' }) as any);
    expect(mockCreateCompany).not.toHaveBeenCalled();
  });

  test('creates company + coordinator + skill workers', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    mockCreateCompany.mockImplementation(async () => ({ id: 'co-1', name: 'Test Agent' }));
    mockCreateWorker.mockImplementation(async () => ({ id: 'worker-1' }));

    const agent = makeAgent({
      skill_graph: [
        { name: 'search', category: 'data' },
        { name: 'analyze', category: 'data' },
      ],
    });

    await provisionPaperclipCompany(agent as any);
    expect(mockCreateCompany).toHaveBeenCalledWith('Test Agent', 'A test agent');
    // Coordinator + 1 cluster worker = 2 createWorker calls
    expect(mockCreateWorker).toHaveBeenCalledTimes(2);
    expect(mockUpdatePaperclipMapping).toHaveBeenCalledWith(
      'agent-1',
      'co-1',
      expect.any(Array),
    );
  });

  test('handles company creation failure gracefully', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    mockCreateCompany.mockImplementation(async () => null);

    await provisionPaperclipCompany(makeAgent() as any);
    expect(mockCreateWorker).not.toHaveBeenCalled();
    expect(mockUpdatePaperclipMapping).not.toHaveBeenCalled();
  });
});

// ── logPostChatMetrics ──────────────────────────────────────────────────────

describe('logPostChatMetrics', () => {
  test('skips when agent has no Paperclip company', async () => {
    await logPostChatMetrics(makeAgent() as any, { inputTokens: 100, outputTokens: 50 });
    expect(mockLogCostEvent).not.toHaveBeenCalled();
  });

  test('skips when Paperclip is unavailable', async () => {
    mockIsAvailable.mockImplementation(async () => false);
    const agent = makeAgent({
      paperclip_company_id: 'co-1',
      paperclip_workers: [{ worker_id: 'w1', paperclip_agent_id: 'pa-1', role: 'ceo', name: 'Coordinator', skill_cluster: [] }],
    });
    await logPostChatMetrics(agent as any, { inputTokens: 100, outputTokens: 50 });
    expect(mockLogCostEvent).not.toHaveBeenCalled();
  });

  test('logs cost event with estimated cost formula', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    const agent = makeAgent({
      paperclip_company_id: 'co-1',
      paperclip_workers: [{ worker_id: 'w1', paperclip_agent_id: 'pa-1', role: 'ceo', name: 'Coordinator', skill_cluster: [] }],
    });

    await logPostChatMetrics(agent as any, {
      model: 'claude-sonnet',
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(mockLogCostEvent).toHaveBeenCalledWith('co-1', expect.objectContaining({
      agentId: 'pa-1',
      model: 'claude-sonnet',
      inputTokens: 1000,
      outputTokens: 500,
    }));

    // Verify cost estimation: (1000 * 0.0003 + 500 * 0.0015) / 10 = (0.3 + 0.75) / 10 = 0.105
    const call = mockLogCostEvent.mock.calls[0];
    const costCents = (call[1] as Record<string, unknown>).costCents as number;
    expect(costCents).toBeCloseTo(0.105, 3);
  });
});

// ── recordAndAnalyze ────────────────────────────────────────────────────────

describe('recordAndAnalyze', () => {
  test('calls openspace.recordAndAnalyzeExecution', async () => {
    const agent = makeAgent();
    const execution = makeExecution();

    await recordAndAnalyze(agent as any, 'sandbox-1', execution as any);
    expect(mockRecordAndAnalyzeExecution).toHaveBeenCalledWith('sandbox-1', execution);
  });

  test('handles evolved skills from analysis', async () => {
    mockRecordAndAnalyzeExecution.mockImplementation(async () => ({
      executionRecorded: true,
      existingSkillCount: 2,
      toolCallCount: 3,
      evolvedSkills: [
        { skillId: 'sk-1', name: 'Web Search', evolutionType: 'CAPTURED', version: 1, skillDir: '/skills/web-search' },
      ],
    }));

    const agent = makeAgent();
    await expect(recordAndAnalyze(agent as any, 'sandbox-1', makeExecution() as any)).resolves.not.toThrow();
  });

  test('logs cost to Paperclip when company is configured and tool calls exist', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    mockRecordAndAnalyzeExecution.mockImplementation(async () => null);

    const agent = makeAgent({
      paperclip_company_id: 'co-1',
      paperclip_workers: [{ worker_id: 'w1', paperclip_agent_id: 'pa-1', role: 'ceo', name: 'Coordinator', skill_cluster: [] }],
    });
    const execution = makeExecution({ totalToolCalls: 3 });

    await recordAndAnalyze(agent as any, 'sandbox-1', execution as any);
    expect(mockLogCostEvent).toHaveBeenCalled();
  });
});

// ── teardownPaperclipCompany ────────────────────────────────────────────────

describe('teardownPaperclipCompany', () => {
  test('logs cleanup intent when agent has Paperclip company', async () => {
    mockGetAgent.mockImplementation(async () => makeAgent({ paperclip_company_id: 'co-1' }));

    // Should not throw
    await teardownPaperclipCompany('agent-1');
    expect(mockGetAgent).toHaveBeenCalledWith('agent-1');
  });

  test('does nothing when agent has no Paperclip company', async () => {
    mockGetAgent.mockImplementation(async () => makeAgent());
    await expect(teardownPaperclipCompany('agent-1')).resolves.not.toThrow();
  });

  test('does nothing when agent not found', async () => {
    mockGetAgent.mockImplementation(async () => null);
    await expect(teardownPaperclipCompany('unknown')).resolves.not.toThrow();
  });
});

// ── extractSkillClusters (tested indirectly via provisionPaperclipCompany) ─

describe('extractSkillClusters (via provisioning)', () => {
  test('empty skill_graph produces General Worker', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    mockCreateCompany.mockImplementation(async () => ({ id: 'co-1', name: 'Agent' }));
    mockCreateWorker.mockImplementation(async () => ({ id: 'w-1' }));

    await provisionPaperclipCompany(makeAgent({ skill_graph: null }) as any);
    // Coordinator + General Worker = 2 calls
    expect(mockCreateWorker).toHaveBeenCalledTimes(2);
    const workerCalls = mockCreateWorker.mock.calls;
    const lastWorkerCall = workerCalls[workerCalls.length - 1];
    expect((lastWorkerCall[1] as Record<string, unknown>).name).toBe('General Worker');
  });

  test('single category produces one worker', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    mockCreateCompany.mockImplementation(async () => ({ id: 'co-1', name: 'Agent' }));
    mockCreateWorker.mockImplementation(async () => ({ id: 'w-1' }));

    const agent = makeAgent({
      skill_graph: [
        { name: 'search', category: 'data' },
        { name: 'index', category: 'data' },
      ],
    });
    await provisionPaperclipCompany(agent as any);
    // Coordinator + 1 cluster = 2 calls
    expect(mockCreateWorker).toHaveBeenCalledTimes(2);
  });

  test('multiple categories produce multiple workers', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    mockCreateCompany.mockImplementation(async () => ({ id: 'co-1', name: 'Agent' }));
    mockCreateWorker.mockImplementation(async () => ({ id: 'w-1' }));

    const agent = makeAgent({
      skill_graph: [
        { name: 'search', category: 'data-analysis' },
        { name: 'send_email', category: 'communication' },
      ],
    });
    await provisionPaperclipCompany(agent as any);
    // Coordinator + 2 clusters = 3 calls
    expect(mockCreateWorker).toHaveBeenCalledTimes(3);
  });

  test('malformed skill_graph nodes are skipped', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    mockCreateCompany.mockImplementation(async () => ({ id: 'co-1', name: 'Agent' }));
    mockCreateWorker.mockImplementation(async () => ({ id: 'w-1' }));

    const agent = makeAgent({
      skill_graph: [null, 42, { noName: true }, { name: 'valid', category: 'ops' }],
    });
    await provisionPaperclipCompany(agent as any);
    // Coordinator + 1 valid cluster = 2 calls
    expect(mockCreateWorker).toHaveBeenCalledTimes(2);
  });
});

// ── formatWorkerName (tested indirectly via provisioning) ───────────────────

describe('formatWorkerName (via provisioning)', () => {
  test('general category becomes General Worker', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    mockCreateCompany.mockImplementation(async () => ({ id: 'co-1', name: 'Agent' }));
    mockCreateWorker.mockImplementation(async () => ({ id: 'w-1' }));

    const agent = makeAgent({
      skill_graph: [{ name: 'task', category: 'general' }],
    });
    await provisionPaperclipCompany(agent as any);

    const workerCalls = mockCreateWorker.mock.calls;
    const clusterWorkerCall = workerCalls[workerCalls.length - 1];
    expect((clusterWorkerCall[1] as Record<string, unknown>).name).toBe('General Worker');
  });

  test('data-analysis category becomes Data Analysis', async () => {
    mockIsAvailable.mockImplementation(async () => true);
    mockCreateCompany.mockImplementation(async () => ({ id: 'co-1', name: 'Agent' }));
    mockCreateWorker.mockImplementation(async () => ({ id: 'w-1' }));

    // Need two categories so it doesn't get collapsed to a single worker named after the category
    const agent = makeAgent({
      skill_graph: [
        { name: 'analyze', category: 'data-analysis' },
        { name: 'email', category: 'communication' },
      ],
    });
    await provisionPaperclipCompany(agent as any);

    const workerCalls = mockCreateWorker.mock.calls;
    // Find the data-analysis worker call (not coordinator)
    const names = workerCalls.slice(1).map(
      (c) => (c[1] as Record<string, unknown>).name as string,
    );
    expect(names).toContain('Data Analysis');
    expect(names).toContain('Communication');
  });
});
