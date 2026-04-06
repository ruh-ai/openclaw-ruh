import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const fetchMock = mock(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
  ok: true,
  status: 200,
  json: async () => ({}),
}));

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalPaperclipApiUrl = process.env.PAPERCLIP_API_URL;
const client = await import('../../src/paperclipClient');

function makeJsonResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  };
}

beforeEach(() => {
  process.env.PAPERCLIP_API_URL = 'http://paperclip.local';
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => makeJsonResponse({}));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  console.warn = mock(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

describe('paperclipClient', () => {
  test('isAvailable returns false when Paperclip is not configured', async () => {
    delete process.env.PAPERCLIP_API_URL;

    expect(await client.isAvailable()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('isAvailable caches healthy responses within the TTL', async () => {
    fetchMock.mockImplementation(async () => makeJsonResponse({ status: 'ok' }));

    expect(await client.isAvailable()).toBe(true);
    expect(await client.isAvailable()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('createCompany serializes the request body and returns parsed data', async () => {
    fetchMock.mockImplementation(async () => makeJsonResponse({
      id: 'company-1',
      name: 'Ruh',
      issuePrefix: 'RUH',
      budgetMonthlyCents: 1000,
      spentMonthlyCents: 250,
    }));
    const result = await client.createCompany('Ruh', 'AI agents');

    expect(result).toEqual({
      id: 'company-1',
      name: 'Ruh',
      issuePrefix: 'RUH',
      budgetMonthlyCents: 1000,
      spentMonthlyCents: 250,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://paperclip.local/api/companies');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ruh',
        description: 'AI agents',
      }),
    }));
  });

  test('createWorker applies the default adapter type and null capabilities', async () => {
    fetchMock.mockImplementation(async () => makeJsonResponse({
      id: 'worker-1',
      companyId: 'company-1',
      name: 'Builder',
      role: 'ops',
      status: 'idle',
      capabilities: null,
      adapterType: 'openclaw_gateway',
      budgetMonthlyCents: 500,
      spentMonthlyCents: 10,
    }));
    const result = await client.createWorker('company-1', {
      name: 'Builder',
      role: 'ops',
    });

    expect(result).toEqual(expect.objectContaining({
      id: 'worker-1',
      adapterType: 'openclaw_gateway',
      capabilities: null,
    }));
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        name: 'Builder',
        role: 'ops',
        capabilities: null,
        adapterType: 'openclaw_gateway',
      }),
    }));
  });

  test('createIssue uses default priority and null optional fields', async () => {
    fetchMock.mockImplementation(async () => makeJsonResponse({
      id: 'issue-1',
      identifier: 'RUH-1',
      title: 'Ship it',
      status: 'backlog',
      assigneeAgentId: null,
    }));
    const result = await client.createIssue('company-1', {
      title: 'Ship it',
    });

    expect(result).toEqual(expect.objectContaining({
      id: 'issue-1',
      identifier: 'RUH-1',
    }));
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        title: 'Ship it',
        description: null,
        assigneeAgentId: null,
        priority: 'medium',
      }),
    }));
  });

  test('checkoutIssue sends expected backlog statuses and returns success', async () => {
    fetchMock.mockImplementation(async () => makeJsonResponse({ id: 'issue-1' }));
    const result = await client.checkoutIssue('issue-1', 'agent-1');

    expect(result).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://paperclip.local/api/issues/issue-1/checkout');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        agentId: 'agent-1',
        expectedStatuses: ['backlog', 'todo'],
      }),
    }));
  });

  test('releaseIssue returns false when the server responds with a non-ok status', async () => {
    fetchMock.mockImplementation(async () => makeJsonResponse({}, { ok: false, status: 503 }));
    expect(await client.releaseIssue('issue-1')).toBe(false);
  });

  test('logCostEvent defaults the provider and includes an occurredAt timestamp', async () => {
    fetchMock.mockImplementation(async () => makeJsonResponse({ id: 'cost-1' }));
    const result = await client.logCostEvent('company-1', {
      agentId: 'agent-1',
      model: 'gpt-5.4',
      inputTokens: 100,
      outputTokens: 50,
      costCents: 12,
    });

    expect(result).toBe(true);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toEqual(expect.objectContaining({
      agentId: 'agent-1',
      provider: 'unknown',
      model: 'gpt-5.4',
      inputTokens: 100,
      outputTokens: 50,
      costCents: 12,
    }));
    expect(typeof body.occurredAt).toBe('string');
  });

  test('getDashboard returns parsed data and network errors collapse to null', async () => {
    fetchMock.mockImplementationOnce(async () => makeJsonResponse({
      agents: { active: 2, running: 1, paused: 0, error: 0 },
      tasks: { open: 3, inProgress: 1, blocked: 0, done: 9 },
      costs: { monthSpendCents: 1234, monthBudgetCents: 5000, monthUtilizationPercent: 24.68 },
    }));
    expect(await client.getDashboard('company-1')).toEqual({
      agents: { active: 2, running: 1, paused: 0, error: 0 },
      tasks: { open: 3, inProgress: 1, blocked: 0, done: 9 },
      costs: { monthSpendCents: 1234, monthBudgetCents: 5000, monthUtilizationPercent: 24.68 },
    });

    fetchMock.mockImplementationOnce(async () => {
      throw new Error('connection reset');
    });

    expect(await client.getDashboard('company-1')).toBeNull();
  });
});

afterAll(() => {
  if (originalPaperclipApiUrl === undefined) {
    delete process.env.PAPERCLIP_API_URL;
  } else {
    process.env.PAPERCLIP_API_URL = originalPaperclipApiUrl;
  }
});
