/**
 * Contract tests: cost-tracking endpoints must return documented response shapes.
 * Validates API contract for Phase 1 of the multi-worker agent architecture.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { request } from '../helpers/app';
import { makeSandboxRecord } from '../helpers/fixtures';
import { signAccessToken } from '../../src/auth/tokens';

function devToken() {
  return signAccessToken({ userId: 'usr-dev-001', email: 'dev@test.dev', role: 'developer', orgId: 'org-001' });
}

// ── Fake data ────────────────────────────────────────────────────────────────

function makeFakeCostEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ce-001',
    agent_id: 'agent-001',
    worker_id: null,
    task_id: 'task-001',
    run_id: 'run-abc',
    model: 'claude-sonnet-4-6',
    input_tokens: 1000,
    output_tokens: 500,
    cost_cents: '0.3500',
    created_at: '2026-03-30T10:00:00.000Z',
    ...overrides,
  };
}

function makeFakeBudgetPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bp-001',
    agent_id: 'agent-001',
    worker_id: null,
    monthly_cap_cents: 10000,
    soft_warning_pct: 80,
    hard_stop: true,
    created_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFakeMonthlySummary(overrides: Record<string, unknown> = {}) {
  return {
    agent_id: 'agent-001',
    month: '2026-03',
    total_cost_cents: 120.5,
    total_input_tokens: 50000,
    total_output_tokens: 25000,
    event_count: 42,
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockCreateCostEvent = mock(async () => makeFakeCostEvent());
const mockListCostEvents = mock(async () => ({ items: [makeFakeCostEvent()], has_more: false }));
const mockGetMonthlySummary = mock(async () => makeFakeMonthlySummary());
const mockUpsertBudgetPolicy = mock(async () => makeFakeBudgetPolicy());
const mockGetBudgetPolicy = mock(async () => makeFakeBudgetPolicy());
const mockGetBudgetStatus = mock(async () => ({
  policy: makeFakeBudgetPolicy(),
  spent_cents: 1205,
  cap_cents: 10000,
  utilization_pct: 12,
  at_soft_warning: false,
  at_hard_stop: false,
}));

mock.module('../../src/costStore', () => ({
  createCostEvent: mockCreateCostEvent,
  listCostEvents: mockListCostEvents,
  getMonthlySummary: mockGetMonthlySummary,
  upsertBudgetPolicy: mockUpsertBudgetPolicy,
  getBudgetPolicy: mockGetBudgetPolicy,
  getBudgetStatus: mockGetBudgetStatus,
}));

const mockCreateRecording = mock(async () => ({
  id: 'er-001',
  agent_id: 'agent-001',
  worker_id: null,
  task_id: null,
  run_id: 'run-abc',
  success: true,
  tool_calls: [],
  tokens_used: { input: 1000, output: 500 },
  skills_applied: ['smart-bidding-v3'],
  skills_effective: ['smart-bidding-v3'],
  started_at: '2026-03-30T10:00:00.000Z',
  completed_at: '2026-03-30T10:01:00.000Z',
  created_at: '2026-03-30T10:01:00.000Z',
}));
const mockListRecordings = mock(async () => ({ items: [], has_more: false }));

mock.module('../../src/executionRecordingStore', () => ({
  createExecutionRecording: mockCreateRecording,
  getExecutionRecording: mock(async () => null),
  listExecutionRecordings: mockListRecordings,
}));

// Required stubs for app.ts to boot
mock.module('../../src/store', () => ({
  getSandbox: mock(async () => makeSandboxRecord()),
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
  get: mock(async () => ({})),
  post: mock(async () => ({})),
}));

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockCreateCostEvent.mockImplementation(async () => makeFakeCostEvent());
  mockListCostEvents.mockImplementation(async () => ({ items: [makeFakeCostEvent()], has_more: false }));
  mockGetMonthlySummary.mockImplementation(async () => makeFakeMonthlySummary());
  mockUpsertBudgetPolicy.mockImplementation(async () => makeFakeBudgetPolicy());
  mockGetBudgetPolicy.mockImplementation(async () => makeFakeBudgetPolicy());
});

// ── Shape validators ──────────────────────────────────────────────────────────

function assertCostEventShape(e: Record<string, unknown>) {
  expect(typeof e.id).toBe('string');
  expect(typeof e.agent_id).toBe('string');
  expect(typeof e.model).toBe('string');
  expect(typeof e.input_tokens).toBe('number');
  expect(typeof e.output_tokens).toBe('number');
  expect(typeof e.cost_cents).toBe('string'); // NUMERIC comes back as string
  expect(typeof e.created_at).toBe('string');
}

function assertBudgetPolicyShape(p: Record<string, unknown>) {
  expect(typeof p.id).toBe('string');
  expect(typeof p.agent_id).toBe('string');
  expect(typeof p.monthly_cap_cents).toBe('number');
  expect(typeof p.soft_warning_pct).toBe('number');
  expect(typeof p.hard_stop).toBe('boolean');
  expect(typeof p.created_at).toBe('string');
}

// ── POST /api/agents/:agentId/cost-events ─────────────────────────────────────

describe('POST /api/agents/:agentId/cost-events', () => {
  test('201 — returns cost_event with required shape', async () => {
    const res = await request()
      .post('/api/agents/agent-001/cost-events')
      .send({ model: 'claude-sonnet-4-6', input_tokens: 1000, output_tokens: 500, cost_cents: 0.35 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('cost_event');
    assertCostEventShape(res.body.cost_event as Record<string, unknown>);
  });

  test('400 — missing model returns error', async () => {
    const res = await request()
      .post('/api/agents/agent-001/cost-events')
      .send({ input_tokens: 1000, output_tokens: 500, cost_cents: 0.35 });

    expect(res.status).toBe(400);
  });

  test('400 — non-numeric input_tokens returns error', async () => {
    const res = await request()
      .post('/api/agents/agent-001/cost-events')
      .send({ model: 'm', input_tokens: 'bad', output_tokens: 100, cost_cents: 0.1 });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/agents/:agentId/cost-events ──────────────────────────────────────

describe('GET /api/agents/:agentId/cost-events', () => {
  test('200 — returns items array and has_more flag', async () => {
    const res = await request()
      .get('/api/agents/agent-001/cost-events');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.has_more).toBe('boolean');
    if (res.body.items.length > 0) {
      assertCostEventShape(res.body.items[0] as Record<string, unknown>);
    }
  });
});

// ── GET /api/agents/:agentId/cost-events/summary ──────────────────────────────

describe('GET /api/agents/:agentId/cost-events/summary', () => {
  test('200 — returns summary with required fields', async () => {
    const res = await request()
      .get('/api/agents/agent-001/cost-events/summary');

    expect(res.status).toBe(200);
    const summary = res.body.summary as Record<string, unknown>;
    expect(typeof summary.agent_id).toBe('string');
    expect(typeof summary.month).toBe('string');
    expect(typeof summary.total_cost_cents).toBe('number');
    expect(typeof summary.event_count).toBe('number');
  });
});

// ── PUT /api/agents/:agentId/budget-policy ────────────────────────────────────

describe('PUT /api/agents/:agentId/budget-policy', () => {
  test('200 — returns budget_policy with required shape', async () => {
    const res = await request()
      .put('/api/agents/agent-001/budget-policy')
      .send({ monthly_cap_cents: 10000 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('budget_policy');
    assertBudgetPolicyShape(res.body.budget_policy as Record<string, unknown>);
  });

  test('400 — negative monthly_cap_cents rejected', async () => {
    const res = await request()
      .put('/api/agents/agent-001/budget-policy')
      .send({ monthly_cap_cents: -100 });

    expect(res.status).toBe(400);
  });

  test('400 — missing monthly_cap_cents rejected', async () => {
    const res = await request()
      .put('/api/agents/agent-001/budget-policy')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── GET /api/agents/:agentId/budget-policy ────────────────────────────────────

describe('GET /api/agents/:agentId/budget-policy', () => {
  test('200 — returns budget_policy with required shape', async () => {
    const res = await request()
      .get('/api/agents/agent-001/budget-policy');

    expect(res.status).toBe(200);
    assertBudgetPolicyShape(res.body.budget_policy as Record<string, unknown>);
  });

  test('404 — when no policy exists', async () => {
    mockGetBudgetPolicy.mockImplementationOnce(async () => null);

    const res = await request()
      .get('/api/agents/agent-001/budget-policy');

    expect(res.status).toBe(404);
  });
});

// ── GET /api/agents/:agentId/budget-status ────────────────────────────────────

describe('GET /api/agents/:agentId/budget-status', () => {
  test('200 — returns budget_status with required fields', async () => {
    const res = await request()
      .get('/api/agents/agent-001/budget-status');

    expect(res.status).toBe(200);
    const status = res.body.budget_status as Record<string, unknown>;
    expect(typeof status.spent_cents).toBe('number');
    expect(typeof status.cap_cents).toBe('number');
    expect(typeof status.utilization_pct).toBe('number');
    expect(typeof status.at_soft_warning).toBe('boolean');
    expect(typeof status.at_hard_stop).toBe('boolean');
  });
});

// ── POST /api/agents/:agentId/execution-recordings ───────────────────────────

describe('POST /api/agents/:agentId/execution-recordings', () => {
  test('201 — returns execution_recording with required shape', async () => {
    const res = await request()
      .post('/api/agents/agent-001/execution-recordings')
      .send({ run_id: 'run-abc', success: true });

    expect(res.status).toBe(201);
    const rec = res.body.execution_recording as Record<string, unknown>;
    expect(typeof rec.id).toBe('string');
    expect(typeof rec.agent_id).toBe('string');
    expect(typeof rec.run_id).toBe('string');
    expect(Array.isArray(rec.tool_calls)).toBe(true);
    expect(Array.isArray(rec.skills_applied)).toBe(true);
  });

  test('400 — missing run_id returns error', async () => {
    const res = await request()
      .post('/api/agents/agent-001/execution-recordings')
      .send({ success: true });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/agents/:agentId/execution-recordings ────────────────────────────

describe('GET /api/agents/:agentId/execution-recordings', () => {
  test('200 — returns items array and has_more flag', async () => {
    const res = await request()
      .get('/api/agents/agent-001/execution-recordings');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.has_more).toBe('boolean');
  });
});
