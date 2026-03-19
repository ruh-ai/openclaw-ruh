/**
 * Express application — routes only, no startup side-effects.
 * Imported by src/index.ts (production) and tests/helpers/app.ts (tests).
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

import * as store from './store';
import * as conversationStore from './conversationStore';
import * as channelManager from './channelManager';
import { createOpenclawSandbox } from './sandboxManager';
import { Daytona } from '@daytonaio/sdk';
import {
  httpError,
  gatewayUrlAndHeaders,
  parseJsonOutput,
  syntheticModels,
} from './utils';

export const app = express();
app.use(express.json());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['*'],
  }),
);

// In-memory store for active creation streams (exported for test cleanup)
export interface StreamEntry {
  status: 'pending' | 'running' | 'done' | 'error';
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}
export const _streams = new Map<string, StreamEntry>();

// ── Internal helpers ──────────────────────────────────────────────────────────

function daytonaApiKey(): string {
  const key = process.env.DAYTONA_API_KEY ?? '';
  if (!key) throw httpError(500, 'DAYTONA_API_KEY not set in server environment');
  return key;
}

async function getRecord(sandboxId: string): Promise<store.SandboxRecord> {
  const record = await store.getSandbox(sandboxId);
  if (!record) throw httpError(404, 'Sandbox not found');
  return record;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

async function sandboxExec(sandboxId: string, cmd: string, timeout = 30): Promise<[number, string]> {
  const d = new Daytona({ apiKey: daytonaApiKey() });
  const sb = await d.get(sandboxId);
  const res = await sb.process.executeCommand(cmd, undefined, undefined, timeout);
  return [res.exitCode, res.result ?? ''];
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Sandbox creation ──────────────────────────────────────────────────────────

app.post(
  '/api/sandboxes/create',
  asyncHandler(async (req, res) => {
    daytonaApiKey();
    const sandboxName: string = req.body.sandbox_name ?? 'openclaw-gateway';
    const streamId = uuidv4();
    _streams.set(streamId, { status: 'pending', request: { sandbox_name: sandboxName } });
    res.json({ stream_id: streamId });
  }),
);

app.get(
  '/api/sandboxes/stream/:stream_id',
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;
    if (!_streams.has(stream_id)) throw httpError(404, 'stream_id not found');

    const entry = _streams.get(stream_id)!;
    if (entry.status !== 'pending') throw httpError(409, 'Stream already consumed');

    entry.status = 'running';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    function sendEvent(event: string, data: unknown) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    try {
      const gen = createOpenclawSandbox({
        daytonaApiKey: daytonaApiKey(),
        anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
        openaiApiKey: process.env.OPENAI_API_KEY ?? '',
        openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
        geminiApiKey: process.env.GEMINI_API_KEY ?? '',
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
        discordBotToken: process.env.DISCORD_BOT_TOKEN ?? '',
        sandboxName: String(entry.request.sandbox_name ?? 'openclaw-gateway'),
      });

      for await (const [eventType, data] of gen) {
        if (eventType === 'log') {
          sendEvent('log', { message: data });
        } else if (eventType === 'result') {
          await store.saveSandbox(data as Record<string, unknown>, String(entry.request.sandbox_name ?? ''));
          entry.result = data as Record<string, unknown>;
          sendEvent('result', data);
        } else if (eventType === 'approved') {
          await store.markApproved(entry.result!['sandbox_id'] as string);
          entry.status = 'done';
          sendEvent('approved', data);
        } else if (eventType === 'error') {
          entry.status = 'error';
          entry.error = data as string;
          sendEvent('error', { message: data });
          res.end();
          return;
        }
      }

      entry.status = 'done';
      sendEvent('done', { stream_id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.status = 'error';
      entry.error = msg;
      sendEvent('error', { message: msg });
    }

    res.end();
  }),
);

// ── Saved sandboxes CRUD ──────────────────────────────────────────────────────

app.get('/api/sandboxes', asyncHandler(async (_req, res) => {
  res.json(await store.listSandboxes());
}));

app.get('/api/sandboxes/:sandbox_id', asyncHandler(async (req, res) => {
  const { sandbox_id } = req.params;
  if (_streams.has(sandbox_id)) {
    const e = _streams.get(sandbox_id)!;
    res.json({ status: e.status, ...(e.result ? { result: e.result } : {}) });
    return;
  }
  res.json(await getRecord(sandbox_id));
}));

app.delete('/api/sandboxes/:sandbox_id', asyncHandler(async (req, res) => {
  const deleted = await store.deleteSandbox(req.params.sandbox_id);
  if (!deleted) throw httpError(404, 'Sandbox not found');
  res.json({ deleted: req.params.sandbox_id });
}));

// ── Gateway proxy ─────────────────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/models', asyncHandler(async (req, res) => {
  const record = await getRecord(req.params.sandbox_id);
  const [url, headers] = gatewayUrlAndHeaders(record, '/v1/models');
  try {
    const resp = await axios.get(url, { headers, timeout: 15000, validateStatus: () => true });
    if (resp.status >= 400 || !resp.data) { res.json(syntheticModels()); return; }
    res.json(resp.data);
  } catch {
    res.json(syntheticModels());
  }
}));

app.get('/api/sandboxes/:sandbox_id/status', asyncHandler(async (req, res) => {
  const record = await getRecord(req.params.sandbox_id);
  const [url, headers] = gatewayUrlAndHeaders(record, '/api/status');
  try {
    const resp = await axios.get(url, { headers, timeout: 10000, validateStatus: () => true });
    if (resp.status === 200 && resp.data) { res.json(resp.data); return; }
  } catch { /* fall through */ }
  res.json({
    sandbox_id: record.sandbox_id,
    sandbox_name: record.sandbox_name,
    gateway_port: record.gateway_port ?? 18789,
    approved: record.approved ?? false,
    created_at: record.created_at,
  });
}));

app.post('/api/sandboxes/:sandbox_id/chat', asyncHandler(async (req, res) => {
  const record = await getRecord(req.params.sandbox_id);
  const body = { ...req.body } as Record<string, unknown>;

  const conversationId = body['conversation_id'] as string | undefined;
  delete body['conversation_id'];

  let sessionKey: string | null = null;
  if (conversationId) {
    const conv = await conversationStore.getConversation(conversationId);
    sessionKey = conv ? conv.openclaw_session_key : `agent:main:${conversationId}`;
    body['user'] = conversationId;
  }

  const [url, headers] = gatewayUrlAndHeaders(record, '/v1/chat/completions');
  headers['Content-Type'] = 'application/json';
  if (sessionKey) headers['x-openclaw-session-key'] = sessionKey;

  const isStream = Boolean(body['stream']);

  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    try {
      const resp = await axios.post(url, body, { headers, timeout: 120000, responseType: 'stream', validateStatus: () => true });
      resp.data.pipe(res);
    } catch (err) {
      throw httpError(503, `Gateway unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    try {
      const resp = await axios.post(url, body, { headers, timeout: 120000, validateStatus: (s) => s < 500 });
      if (resp.status >= 400) throw httpError(resp.status, JSON.stringify(resp.data));
      res.json(resp.data);
    } catch (err) {
      if ((err as { status?: number }).status) throw err;
      throw httpError(503, `Gateway unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}));

// ── Conversation management ───────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/conversations', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  res.json(await conversationStore.listConversations(req.params.sandbox_id));
}));

app.post('/api/sandboxes/:sandbox_id/conversations', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  res.json(await conversationStore.createConversation(
    req.params.sandbox_id,
    req.body.model ?? 'openclaw-default',
    req.body.name ?? 'New Conversation',
  ));
}));

app.get('/api/sandboxes/:sandbox_id/conversations/:conv_id/messages', asyncHandler(async (req, res) => {
  const { sandbox_id, conv_id } = req.params;
  const conv = await conversationStore.getConversation(conv_id);
  if (!conv || conv.sandbox_id !== sandbox_id) throw httpError(404, 'Conversation not found');
  res.json(await conversationStore.getMessages(conv_id));
}));

app.post('/api/sandboxes/:sandbox_id/conversations/:conv_id/messages', asyncHandler(async (req, res) => {
  const { sandbox_id, conv_id } = req.params;
  const conv = await conversationStore.getConversation(conv_id);
  if (!conv || conv.sandbox_id !== sandbox_id) throw httpError(404, 'Conversation not found');
  await conversationStore.appendMessages(conv_id, req.body.messages ?? []);
  res.json({ ok: true });
}));

app.patch('/api/sandboxes/:sandbox_id/conversations/:conv_id', asyncHandler(async (req, res) => {
  const { sandbox_id, conv_id } = req.params;
  const conv = await conversationStore.getConversation(conv_id);
  if (!conv || conv.sandbox_id !== sandbox_id) throw httpError(404, 'Conversation not found');
  await conversationStore.renameConversation(conv_id, req.body.name);
  res.json({ ok: true });
}));

app.delete('/api/sandboxes/:sandbox_id/conversations/:conv_id', asyncHandler(async (req, res) => {
  const { sandbox_id, conv_id } = req.params;
  const conv = await conversationStore.getConversation(conv_id);
  if (!conv || conv.sandbox_id !== sandbox_id) throw httpError(404, 'Conversation not found');
  await conversationStore.deleteConversation(conv_id);
  res.json({ deleted: conv_id });
}));

// ── Cron management ───────────────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/crons', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const [code, output] = await sandboxExec(req.params.sandbox_id, 'openclaw cron list --json 2>&1', 20);
  if (code !== 0) throw httpError(502, `openclaw cron list failed: ${output.slice(0, 300)}`);
  try { res.json(parseJsonOutput(output)); } catch { throw httpError(502, 'Failed to parse cron list output'); }
}));

app.post('/api/sandboxes/:sandbox_id/crons', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const { name, schedule, payload, session_target = 'isolated', wake_mode = 'now', delete_after_run = false, enabled = true, description = '' } = req.body;

  const kind = String(schedule.kind ?? 'cron');
  let schedFlag: string;
  if (kind === 'cron') {
    schedFlag = `--cron ${JSON.stringify(String(schedule.expr ?? '0 9 * * *'))}`;
    const tz = String(schedule.tz ?? '');
    if (tz) schedFlag += ` --tz ${JSON.stringify(tz)}`;
  } else if (kind === 'every') {
    schedFlag = `--every ${Math.floor(Number(schedule.everyMs ?? 1_800_000) / 60_000)}m`;
  } else if (kind === 'at') {
    schedFlag = `--at ${JSON.stringify(String(schedule.at ?? ''))}`;
  } else {
    throw httpError(400, `Unknown schedule kind: ${kind}`);
  }

  const pk = String(payload.kind ?? 'agentTurn');
  const payloadFlag = pk === 'systemEvent'
    ? `--system-event ${JSON.stringify(String(payload.text ?? ''))}`
    : `--message ${JSON.stringify(String(payload.message ?? payload.text ?? ''))}`;

  const parts = ['openclaw cron add --json', `--name ${JSON.stringify(name)}`, schedFlag, payloadFlag, `--session ${session_target}`, `--wake ${wake_mode}`];
  if (delete_after_run) parts.push('--delete-after-run');
  if (!enabled) parts.push('--disabled');
  if (description) parts.push(`--description ${JSON.stringify(description)}`);

  const [code, output] = await sandboxExec(req.params.sandbox_id, parts.join(' ') + ' 2>&1', 30);
  if (code !== 0) throw httpError(502, `openclaw cron add failed: ${output.slice(0, 400)}`);
  try { res.json(parseJsonOutput(output)); } catch { res.json({ ok: true, output }); }
}));

app.delete('/api/sandboxes/:sandbox_id/crons/:job_id', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const [code, output] = await sandboxExec(req.params.sandbox_id, `openclaw cron rm ${req.params.job_id} 2>&1`, 20);
  if (code !== 0) throw httpError(502, `openclaw cron rm failed: ${output.slice(0, 300)}`);
  res.json({ deleted: req.params.job_id });
}));

app.post('/api/sandboxes/:sandbox_id/crons/:job_id/toggle', asyncHandler(async (req, res) => {
  const { sandbox_id, job_id } = req.params;
  await getRecord(sandbox_id);
  const [code, output] = await sandboxExec(sandbox_id, 'openclaw cron list --json 2>&1', 20);
  if (code !== 0) throw httpError(502, `cron list failed: ${output.slice(0, 300)}`);
  let data: Record<string, unknown>;
  try { data = parseJsonOutput(output) as Record<string, unknown>; } catch (e) { throw httpError(502, String(e)); }
  const jobs = (data['jobs'] ?? []) as Array<Record<string, unknown>>;
  const job = jobs.find((j) => j['id'] === job_id);
  if (!job) throw httpError(404, 'Cron job not found');
  const subcmd = Boolean(job['enabled'] ?? true) ? 'disable' : 'enable';
  const [code2, output2] = await sandboxExec(sandbox_id, `openclaw cron ${subcmd} ${job_id} 2>&1`, 20);
  if (code2 !== 0) throw httpError(502, `cron ${subcmd} failed: ${output2.slice(0, 300)}`);
  res.json({ jobId: job_id, enabled: subcmd === 'enable' });
}));

app.patch('/api/sandboxes/:sandbox_id/crons/:job_id', asyncHandler(async (req, res) => {
  const { sandbox_id, job_id } = req.params;
  await getRecord(sandbox_id);
  const { name, schedule, payload, session_target, wake_mode, description } = req.body;
  const parts = [`openclaw cron edit ${job_id}`];
  if (name != null) parts.push(`--name ${JSON.stringify(name)}`);
  if (schedule != null) {
    const kind = String(schedule.kind ?? 'cron');
    if (kind === 'cron') { parts.push(`--cron ${JSON.stringify(String(schedule.expr ?? '0 9 * * *'))}`); if (schedule.tz) parts.push(`--tz ${JSON.stringify(String(schedule.tz))}`); }
    else if (kind === 'every') parts.push(`--every ${Math.floor(Number(schedule.everyMs ?? 1_800_000) / 60_000)}m`);
    else if (kind === 'at') parts.push(`--at ${JSON.stringify(String(schedule.at ?? ''))}`);
  }
  if (payload != null) {
    const pk = String(payload.kind ?? 'agentTurn');
    parts.push(pk === 'systemEvent' ? `--system-event ${JSON.stringify(String(payload.text ?? ''))}` : `--message ${JSON.stringify(String(payload.message ?? payload.text ?? ''))}`);
  }
  if (session_target != null) parts.push(`--session ${session_target}`);
  if (wake_mode != null) parts.push(`--wake ${wake_mode}`);
  if (description != null) parts.push(`--description ${JSON.stringify(description)}`);
  const [code, output] = await sandboxExec(sandbox_id, parts.join(' ') + ' 2>&1', 30);
  if (code !== 0) throw httpError(502, `openclaw cron edit failed: ${output.slice(0, 400)}`);
  res.json({ ok: true, jobId: job_id });
}));

app.post('/api/sandboxes/:sandbox_id/crons/:job_id/run', asyncHandler(async (req, res) => {
  const { sandbox_id, job_id } = req.params;
  await getRecord(sandbox_id);
  const [code, output] = await sandboxExec(sandbox_id, `openclaw cron run ${job_id} 2>&1`, 60);
  if (code !== 0) throw httpError(502, `openclaw cron run failed: ${output.slice(0, 300)}`);
  res.json({ ok: true, jobId: job_id });
}));

app.get('/api/sandboxes/:sandbox_id/crons/:job_id/runs', asyncHandler(async (req, res) => {
  const { sandbox_id, job_id } = req.params;
  const limit = Number(req.query.limit ?? 50);
  await getRecord(sandbox_id);
  const [code, output] = await sandboxExec(sandbox_id, `openclaw cron runs --id ${job_id} --limit ${limit} 2>&1`, 20);
  if (code !== 0) throw httpError(502, `openclaw cron runs failed: ${output.slice(0, 300)}`);
  try { res.json(parseJsonOutput(output)); } catch { throw httpError(502, 'Failed to parse runs output'); }
}));

// ── Channel configuration ─────────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/channels', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  res.json(await channelManager.getChannelsConfig(daytonaApiKey(), req.params.sandbox_id));
}));

app.put('/api/sandboxes/:sandbox_id/channels/telegram', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  res.json(await channelManager.setTelegramConfig(daytonaApiKey(), req.params.sandbox_id, req.body));
}));

app.put('/api/sandboxes/:sandbox_id/channels/slack', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  res.json(await channelManager.setSlackConfig(daytonaApiKey(), req.params.sandbox_id, req.body));
}));

app.get('/api/sandboxes/:sandbox_id/channels/:channel/status', asyncHandler(async (req, res) => {
  const { sandbox_id, channel } = req.params;
  if (channel !== 'telegram' && channel !== 'slack') throw httpError(400, "channel must be 'telegram' or 'slack'");
  await getRecord(sandbox_id);
  res.json(await channelManager.probeChannelStatus(daytonaApiKey(), sandbox_id, channel));
}));

// ── Pairing ───────────────────────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/channels/:channel/pairing', asyncHandler(async (req, res) => {
  const { sandbox_id, channel } = req.params;
  if (channel !== 'telegram' && channel !== 'slack') throw httpError(400, "channel must be 'telegram' or 'slack'");
  await getRecord(sandbox_id);
  res.json(await channelManager.listPairingRequests(daytonaApiKey(), sandbox_id, channel));
}));

app.post('/api/sandboxes/:sandbox_id/channels/:channel/pairing/approve', asyncHandler(async (req, res) => {
  const { sandbox_id, channel } = req.params;
  if (channel !== 'telegram' && channel !== 'slack') throw httpError(400, "channel must be 'telegram' or 'slack'");
  await getRecord(sandbox_id);
  const result = await channelManager.approvePairing(daytonaApiKey(), sandbox_id, channel, String(req.body.code ?? ''));
  if (!result['ok']) throw httpError(400, String(result['output'] ?? 'Approval failed'));
  res.json(result);
}));

// ── Error middleware (MUST be last) ──────────────────────────────────────────
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  res.status(status).json({ detail: err.message });
});

export default app;
