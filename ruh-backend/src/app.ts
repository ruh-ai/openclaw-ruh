/**
 * Express application — routes only, no startup side-effects.
 * Imported by src/index.ts (production) and tests/helpers/app.ts (tests).
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './authRoutes';
import { marketplaceRouter } from './marketplaceRoutes';
import { createCostRouter } from './costRoutes';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';
import { context, trace, SpanStatusCode, propagation } from '@opentelemetry/api';
import { startAgentSpan, endSpanOk, endSpanError, spanTraceContext } from './agentTracing';
import { createLogger } from '@ruh/logger';
import { requestLoggerMiddleware } from './requestLogger';
import { getConfig } from './config';
import { requireAuth, requireRole } from './auth/middleware';
import * as userStore from './userStore';
import { withConn } from './db';

import {
  buildConfigureAgentCronAddCommand,
  buildCronDeleteCommand,
  buildCronRunCommand,
  buildHomeFileWriteCommand,
  dockerContainerRunning,
  listManagedSandboxContainers,
  dockerSpawn,
  joinShellArgs,
  normalizePathSegment,
} from './docker';
import * as store from './store';
import * as conversationStore from './conversationStore';
import * as agentStore from './agentStore';
import * as channelManager from './channelManager';
import * as auditStore from './auditStore';
import * as systemEventStore from './systemEventStore';
import * as webhookDeliveryStore from './webhookDeliveryStore';
import { findSkill, listSkills } from './skillRegistry';
import * as paperclipOrchestrator from './paperclipOrchestrator';
import { getBackendReadiness } from './backendReadiness';
import { getSandboxConversationRecord } from './conversationAccess';
import {
  createOpenclawSandbox,
  dockerExec,
  getContainerName,
  PREVIEW_PORTS,
  reconfigureSandboxLlm,
  restartGateway,
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
  createWorkspaceArchiveCommand,
  createWorkspaceDownloadCommand,
  createWorkspaceHandoffCommand,
  createWorkspaceListCommand,
  createWorkspaceReadCommand,
  normalizeWorkspaceRelativePath,
} from "./workspaceFiles";
import {
  JSON_BODY_LIMIT,
  validateUuid,
  validateAgentConfigPatchBody,
  validateAgentCreateBody,
  validateAgentMetadataPatchBody,
  validateAgentSandboxAttachBody,
  validateAgentWorkspaceMemoryPatchBody,
  validateConversationMessagesAppendBody,
} from './validation';
import {
  getPersistedAssistantMessageFromResponse,
  getPersistedUserMessage,
  StreamingChatPersistenceCollector,
  type ExecutionSummary,
} from './chatPersistence';
import {
  buildSandboxRuntimeReconciliation,
  classifySandboxRuntime,
} from './sandboxRuntime';

// ---------------------------------------------------------------------------
// Architect SOUL.md — injected into every new agent's forge container so the
// Architect agent can guide the creation conversation from within the sandbox.
// ---------------------------------------------------------------------------
let ARCHITECT_SOUL_MD = '';
try {
  ARCHITECT_SOUL_MD = readFileSync(join(__dirname, 'architect-soul.md'), 'utf8');
} catch {
  console.warn('[architect] architect-soul.md not found — SOUL.md will not be injected into new forge containers');
}

const appLogger = createLogger({ service: 'ruh-backend' });

export const app = express();
app.use(express.json({ limit: JSON_BODY_LIMIT }));

type RequestWithMetadata = Request & {
  __requestId?: string;
  __traceId?: string | null;
  __otelTraceId?: string;
  __otelSpanId?: string;
};

function getOrCreateRequestId(req: Request): string {
  const typedReq = req as RequestWithMetadata;
  if (typedReq.__requestId) {
    return typedReq.__requestId;
  }
  const requestId = String(req.headers['x-request-id'] ?? '').trim() || uuidv4();
  typedReq.__requestId = requestId;
  return requestId;
}

function getTraceId(req: Request): string | null {
  const typedReq = req as RequestWithMetadata;
  if (typedReq.__traceId !== undefined) {
    return typedReq.__traceId;
  }
  typedReq.__traceId = String(req.headers['x-trace-id'] ?? '').trim() || null;
  return typedReq.__traceId;
}

app.use((req, res, next) => {
  res.setHeader('x-request-id', getOrCreateRequestId(req));
  next();
});

// OTEL HTTP request tracing — creates a span per request.
// When OTEL is disabled, trace.getTracer() returns a no-op tracer (zero overhead).
app.use((req, res, next) => {
  const tracer = trace.getTracer('ruh-backend');
  const parentCtx = propagation.extract(context.active(), req.headers);
  const span = tracer.startSpan(`HTTP ${req.method} ${req.path}`, {
    attributes: {
      'http.method': req.method,
      'http.url': req.originalUrl,
      'http.target': req.path,
    },
  }, parentCtx);

  const spanCtx = span.spanContext();
  const typedReq = req as RequestWithMetadata;
  typedReq.__otelTraceId = spanCtx.traceId;
  typedReq.__otelSpanId = spanCtx.spanId;

  res.on('finish', () => {
    span.setAttribute('http.status_code', res.statusCode);
    if (res.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end();
  });

  context.with(trace.setSpan(parentCtx, span), () => next());
});

// ── Structured HTTP request/response logging ────────────────────────────────
app.use(requestLoggerMiddleware);

const allowedOrigins = getConfig().allowedOrigins;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-OpenClaw-Session-Key', 'X-Daytona-Preview-Token'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400,
  }),
);

app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/agents/:agentId', createCostRouter());

// In-memory store for active creation streams (exported for test cleanup)
export interface StreamEntry {
  status: 'pending' | 'running' | 'done' | 'error';
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}
export const _streams = new Map<string, StreamEntry>();

interface ConfigureAgentStepResult {
  kind: 'soul' | 'skill' | 'cron' | 'mcp' | 'runtime_env' | 'webhook';
  target: string;
  ok: boolean;
  message: string;
}

interface PublicWebhookProvisioning {
  triggerId: string;
  title: string;
  url: string;
  secret: string;
  secretLastFour: string;
}

const WEBHOOK_PAYLOAD_LIMIT_BYTES = 64 * 1024;
const WEBHOOK_DELIVERY_ID_HEADER = 'x-openclaw-delivery-id';
const WEBHOOK_DELIVERY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

function buildFallbackSkillContent(skill: { skill_id: string; name: string; description: string }): string {
  const normalizedSkillId = normalizePathSegment(String(skill.skill_id ?? ''));
  return [
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
    '',
    '# TODO: Implement this skill',
  ].join('\n');
}

const MCP_PACKAGES: Record<string, { pkg: string }> = {
  github: { pkg: '@modelcontextprotocol/server-github' },
  slack: { pkg: '@modelcontextprotocol/server-slack' },
  google: { pkg: '@anthropic/google-workspace-mcp' },
  'google-ads': { pkg: '@anthropic/google-ads-mcp' },
  jira: { pkg: 'mcp-atlassian' },
  notion: { pkg: '@modelcontextprotocol/server-notion' },
  linear: { pkg: '@linear/mcp-server' },
};

function initializeSseStream(req: Request, res: Response): {
  sendEvent: (event: string, data: unknown) => void;
  close: () => void;
} {
  req.setTimeout(0);
  res.setTimeout(0);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let clientConnected = true;
  const markDisconnected = () => {
    clientConnected = false;
  };

  req.on('aborted', markDisconnected);
  req.on('close', markDisconnected);

  const heartbeat = setInterval(() => {
    if (!clientConnected) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(': heartbeat\n\n');
    } catch {
      markDisconnected();
      clearInterval(heartbeat);
    }
  }, 15000);

  return {
    sendEvent(event: string, data: unknown) {
      if (!clientConnected) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        markDisconnected();
      }
    },
    close() {
      clearInterval(heartbeat);
      req.off('aborted', markDisconnected);
      req.off('close', markDisconnected);
      if (!clientConnected) return;
      try {
        res.end();
      } catch {
        // Ignore response shutdown failures after partial disconnects.
      }
    },
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getRecord(sandboxId: string): Promise<store.SandboxRecord> {
  const record = await store.getSandbox(sandboxId);
  if (!record) throw httpError(404, 'Sandbox not found');
  return record;
}

function hashWebhookSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function verifyWebhookSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashWebhookSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

function buildWebhookUrl(req: Request, publicId: string): string {
  const host = req.get('host') ?? 'localhost:8000';
  return `${req.protocol}://${host}/api/triggers/webhooks/${publicId}`;
}

function redactAgentWebhookSecrets(record: agentStore.AgentRecord): agentStore.AgentRecord {
  return {
    ...record,
    triggers: record.triggers.map((trigger) => {
      const { webhookSecretHash, ...safeTrigger } = trigger;
      void webhookSecretHash;
      return safeTrigger;
    }),
  };
}

async function ensureWebhookProvisioning(
  req: Request,
  agentId: string,
): Promise<{ agent: agentStore.AgentRecord; provisioned: PublicWebhookProvisioning[] }> {
  const agent = await getAgentRecord(agentId);
  const provisioned: PublicWebhookProvisioning[] = [];
  let changed = false;

  const nextTriggers = agent.triggers.map((trigger) => {
    if (trigger.kind !== 'webhook' || trigger.status !== 'supported') {
      return trigger;
    }
    if (trigger.webhookPublicId && trigger.webhookSecretHash && trigger.webhookSecretLastFour) {
      return trigger;
    }

    changed = true;
    const secret = `whsec_${randomBytes(18).toString('hex')}`;
    const publicId = uuidv4();
    const secretLastFour = secret.slice(-4);
    provisioned.push({
      triggerId: trigger.id,
      title: trigger.title,
      url: buildWebhookUrl(req, publicId),
      secret,
      secretLastFour,
    });

    return {
      ...trigger,
      webhookPublicId: publicId,
      webhookSecretHash: hashWebhookSecret(secret),
      webhookSecretLastFour: secretLastFour,
      webhookSecretIssuedAt: new Date().toISOString(),
    };
  });

  if (!changed) {
    return { agent, provisioned };
  }

  const updated = await agentStore.updateAgentConfig(agentId, { triggers: nextTriggers });
  return { agent: updated ?? { ...agent, triggers: nextTriggers }, provisioned };
}

async function resolveActiveSandboxForAgent(
  agent: agentStore.AgentRecord,
): Promise<store.SandboxRecord | null> {
  for (const sandboxId of agent.sandbox_ids ?? []) {
    const record = await store.getSandbox(sandboxId).catch(() => null);
    if (!record) {
      continue;
    }
    const running = await dockerContainerRunning(getContainerName(sandboxId)).catch(() => false);
    if (running) {
      return record;
    }
  }

  return null;
}

async function persistWebhookDeliveryStatus(
  agent: agentStore.AgentRecord,
  triggerId: string,
  status: 'delivered' | 'failed',
): Promise<void> {
  const timestamp = new Date().toISOString();
  const triggers = agent.triggers.map((trigger) =>
    trigger.id === triggerId
      ? {
          ...trigger,
          webhookLastDeliveryAt: timestamp,
          webhookLastDeliveryStatus: status,
        }
      : trigger,
  );

  await agentStore.updateAgentConfig(agent.id, { triggers });
}

function getWebhookDeliveryId(req: Request): string {
  const deliveryId = String(req.headers[WEBHOOK_DELIVERY_ID_HEADER] ?? '').trim();
  if (!deliveryId) {
    throw httpError(400, `${WEBHOOK_DELIVERY_ID_HEADER} header is required`);
  }
  if (!WEBHOOK_DELIVERY_ID_PATTERN.test(deliveryId)) {
    throw httpError(400, `${WEBHOOK_DELIVERY_ID_HEADER} must be 1-200 URL-safe characters`);
  }
  return deliveryId;
}

function getWebhookPayloadForDelivery(req: Request): string {
  const contentLength = Number.parseInt(String(req.headers['content-length'] ?? ''), 10);
  if (Number.isFinite(contentLength) && contentLength > WEBHOOK_PAYLOAD_LIMIT_BYTES) {
    throw httpError(413, `Webhook payload exceeds ${WEBHOOK_PAYLOAD_LIMIT_BYTES} bytes`);
  }

  const payload = JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(payload, 'utf8') > WEBHOOK_PAYLOAD_LIMIT_BYTES) {
    throw httpError(413, `Webhook payload exceeds ${WEBHOOK_PAYLOAD_LIMIT_BYTES} bytes`);
  }

  return payload;
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
  const configuredToken = getConfig().openclawAdminToken;
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
  const requestId = getOrCreateRequestId(req);

  try {
    await auditStore.writeAuditEvent({
      ...event,
      request_id: requestId,
      actor_type: actor.actor_type,
      actor_id: actor.actor_id,
      origin,
    });
  } catch (error) {
    appLogger.error({ err: error }, 'Failed to persist control-plane audit event');
  }
}

async function recordSystemEvent(
  req: Request,
  event: Omit<systemEventStore.WriteSystemEventInput, 'request_id' | 'trace_id' | 'span_id'>,
): Promise<void> {
  try {
    const typedReq = req as RequestWithMetadata;
    await systemEventStore.writeSystemEvent({
      ...event,
      request_id: getOrCreateRequestId(req),
      trace_id: typedReq.__otelTraceId ?? getTraceId(req),
      span_id: typedReq.__otelSpanId ?? null,
    });
  } catch (error) {
    appLogger.error({ err: error }, 'Failed to persist system event');
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

function parseOptionalQueryString(value: unknown): string | undefined {
  const parsed = String(value ?? '').trim();
  return parsed === '' ? undefined : parsed;
}

function buildSystemEventFilters(
  req: Request,
  fixed: Partial<systemEventStore.SystemEventFilters> = {},
): systemEventStore.SystemEventFilters {
  return {
    level: parseOptionalQueryString(req.query.level),
    category: parseOptionalQueryString(req.query.category),
    action: parseOptionalQueryString(req.query.action),
    status: parseOptionalQueryString(req.query.status),
    request_id: parseOptionalQueryString(req.query.request_id),
    trace_id: parseOptionalQueryString(req.query.trace_id),
    sandbox_id: fixed.sandbox_id ?? parseOptionalQueryString(req.query.sandbox_id),
    agent_id: fixed.agent_id ?? parseOptionalQueryString(req.query.agent_id),
    conversation_id: fixed.conversation_id ?? parseOptionalQueryString(req.query.conversation_id),
    source: parseOptionalQueryString(req.query.source),
    limit: req.query.limit == null ? undefined : parsePositiveIntParam(req.query.limit, 50, 'system-event limit'),
  };
}

function buildRuntimeEnvFileContent(
  runtimeInputs: Array<{ key: string; value: string }>,
): string {
  return runtimeInputs
    .map(({ key, value }) => `${key}=${value}`)
    .join('\n');
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/ready', (_req, res) => {
  const readiness = getBackendReadiness();
  res.status(readiness.ready ? 200 : 503).json(readiness);
});

app.get('/api/system/events', asyncHandler(async (req, res) => {
  res.json(await systemEventStore.listSystemEvents(buildSystemEventFilters(req)));
}));

app.get('/api/sandboxes/:sandbox_id/system-events', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  res.json(await systemEventStore.listSystemEvents(buildSystemEventFilters(req, {
    sandbox_id: req.params.sandbox_id,
  })));
}));

app.get('/api/agents/:id/system-events', asyncHandler(async (req, res) => {
  await getAgentRecord(req.params.id);
  res.json(await systemEventStore.listSystemEvents(buildSystemEventFilters(req, {
    agent_id: req.params.id,
  })));
}));

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

    const stream = initializeSseStream(req, res);
    const { sendEvent } = stream;
    const sandboxName = String(entry.request.sandbox_name ?? 'openclaw-gateway');

    await recordSystemEvent(req, {
      level: 'info',
      category: 'sandbox.lifecycle',
      action: 'sandbox.create.started',
      status: 'started',
      message: `Started creating sandbox "${sandboxName}"`,
      source: 'ruh-backend:sandbox-stream',
      details: {
        stream_id,
        sandbox_name: sandboxName,
      },
    });

    try {
      const config = getConfig();
      const gen = createOpenclawSandbox({
        anthropicApiKey: config.anthropicApiKey ?? '',
        openaiApiKey: config.openaiApiKey ?? '',
        openrouterApiKey: config.openrouterApiKey ?? '',
        geminiApiKey: config.geminiApiKey ?? '',
        ollamaBaseUrl: config.ollamaBaseUrl ?? undefined,
        ollamaModel: config.ollamaModel,
        telegramBotToken: config.telegramBotToken ?? '',
        discordBotToken: config.discordBotToken ?? '',
        sandboxName,
      });

      for await (const [eventType, data] of gen) {
        if (eventType === 'log') {
          sendEvent('log', { message: data });
        } else if (eventType === 'result') {
          await store.saveSandbox(data as Record<string, unknown>, String(entry.request.sandbox_name ?? ''));
          entry.result = data as Record<string, unknown>;
          await recordSystemEvent(req, {
            level: 'info',
            category: 'sandbox.lifecycle',
            action: 'sandbox.create.succeeded',
            status: 'success',
            message: `Sandbox ${String((data as Record<string, unknown>)['sandbox_id'] ?? '')} created successfully`,
            sandbox_id: String((data as Record<string, unknown>)['sandbox_id'] ?? ''),
            source: 'ruh-backend:sandbox-stream',
            details: {
              stream_id,
              sandbox_name: sandboxName,
              gateway_port: (data as Record<string, unknown>)['gateway_port'],
            },
          });
          sendEvent('result', data);
        } else if (eventType === 'approved') {
          await store.markApproved(entry.result!['sandbox_id'] as string);
          entry.status = 'done';
          await recordSystemEvent(req, {
            level: 'info',
            category: 'sandbox.lifecycle',
            action: 'sandbox.create.approved',
            status: 'success',
            message: `Sandbox ${String(entry.result?.['sandbox_id'] ?? '')} device approval succeeded`,
            sandbox_id: String(entry.result?.['sandbox_id'] ?? ''),
            source: 'ruh-backend:sandbox-stream',
            details: {
              stream_id,
              approval_message: (data as Record<string, unknown>)['message'],
            },
          });
          sendEvent('approved', data);
        } else if (eventType === 'error') {
          entry.status = 'error';
          entry.error = data as string;
          await recordSystemEvent(req, {
            level: 'error',
            category: 'sandbox.lifecycle',
            action: 'sandbox.create.failed',
            status: 'failure',
            message: String(data),
            source: 'ruh-backend:sandbox-stream',
            details: {
              stream_id,
              sandbox_name: sandboxName,
              error: String(data),
            },
          });
          sendEvent('error', { message: data });
          stream.close();
          return;
        }
      }

      entry.status = 'done';
      sendEvent('done', { stream_id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.status = 'error';
      entry.error = msg;
      await recordSystemEvent(req, {
        level: 'error',
        category: 'sandbox.lifecycle',
        action: 'sandbox.create.failed',
        status: 'failure',
        message: msg,
        source: 'ruh-backend:sandbox-stream',
        details: {
          stream_id,
          sandbox_name: sandboxName,
          error: msg,
        },
      });
      sendEvent('error', { message: msg });
    }

    stream.close();
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

// Restart the OpenClaw gateway inside a sandbox container.
// Containers run without systemd, so we kill the old process and start fresh.
app.post('/api/sandboxes/:sandbox_id/gateway/restart', asyncHandler(async (req, res) => {
  const { sandbox_id } = req.params;
  await getRecord(sandbox_id); // throws 404 if not found
  // Kill existing gateway process (if any), then start in background
  await sandboxExec(sandbox_id, 'pkill -f "openclaw gateway" 2>/dev/null || true', 5);
  const [exitCode, output] = await sandboxExec(
    sandbox_id,
    'nohup openclaw gateway > /tmp/openclaw-gateway.log 2>&1 & sleep 2 && curl -sf http://localhost:18789/ > /dev/null && echo "GATEWAY_OK" || echo "GATEWAY_FAIL"',
    15,
  );
  const gatewayOk = output.includes('GATEWAY_OK');
  if (!gatewayOk) {
    throw httpError(502, `Gateway restart failed: ${output.slice(0, 300)}`);
  }
  res.json({ restarted: true, healthy: true });
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

app.get('/api/skills', asyncHandler(async (_req, res) => {
  res.json(listSkills());
}));

app.get('/api/skills/:skill_id', asyncHandler(async (req, res) => {
  const skill = findSkill(req.params.skill_id);
  if (!skill) throw httpError(404, 'Skill not found');
  res.json(skill);
}));

async function getAgentRecord(agentId: string): Promise<agentStore.AgentRecord> {
  const record = await agentStore.getAgent(agentId);
  if (!record) throw httpError(404, 'Agent not found');
  return record;
}

app.get('/api/agents', asyncHandler(async (_req, res) => {
  const agents = await agentStore.listAgents();
  res.json(agents.map(redactAgentWebhookSecrets));
}));

app.post('/api/agents', asyncHandler(async (req, res) => {
  const body = validateAgentCreateBody(req.body);
  res.json(redactAgentWebhookSecrets(await agentStore.saveAgent(body)));
}));

app.get('/api/agents/:id', asyncHandler(async (req, res) => {
  res.json(redactAgentWebhookSecrets(await getAgentRecord(req.params.id)));
}));

app.patch('/api/agents/:id', asyncHandler(async (req, res) => {
  await getAgentRecord(req.params.id);
  const body = validateAgentMetadataPatchBody(req.body);
  const updated = await agentStore.updateAgent(req.params.id, body);
  res.json(updated ? redactAgentWebhookSecrets(updated) : updated);
}));

app.delete('/api/agents/:id', asyncHandler(async (req, res) => {
  // Read agent first to get sandbox_ids for cascade cleanup
  const agent = await agentStore.getAgent(req.params.id);
  if (!agent) throw httpError(404, 'Agent not found');

  // Fire-and-forget: clean up Paperclip resources
  paperclipOrchestrator.teardownPaperclipCompany(req.params.id).catch(() => {});

  // Cascade: delete associated sandboxes + Docker containers
  const sandboxIds: string[] = agent.sandbox_ids ?? [];
  for (const sid of sandboxIds) {
    await store.deleteSandbox(sid).catch(() => {});
    stopAndRemoveContainer(sid).catch(() => {});
  }

  const deleted = await agentStore.deleteAgent(req.params.id);
  if (!deleted) throw httpError(404, 'Agent not found');
  await recordAuditEvent(req, {
    action_type: 'agent.delete',
    target_type: 'agent',
    target_id: req.params.id,
    outcome: 'success',
    details: { deleted: true, sandboxesCleaned: sandboxIds.length },
  });
  res.json({ deleted: req.params.id, sandboxesCleaned: sandboxIds.length });
}));

app.post('/api/agents/bulk-delete', asyncHandler(async (req, res) => {
  const { agentIds } = req.body;
  if (!Array.isArray(agentIds) || agentIds.length === 0) {
    throw httpError(400, 'agentIds must be a non-empty array');
  }
  if (agentIds.length > 50) {
    throw httpError(400, 'Cannot delete more than 50 agents at once');
  }

  const deleted: string[] = [];
  const failed: string[] = [];
  let totalSandboxesCleaned = 0;

  for (const agentId of agentIds) {
    try {
      const agent = await agentStore.getAgent(agentId);
      if (!agent) { failed.push(agentId); continue; }

      // Cascade: delete associated sandboxes + Docker containers
      const sandboxIds: string[] = agent.sandbox_ids ?? [];
      for (const sid of sandboxIds) {
        await store.deleteSandbox(sid).catch(() => {});
        stopAndRemoveContainer(sid).catch(() => {});
      }
      totalSandboxesCleaned += sandboxIds.length;

      const ok = await agentStore.deleteAgent(agentId);
      if (ok) {
        deleted.push(agentId);
      } else {
        failed.push(agentId);
      }
    } catch {
      failed.push(agentId);
    }
  }

  await recordAuditEvent(req, {
    action_type: 'agent.bulk_delete',
    target_type: 'agent',
    target_id: deleted.join(','),
    outcome: failed.length === 0 ? 'success' : 'partial',
    details: { deleted: deleted.length, failed: failed.length, sandboxesCleaned: totalSandboxesCleaned },
  });

  res.json({ deleted, failed, sandboxesCleaned: totalSandboxesCleaned });
}));

app.post('/api/agents/:id/sandbox', asyncHandler(async (req, res) => {
  await getAgentRecord(req.params.id);
  const { sandbox_id } = validateAgentSandboxAttachBody(req.body);
  const updated = await agentStore.addSandboxToAgent(req.params.id, sandbox_id);
  res.json(updated ? redactAgentWebhookSecrets(updated) : updated);
}));

app.delete('/api/agents/:id/sandbox/:sandbox_id', asyncHandler(async (req, res) => {
  const { id: agentId, sandbox_id: sandboxId } = req.params;
  const agent = await getAgentRecord(agentId);
  const sandboxIds: string[] = agent.sandbox_ids ?? [];
  if (!sandboxIds.includes(sandboxId)) {
    throw httpError(404, 'Sandbox not associated with this agent');
  }

  // Delete sandbox DB record + Docker container (best-effort)
  await store.deleteSandbox(sandboxId).catch(() => {});
  stopAndRemoveContainer(sandboxId).catch(() => {});

  // Detach from agent
  const updated = await agentStore.removeSandboxFromAgent(agentId, sandboxId);

  await recordAuditEvent(req, {
    action_type: 'agent.sandbox_delete',
    target_type: 'sandbox',
    target_id: sandboxId,
    outcome: 'success',
    details: { agentId, sandboxId },
  });
  res.json(updated ? redactAgentWebhookSecrets(updated) : updated);
}));

// ── Agent Create + Forge (v2: agent record + container in one call) ──────────

/**
 * Create a new agent and immediately provision its own container.
 * Returns { agent_id, stream_id } — client uses stream_id with
 * GET /api/agents/:id/forge/stream/:stream_id for SSE progress.
 * When the stream emits "done", the agent's forge sandbox is ready and
 * the Architect SOUL.md has been injected — the builder chat can start.
 */
app.post('/api/agents/create', asyncHandler(async (req, res) => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw httpError(400, 'name is required');
  }

  const span = startAgentSpan('agent.create', { 'agent.name': name.trim() });
  try {
    // 1. Create the agent record with "forging" status — shown as "In the Forge" in agents list
    const agent = await agentStore.saveAgent({
      name: name.trim(),
      description: description ? String(description).trim() : '',
      status: 'forging',
    });

    // 2. Set up the forge stream entry (same pattern as POST /api/agents/:id/forge)
    const sandboxName = `forge-${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    const streamId = uuidv4();
    _streams.set(streamId, {
      status: 'pending',
      request: { sandbox_name: sandboxName, forge_agent_id: agent.id },
    });

    span.setAttribute('agent.id', agent.id);
    span.setAttribute('stream.id', streamId);
    endSpanOk(span);

    // Fire-and-forget: provision Paperclip company + workers in background
    paperclipOrchestrator.provisionPaperclipCompany(agent).catch((err) => {
      console.warn('[paperclip] Provisioning failed (non-blocking):', (err as Error).message);
    });

    res.json({ agent_id: agent.id, stream_id: streamId });
  } catch (err) {
    endSpanError(span, err);
    throw err;
  }
}));

// ── Agent Forge (per-agent builder sandbox) ─────────────────────────────────

/**
 * Provision a forge sandbox for an agent.
 * Idempotent: returns existing forge sandbox if one is already running.
 * Returns { stream_id } for SSE progress (same pattern as sandbox creation).
 */
app.post('/api/agents/:id/forge', asyncHandler(async (req, res) => {
  const agent = await getAgentRecord(req.params.id);

  // Idempotent: if forge sandbox already exists and container is running, return it
  if (agent.forge_sandbox_id) {
    const existing = await store.getSandbox(agent.forge_sandbox_id).catch(() => null);
    if (existing) {
      const running = await dockerContainerRunning(getContainerName(agent.forge_sandbox_id)).catch(() => false);
      if (running) {
        res.json({ forge_sandbox_id: agent.forge_sandbox_id, status: 'ready', sandbox: existing });
        return;
      }
    }
    // Forge sandbox is gone or not running — clear it and create a new one
    await agentStore.clearForgeSandbox(req.params.id);
  }

  // Create a new forge sandbox via SSE stream (same pattern as POST /api/sandboxes/create)
  const sandboxName = `forge-${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
  const streamId = uuidv4();
  // Stash agent ID so the stream handler can link the sandbox to the agent
  _streams.set(streamId, { status: 'pending', request: { sandbox_name: sandboxName, forge_agent_id: req.params.id } });
  res.json({ stream_id: streamId });
}));

/**
 * SSE stream for forge sandbox creation progress.
 * Same as /api/sandboxes/stream/:stream_id but also links the sandbox to the agent on success.
 */
app.get('/api/agents/:id/forge/stream/:stream_id', asyncHandler(async (req, res) => {
  const { id: agentId, stream_id } = req.params;
  await getAgentRecord(agentId);

  if (!_streams.has(stream_id)) throw httpError(404, 'stream_id not found');
  const entry = _streams.get(stream_id)!;
  if (entry.status !== 'pending') throw httpError(409, 'Stream already consumed');

  entry.status = 'running';

  const stream = initializeSseStream(req, res);
  const { sendEvent } = stream;
  const sandboxName = String(entry.request.sandbox_name ?? 'forge-sandbox');

  // v2: trace the entire forge provisioning lifecycle
  const forgeSpan = startAgentSpan('agent.forge.provision', {
    'agent.id': agentId,
    'stream.id': stream_id,
    'sandbox.name': sandboxName,
  });

  await recordSystemEvent(req, {
    level: 'info',
    category: 'sandbox.lifecycle',
    action: 'agent.forge.started',
    status: 'started',
    message: `Started provisioning forge sandbox for agent ${agentId}`,
    agent_id: agentId,
    source: 'ruh-backend:forge-stream',
    details: {
      stream_id,
      sandbox_name: sandboxName,
    },
  });

  try {
    const config = getConfig();
    const gen = createOpenclawSandbox({
      anthropicApiKey: config.anthropicApiKey ?? '',
      openaiApiKey: config.openaiApiKey ?? '',
      openrouterApiKey: config.openrouterApiKey ?? '',
      geminiApiKey: config.geminiApiKey ?? '',
      ollamaBaseUrl: config.ollamaBaseUrl ?? undefined,
      ollamaModel: config.ollamaModel,
      telegramBotToken: config.telegramBotToken ?? '',
      discordBotToken: config.discordBotToken ?? '',
      sandboxName,
    });

    for await (const [eventType, data] of gen) {
      if (eventType === 'log') {
        sendEvent('log', { message: data });
      } else if (eventType === 'result') {
        await store.saveSandbox(data as Record<string, unknown>, String(entry.request.sandbox_name ?? ''));
        entry.result = data as Record<string, unknown>;
        const sandboxId = (data as Record<string, unknown>)['sandbox_id'] as string;
        // Link forge sandbox to agent
        await agentStore.setForgeSandbox(agentId, sandboxId);
        await recordSystemEvent(req, {
          level: 'info',
          category: 'sandbox.lifecycle',
          action: 'agent.forge.succeeded',
          status: 'success',
          message: `Forge sandbox ${sandboxId} created for agent ${agentId}`,
          sandbox_id: sandboxId,
          agent_id: agentId,
          source: 'ruh-backend:forge-stream',
          details: {
            stream_id,
            sandbox_name: sandboxName,
          },
        });
        sendEvent('result', { ...(data as Record<string, unknown>), forge_agent_id: agentId });
      } else if (eventType === 'approved') {
        await store.markApproved(entry.result!['sandbox_id'] as string);
        entry.status = 'done';
        await recordSystemEvent(req, {
          level: 'info',
          category: 'sandbox.lifecycle',
          action: 'agent.forge.approved',
          status: 'success',
          message: `Forge sandbox ${String(entry.result?.['sandbox_id'] ?? '')} device approval succeeded`,
          sandbox_id: String(entry.result?.['sandbox_id'] ?? ''),
          agent_id: agentId,
          source: 'ruh-backend:forge-stream',
          details: {
            stream_id,
            approval_message: (data as Record<string, unknown>)['message'],
          },
        });

        // Reproduce from repo: clone the template instead of injecting Architect SOUL
        const reproduceRepoUrl = entry.request.reproduce_repo_url as string | undefined;
        const sandboxIdStr = String(entry.result?.['sandbox_id'] ?? '');
        if (reproduceRepoUrl && sandboxIdStr) {
          const cloneSpan = startAgentSpan('agent.forge.repo_clone', {
            'agent.id': agentId, 'sandbox.id': sandboxIdStr, 'repo.url': reproduceRepoUrl,
          });
          const forgeCName = getContainerName(sandboxIdStr);
          sendEvent('log', { message: `Cloning template from ${reproduceRepoUrl}...` });

          // Build git clone URL (inject token for private repos)
          const reproduceToken = entry.request.reproduce_github_token as string | undefined;
          let cloneUrl = reproduceRepoUrl;
          if (reproduceToken && cloneUrl.startsWith('https://')) {
            cloneUrl = cloneUrl.replace('https://', `https://${reproduceToken}@`);
          }

          // Install git, clone into workspace
          await dockerExec(forgeCName, 'apt-get update -qq && apt-get install -y --no-install-recommends git >/dev/null 2>&1', 60_000).catch(() => {});
          const [cloneOk, cloneOut] = await dockerExec(
            forgeCName,
            `cd ~/.openclaw/workspace && git clone --depth 1 '${cloneUrl.replace(/'/g, "'\\''")}' _repo_tmp 2>&1 && cp -r _repo_tmp/* _repo_tmp/.* . 2>/dev/null; rm -rf _repo_tmp .git && echo __CLONE_OK__`,
            120_000,
          ).catch(() => [false, 'clone command failed']);
          const cloneSuccess = typeof cloneOut === 'string' && cloneOut.includes('__CLONE_OK__');
          if (cloneSuccess) {
            sendEvent('log', { message: 'Template cloned into workspace.' });
            sendEvent('log', { message: 'Restarting gateway with cloned soul...' });
            await restartGateway(forgeCName).catch(() => {});
            endSpanOk(cloneSpan);
          } else {
            sendEvent('log', { message: `Clone failed: ${String(cloneOut).slice(0, 200)}` });
            endSpanError(cloneSpan, `Clone failed: ${String(cloneOut).slice(0, 200)}`);
          }
        } else if (ARCHITECT_SOUL_MD && sandboxIdStr) {
          const soulSpan = startAgentSpan('agent.forge.soul_inject', {
            'agent.id': agentId, 'sandbox.id': sandboxIdStr, 'method': 'architect',
          });
          const forgeCName = getContainerName(sandboxIdStr);
          sendEvent('log', { message: 'Injecting Architect SOUL.md into workspace...' });
          const [soulOk] = await dockerExec(
            forgeCName,
            buildHomeFileWriteCommand('.openclaw/workspace/SOUL.md', ARCHITECT_SOUL_MD),
            30_000,
          ).catch(() => [false]);
          if (soulOk) {
            // Write a backup so mode-switching can restore the Architect soul
            // after the Architect overwrites SOUL.md with the agent's soul.
            await dockerExec(
              forgeCName,
              buildHomeFileWriteCommand('.openclaw/workspace/.soul.architect.md', ARCHITECT_SOUL_MD),
              30_000,
            ).catch(() => {});
          }
          if (soulOk) {
            sendEvent('log', { message: 'Architect SOUL.md ready.' });
            endSpanOk(soulSpan);
          } else {
            sendEvent('log', { message: 'SOUL.md injection failed — agent will start without soul.' });
            endSpanError(soulSpan, 'SOUL.md injection failed');
          }
        }

        sendEvent('approved', data);
      } else if (eventType === 'error') {
        entry.status = 'error';
        entry.error = data as string;
        await recordSystemEvent(req, {
          level: 'error',
          category: 'sandbox.lifecycle',
          action: 'agent.forge.failed',
          status: 'failure',
          message: String(data),
          agent_id: agentId,
          source: 'ruh-backend:forge-stream',
          details: {
            stream_id,
            sandbox_name: sandboxName,
            error: String(data),
          },
        });
        sendEvent('error', { message: data });
        endSpanError(forgeSpan, String(data));
        stream.close();
        return;
      }
    }

    entry.status = 'done';
    endSpanOk(forgeSpan);
    sendEvent('done', { stream_id, forge_agent_id: agentId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    entry.status = 'error';
    entry.error = msg;
    endSpanError(forgeSpan, err);
    await recordSystemEvent(req, {
      level: 'error',
      category: 'sandbox.lifecycle',
      action: 'agent.forge.failed',
      status: 'failure',
      message: msg,
      agent_id: agentId,
      source: 'ruh-backend:forge-stream',
      details: {
        stream_id,
        sandbox_name: sandboxName,
        error: msg,
      },
    });
    sendEvent('error', { message: msg });
  }

  stream.close();
}));

/**
 * Get forge sandbox health status.
 */
// GET forge sandbox info for the frontend useForgeSandbox hook
app.get('/api/agents/:id/forge', asyncHandler(async (req, res) => {
  const agent = await getAgentRecord(req.params.id);
  if (!agent.forge_sandbox_id) {
    res.json({ status: 'none', forge_sandbox_id: null, sandbox: null });
    return;
  }

  const record = await store.getSandbox(agent.forge_sandbox_id).catch(() => null);
  if (!record) {
    res.json({ status: 'missing', forge_sandbox_id: agent.forge_sandbox_id, sandbox: null });
    return;
  }

  const running = await dockerContainerRunning(getContainerName(agent.forge_sandbox_id)).catch(() => false);
  res.json({
    status: running ? 'ready' : 'stopped',
    forge_sandbox_id: agent.forge_sandbox_id,
    sandbox: record,
  });
}));

app.get('/api/agents/:id/forge/status', asyncHandler(async (req, res) => {
  const agent = await getAgentRecord(req.params.id);
  if (!agent.forge_sandbox_id) {
    res.json({ active: false, status: 'none', reason: 'No forge sandbox provisioned' });
    return;
  }

  const record = await store.getSandbox(agent.forge_sandbox_id).catch(() => null);
  if (!record) {
    res.json({ active: false, status: 'missing', reason: 'Forge sandbox record not found' });
    return;
  }

  const running = await dockerContainerRunning(getContainerName(agent.forge_sandbox_id)).catch(() => false);
  res.json({
    active: running,
    status: running ? 'ready' : 'stopped',
    forge_sandbox_id: agent.forge_sandbox_id,
    vnc_port: record.vnc_port ?? null,
    gateway_port: record.gateway_port,
    standard_url: record.standard_url,
  });
}));

/**
 * Delete the agent's forge: stops and removes the Docker container,
 * cleans up the sandbox record, and deletes the agent itself.
 * This is a full discard — the agent and all its work are gone.
 */
app.delete('/api/agents/:id/forge', asyncHandler(async (req, res) => {
  const agent = await getAgentRecord(req.params.id);
  const span = startAgentSpan('agent.forge.delete', {
    'agent.id': req.params.id,
    'sandbox.id': agent.forge_sandbox_id ?? undefined,
  });

  let sandboxCleaned = false;
  try {
    // 1. Stop and remove the Docker container
    if (agent.forge_sandbox_id) {
      await stopAndRemoveContainer(agent.forge_sandbox_id).catch(() => {});
      await store.deleteSandbox(agent.forge_sandbox_id).catch(() => {});
      sandboxCleaned = true;
    }

    // 2. Also clean up any promoted sandbox_ids
    for (const sid of agent.sandbox_ids ?? []) {
      if (sid !== agent.forge_sandbox_id) {
        await stopAndRemoveContainer(sid).catch(() => {});
        await store.deleteSandbox(sid).catch(() => {});
      }
    }

    // 3. Delete the agent record
    await agentStore.deleteAgent(req.params.id);

    await recordAuditEvent(req, {
      action_type: 'agent.forge_delete',
      target_type: 'agent',
      target_id: req.params.id,
      outcome: 'success',
      details: { forge_sandbox_id: agent.forge_sandbox_id, sandbox_cleaned: sandboxCleaned },
    });

    endSpanOk(span);
    res.json({ deleted: req.params.id, sandbox_cleaned: sandboxCleaned });
  } catch (err) {
    endSpanError(span, err);
    throw err;
  }
}));

/**
 * Switch the agent's forge container between building and live mode.
 *
 * building → Restores the Architect SOUL.md (from .soul.architect.md backup)
 *            so the Architect can continue guiding creation.
 * live     → Activates the agent's own SOUL.md (already written by Architect).
 *
 * Both modes restart the OpenClaw gateway so it picks up the active SOUL.md.
 */
app.patch('/api/agents/:id/mode', asyncHandler(async (req, res) => {
  const { mode } = req.body as { mode?: string };
  if (mode !== 'building' && mode !== 'live') {
    throw httpError(400, 'mode must be "building" or "live"');
  }

  const agent = await getAgentRecord(req.params.id);
  if (!agent.forge_sandbox_id) {
    throw httpError(400, 'Agent has no forge sandbox — provision one first');
  }

  const span = startAgentSpan('agent.mode.switch', {
    'agent.id': req.params.id,
    'sandbox.id': agent.forge_sandbox_id,
    'agent.mode': mode,
  });

  try {
    const containerName = getContainerName(agent.forge_sandbox_id);

    if (mode === 'building') {
      const [restoreOk, restoreOut] = await dockerExec(
        containerName,
        'cp ~/.openclaw/workspace/.soul.architect.md ~/.openclaw/workspace/SOUL.md 2>/dev/null && echo ok || echo missing',
        15_000,
      );
      if (!restoreOk || restoreOut.includes('missing')) {
        if (ARCHITECT_SOUL_MD) {
          await dockerExec(
            containerName,
            buildHomeFileWriteCommand('.openclaw/workspace/SOUL.md', ARCHITECT_SOUL_MD),
            30_000,
          );
        } else {
          throw httpError(500, 'Architect SOUL.md backup not found in container and server copy is unavailable');
        }
      }
    }

    await restartGateway(containerName);
    endSpanOk(span);
    res.json({ ok: true, mode, agent_id: req.params.id, sandbox_id: agent.forge_sandbox_id });
  } catch (err) {
    endSpanError(span, err);
    throw err;
  }
}));

/**
 * Promote a forge sandbox to production: clear forge_sandbox_id, set status to 'active'.
 */
app.post('/api/agents/:id/forge/promote', asyncHandler(async (req, res) => {
  const agent = await getAgentRecord(req.params.id);
  if (!agent.forge_sandbox_id) {
    throw httpError(400, 'Agent has no forge sandbox to promote');
  }

  const updated = await agentStore.promoteForgeSandbox(req.params.id);

  await recordAuditEvent(req, {
    action_type: 'agent.forge_promote',
    target_type: 'agent',
    target_id: req.params.id,
    outcome: 'success',
    details: { sandbox_id: agent.forge_sandbox_id },
  });

  // Fire-and-forget: re-provision Paperclip workers with finalized skill graph
  if (updated) {
    paperclipOrchestrator.provisionPaperclipCompany(updated).catch((err) => {
      console.warn('[paperclip] Post-promote provisioning failed (non-blocking):', (err as Error).message);
    });
  }

  res.json(updated ? redactAgentWebhookSecrets(updated) : updated);
}));

/**
 * Scaffold skills into a forge sandbox workspace.
 *
 * The copilot build phase gets a JSON skill graph from the architect via the HTTP
 * chat proxy — but that proxy can only return text, it cannot exec shell commands.
 * This endpoint bridges the gap: it takes the JSON skill graph and writes the actual
 * SKILL.md files into the container via docker exec.
 *
 * Accepts: { skill_graph: { nodes: [...] }, workflow?: object }
 */
app.post('/api/agents/:id/forge/scaffold-skills', asyncHandler(async (req, res) => {
  const agent = await getAgentRecord(req.params.id);
  const sandboxId = agent.forge_sandbox_id;
  if (!sandboxId) {
    throw httpError(400, 'Agent has no forge sandbox');
  }

  const { skill_graph, workflow } = req.body as {
    skill_graph: { nodes: Array<{ skill_id: string; name: string; skill_md?: string; description?: string; requires_env?: string[]; external_api?: string; depends_on?: string[] }> };
    workflow?: object;
  };

  if (!skill_graph?.nodes?.length) {
    throw httpError(400, 'skill_graph.nodes is required and must be non-empty');
  }

  const containerName = getContainerName(sandboxId);
  const results: Array<{ skill_id: string; ok: boolean }> = [];

  for (const node of skill_graph.nodes) {
    const skillContent = node.skill_md || buildDefaultSkillMd(node);
    const skillPath = `.openclaw/workspace/skills/${node.skill_id}/SKILL.md`;
    try {
      const [ok] = await dockerExec(
        containerName,
        buildHomeFileWriteCommand(skillPath, skillContent),
        30_000,
      );
      results.push({ skill_id: node.skill_id, ok });
    } catch {
      results.push({ skill_id: node.skill_id, ok: false });
    }
  }

  if (workflow) {
    await dockerExec(
      containerName,
      buildHomeFileWriteCommand(
        '.openclaw/workspace/.openclaw/workflow.json',
        JSON.stringify(workflow, null, 2),
      ),
      30_000,
    ).catch(() => {});
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.info(`[scaffold-skills] Agent ${req.params.id}: ${succeeded}/${skill_graph.nodes.length} skills written (${failed} failed)`);
  res.json({ scaffolded: succeeded, failed, total: skill_graph.nodes.length, results });
}));

function buildDefaultSkillMd(node: { skill_id: string; name: string; description?: string; requires_env?: string[]; external_api?: string; depends_on?: string[] }): string {
  const lines: string[] = [
    '---', `name: ${node.skill_id}`, 'version: 1.0.0',
    `description: "${(node.description || node.name).replace(/"/g, '\\"')}"`,
    'allowed-tools:', '  - Bash', '  - Read', '  - Write',
    'user-invocable: true', '---', '', `# ${node.name}`, '',
  ];
  if (node.description) lines.push(node.description, '');
  if (node.requires_env?.length) {
    lines.push('## Required Environment Variables');
    for (const env of node.requires_env) lines.push(`- \`${env}\``);
    lines.push('');
  }
  if (node.external_api) lines.push(`## External API\n- ${node.external_api}`, '');
  if (node.depends_on?.length) {
    lines.push('## Dependencies');
    for (const dep of node.depends_on) lines.push(`- ${dep}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Reproduce an agent from a GitHub repo template.
 * Creates a new agent + spins up a container + clones the repo workspace.
 * Returns { agent_id, stream_id } — stream SSE for progress.
 */
app.post('/api/agents/reproduce', asyncHandler(async (req, res) => {
  const { name, description, repo_url, github_token } = req.body as {
    name?: string;
    description?: string;
    repo_url?: string;
    github_token?: string;
  };

  if (!name?.trim()) throw httpError(400, 'name is required');
  if (!repo_url?.trim()) throw httpError(400, 'repo_url is required');

  const span = startAgentSpan('agent.reproduce', { 'agent.name': name.trim(), 'repo.url': repo_url.trim() });
  try {
    const agent = await agentStore.saveAgent({
      name: name.trim(),
      description: description?.trim() ?? `Reproduced from ${repo_url}`,
      status: 'draft',
    });

    const sandboxName = `forge-${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    const streamId = uuidv4();
    _streams.set(streamId, {
      status: 'pending',
      request: {
        sandbox_name: sandboxName,
        forge_agent_id: agent.id,
        reproduce_repo_url: repo_url.trim(),
        reproduce_github_token: github_token?.trim() ?? '',
      },
    });

    span.setAttribute('agent.id', agent.id);
    span.setAttribute('stream.id', streamId);
    endSpanOk(span);
    res.json({ agent_id: agent.id, stream_id: streamId });
  } catch (err) {
    endSpanError(span, err);
    throw err;
  }
}));

app.patch('/api/agents/:id/config', asyncHandler(async (req, res) => {
  await getAgentRecord(req.params.id);
  const body = validateAgentConfigPatchBody(req.body);
  const updated = await agentStore.updateAgentConfig(req.params.id, body);
  res.json(updated ? redactAgentWebhookSecrets(updated) : updated);
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

// ── Agent credentials ─────────────────────────────────────────────────────────

app.get('/api/agents/:id/credentials', asyncHandler(async (req, res, _next) => {
  const agent = await agentStore.getAgent(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  const summary = await agentStore.getAgentCredentialSummary(req.params.id);
  res.json(summary);
}));

app.put('/api/agents/:id/credentials/:toolId', asyncHandler(async (req, res, _next) => {
  const agent = await agentStore.getAgent(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const { credentials } = req.body as { credentials?: Record<string, string> };
  if (!credentials || typeof credentials !== 'object' || Object.keys(credentials).length === 0) {
    res.status(400).json({ error: 'credentials object is required' }); return;
  }
  // Validate all values are non-empty strings
  for (const [key, val] of Object.entries(credentials)) {
    if (typeof val !== 'string' || !val.trim()) {
      res.status(422).json({ error: `Credential field "${key}" must be a non-empty string` }); return;
    }
  }

  const { encryptCredentials } = await import('./credentials');
  const { encrypted, iv } = encryptCredentials(credentials);
  await agentStore.saveAgentCredential(req.params.id, req.params.toolId, encrypted, iv);

  await recordAuditEvent(req, { action_type: 'agent.credential_save', target_type: 'agent', target_id: req.params.id, outcome: 'success', details: { toolId: req.params.toolId } });
  res.json({ ok: true, toolId: req.params.toolId });
}));

app.delete('/api/agents/:id/credentials/:toolId', asyncHandler(async (req, res, _next) => {
  const agent = await agentStore.getAgent(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  await agentStore.deleteAgentCredential(req.params.id, req.params.toolId);
  await recordAuditEvent(req, { action_type: 'agent.credential_delete', target_type: 'agent', target_id: req.params.id, outcome: 'success', details: { toolId: req.params.toolId } });
  res.json({ ok: true, toolId: req.params.toolId });
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
    runtime_inputs,
    agent_id,
  } = req.body as {
    system_name: string;
    soul_content: string;
    skills: Array<{ skill_id: string; name: string; description: string; skill_md?: string }>;
    cron_jobs: Array<{ name: string; schedule: string; message: string }>;
    runtime_inputs?: Array<{
      key: string;
      label: string;
      description: string;
      required: boolean;
      source: 'architect_requirement' | 'skill_requirement';
      value: string;
    }>;
    agent_id?: string;
  };

  const steps: ConfigureAgentStepResult[] = [];
  let provisionedWebhooks: PublicWebhookProvisioning[] = [];

  const pushStep = (step: ConfigureAgentStepResult) => {
    steps.push(step);
    return step.ok;
  };

  const failConfigureAgent = async () => {
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
  };

  const missingRuntimeInputs = (runtime_inputs ?? []).filter(
    (input) => input.required && String(input.value ?? '').trim().length === 0,
  );
  if (missingRuntimeInputs.length > 0) {
    for (const input of missingRuntimeInputs) {
      pushStep({
        kind: 'runtime_env',
        target: input.key,
        ok: false,
        message: `Missing required runtime input: ${input.key}`,
      });
    }
    res.status(400).json({
      ok: false,
      applied: false,
      detail: `Missing required runtime inputs: ${missingRuntimeInputs.map((input) => input.key).join(', ')}`,
      steps,
    });
    return;
  }

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
      await failConfigureAgent();
      return;
    }
  }

  // Write each skill SKILL.md
  for (const skill of (skills ?? [])) {
    const normalizedSkillId = normalizePathSegment(String(skill.skill_id ?? ''));
    // Priority: 1) skill_md from request (built by wizard), 2) registry match, 3) fallback stub
    const registrySkill = findSkill(skill.skill_id) ?? findSkill(skill.name);
    const skillContent = skill.skill_md || registrySkill?.skill_md || buildFallbackSkillContent(skill);
    const skillMessage = skill.skill_md
      ? `Skill ${normalizedSkillId}: built (wizard-provided)`
      : registrySkill
        ? `Skill ${normalizedSkillId}: registry match (${registrySkill.skill_id})`
        : `Skill ${normalizedSkillId}: stub (no registry entry)`;
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
      message: ok ? skillMessage : `Skill ${normalizedSkillId} failed: ${out}`,
    })) {
      await failConfigureAgent();
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
      await failConfigureAgent();
      return;
    }
  }

  if ((runtime_inputs ?? []).length > 0) {
    const runtimeEnvContent = buildRuntimeEnvFileContent(
      (runtime_inputs ?? []).map((input) => ({
        key: String(input.key ?? ''),
        value: String(input.value ?? ''),
      })),
    );
    const [ok, out] = await dockerExec(
      containerName,
      buildHomeFileWriteCommand('.openclaw/.env', runtimeEnvContent),
      20_000,
    );
    if (!pushStep({
      kind: 'runtime_env',
      target: '.openclaw/.env',
      ok,
      message: ok ? `Runtime env written (${(runtime_inputs ?? []).length} values)` : `Runtime env failed: ${out}`,
    })) {
      res.status(500).json({ ok: false, applied: false, detail: 'Agent config apply failed', steps });
      return;
    }
  }

  // ── MCP config (tool credentials) ──────────────────────────────────────
  if (agent_id) {
    try {
      const { decryptCredentials } = await import('./credentials');
      const agent = await getAgentRecord(agent_id);
      const selectedMcpToolIds = new Set(
        agent.tool_connections
          .filter((tool) => tool.connectorType === 'mcp' && tool.status === 'configured')
          .map((tool) => tool.toolId),
      );
      const creds = await agentStore.getAgentCredentials(agent_id);
      const credentialByToolId = new Map(creds.map((cred) => [cred.toolId, cred]));
      const mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }> = {};

      for (const toolId of selectedMcpToolIds) {
        const pkg = MCP_PACKAGES[toolId];
        if (!pkg) {
          pushStep({ kind: 'mcp', target: toolId, ok: false, message: `Selected MCP tool ${toolId} has no runtime package mapping` });
          await failConfigureAgent();
          return;
        }

        const cred = credentialByToolId.get(toolId);
        if (!cred) {
          pushStep({ kind: 'mcp', target: toolId, ok: false, message: `Missing saved credentials for selected MCP tool ${toolId}` });
          await failConfigureAgent();
          return;
        }

        try {
          mcpServers[toolId] = {
            command: 'npx',
            args: ['-y', pkg.pkg],
            env: decryptCredentials(cred.encrypted, cred.iv),
          };
        } catch {
          pushStep({ kind: 'mcp', target: toolId, ok: false, message: `Failed to decrypt credentials for ${toolId}` });
          await failConfigureAgent();
          return;
        }
      }

      const mcpConfig = JSON.stringify({ mcpServers }, null, 2);
      const mcpCmd = buildHomeFileWriteCommand('.openclaw/mcp.json', mcpConfig);
      const [mcpOk, mcpOut] = await dockerExec(containerName, mcpCmd, 15_000);
      if (!pushStep({
        kind: 'mcp',
        target: '.openclaw/mcp.json',
        ok: mcpOk,
        message: mcpOk ? `MCP config written (${Object.keys(mcpServers).length} servers)` : `MCP config failed: ${mcpOut}`,
      })) {
        await failConfigureAgent();
        return;
      }
    } catch (err) {
      pushStep({ kind: 'mcp', target: 'mcp-config', ok: false, message: `MCP config error: ${err instanceof Error ? err.message : 'unknown'}` });
      await failConfigureAgent();
      return;
    }

    try {
      const webhookProvisioning = await ensureWebhookProvisioning(req, agent_id);
      provisionedWebhooks = webhookProvisioning.provisioned;
      for (const webhook of provisionedWebhooks) {
        pushStep({
          kind: 'webhook',
          target: webhook.triggerId,
          ok: true,
          message: `Webhook ${webhook.title} provisioned at ${webhook.url}`,
        });
      }
    } catch (err) {
      pushStep({
        kind: 'webhook',
        target: 'webhook-provisioning',
        ok: false,
        message: `Webhook provisioning failed: ${err instanceof Error ? err.message : 'unknown'}`,
      });
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
  res.json({
    ok: true,
    applied: true,
    steps,
    ...(provisionedWebhooks.length > 0 ? { webhooks: provisionedWebhooks } : {}),
  });
}));

// ── Lightweight runtime env push (for already-deployed sandboxes) ─────────────
app.patch('/api/sandboxes/:sandbox_id/runtime-env', asyncHandler(async (req, res) => {
  const { sandbox_id } = req.params;
  const record = await getRecord(sandbox_id);
  const containerName = getContainerName(record.sandbox_id);

  const { runtime_inputs } = req.body;
  if (!Array.isArray(runtime_inputs) || runtime_inputs.length === 0) {
    throw httpError(400, 'runtime_inputs array is required');
  }

  const envContent = buildRuntimeEnvFileContent(
    runtime_inputs.map((input: { key?: string; value?: string }) => ({
      key: String(input.key ?? ''),
      value: String(input.value ?? ''),
    })),
  );

  const [ok, out] = await dockerExec(
    containerName,
    buildHomeFileWriteCommand('.openclaw/.env', envContent),
    20_000,
  );

  if (!ok) {
    res.status(500).json({ ok: false, message: `Failed to write runtime env: ${out}` });
    return;
  }

  res.json({ ok: true, message: `Runtime env written (${runtime_inputs.length} values)` });
}));

app.post('/api/triggers/webhooks/:public_id', asyncHandler(async (req, res) => {
  const webhookSecret = String(req.headers['x-openclaw-webhook-secret'] ?? '').trim();
  if (!webhookSecret) {
    throw httpError(401, 'Webhook secret is required');
  }
  const deliveryId = getWebhookDeliveryId(req);
  const serializedBody = getWebhookPayloadForDelivery(req);

  const agents = await agentStore.listAgents();
  let matchedAgent: agentStore.AgentRecord | null = null;
  let matchedTrigger: agentStore.AgentTriggerRecord | null = null;

  for (const agent of agents) {
    const trigger = agent.triggers.find((candidate) => candidate.webhookPublicId === req.params.public_id);
    if (trigger) {
      matchedAgent = agent;
      matchedTrigger = trigger;
      break;
    }
  }

  if (!matchedAgent || !matchedTrigger) {
    throw httpError(404, 'Webhook not found');
  }

  if (!matchedTrigger.webhookSecretHash || !verifyWebhookSecret(webhookSecret, matchedTrigger.webhookSecretHash)) {
    throw httpError(401, 'Invalid webhook secret');
  }

  const deliveryReservation = await webhookDeliveryStore.reserveWebhookDelivery({
    publicId: req.params.public_id,
    deliveryId,
    agentId: matchedAgent.id,
    triggerId: matchedTrigger.id,
  });

  if (!deliveryReservation.reserved) {
    res.status(409).json({
      ok: false,
      accepted: false,
      duplicate: true,
      agent_id: matchedAgent.id,
      trigger_id: matchedTrigger.id,
      delivery_id: deliveryId,
      delivery_status: deliveryReservation.existingStatus,
    });
    return;
  }

  const sandbox = await resolveActiveSandboxForAgent(matchedAgent);
  if (!sandbox) {
    await webhookDeliveryStore.markWebhookDeliveryStatus(req.params.public_id, deliveryId, 'failed');
    await persistWebhookDeliveryStatus(matchedAgent, matchedTrigger.id, 'failed');
    throw httpError(409, 'No active sandbox available for webhook delivery');
  }

  const [url, headers] = gatewayUrlAndHeaders(sandbox, '/v1/chat/completions');
  headers['Content-Type'] = 'application/json';
  headers['x-openclaw-session-key'] = `agent:trigger:${matchedAgent.id}:${matchedTrigger.id}`;

  const payload = {
    model: 'openclaw',
    stream: false,
    messages: [
      {
        role: 'system',
        content:
          `A signed webhook trigger fired for agent ${matchedAgent.name}. ` +
          `Treat the next user message as the webhook payload and perform any immediate trigger work.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          delivery_id: deliveryId,
          trigger_id: matchedTrigger.id,
          trigger_title: matchedTrigger.title,
          body: JSON.parse(serializedBody),
        }),
      },
    ],
  };

  try {
    const response = await axios.post(url, payload, {
      headers,
      timeout: 120000,
      validateStatus: (status) => status < 500,
    });

    if (response.status >= 400) {
      await webhookDeliveryStore.markWebhookDeliveryStatus(req.params.public_id, deliveryId, 'failed');
      await persistWebhookDeliveryStatus(matchedAgent, matchedTrigger.id, 'failed');
      throw httpError(502, `Webhook delivery rejected by sandbox gateway (${response.status})`);
    }
  } catch (error) {
    await webhookDeliveryStore.markWebhookDeliveryStatus(req.params.public_id, deliveryId, 'failed');
    await persistWebhookDeliveryStatus(matchedAgent, matchedTrigger.id, 'failed');
    if (typeof error === 'object' && error && 'status' in error) {
      throw error;
    }
    throw httpError(503, `Webhook delivery failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  await webhookDeliveryStore.markWebhookDeliveryStatus(req.params.public_id, deliveryId, 'delivered');
  await persistWebhookDeliveryStatus(matchedAgent, matchedTrigger.id, 'delivered');
  res.status(202).json({
    ok: true,
    accepted: true,
    agent_id: matchedAgent.id,
    trigger_id: matchedTrigger.id,
    delivery_id: deliveryId,
    sandbox_id: sandbox.sandbox_id,
  });
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
  let gatewayReachable = false;
  try {
    const resp = await axios.get(url, { headers, timeout: 10000, validateStatus: () => true });
    if (resp.status === 200 && resp.data && typeof resp.data === 'object' && !Array.isArray(resp.data)) {
      gatewayReachable = true;
      const runtime = classifySandboxRuntime({
        record,
        container: container_running
          ? {
            sandbox_id: record.sandbox_id,
            container_name: getContainerName(record.sandbox_id),
            state: 'running',
            running: true,
            status: 'Running',
          }
          : null,
        gatewayReachable,
      });
      res.json({
        ...runtime,
        ...resp.data,
        sandbox_id: record.sandbox_id,
        sandbox_name: record.sandbox_name,
        gateway_port: record.gateway_port ?? 18789,
        approved: record.approved ?? false,
        created_at: record.created_at,
        container_running,
      });
      return;
    }
  } catch { /* fall through */ }
  const runtime = classifySandboxRuntime({
    record,
    container: container_running
      ? {
        sandbox_id: record.sandbox_id,
        container_name: getContainerName(record.sandbox_id),
        state: 'running',
        running: true,
        status: 'Running',
      }
      : null,
    gatewayReachable,
  });
  res.json({
    ...runtime,
    sandbox_id: record.sandbox_id,
    sandbox_name: record.sandbox_name,
    gateway_port: record.gateway_port ?? 18789,
    approved: record.approved ?? false,
    created_at: record.created_at,
  });
}));

app.get('/api/admin/sandboxes/reconcile', asyncHandler(async (req, res) => {
  requireAdmin(req);
  const [records, containers] = await Promise.all([
    store.listSandboxes(),
    listManagedSandboxContainers(),
  ]);
  const report = buildSandboxRuntimeReconciliation({ records, containers });
  res.json(report);
}));

app.post('/api/admin/sandboxes/:sandbox_id/reconcile/repair', asyncHandler(async (req, res) => {
  requireAdmin(req);
  const sandboxId = String(req.params.sandbox_id ?? '').trim();
  const action = String(req.body?.action ?? '').trim();
  const [records, containers] = await Promise.all([
    store.listSandboxes(),
    listManagedSandboxContainers(),
  ]);
  const report = buildSandboxRuntimeReconciliation({ records, containers });
  const item = report.items.find((entry) => entry.sandbox_id === sandboxId)
    ?? classifySandboxRuntime({ record: null, container: null, gatewayReachable: false });

  if (item.sandbox_id !== sandboxId) {
    throw httpError(404, 'Sandbox not found in reconciliation report');
  }

  if (action === 'delete_db_record') {
    if (item.drift_state !== 'db_only') {
      throw httpError(409, 'Sandbox is not in db_only state');
    }
    await store.deleteSandbox(sandboxId);
  } else if (action === 'remove_orphan_container') {
    if (item.drift_state !== 'container_only') {
      throw httpError(409, 'Sandbox is not in container_only state');
    }
    await stopAndRemoveContainer(sandboxId);
  } else {
    throw httpError(400, 'Invalid reconcile repair action');
  }

  await recordAuditEvent(req, {
    action_type: 'sandbox.reconcile_repair',
    target_type: 'sandbox',
    target_id: sandboxId,
    outcome: 'success',
    details: { action, prior_drift_state: item.drift_state },
  }, { actor_type: 'admin_token', actor_id: 'openclaw_admin_token' });

  res.json({
    ok: true,
    sandbox_id: sandboxId,
    action,
    prior_drift_state: item.drift_state,
  });
}));

app.post('/api/sandboxes/:sandbox_id/restart', asyncHandler(async (req, res) => {
  const { sandbox_id } = req.params;
  await getRecord(sandbox_id);
  const containerName = getContainerName(sandbox_id);

  // Check if container exists at all
  const running = await dockerContainerRunning(containerName).catch(() => false);
  if (!running) {
    // Try to start a stopped container
    const [startCode] = await dockerSpawn(['start', containerName], 30_000);
    if (startCode !== 0) {
      throw httpError(
        409,
        'Container does not exist or cannot be started. Please redeploy this agent.',
      );
    }
  }

  // Restart the gateway process inside the container
  await restartGateway(containerName);

  await recordAuditEvent(req, {
    action_type: 'sandbox.restart',
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: { restarted: true },
  });
  res.json({ restarted: true, sandbox_id });
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

// ── JWT-authenticated admin panel routes ──────────────────────────────────────

app.get('/api/admin/stats', requireAuth, requireRole('admin'), asyncHandler(async (_req, res) => {
  const userCount = await withConn(async (client) => {
    const r = await client.query('SELECT COUNT(*) FROM users');
    return parseInt(r.rows[0].count, 10);
  });
  const agentCount = await withConn(async (client) => {
    const r = await client.query('SELECT COUNT(*) FROM agents');
    return parseInt(r.rows[0].count, 10);
  });
  const sandboxCount = await withConn(async (client) => {
    const r = await client.query("SELECT COUNT(*) FROM sandboxes WHERE sandbox_state = 'running'");
    return parseInt(r.rows[0].count, 10);
  });
  res.json({ totalUsers: userCount, totalAgents: agentCount, activeSandboxes: sandboxCount, marketplaceListings: 0 });
}));

app.get('/api/admin/users', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { role, status, search, limit, offset } = req.query;
  const result = await userStore.listUsers({
    role: role as string | undefined,
    status: status as string | undefined,
    search: search as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined,
  });
  res.json(result);
}));

app.patch('/api/admin/users/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { role, status } = req.body;
  const updated = await userStore.updateUser(req.params.id, { role, status });
  if (!updated) throw httpError(404, 'User not found');
  res.json(updated);
}));

app.delete('/api/admin/users/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const deleted = await userStore.deleteUser(req.params.id);
  if (!deleted) throw httpError(404, 'User not found');
  res.json({ message: 'User deleted' });
}));

app.get('/api/admin/agents', requireAuth, requireRole('admin'), asyncHandler(async (_req, res) => {
  const agents = await agentStore.listAgents();
  res.json({ items: agents });
}));

app.post('/api/sandboxes/:sandbox_id/chat', asyncHandler(async (req, res) => {
  const record = await getRecord(req.params.sandbox_id);
  const body = { ...req.body } as Record<string, unknown>;
  const requestMessages = Array.isArray(body.messages) ? [...body.messages] : [];

  const conversationId = body['conversation_id'] as string | undefined;
  delete body['conversation_id'];
  const persistedUserMessage = conversationId ? getPersistedUserMessage(requestMessages) : null;

  let sessionKey: string | null = null;
  if (conversationId) {
    validateUuid(conversationId, 'conversation_id');
    const conv = await conversationStore.getConversation(conversationId);
    if (conv && conv.sandbox_id !== req.params.sandbox_id) {
      throw httpError(404, 'Conversation not found');
    }
    sessionKey = conv ? conv.openclaw_session_key : `agent:main:${conversationId}`;
    body['user'] = conversationId;

    // Inject session-scoped workspace instruction on every message
    const sessionPath = `$HOME/.openclaw/workspace/sessions/${conversationId}`;
    const sessionMsg = {
      role: 'system',
      content:
        `WORKSPACE RULE: Your working directory for this conversation is ${sessionPath}/. ` +
        `All files you create, read, or modify MUST be within this directory. ` +
        `Use \`cd ${sessionPath}\` before executing any file operations. ` +
        `Do not use the workspace root for output files.`,
    };
    const messages = Array.isArray(body['messages']) ? body['messages'] as unknown[] : [];
    body['messages'] = [sessionMsg, ...messages];

    // Defensive: ensure session dir exists (fire-and-forget)
    sandboxExec(req.params.sandbox_id, `mkdir -p "${sessionPath}" 2>/dev/null`, 10).catch(() => {});
  }

  const [url, headers] = gatewayUrlAndHeaders(record, '/v1/chat/completions');
  headers['Content-Type'] = 'application/json';
  if (sessionKey) headers['x-openclaw-session-key'] = sessionKey;

  // Normalize model name: gateway only accepts "openclaw" or "openclaw/<agentId>"
  const rawModel = typeof body['model'] === 'string' ? body['model'] : '';
  if (!rawModel.startsWith('openclaw/') && rawModel !== 'openclaw') {
    body['model'] = 'openclaw';
  }

  const isStream = Boolean(body['stream']);

  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    try {
      const resp = await axios.post(url, body, { headers, timeout: 600000, responseType: 'stream', validateStatus: () => true });
      const collector = new StreamingChatPersistenceCollector();
      const decoder = new TextDecoder();
      let lineBuffer = '';

      for await (const chunk of resp.data as AsyncIterable<string | Uint8Array>) {
        lineBuffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const { sawDone } = collector.consumeLine(line);
          if (!sawDone) {
            res.write(`${line}\n`);
          }
        }
      }

      const trailing = decoder.decode();
      if (trailing) {
        lineBuffer += trailing;
      }
      if (lineBuffer) {
        const { sawDone } = collector.consumeLine(lineBuffer);
        if (!sawDone) {
          res.write(lineBuffer);
        }
      }

      if (conversationId && persistedUserMessage && collector.hasCompleted()) {
        const persistedAssistantMessage = collector.buildAssistantMessage();
        if (persistedAssistantMessage) {
          try {
            await conversationStore.appendMessages(conversationId, [
              persistedUserMessage,
              persistedAssistantMessage,
            ]);
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            res.write('event: persistence_error\n');
            res.write(`data: ${JSON.stringify({
              code: 'chat_exchange_persistence_failed',
              message: `Assistant reply was generated but could not be saved to conversation history: ${detail}`,
            })}\n\n`);
          }
        }
      }

      // Fire-and-forget: post-chat execution recording + skill analysis
      if (collector.hasCompleted()) {
        const executionSummary = collector.buildExecutionSummary();
        if (executionSummary && executionSummary.totalToolCalls > 0) {
          const chatAgent = await agentStore.getAgentBySandboxId(req.params.sandbox_id);
          if (chatAgent) {
            paperclipOrchestrator.recordAndAnalyze(chatAgent, req.params.sandbox_id, executionSummary).catch((err) => {
              console.warn('[post-chat] Skill analysis failed (non-blocking):', (err as Error).message);
            });
          }
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      throw httpError(503, `Gateway unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    try {
      const resp = await axios.post(url, body, { headers, timeout: 120000, validateStatus: (s) => s < 500 });
      if (resp.status >= 400) throw httpError(resp.status, JSON.stringify(resp.data));
      if (conversationId && persistedUserMessage) {
        const persistedAssistantMessage = getPersistedAssistantMessageFromResponse(resp.data);
        if (persistedAssistantMessage) {
          try {
            await conversationStore.appendMessages(conversationId, [
              persistedUserMessage,
              persistedAssistantMessage,
            ]);
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw httpError(500, `chat_exchange_persistence_failed: ${detail}`);
          }
        }
      }
      res.json(resp.data);
    } catch (err) {
      if ((err as { status?: number }).status) throw err;
      throw httpError(503, `Gateway unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}));

// ── WebSocket-based chat proxy (structured tool events) ─────────────────────
// Unlike the HTTP /v1/chat/completions proxy above, this endpoint connects to
// the gateway via WebSocket which surfaces exec.approval.requested events for
// every tool call. These are forwarded as `tool_start` / `tool_end` SSE events
// so the frontend can drive tab switching and show real-time tool activity.

app.post('/api/sandboxes/:sandbox_id/chat/ws', asyncHandler(async (req, res) => {
  const WebSocket = (await import('ws')).default;
  const record = await getRecord(req.params.sandbox_id);
  const body = req.body as Record<string, unknown>;
  const conversationId = body['conversation_id'] as string | undefined;
  const requestMessages = Array.isArray(body.messages) ? [...body.messages] : [];
  const persistedUserMessage = conversationId ? getPersistedUserMessage(requestMessages) : null;

  let sessionKey = `agent:main:${conversationId || uuidv4()}`;
  if (conversationId) {
    validateUuid(conversationId, 'conversation_id');
    const conv = await conversationStore.getConversation(conversationId);
    if (conv && conv.sandbox_id !== req.params.sandbox_id) {
      throw httpError(404, 'Conversation not found');
    }
    if (conv?.openclaw_session_key) sessionKey = conv.openclaw_session_key;
  }

  // Build user message with workspace instruction
  const sessionPath = conversationId
    ? `$HOME/.openclaw/workspace/sessions/${conversationId}`
    : '$HOME/.openclaw/workspace';
  const workspaceInstruction =
    `WORKSPACE RULE: Your working directory for this conversation is ${sessionPath}/. ` +
    `All files you create, read, or modify MUST be within this directory. ` +
    `Use \`cd ${sessionPath}\` before executing any file operations. ` +
    `Do not use the workspace root for output files.`;
  const messages = Array.isArray(body['messages']) ? body['messages'] as Array<{ role: string; content: string }> : [];
  const userContent = messages.map(m => m.content).join('\n');
  const fullMessage = `${workspaceInstruction}\n\n${userContent}`;

  // Ensure session dir exists
  if (conversationId) {
    sandboxExec(req.params.sandbox_id, `mkdir -p "${sessionPath}" 2>/dev/null`, 10).catch(() => {});
  }

  // Resolve gateway WebSocket URL — use localhost:<gateway_port> so the connection
  // is from a secure context (localhost is always secure by spec). The external URL
  // would require HTTPS which isn't available in local dev.
  const gwPort = record.gateway_port || 18789;
  const wsUrl = `ws://localhost:${gwPort}`;
  const token = record.gateway_token || '';
  const origin = 'https://localhost';

  // Set up SSE response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sseSend = (event: string, data: unknown) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch { /* client may have disconnected */ }
  };

  let assistantText = '';
  let activeToolName: string | null = null;
  let resolved = false;

  const ws = new WebSocket(wsUrl, { headers: { Origin: origin } });
  const timeout = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      sseSend('error', { message: 'Gateway timeout (180s)' });
      res.write('data: [DONE]\n\n');
      res.end();
      ws.close();
    }
  }, 180000);

  const cleanup = () => {
    clearTimeout(timeout);
    ws.close();
  };

  req.on('close', () => { resolved = true; cleanup(); });

  ws.on('error', (err) => {
    if (resolved) return;
    resolved = true;
    sseSend('error', { message: `Gateway connection error: ${err.message}` });
    res.write('data: [DONE]\n\n');
    res.end();
    cleanup();
  });

  ws.on('message', async (data) => {
    if (resolved) return;
    let frame: Record<string, unknown>;
    try { frame = JSON.parse(data.toString()); } catch { return; }

    // Step 1: connect.challenge → authenticate
    if (frame.type === 'event' && frame.event === 'connect.challenge') {
      ws.send(JSON.stringify({
        type: 'req', id: '1', method: 'connect',
        params: {
          minProtocol: 3, maxProtocol: 3,
          client: { id: 'openclaw-control-ui', version: '2026.3.13', platform: 'web', mode: 'webchat' },
          role: 'operator', scopes: ['operator.read', 'operator.write'],
          auth: { token },
        },
      }));
      return;
    }

    // Step 2: hello-ok → send chat.send
    if (frame.type === 'res' && frame.id === '1') {
      if (!frame.ok) {
        resolved = true;
        sseSend('error', { message: `Auth failed: ${JSON.stringify(frame.error || frame.payload)}` });
        res.write('data: [DONE]\n\n');
        res.end();
        cleanup();
        return;
      }
      sseSend('status', { phase: 'authenticated', message: 'Agent started...' });
      ws.send(JSON.stringify({
        type: 'req', id: '2', method: 'chat.send',
        params: { sessionKey, message: fullMessage, idempotencyKey: uuidv4(), deliver: false },
      }));
      return;
    }

    // Step 3: chat.send ack
    if (frame.type === 'res' && frame.id === '2') {
      if (!frame.ok) {
        resolved = true;
        sseSend('error', { message: `Chat send failed: ${JSON.stringify(frame.error)}` });
        res.write('data: [DONE]\n\n');
        res.end();
        cleanup();
        return;
      }
      return;
    }

    // Agent events
    if (frame.type === 'event' && frame.event === 'agent') {
      const payload = frame.payload as Record<string, unknown>;

      if (payload.stream === 'assistant') {
        const agentData = payload.data as Record<string, unknown> | undefined;
        const newText = (agentData?.text as string) || assistantText;
        if (newText.length > assistantText.length) {
          const chunk = newText.slice(assistantText.length);
          // Forward as OpenAI-compatible SSE so existing SandboxAgent parser works
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
        }
        assistantText = newText;
      } else if (payload.stream === 'lifecycle') {
        const agentData = payload.data as Record<string, unknown> | undefined;
        const phase = agentData?.phase as string;
        // Emit tool_end when lifecycle moves away from tool_execution
        if (activeToolName && phase !== 'tool_execution') {
          res.write(`data: ${JSON.stringify({ result: `Completed: ${activeToolName}` })}\n\n`);
          activeToolName = null;
        }
        if (phase === 'end' && assistantText) {
          // Persist conversation
          if (conversationId && persistedUserMessage) {
            try {
              await conversationStore.appendMessages(conversationId, [
                persistedUserMessage,
                { role: 'assistant', content: assistantText },
              ]);
            } catch (error) {
              res.write(`event: persistence_error\ndata: ${JSON.stringify({
                code: 'chat_exchange_persistence_failed',
                message: `Persistence failed: ${error instanceof Error ? error.message : String(error)}`,
              })}\n\n`);
            }
          }
          resolved = true;
          res.write('data: [DONE]\n\n');
          res.end();
          cleanup();
        }
      }
      return;
    }

    // Tool approval events — auto-allow and emit structured tool events
    if (frame.type === 'event' && frame.event === 'exec.approval.requested') {
      const payload = frame.payload as Record<string, unknown>;
      const toolName = (payload.tool as string) || (payload.name as string) || 'tool';
      const summary = (payload.command as string) || (payload.description as string) || toolName;

      // End previous tool if still active
      if (activeToolName) {
        res.write(`data: ${JSON.stringify({ result: `Completed: ${activeToolName}` })}\n\n`);
      }
      activeToolName = toolName;

      // Emit structured tool event (SandboxAgent already handles {tool, input} format)
      res.write(`data: ${JSON.stringify({ tool: toolName, input: summary })}\n\n`);

      // Auto-allow the tool execution
      ws.send(JSON.stringify({
        type: 'req', id: uuidv4(), method: 'exec.approval.resolve',
        params: { id: payload.id, decision: 'allow' },
      }));
      return;
    }
  });
}));

// ── Browser / VNC status ──────────────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/browser/status', asyncHandler(async (req, res) => {
  const record = await getRecord(req.params.sandbox_id);
  if (!record.vnc_port) {
    res.json({ active: false, reason: 'VNC not provisioned for this sandbox' });
    return;
  }
  // Check if x11vnc is running inside the container
  const [code, output] = await sandboxExec(req.params.sandbox_id, 'pgrep -f x11vnc', 5);
  res.json({
    active: code === 0 && output.trim().length > 0,
    vnc_port: record.vnc_port,
  });
}));

app.get('/api/sandboxes/:sandbox_id/browser/screenshot', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  // Capture X11 framebuffer as JPEG, output base64 to stdout
  const [code, output] = await sandboxExec(
    req.params.sandbox_id,
    'DISPLAY=:99 import -window root -quality 60 jpeg:- 2>/dev/null | base64 -w0',
    10,
  );
  if (code !== 0 || !output.trim()) {
    // Display not available — return a 1x1 transparent PNG
    res.setHeader('Content-Type', 'image/png');
    res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
    return;
  }
  const buffer = Buffer.from(output.trim(), 'base64');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}));

// ── Preview port discovery & proxy ─────────────────────────────────────────────

app.get('/api/sandboxes/:sandbox_id/preview/ports', asyncHandler(async (req, res) => {
  const record = await getRecord(req.params.sandbox_id);
  const containerName = getContainerName(record.sandbox_id);

  // Batch: get all port mappings from Docker in one call
  const portMappings: Record<number, number> = {};
  try {
    const proc = Bun.spawnSync(['docker', 'port', containerName]);
    const stdout = proc.stdout?.toString().trim() ?? '';
    if (proc.exitCode === 0 && stdout) {
      // Format: "3000/tcp -> 0.0.0.0:32770\n8080/tcp -> 0.0.0.0:32771"
      for (const line of stdout.split('\n')) {
        const match = line.match(/^(\d+)\/tcp\s+->\s+.*:(\d+)/);
        if (match) {
          const containerPort = parseInt(match[1], 10);
          const hostPort = parseInt(match[2], 10);
          if (PREVIEW_PORTS.includes(containerPort) && !isNaN(hostPort)) {
            portMappings[containerPort] = hostPort;
          }
        }
      }
    }
  } catch { /* container may not be running */ }

  // Check which ports have active listeners using bash /dev/tcp probe
  // This works on any Linux container without needing ss, netstat, or iproute2
  const portList = PREVIEW_PORTS.join(' ');
  const [, probeOutput] = await sandboxExec(
    req.params.sandbox_id,
    `for p in ${portList}; do (echo >/dev/tcp/127.0.0.1/$p) 2>/dev/null && echo $p; done`,
    10,
  );
  const activePorts: number[] = [];
  for (const line of probeOutput.split('\n')) {
    const port = parseInt(line.trim(), 10);
    if (!isNaN(port) && PREVIEW_PORTS.includes(port)) {
      activePorts.push(port);
    }
  }

  res.json({ ports: portMappings, active: activePorts });
}));

app.all('/api/sandboxes/:sandbox_id/preview/proxy/:port/*', asyncHandler(async (req, res) => {
  const record = await getRecord(req.params.sandbox_id);
  const containerPort = parseInt(req.params.port, 10);
  if (isNaN(containerPort) || !PREVIEW_PORTS.includes(containerPort)) {
    throw httpError(400, `Port ${req.params.port} is not a valid preview port`);
  }

  const containerName = getContainerName(record.sandbox_id);
  const proc = Bun.spawnSync(['docker', 'port', containerName, `${containerPort}/tcp`]);
  const stdout = proc.stdout?.toString().trim() ?? '';
  if (proc.exitCode !== 0 || !stdout) {
    throw httpError(502, `Port ${containerPort} is not mapped for this sandbox`);
  }
  const hostPort = parseInt(stdout.split(':').pop() ?? '', 10);
  if (isNaN(hostPort)) throw httpError(502, 'Failed to resolve host port');

  // Extract the path after /proxy/:port/
  const proxyPath = req.params[0] || '';
  const targetUrl = `http://127.0.0.1:${hostPort}/${proxyPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

  try {
    const proxyRes = await axios({
      method: req.method as string,
      url: targetUrl,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${hostPort}`,
      },
      data: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      responseType: 'arraybuffer',
      validateStatus: () => true,
      timeout: 30_000,
      maxRedirects: 0,
    });

    // Forward status + headers
    res.status(proxyRes.status);
    const skipHeaders = new Set(['transfer-encoding', 'connection', 'content-encoding']);
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (!skipHeaders.has(key.toLowerCase()) && value) {
        res.setHeader(key, value as string);
      }
    }
    // Allow iframe embedding
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.removeHeader('content-security-policy');
    res.removeHeader('x-frame-options');

    res.send(Buffer.from(proxyRes.data as ArrayBuffer));
  } catch (err) {
    throw httpError(502, `Preview proxy error: ${err instanceof Error ? err.message : String(err)}`);
  }
}));

// ── Workspace file access ─────────────────────────────────────────────────────

function classifyWorkspaceExecError(output: string, operation: string): never {
  const lower = output.toLowerCase();
  if (lower.includes('no such container') || lower.includes('is not running')) {
    throw httpError(503, 'Sandbox container is not running. It may need to be restarted.');
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    throw httpError(504, `Workspace ${operation} timed out. The container may be overloaded.`);
  }
  throw httpError(502, `Workspace ${operation} failed: ${output.slice(0, 300)}`);
}

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
  if (code !== 0) classifyWorkspaceExecError(output, 'list');
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
  if (code !== 0) classifyWorkspaceExecError(output, 'read');
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
  if (code !== 0) classifyWorkspaceExecError(output, 'download');

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

app.get('/api/sandboxes/:sandbox_id/workspace/handoff', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const relativePath = parseWorkspaceRelativePath(req.query.path);
  const archiveName = relativePath
    ? `${relativePath.split('/').filter(Boolean).join('-') || 'workspace'}-bundle.tar.gz`
    : 'workspace-bundle.tar.gz';
  const [code, output] = await sandboxExec(
    req.params.sandbox_id,
    createWorkspaceHandoffCommand(relativePath, archiveName),
    30,
  );
  if (code !== 0) classifyWorkspaceExecError(output, 'handoff');
  try {
    res.json(parseJsonOutput(output));
  } catch {
    throw httpError(502, 'Failed to parse workspace handoff output');
  }
}));

app.get('/api/sandboxes/:sandbox_id/workspace/archive', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const relativePath = parseWorkspaceRelativePath(req.query.path);
  const archiveName = relativePath
    ? `${relativePath.split('/').filter(Boolean).join('-') || 'workspace'}-bundle.tar.gz`
    : 'workspace-bundle.tar.gz';
  const [code, output] = await sandboxExec(
    req.params.sandbox_id,
    createWorkspaceArchiveCommand(relativePath, archiveName),
    60,
  );
  if (code !== 0) {
    if (output.includes('Archive unavailable: workspace_empty')) {
      throw httpError(409, 'Workspace archive unavailable: workspace is empty');
    }
    if (output.includes('Archive unavailable: too_many_files')) {
      throw httpError(409, 'Workspace archive unavailable: too many files');
    }
    if (output.includes('Archive unavailable: archive_too_large')) {
      throw httpError(409, 'Workspace archive unavailable: archive too large');
    }
    classifyWorkspaceExecError(output, 'archive');
  }

  let payload: Record<string, unknown>;
  try {
    payload = parseJsonOutput(output) as Record<string, unknown>;
  } catch {
    throw httpError(502, 'Failed to parse workspace archive output');
  }

  const base64 = typeof payload.base64 === 'string' ? payload.base64 : null;
  if (!base64) throw httpError(502, 'Workspace archive payload missing file bytes');

  const buffer = Buffer.from(base64, 'base64');
  const downloadName = typeof payload.download_name === 'string' ? payload.download_name : archiveName;
  const mimeType = typeof payload.mime_type === 'string' ? payload.mime_type : 'application/gzip';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName.replace(/"/g, '')}"`);
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
  // Create session folder with context file (fire-and-forget — non-fatal if sandbox is down)
  sandboxExec(
    req.params.sandbox_id,
    `mkdir -p "$HOME/.openclaw/workspace/sessions/${conv.id}" 2>/dev/null && ` +
    `printf '%s' 'This is your session workspace. All output files for this conversation should be created here.' ` +
    `> "$HOME/.openclaw/workspace/sessions/${conv.id}/.session-context" 2>/dev/null`,
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
  const body = validateConversationMessagesAppendBody(req.body);
  await conversationStore.appendMessages(conv_id, body.messages);
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
app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  const requestId = (req as any).__requestId;
  if (status >= 500) {
    // Log full error details internally but return generic message to client
    appLogger.error({ err, requestId, status, path: req.path }, `Unhandled error: ${err.message}`);
    res.status(status).json({ detail: 'Internal server error', requestId });
  } else {
    // 4xx errors are intentional — safe to return the message
    res.status(status).json({ detail: err.message });
  }
});

export default app;
