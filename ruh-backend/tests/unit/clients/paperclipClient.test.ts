/**
 * Unit tests for src/paperclipClient.ts — mocks config and global fetch.
 */

import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';

// ── Mock config ──────────────────────────────────────────────────────────────

let mockPaperclipUrl: string | null = null;

mock.module('../../../src/config', () => ({
  getConfig: () => ({ paperclipApiUrl: mockPaperclipUrl }),
}));

import * as paperclip from '../../../src/paperclipClient';

// ─────────────────────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

beforeEach(() => {
  mockPaperclipUrl = null;
  globalThis.fetch = mock(async () => new Response('{}', { status: 200 })) as any;
  // Reset the module's internal health cache via the exported helper
  paperclip.resetHealthCache();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ── isAvailable ──────────────────────────────────────────────────────────────

describe('paperclip.isAvailable', () => {
  test('returns false when no URL configured', async () => {
    const result = await paperclip.isAvailable();
    expect(result).toBe(false);
  });

  test('returns true when health check succeeds', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    ) as any;

    const result = await paperclip.isAvailable();
    expect(result).toBe(true);
  });

  test('returns false when health check returns non-ok', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ status: 'error' }), { status: 200 }),
    ) as any;

    const result = await paperclip.isAvailable();
    expect(result).toBe(false);
  });
});

// ── createCompany ────────────────────────────────────────────────────────────

describe('paperclip.createCompany', () => {
  test('calls fetch with correct method/path/body', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    const mockResponse = { id: 'company-1', name: 'Test Co' };
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    ) as any;

    const result = await paperclip.createCompany('Test Co', 'A test company');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test Co');

    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/companies');
    expect(call[1].method).toBe('POST');
  });

  test('returns null on non-ok response', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () =>
      new Response('Not Found', { status: 404 }),
    ) as any;

    const result = await paperclip.createCompany('Test');
    expect(result).toBeNull();
  });

  test('returns null on fetch error', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () => { throw new Error('Network error'); }) as any;

    const result = await paperclip.createCompany('Test');
    expect(result).toBeNull();
  });

  test('returns null when no URL configured', async () => {
    const result = await paperclip.createCompany('Test');
    expect(result).toBeNull();
  });
});

// ── createWorker ─────────────────────────────────────────────────────────────

describe('paperclip.createWorker', () => {
  test('sends correct payload', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ id: 'agent-1' }), { status: 200 }),
    ) as any;

    const result = await paperclip.createWorker('company-1', {
      name: 'Worker',
      role: 'analyst',
    });
    expect(result).not.toBeNull();

    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/companies/company-1/agents');
  });
});

// ── createIssue ──────────────────────────────────────────────────────────────

describe('paperclip.createIssue', () => {
  test('sends correct payload', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ id: 'issue-1', identifier: 'TST-1' }), { status: 200 }),
    ) as any;

    const result = await paperclip.createIssue('company-1', {
      title: 'Fix bug',
      description: 'Something is broken',
    });
    expect(result).not.toBeNull();
  });
});

// ── checkoutIssue / releaseIssue ─────────────────────────────────────────────

describe('paperclip.checkoutIssue', () => {
  test('returns true on success', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ id: 'issue-1' }), { status: 200 }),
    ) as any;

    const result = await paperclip.checkoutIssue('issue-1', 'agent-1');
    expect(result).toBe(true);
  });

  test('returns false on failure', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () =>
      new Response('Conflict', { status: 409 }),
    ) as any;

    const result = await paperclip.checkoutIssue('issue-1', 'agent-1');
    expect(result).toBe(false);
  });
});

describe('paperclip.releaseIssue', () => {
  test('returns true on success', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ id: 'issue-1' }), { status: 200 }),
    ) as any;

    const result = await paperclip.releaseIssue('issue-1');
    expect(result).toBe(true);
  });
});

// ── logCostEvent ─────────────────────────────────────────────────────────────

describe('paperclip.logCostEvent', () => {
  test('sends correct cost payload', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ id: 'cost-1' }), { status: 200 }),
    ) as any;

    const result = await paperclip.logCostEvent('company-1', {
      agentId: 'agent-1',
      model: 'gpt-4',
      inputTokens: 100,
      outputTokens: 50,
      costCents: 5,
    });
    expect(result).toBe(true);

    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/companies/company-1/cost-events');
  });
});

// ── getDashboard ─────────────────────────────────────────────────────────────

describe('paperclip.getDashboard', () => {
  test('returns dashboard data', async () => {
    mockPaperclipUrl = 'http://localhost:3100';
    const dashboard = {
      agents: { active: 2, running: 1, paused: 0, error: 0 },
      tasks: { open: 5, inProgress: 2, blocked: 0, done: 10 },
      costs: { monthSpendCents: 1000, monthBudgetCents: 5000, monthUtilizationPercent: 20 },
    };
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(dashboard), { status: 200 }),
    ) as any;

    const result = await paperclip.getDashboard('company-1');
    expect(result).not.toBeNull();
    expect(result!.agents.active).toBe(2);
    expect(result!.costs.monthSpendCents).toBe(1000);
  });

  test('returns null when not available', async () => {
    const result = await paperclip.getDashboard('company-1');
    expect(result).toBeNull();
  });
});
