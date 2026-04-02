/**
 * Thin HTTP client for the Paperclip control plane API.
 *
 * Every function is fail-safe: returns null/false if Paperclip is not
 * configured or unreachable. Never throws. Never blocks the caller.
 */

import { getConfig } from './config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaperclipCompany {
  id: string;
  name: string;
  issuePrefix: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
}

export interface PaperclipAgent {
  id: string;
  companyId: string;
  name: string;
  role: string;
  status: string;
  capabilities: string | null;
  adapterType: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
}

export interface PaperclipIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  assigneeAgentId: string | null;
}

export interface PaperclipDashboard {
  agents: { active: number; running: number; paused: number; error: number };
  tasks: { open: number; inProgress: number; blocked: number; done: number };
  costs: { monthSpendCents: number; monthBudgetCents: number; monthUtilizationPercent: number };
}

export interface CostEventInput {
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  provider?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 5_000;
let _healthCache: { ok: boolean; ts: number } | null = null;
const HEALTH_TTL_MS = 30_000;

/** Reset the cached health-check result. Exported for testing only. */
export function resetHealthCache(): void {
  _healthCache = null;
}

function baseUrl(): string | null {
  return getConfig().paperclipApiUrl;
}

async function paperfetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | null> {
  const base = baseUrl();
  if (!base) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${base}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[paperclip] ${method} ${path} → ${res.status}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[paperclip] ${method} ${path} failed:`, (err as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Cached health check — true if Paperclip API is reachable. */
export async function isAvailable(): Promise<boolean> {
  if (!baseUrl()) return false;

  const now = Date.now();
  if (_healthCache && now - _healthCache.ts < HEALTH_TTL_MS) {
    return _healthCache.ok;
  }

  const result = await paperfetch<{ status: string }>('GET', '/api/health');
  const ok = result?.status === 'ok';
  _healthCache = { ok, ts: now };
  return ok;
}

/** Create a Paperclip company representing a Ruh.ai agent. */
export async function createCompany(
  name: string,
  description?: string,
): Promise<PaperclipCompany | null> {
  return paperfetch<PaperclipCompany>('POST', '/api/companies', {
    name,
    description: description ?? null,
  });
}

/** Create a worker (Paperclip agent) inside a company. */
export async function createWorker(
  companyId: string,
  opts: {
    name: string;
    role: string;
    capabilities?: string;
    adapterType?: string;
  },
): Promise<PaperclipAgent | null> {
  return paperfetch<PaperclipAgent>(
    'POST',
    `/api/companies/${companyId}/agents`,
    {
      name: opts.name,
      role: opts.role,
      capabilities: opts.capabilities ?? null,
      adapterType: opts.adapterType ?? 'openclaw_gateway',
    },
  );
}

/** Create a task (Paperclip issue) inside a company. */
export async function createIssue(
  companyId: string,
  opts: {
    title: string;
    description?: string;
    assigneeAgentId?: string;
    priority?: string;
  },
): Promise<PaperclipIssue | null> {
  return paperfetch<PaperclipIssue>(
    'POST',
    `/api/companies/${companyId}/issues`,
    {
      title: opts.title,
      description: opts.description ?? null,
      assigneeAgentId: opts.assigneeAgentId ?? null,
      priority: opts.priority ?? 'medium',
    },
  );
}

/** Atomically checkout an issue to a worker. */
export async function checkoutIssue(
  issueId: string,
  agentId: string,
): Promise<boolean> {
  const result = await paperfetch<{ id: string }>(
    'POST',
    `/api/issues/${issueId}/checkout`,
    {
      agentId,
      expectedStatuses: ['backlog', 'todo'],
    },
  );
  return result !== null;
}

/** Release an issue lock. */
export async function releaseIssue(issueId: string): Promise<boolean> {
  const result = await paperfetch<{ id: string }>(
    'POST',
    `/api/issues/${issueId}/release`,
  );
  return result !== null;
}

/** Log a cost event for a worker execution. */
export async function logCostEvent(
  companyId: string,
  event: CostEventInput,
): Promise<boolean> {
  const result = await paperfetch<{ id: string }>(
    'POST',
    `/api/companies/${companyId}/cost-events`,
    {
      agentId: event.agentId,
      provider: event.provider ?? 'unknown',
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      costCents: event.costCents,
      occurredAt: new Date().toISOString(),
    },
  );
  return result !== null;
}

/** Get company dashboard summary. */
export async function getDashboard(
  companyId: string,
): Promise<PaperclipDashboard | null> {
  return paperfetch<PaperclipDashboard>(
    'GET',
    `/api/companies/${companyId}/dashboard`,
  );
}
