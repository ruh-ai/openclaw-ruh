/**
 * Cron management routes — extracted from app.ts.
 *
 * Handles CRUD and execution of cron jobs within sandbox containers.
 */

import { Router } from 'express';
import { httpError, parseJsonOutput } from './utils';
import { buildCronDeleteCommand, buildCronRunCommand, joinShellArgs } from './docker';
import {
  asyncHandler,
  getRecord,
  parsePositiveIntParam,
  type RouteContext,
} from './routeHelpers';

export function createCronRouter(ctx: RouteContext): Router {
  const router = Router({ mergeParams: true });

  // List all cron jobs
  router.get('/api/sandboxes/:sandbox_id/crons', asyncHandler(async (req, res) => {
    await getRecord(req.params.sandbox_id);
    const [code, output] = await ctx.sandboxExec(req.params.sandbox_id, 'openclaw cron list --json 2>&1', 20);
    if (code !== 0) throw httpError(502, `openclaw cron list failed: ${output.slice(0, 300)}`);
    try { res.json(parseJsonOutput(output)); } catch { throw httpError(502, 'Failed to parse cron list output'); }
  }));

  // Create a cron job
  router.post('/api/sandboxes/:sandbox_id/crons', asyncHandler(async (req, res) => {
    await getRecord(req.params.sandbox_id);
    const { name, schedule, payload, session_target = 'isolated', wake_mode = 'now', delete_after_run = false, enabled = true, description = '' } = req.body;

    const kind = String(schedule.kind ?? 'cron');
    if (kind !== 'cron' && kind !== 'every' && kind !== 'at') {
      throw httpError(400, `Unknown schedule kind: ${kind}`);
    }

    const pk = String(payload.kind ?? 'agentTurn');
    const parts: Array<string | number> = ['openclaw', 'cron', 'add', '--json', '--name', String(name)];
    if (kind === 'cron') {
      parts.push('--cron', String(schedule.expr ?? '0 9 * * *'));
      const tz = String(schedule.tz ?? '');
      if (tz) parts.push('--tz', tz);
    } else if (kind === 'every') {
      parts.push('--every', `${Math.floor(Number(schedule.everyMs ?? 1_800_000) / 60_000)}m`);
    } else if (kind === 'at') {
      parts.push('--at', String(schedule.at ?? ''));
    }
    if (pk === 'systemEvent') {
      parts.push('--system-event', String(payload.text ?? ''));
    } else {
      parts.push('--message', String(payload.message ?? payload.text ?? ''));
    }
    parts.push('--session', String(session_target), '--wake', String(wake_mode));
    if (delete_after_run) parts.push('--delete-after-run');
    if (!enabled) parts.push('--disabled');
    if (description) parts.push('--description', String(description));

    const [code, output] = await ctx.sandboxExec(req.params.sandbox_id, `${joinShellArgs(parts)} 2>&1`, 30);
    if (code !== 0) throw httpError(502, `openclaw cron add failed: ${output.slice(0, 400)}`);
    let response: Record<string, unknown>;
    try { response = parseJsonOutput(output) as Record<string, unknown>; } catch { response = { ok: true, output }; }
    await ctx.recordAuditEvent(req, {
      action_type: 'cron.create',
      target_type: 'sandbox',
      target_id: req.params.sandbox_id,
      outcome: 'success',
      details: {
        schedule_kind: kind,
        payload_kind: pk,
        session_target: String(session_target),
        wake_mode: String(wake_mode),
        delete_after_run: Boolean(delete_after_run),
        enabled: Boolean(enabled),
        description_present: Boolean(description),
        job_id: typeof response['id'] === 'string' ? response['id'] : undefined,
      },
    });
    res.json(response);
  }));

  // Delete a cron job
  router.delete('/api/sandboxes/:sandbox_id/crons/:job_id', asyncHandler(async (req, res) => {
    await getRecord(req.params.sandbox_id);
    const [code, output] = await ctx.sandboxExec(req.params.sandbox_id, buildCronDeleteCommand(req.params.job_id), 20);
    if (code !== 0) throw httpError(502, `openclaw cron rm failed: ${output.slice(0, 300)}`);
    await ctx.recordAuditEvent(req, {
      action_type: 'cron.delete',
      target_type: 'sandbox',
      target_id: req.params.sandbox_id,
      outcome: 'success',
      details: { job_id: req.params.job_id },
    });
    res.json({ deleted: req.params.job_id });
  }));

  // Toggle a cron job enabled/disabled
  router.post('/api/sandboxes/:sandbox_id/crons/:job_id/toggle', asyncHandler(async (req, res) => {
    const { sandbox_id, job_id } = req.params;
    await getRecord(sandbox_id);
    const [code, output] = await ctx.sandboxExec(sandbox_id, 'openclaw cron list --json 2>&1', 20);
    if (code !== 0) throw httpError(502, `cron list failed: ${output.slice(0, 300)}`);
    let data: Record<string, unknown>;
    try { data = parseJsonOutput(output) as Record<string, unknown>; } catch (e) { throw httpError(502, String(e)); }
    const jobs = (data['jobs'] ?? []) as Array<Record<string, unknown>>;
    const job = jobs.find((j) => j['id'] === job_id);
    if (!job) throw httpError(404, 'Cron job not found');
    const subcmd = Boolean(job['enabled'] ?? true) ? 'disable' : 'enable';
    const [code2, output2] = await ctx.sandboxExec(
      sandbox_id,
      `${joinShellArgs(['openclaw', 'cron', subcmd, job_id])} 2>&1`,
      20,
    );
    if (code2 !== 0) throw httpError(502, `cron ${subcmd} failed: ${output2.slice(0, 300)}`);
    await ctx.recordAuditEvent(req, {
      action_type: 'cron.toggle',
      target_type: 'sandbox',
      target_id: sandbox_id,
      outcome: 'success',
      details: { job_id, enabled: subcmd === 'enable' },
    });
    res.json({ jobId: job_id, enabled: subcmd === 'enable' });
  }));

  // Edit a cron job
  router.patch('/api/sandboxes/:sandbox_id/crons/:job_id', asyncHandler(async (req, res) => {
    const { sandbox_id, job_id } = req.params;
    await getRecord(sandbox_id);
    const { name, schedule, payload, session_target, wake_mode, description } = req.body;
    const parts: Array<string | number> = ['openclaw', 'cron', 'edit', job_id];
    if (name != null) parts.push('--name', String(name));
    if (schedule != null) {
      const kind = String(schedule.kind ?? 'cron');
      if (kind === 'cron') {
        parts.push('--cron', String(schedule.expr ?? '0 9 * * *'));
        if (schedule.tz) parts.push('--tz', String(schedule.tz));
      } else if (kind === 'every') parts.push('--every', `${Math.floor(Number(schedule.everyMs ?? 1_800_000) / 60_000)}m`);
      else if (kind === 'at') parts.push('--at', String(schedule.at ?? ''));
    }
    if (payload != null) {
      const pk = String(payload.kind ?? 'agentTurn');
      if (pk === 'systemEvent') {
        parts.push('--system-event', String(payload.text ?? ''));
      } else {
        parts.push('--message', String(payload.message ?? payload.text ?? ''));
      }
    }
    if (session_target != null) parts.push('--session', String(session_target));
    if (wake_mode != null) parts.push('--wake', String(wake_mode));
    if (description != null) parts.push('--description', String(description));
    const [code, output] = await ctx.sandboxExec(sandbox_id, `${joinShellArgs(parts)} 2>&1`, 30);
    if (code !== 0) throw httpError(502, `openclaw cron edit failed: ${output.slice(0, 400)}`);
    await ctx.recordAuditEvent(req, {
      action_type: 'cron.edit',
      target_type: 'sandbox',
      target_id: sandbox_id,
      outcome: 'success',
      details: {
        job_id,
        name_present: name != null,
        schedule_present: schedule != null,
        payload_present: payload != null,
        session_target_present: session_target != null,
        wake_mode_present: wake_mode != null,
        description_present: description != null,
      },
    });
    res.json({ ok: true, jobId: job_id });
  }));

  // Run a cron job immediately
  router.post('/api/sandboxes/:sandbox_id/crons/:job_id/run', asyncHandler(async (req, res) => {
    const { sandbox_id, job_id } = req.params;
    await getRecord(sandbox_id);
    const [code, output] = await ctx.sandboxExec(sandbox_id, buildCronRunCommand(job_id), 60);
    if (code !== 0) throw httpError(502, `openclaw cron run failed: ${output.slice(0, 300)}`);
    await ctx.recordAuditEvent(req, {
      action_type: 'cron.run',
      target_type: 'sandbox',
      target_id: sandbox_id,
      outcome: 'success',
      details: { job_id },
    });
    res.json({ ok: true, jobId: job_id });
  }));

  // Get run history for a cron job
  router.get('/api/sandboxes/:sandbox_id/crons/:job_id/runs', asyncHandler(async (req, res) => {
    const { sandbox_id, job_id } = req.params;
    const limit = Number(req.query.limit ?? 50);
    await getRecord(sandbox_id);
    const [code, output] = await ctx.sandboxExec(
      sandbox_id,
      `${joinShellArgs(['openclaw', 'cron', 'runs', '--id', job_id, '--limit', String(limit)])} 2>&1`,
      20,
    );
    if (code !== 0) throw httpError(502, `openclaw cron runs failed: ${output.slice(0, 300)}`);
    try { res.json(parseJsonOutput(output)); } catch { throw httpError(502, 'Failed to parse runs output'); }
  }));

  return router;
}
