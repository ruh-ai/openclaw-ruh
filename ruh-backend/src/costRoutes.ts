/**
 * Cost tracking routes — cost events, budget policies, execution recordings.
 * Mounted at /api/agents/:agentId in app.ts.
 *
 * Endpoints:
 *   POST   /api/agents/:agentId/cost-events
 *   GET    /api/agents/:agentId/cost-events
 *   GET    /api/agents/:agentId/cost-events/summary
 *   PUT    /api/agents/:agentId/budget-policy
 *   GET    /api/agents/:agentId/budget-policy
 *   GET    /api/agents/:agentId/budget-status
 *   POST   /api/agents/:agentId/execution-recordings
 *   GET    /api/agents/:agentId/execution-recordings
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from './auth/middleware';
import { httpError } from './utils';
import * as costStore from './costStore';
import * as executionRecordingStore from './executionRecordingStore';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function createCostRouter(): Router {
  const router = Router({ mergeParams: true });

  // ── POST /cost-events ──────────────────────────────────────────────────────

  router.post('/cost-events', requireAuth, asyncHandler(async (req, res) => {
    const agentId = req.params['agentId'];
    if (!agentId) throw httpError(400, 'Missing agentId');

    const { worker_id, task_id, run_id, model, input_tokens, output_tokens, cost_cents } = req.body as Record<string, unknown>;

    if (typeof model !== 'string' || !model) throw httpError(400, 'model is required');
    if (typeof input_tokens !== 'number') throw httpError(400, 'input_tokens must be a number');
    if (typeof output_tokens !== 'number') throw httpError(400, 'output_tokens must be a number');
    if (typeof cost_cents !== 'number') throw httpError(400, 'cost_cents must be a number');

    const event = await costStore.createCostEvent({
      agent_id: agentId,
      worker_id: typeof worker_id === 'string' ? worker_id : null,
      task_id: typeof task_id === 'string' ? task_id : null,
      run_id: typeof run_id === 'string' ? run_id : null,
      model,
      input_tokens,
      output_tokens,
      cost_cents,
    });

    res.status(201).json({ cost_event: event });
  }));

  // ── GET /cost-events ───────────────────────────────────────────────────────

  router.get('/cost-events', requireAuth, asyncHandler(async (req, res) => {
    const agentId = req.params['agentId'];
    if (!agentId) throw httpError(400, 'Missing agentId');

    const { limit, offset, run_id } = req.query as Record<string, string | undefined>;

    const result = await costStore.listCostEvents(agentId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      run_id,
    });

    res.json(result);
  }));

  // ── GET /cost-events/summary ───────────────────────────────────────────────

  router.get('/cost-events/summary', requireAuth, asyncHandler(async (req, res) => {
    const agentId = req.params['agentId'];
    if (!agentId) throw httpError(400, 'Missing agentId');

    const { month } = req.query as { month?: string };
    const summary = await costStore.getMonthlySummary(agentId, month);
    res.json({ summary });
  }));

  // ── PUT /budget-policy ─────────────────────────────────────────────────────

  router.put('/budget-policy', requireAuth, asyncHandler(async (req, res) => {
    const agentId = req.params['agentId'];
    if (!agentId) throw httpError(400, 'Missing agentId');

    const { monthly_cap_cents, soft_warning_pct, hard_stop, worker_id } = req.body as Record<string, unknown>;

    if (typeof monthly_cap_cents !== 'number' || monthly_cap_cents < 0) {
      throw httpError(400, 'monthly_cap_cents must be a non-negative number');
    }

    const policy = await costStore.upsertBudgetPolicy({
      agent_id: agentId,
      worker_id: typeof worker_id === 'string' ? worker_id : null,
      monthly_cap_cents,
      soft_warning_pct: typeof soft_warning_pct === 'number' ? soft_warning_pct : undefined,
      hard_stop: typeof hard_stop === 'boolean' ? hard_stop : undefined,
    });

    res.json({ budget_policy: policy });
  }));

  // ── GET /budget-policy ─────────────────────────────────────────────────────

  router.get('/budget-policy', requireAuth, asyncHandler(async (req, res) => {
    const agentId = req.params['agentId'];
    if (!agentId) throw httpError(400, 'Missing agentId');

    const { worker_id } = req.query as { worker_id?: string };
    const policy = await costStore.getBudgetPolicy(agentId, worker_id ?? null);

    if (!policy) throw httpError(404, 'No budget policy set for this agent');
    res.json({ budget_policy: policy });
  }));

  // ── GET /budget-status ─────────────────────────────────────────────────────

  router.get('/budget-status', requireAuth, asyncHandler(async (req, res) => {
    const agentId = req.params['agentId'];
    if (!agentId) throw httpError(400, 'Missing agentId');

    const { worker_id } = req.query as { worker_id?: string };
    const status = await costStore.getBudgetStatus(agentId, worker_id ?? null);
    res.json({ budget_status: status });
  }));

  // ── POST /execution-recordings ─────────────────────────────────────────────

  router.post('/execution-recordings', requireAuth, asyncHandler(async (req, res) => {
    const agentId = req.params['agentId'];
    if (!agentId) throw httpError(400, 'Missing agentId');

    const {
      worker_id, task_id, run_id, success,
      tool_calls, tokens_used, skills_applied, skills_effective,
      started_at, completed_at,
    } = req.body as Record<string, unknown>;

    if (typeof run_id !== 'string' || !run_id) throw httpError(400, 'run_id is required');

    const recording = await executionRecordingStore.createExecutionRecording({
      agent_id: agentId,
      worker_id: typeof worker_id === 'string' ? worker_id : null,
      task_id: typeof task_id === 'string' ? task_id : null,
      run_id,
      success: typeof success === 'boolean' ? success : null,
      tool_calls: Array.isArray(tool_calls) ? tool_calls : [],
      tokens_used: tokens_used && typeof tokens_used === 'object' ? tokens_used as { input?: number; output?: number } : {},
      skills_applied: Array.isArray(skills_applied) ? skills_applied as string[] : [],
      skills_effective: Array.isArray(skills_effective) ? skills_effective as string[] : [],
      started_at: typeof started_at === 'string' ? started_at : null,
      completed_at: typeof completed_at === 'string' ? completed_at : null,
    });

    res.status(201).json({ execution_recording: recording });
  }));

  // ── GET /execution-recordings ──────────────────────────────────────────────

  router.get('/execution-recordings', requireAuth, asyncHandler(async (req, res) => {
    const agentId = req.params['agentId'];
    if (!agentId) throw httpError(400, 'Missing agentId');

    const { limit, offset } = req.query as Record<string, string | undefined>;

    const result = await executionRecordingStore.listExecutionRecordings(agentId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    res.json(result);
  }));

  return router;
}
