/**
 * Express application — routes only, no startup side-effects.
 * Imported by src/index.ts (production) and tests/helpers/app.ts (tests).
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'node:crypto';
import axios from 'axios';

import {
  buildConfigureAgentCronAddCommand,
  buildCronDeleteCommand,
  buildCronRunCommand,
  buildHomeFileWriteCommand,
  dockerContainerRunning,
  joinShellArgs,
  normalizePathSegment,
} from './docker';
import * as store from './store';
import * as conversationStore from './conversationStore';
import * as agentStore from './agentStore';
import * as channelManager from './channelManager';
import * as auditStore from './auditStore';
import { getBackendReadiness } from './backendReadiness';
import { getSandboxConversationRecord } from './conversationAccess';
import {
  createOpenclawSandbox,
  dockerExec,
  getContainerName,
  reconfigureSandboxLlm,
  retrofitSandboxToSharedCodex,
  stopAndRemoveContainer,
} from './sandboxManager';
import {
  httpError,
  gatewayUrlAndHeaders,
  parseJsonOutput,
  syntheticModels,
} from './utils';
import {
  createWorkspaceDownloadCommand,
  createWorkspaceListCommand,
  createWorkspaceReadCommand,
  normalizeWorkspaceRelativePath,
} from "./workspaceFiles";
import {
  JSON_BODY_LIMIT,
  validateAgentConfigPatchBody,
  validateAgentCreateBody,
  validateAgentMetadataPatchBody,
  validateAgentSandboxAttachBody,
  validateAgentWorkspaceMemoryPatchBody,
} from './validation';

export const app = express();
app.use(express.json({ limit: JSON_BODY_LIMIT }));

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

interface ConfigureAgentStepResult {
  kind: 'soul' | 'skill' | 'cron';
  target: string;
  ok: boolean;
  message: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

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

function parsePositiveIntParam(
  value: unknown,
  fallback: number,
  fieldName: string,
): number {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw httpError(400, `Invalid ${fieldName}`);
  }
  return parsed;
}

function requireAdmin(req: Request): void {
  const configuredToken = String(process.env.OPENCLAW_ADMIN_TOKEN ?? '').trim();
  if (!configuredToken) {
    throw httpError(503, 'OPENCLAW_ADMIN_TOKEN is not configured');
  }

  const authHeader = String(req.headers.authorization ?? '');
  const expectedHeader = `Bearer ${configuredToken}`;
  if (authHeader !== expectedHeader) {
    throw httpError(401, 'Invalid admin token');
  }
}

interface AuditActor {
  actor_type: string;
  actor_id: string;
}

async function recordAuditEvent(
  req: Request,
  event: Omit<auditStore.WriteAuditEventInput, 'request_id' | 'actor_type' | 'actor_id' | 'origin'>,
  actor: AuditActor = { actor_type: 'anonymous', actor_id: 'anonymous' },
): Promise<void> {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  const rawOrigin = forwarded || req.ip || req.socket.remoteAddress || 'unknown';
  const origin = `iphash:${createHash('sha256').update(rawOrigin).digest('hex').slice(0, 12)}`;
  const requestId = String(req.headers['x-request-id'] ?? '').trim() || uuidv4();

  try {
    await auditStore.writeAuditEvent({
      ...event,
      request_id: requestId,
      actor_type: actor.actor_type,
      actor_id: actor.actor_id,
      origin,
    });
  } catch (error) {
    console.error('Failed to persist control-plane audit event', error);
  }
}

async function sandboxExec(sandboxId: string, cmd: string, timeoutSec = 30): Promise<[number, string]> {
  const containerName = getContainerName(sandboxId);
  const [ok, output] = await dockerExec(containerName, cmd, timeoutSec * 1000);
  return [ok ? 0 : 1, output];
}

function parseWorkspaceRelativePath(value: unknown, required = false): string {
  if (value == null || String(value).trim() === '') {
    if (required) throw httpError(400, 'Workspace file path is required');
    return '';
  }

  try {
    return normalizeWorkspaceRelativePath(String(value));
  } catch (error) {
    throw httpError(400, error instanceof Error ? error.message : 'Invalid workspace path');
  }
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/ready', (_req, res) => {
  const readiness = getBackendReadiness();
  res.status(readiness.ready ? 200 : 503).json(readiness);
});

// ── Sandbox creation ──────────────────────────────────────────────────────────

app.post(
  '/api/sandboxes/create',
  asyncHandler(async (req, res) => {
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
        anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
        openaiApiKey: process.env.OPENAI_API_KEY ?? '',
        openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
        geminiApiKey: process.env.GEMINI_API_KEY ?? '',
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434/v1',
        ollamaModel: process.env.OLLAMA_MODEL ?? 'qwen3-coder:30b',
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
  const { sandbox_id } = req.params;
  const deleted = await store.deleteSandbox(sandbox_id);
  if (!deleted) throw httpError(404, 'Sandbox not found');
  // Stop and remove the Docker container (best-effort)
  stopAndRemoveContainer(sandbox_id).catch(() => {});
  await recordAuditEvent(req, {
    action_type: 'sandbox.delete',
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: { deleted: true },
  });
  res.json({ deleted: sandbox_id });
}));

// ── Agents CRUD ──────────────────────────────────────────────────────────────

async function getAgentRecord(agentId: string): Promise<agentStore.AgentRecord> {
  const record = await agentStore.getAgent(agentId);
  if (!record) throw httpError(404, 'Agent not found');
  return record;
}

app.get('/api/agents', asyncHandler(async (_req, res) => {
  res.json(await agentStore.listAgents());
}));

app.post('/api/agents', asyncHandler(async (req, res) => {
  const body = validateAgentCreateBody(req.body);
  res.json(await agentStore.saveAgent(body));
}));

app.get('/api/agents/:id', asyncHandler(async (req, res) => {
  res.json(await getAgentRecord(req.params.id));
}));

app.patch('/api/agents/:id', asyncHandler(async (req, res) => {
  await getAgentRecord(req.params.id);
  const body = validateAgentMetadataPatchBody(req.body);
  const updated = await agentStore.updateAgent(req.params.id, body);
  res.json(updated);
}));

app.delete('/api/agents/:id', asyncHandler(async (req, res) => {
  const deleted = await agentStore.deleteAgent(req.params.id);
  if (!deleted) throw httpError(404, 'Agent not found');
  await recordAuditEvent(req, {
    action_type: 'agent.delete',
    target_type: 'agent',
    target_id: req.params.id,
    outcome: 'success',
    details: { deleted: true },
  });
  res.json({ deleted: req.params.id });
}));

app.post('/api/agents/:id/sandbox', asyncHandler(async (req, res) => {
  await getAgentRecord(req.params.id);
  const { sandbox_id } = validateAgentSandboxAttachBody(req.body);
  const updated = await agentStore.addSandboxToAgent(req.params.id, sandbox_id);
  res.json(updated);
}));

app.patch('/api/agents/:id/config', asyncHandler(async (req, res) => {
  await getAgentRecord(req.params.id);
  const body = validateAgentConfigPatchBody(req.body);
  const updated = await agentStore.updateAgentConfig(req.params.id, body);
  res.json(updated);
}));

app.get('/api/agents/:id/workspace-memory', asyncHandler(async (req, res) => {
  await getAgentRecord(req.params.id);
  const memory = await agentStore.getAgentWorkspaceMemory(req.params.id);
  res.json(memory);
}));

app.patch('/api/agents/:id/workspace-memory', asyncHandler(async (req, res) => {
  await getAgentRecord(req.params.id);
  const body = validateAgentWorkspaceMemoryPatchBody(req.body);
  const updated = await agentStore.updateAgentWorkspaceMemory(req.params.id, body);
  res.json(updated);
}));

// ── Agent configuration push ──────────────────────────────────────────────────

app.post('/api/sandboxes/:sandbox_id/configure-agent', asyncHandler(async (req, res) => {
  const { sandbox_id } = req.params;
  const record = await getRecord(sandbox_id);
  const containerName = getContainerName(record.sandbox_id);

  const {
    system_name,
    soul_content,
    skills,
    cron_jobs,
  } = req.body as {
    system_name: string;
    soul_content: string;
    skills: Array<{ skill_id: string; name: string; description: string }>;
    cron_jobs: Array<{ name: string; schedule: string; message: string }>;
  };

  const steps: ConfigureAgentStepResult[] = [];

  const pushStep = (step: ConfigureAgentStepResult) => {
    steps.push(step);
    return step.ok;
  };

  // Write SOUL.md
  if (soul_content) {
    const [ok, out] = await dockerExec(containerName,
      buildHomeFileWriteCommand('.openclaw/workspace/SOUL.md', soul_content),
      30_000);
    if (!pushStep({
      kind: 'soul',
      target: 'SOUL.md',
      ok,
      message: ok ? 'SOUL.md written' : `SOUL.md failed: ${out}`,
    })) {
      await recordAuditEvent(req, {
        action_type: 'sandbox.configure_agent',
        target_type: 'sandbox',
        target_id: sandbox_id,
        outcome: 'failure',
        details: {
          system_name: typeof system_name === 'string' ? system_name : '',
          skill_count: Array.isArray(skills) ? skills.length : 0,
          cron_job_count: Array.isArray(cron_jobs) ? cron_jobs.length : 0,
          step_count: steps.length,
          failed_step: steps[steps.length - 1],
        },
      });
      res.status(500).json({ ok: false, applied: false, detail: 'Agent config apply failed', steps });
      return;
    }
  }

  // Write each skill SKILL.md
  for (const skill of (skills ?? [])) {
    const normalizedSkillId = normalizePathSegment(String(skill.skill_id ?? ''));
    const skillContent = [
      '---',
      `name: ${normalizedSkillId}`,
      'version: 1.0.0',
      `description: "${skill.description || skill.name}"`,
      'user-invocable: false',
      '---',
      '',
      `# ${skill.name}`,
      '',
      skill.description || 'Auto-generated skill.',
    ].join('\n');
    const [ok, out] = await dockerExec(containerName,
      buildHomeFileWriteCommand(
        `.openclaw/workspace/skills/${normalizedSkillId}/SKILL.md`,
        skillContent,
      ),
      20_000);
    if (!pushStep({
      kind: 'skill',
      target: normalizedSkillId,
      ok,
      message: ok ? `Skill ${normalizedSkillId} written` : `Skill ${normalizedSkillId} failed: ${out}`,
    })) {
      await recordAuditEvent(req, {
        action_type: 'sandbox.configure_agent',
        target_type: 'sandbox',
        target_id: sandbox_id,
        outcome: 'failure',
        details: {
          system_name: typeof system_name === 'string' ? system_name : '',
          skill_count: Array.isArray(skills) ? skills.length : 0,
          cron_job_count: Array.isArray(cron_jobs) ? cron_jobs.length : 0,
          step_count: steps.length,
          failed_step: steps[steps.length - 1],
        },
      });
      res.status(500).json({ ok: false, applied: false, detail: 'Agent config apply failed', steps });
      return;
    }
  }

  // Register cron jobs
  for (const job of (cron_jobs ?? [])) {
    const [ok, out] = await dockerExec(containerName,
      buildConfigureAgentCronAddCommand({
        name: String(job.name ?? ''),
        schedule: String(job.schedule ?? ''),
        message: String(job.message ?? ''),
      }),
      20_000);
    if (!pushStep({
      kind: 'cron',
      target: String(job.name ?? ''),
      ok,
      message: ok ? `Cron ${job.name} registered` : `Cron ${job.name} failed: ${out}`,
    })) {
      await recordAuditEvent(req, {
        action_type: 'sandbox.configure_agent',
        target_type: 'sandbox',
        target_id: sandbox_id,
        outcome: 'failure',
        details: {
          system_name: typeof system_name === 'string' ? system_name : '',
          skill_count: Array.isArray(skills) ? skills.length : 0,
          cron_job_count: Array.isArray(cron_jobs) ? cron_jobs.length : 0,
          step_count: steps.length,
          failed_step: steps[steps.length - 1],
        },
      });
      res.status(500).json({ ok: false, applied: false, detail: 'Agent config apply failed', steps });
      return;
    }
  }

  await recordAuditEvent(req, {
    action_type: 'sandbox.configure_agent',
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: {
      system_name: typeof system_name === 'string' ? system_name : '',
      skill_count: Array.isArray(skills) ? skills.length : 0,
      cron_job_count: Array.isArray(cron_jobs) ? cron_jobs.length : 0,
      step_count: steps.length,
    },
  });
  res.json({ ok: true, applied: true, steps });
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
  const container_running = await dockerContainerRunning(getContainerName(record.sandbox_id))
    .catch(() => false);
  const fallback = {
    sandbox_id: record.sandbox_id,
    sandbox_name: record.sandbox_name,
    gateway_port: record.gateway_port ?? 18789,
    approved: record.approved ?? false,
    created_at: record.created_at,
    container_running,
  };
  try {
    const resp = await axios.get(url, { headers, timeout: 10000, validateStatus: () => true });
    if (resp.status === 200 && resp.data && typeof resp.data === 'object' && !Array.isArray(resp.data)) {
      res.json({
        ...fallback,
        ...resp.data,
        container_running,
      });
      return;
    }
  } catch { /* fall through */ }
  res.json(fallback);
}));

app.post('/api/sandboxes/:sandbox_id/reconfigure-llm', asyncHandler(async (req, res) => {
  const { sandbox_id } = req.params;
  const record = await getRecord(sandbox_id);
  if (record.shared_codex_enabled) {
    throw httpError(409, 'This sandbox is locked to shared Codex auth');
  }

  const provider = String(req.body.provider ?? '').trim();
  if (!provider) throw httpError(400, 'provider is required');

  const result = await reconfigureSandboxLlm(sandbox_id, {
    provider: provider as 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama',
    apiKey: typeof req.body.apiKey === 'string' ? req.body.apiKey : undefined,
    model: typeof req.body.model === 'string' ? req.body.model : undefined,
    ollamaBaseUrl: typeof req.body.ollamaBaseUrl === 'string' ? req.body.ollamaBaseUrl : undefined,
    ollamaModel: typeof req.body.ollamaModel === 'string' ? req.body.ollamaModel : undefined,
  });

  await recordAuditEvent(req, {
    action_type: 'sandbox.reconfigure_llm',
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: {
      provider: result.provider,
      model: result.model,
      shared_codex_enabled: false,
    },
  });
  res.json(result);
}));

app.post('/api/admin/sandboxes/:sandbox_id/retrofit-shared-codex', asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { sandbox_id } = req.params;
  await getRecord(sandbox_id);

  const result = await retrofitSandboxToSharedCodex(sandbox_id, {
    sharedCodexModel: typeof req.body.model === 'string' ? req.body.model : undefined,
  });

  await store.updateSandboxSharedCodex(sandbox_id, true, result.model);
  await recordAuditEvent(req, {
    action_type: 'sandbox.retrofit_shared_codex',
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: {
      model: result.model,
      authSource: result.authSource,
    },
  }, { actor_type: 'admin_token', actor_id: 'openclaw_admin_token' });
  res.json(result);
}));

app.get('/api/admin/audit-events', asyncHandler(async (req, res) => {
  requireAdmin(req);
  const limit = Math.min(parsePositiveIntParam(req.query.limit, 50, 'audit-event limit'), 100);
  const result = await auditStore.listAuditEvents({
    action_type: req.query.action_type == null ? undefined : String(req.query.action_type),
    target_type: req.query.target_type == null ? undefined : String(req.query.target_type),
    target_id: req.query.target_id == null ? undefined : String(req.query.target_id),
    actor_type: req.query.actor_type == null ? undefined : String(req.query.actor_type),
    actor_id: req.query.actor_id == null ? undefined : String(req.query.actor_id),
    outcome: req.query.outcome == null ? undefined : String(req.query.outcome),
    limit,
  });
  res.json(result);
}));

app.post('/api/sandboxes/:sandbox_id/chat', asyncHandler(async (req, res) => {
  const record = await getRecord(req.params.sandbox_id);
  const body = { ...req.body } as Record<string, unknown>;

  const conversationId = body['conversation_id'] as string | undefined;
  delete body['conversation_id'];

  let sessionKey: string | null = null;
  if (conversationId) {
    const conv = await conversationStore.getConversation(conversationId);
    if (conv && conv.sandbox_id !== req.params.sandbox_id) {
      throw httpError(404, 'Conversation not found');
    }
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

// ── Browser / VNC status ──────────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/browser/status', asyncHandler(async (req, res) => {
  const record = await getRecord(req.params.sandbox_id);
  if (!record.vnc_port) {
    res.json({ active: false, reason: 'VNC not provisioned for this sandbox' });
    return;
  }
  // Check if x11vnc is running inside the container
  const [ok, output] = await sandboxExec(req.params.sandbox_id, 'pgrep -f x11vnc', 5);
  res.json({
    active: ok && output.trim().length > 0,
    vnc_port: record.vnc_port,
  });
}));

// ── Workspace file access ─────────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/workspace/files', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const relativePath = parseWorkspaceRelativePath(req.query.path);
  const depth = Math.min(parsePositiveIntParam(req.query.depth, 2, 'workspace depth'), 5);
  const limit = Math.min(parsePositiveIntParam(req.query.limit, 200, 'workspace limit'), 500);
  const [code, output] = await sandboxExec(
    req.params.sandbox_id,
    createWorkspaceListCommand(relativePath, depth, limit),
    30,
  );
  if (code !== 0) throw httpError(502, `Workspace list failed: ${output.slice(0, 300)}`);
  try {
    res.json(parseJsonOutput(output));
  } catch {
    throw httpError(502, 'Failed to parse workspace list output');
  }
}));

app.get('/api/sandboxes/:sandbox_id/workspace/file', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const relativePath = parseWorkspaceRelativePath(req.query.path, true);
  const [code, output] = await sandboxExec(
    req.params.sandbox_id,
    createWorkspaceReadCommand(relativePath),
    30,
  );
  if (code !== 0) throw httpError(502, `Workspace read failed: ${output.slice(0, 300)}`);
  try {
    res.json(parseJsonOutput(output));
  } catch {
    throw httpError(502, 'Failed to parse workspace file output');
  }
}));

app.get('/api/sandboxes/:sandbox_id/workspace/file/download', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const relativePath = parseWorkspaceRelativePath(req.query.path, true);
  const [code, output] = await sandboxExec(
    req.params.sandbox_id,
    createWorkspaceDownloadCommand(relativePath),
    30,
  );
  if (code !== 0) throw httpError(502, `Workspace download failed: ${output.slice(0, 300)}`);

  let payload: Record<string, unknown>;
  try {
    payload = parseJsonOutput(output) as Record<string, unknown>;
  } catch {
    throw httpError(502, 'Failed to parse workspace download output');
  }

  const base64 = typeof payload.base64 === 'string' ? payload.base64 : null;
  if (!base64) throw httpError(502, 'Workspace download payload missing file bytes');

  const buffer = Buffer.from(base64, 'base64');
  const downloadName = typeof payload.download_name === 'string' ? payload.download_name : 'download';
  const mimeType = typeof payload.mime_type === 'string' ? payload.mime_type : 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${downloadName.replace(/"/g, '')}"`);
  res.send(buffer);
}));

// ── Conversation management ───────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/conversations', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const limit = Math.min(parsePositiveIntParam(req.query.limit, 20, 'conversation limit'), 100);
  const cursor = req.query.cursor == null ? null : String(req.query.cursor);

  try {
    res.json(await conversationStore.listConversationsPage(req.params.sandbox_id, { limit, cursor }));
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid conversation cursor') {
      throw httpError(400, 'Invalid conversation cursor');
    }
    throw error;
  }
}));

app.post('/api/sandboxes/:sandbox_id/conversations', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const conv = await conversationStore.createConversation(
    req.params.sandbox_id,
    req.body.model ?? 'openclaw-default',
    req.body.name ?? 'New Conversation',
  );
  // Create session folder in the sandbox workspace (fire-and-forget — non-fatal if sandbox is down)
  sandboxExec(
    req.params.sandbox_id,
    `mkdir -p "$HOME/.openclaw/workspace/sessions/${conv.id}" 2>/dev/null`,
    10,
  ).catch(() => { /* sandbox may be stopped — folder will be created on first file write */ });
  res.json(conv);
}));

app.get('/api/sandboxes/:sandbox_id/conversations/:conv_id/messages', asyncHandler(async (req, res) => {
  const { sandbox_id, conv_id } = req.params;
  await getSandboxConversationRecord(sandbox_id, conv_id);
  const limit = Math.min(parsePositiveIntParam(req.query.limit, 50, 'message limit'), 200);
  const beforeValue = req.query.before;
  let before: number | null = null;
  if (beforeValue != null && beforeValue !== '') {
    before = parsePositiveIntParam(beforeValue, 0, 'message cursor');
  }

  res.json(await conversationStore.getMessagesPage(conv_id, { limit, before }));
}));

app.post('/api/sandboxes/:sandbox_id/conversations/:conv_id/messages', asyncHandler(async (req, res) => {
  const { sandbox_id, conv_id } = req.params;
  await getSandboxConversationRecord(sandbox_id, conv_id);
  await conversationStore.appendMessages(conv_id, req.body.messages ?? []);
  res.json({ ok: true });
}));

app.patch('/api/sandboxes/:sandbox_id/conversations/:conv_id', asyncHandler(async (req, res) => {
  const { sandbox_id, conv_id } = req.params;
  await getSandboxConversationRecord(sandbox_id, conv_id);
  await conversationStore.renameConversation(conv_id, req.body.name);
  res.json({ ok: true });
}));

app.delete('/api/sandboxes/:sandbox_id/conversations/:conv_id', asyncHandler(async (req, res) => {
  const { sandbox_id, conv_id } = req.params;
  await getSandboxConversationRecord(sandbox_id, conv_id);
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
  if (kind === 'cron') {
  } else if (kind === 'every') {
  } else if (kind === 'at') {
  } else {
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

  const [code, output] = await sandboxExec(req.params.sandbox_id, `${joinShellArgs(parts)} 2>&1`, 30);
  if (code !== 0) throw httpError(502, `openclaw cron add failed: ${output.slice(0, 400)}`);
  let response: Record<string, unknown>;
  try { response = parseJsonOutput(output) as Record<string, unknown>; } catch { response = { ok: true, output }; }
  await recordAuditEvent(req, {
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

app.delete('/api/sandboxes/:sandbox_id/crons/:job_id', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const [code, output] = await sandboxExec(req.params.sandbox_id, buildCronDeleteCommand(req.params.job_id), 20);
  if (code !== 0) throw httpError(502, `openclaw cron rm failed: ${output.slice(0, 300)}`);
  await recordAuditEvent(req, {
    action_type: 'cron.delete',
    target_type: 'sandbox',
    target_id: req.params.sandbox_id,
    outcome: 'success',
    details: { job_id: req.params.job_id },
  });
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
  const [code2, output2] = await sandboxExec(
    sandbox_id,
    `${joinShellArgs(['openclaw', 'cron', subcmd, job_id])} 2>&1`,
    20,
  );
  if (code2 !== 0) throw httpError(502, `cron ${subcmd} failed: ${output2.slice(0, 300)}`);
  await recordAuditEvent(req, {
    action_type: 'cron.toggle',
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: { job_id, enabled: subcmd === 'enable' },
  });
  res.json({ jobId: job_id, enabled: subcmd === 'enable' });
}));

app.patch('/api/sandboxes/:sandbox_id/crons/:job_id', asyncHandler(async (req, res) => {
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
  const [code, output] = await sandboxExec(sandbox_id, `${joinShellArgs(parts)} 2>&1`, 30);
  if (code !== 0) throw httpError(502, `openclaw cron edit failed: ${output.slice(0, 400)}`);
  await recordAuditEvent(req, {
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

app.post('/api/sandboxes/:sandbox_id/crons/:job_id/run', asyncHandler(async (req, res) => {
  const { sandbox_id, job_id } = req.params;
  await getRecord(sandbox_id);
  const [code, output] = await sandboxExec(sandbox_id, buildCronRunCommand(job_id), 60);
  if (code !== 0) throw httpError(502, `openclaw cron run failed: ${output.slice(0, 300)}`);
  await recordAuditEvent(req, {
    action_type: 'cron.run',
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: { job_id },
  });
  res.json({ ok: true, jobId: job_id });
}));

app.get('/api/sandboxes/:sandbox_id/crons/:job_id/runs', asyncHandler(async (req, res) => {
  const { sandbox_id, job_id } = req.params;
  const limit = Number(req.query.limit ?? 50);
  await getRecord(sandbox_id);
  const [code, output] = await sandboxExec(
    sandbox_id,
    `${joinShellArgs(['openclaw', 'cron', 'runs', '--id', job_id, '--limit', String(limit)])} 2>&1`,
    20,
  );
  if (code !== 0) throw httpError(502, `openclaw cron runs failed: ${output.slice(0, 300)}`);
  try { res.json(parseJsonOutput(output)); } catch { throw httpError(502, 'Failed to parse runs output'); }
}));

// ── Channel configuration ─────────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/channels', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  res.json(await channelManager.getChannelsConfig(req.params.sandbox_id));
}));

app.put('/api/sandboxes/:sandbox_id/channels/telegram', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const result = await channelManager.setTelegramConfig(req.params.sandbox_id, req.body);
  await recordAuditEvent(req, {
    action_type: 'channel.telegram.update',
    target_type: 'sandbox',
    target_id: req.params.sandbox_id,
    outcome: 'success',
    details: {
      enabled: req.body?.enabled,
      dmPolicy: req.body?.dmPolicy,
      botTokenConfigured: Boolean(req.body?.botToken),
    },
  });
  res.json(result);
}));

app.put('/api/sandboxes/:sandbox_id/channels/slack', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const result = await channelManager.setSlackConfig(req.params.sandbox_id, req.body);
  await recordAuditEvent(req, {
    action_type: 'channel.slack.update',
    target_type: 'sandbox',
    target_id: req.params.sandbox_id,
    outcome: 'success',
    details: {
      enabled: req.body?.enabled,
      mode: req.body?.mode,
      dmPolicy: req.body?.dmPolicy,
      appTokenConfigured: Boolean(req.body?.appToken),
      botTokenConfigured: Boolean(req.body?.botToken),
      signingSecretConfigured: Boolean(req.body?.signingSecret),
    },
  });
  res.json(result);
}));

app.get('/api/sandboxes/:sandbox_id/channels/:channel/status', asyncHandler(async (req, res) => {
  const { sandbox_id, channel } = req.params;
  if (channel !== 'telegram' && channel !== 'slack') throw httpError(400, "channel must be 'telegram' or 'slack'");
  await getRecord(sandbox_id);
  res.json(await channelManager.probeChannelStatus(sandbox_id, channel));
}));

// ── Pairing ───────────────────────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/channels/:channel/pairing', asyncHandler(async (req, res) => {
  const { sandbox_id, channel } = req.params;
  if (channel !== 'telegram' && channel !== 'slack') throw httpError(400, "channel must be 'telegram' or 'slack'");
  await getRecord(sandbox_id);
  res.json(await channelManager.listPairingRequests(sandbox_id, channel));
}));

app.post('/api/sandboxes/:sandbox_id/channels/:channel/pairing/approve', asyncHandler(async (req, res) => {
  const { sandbox_id, channel } = req.params;
  if (channel !== 'telegram' && channel !== 'slack') throw httpError(400, "channel must be 'telegram' or 'slack'");
  await getRecord(sandbox_id);
  const result = await channelManager.approvePairing(sandbox_id, channel, String(req.body.code ?? ''));
  if (!result['ok']) throw httpError(400, String(result['output'] ?? 'Approval failed'));
  await recordAuditEvent(req, {
    action_type: `channel.${channel}.pairing_approve`,
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: { channel, code_present: Boolean(req.body.code) },
  });
  res.json(result);
}));

// ── Error middleware (MUST be last) ──────────────────────────────────────────
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  res.status(status).json({ detail: err.message });
});

export default app;
