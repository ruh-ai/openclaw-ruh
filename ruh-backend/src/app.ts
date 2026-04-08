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
import { optionalAuth, requireAuth, requireRole } from './auth/middleware';
import { deriveAppAccess } from './auth/appAccess';
import { requireActiveDeveloperOrg } from './auth/builderAccess';
import { requireActiveCustomerOrg } from './auth/customerAccess';
import * as userStore from './userStore';
import * as sessionStore from './sessionStore';
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
import * as evalResultStore from './evalResultStore';
import * as orgStore from './orgStore';
import * as organizationMembershipStore from './organizationMembershipStore';
import * as channelManager from './channelManager';
import * as auditStore from './auditStore';
import * as systemEventStore from './systemEventStore';
import * as webhookDeliveryStore from './webhookDeliveryStore';
import * as billingStore from './billingStore';
import { resolveEntitlementAccess } from './billing/entitlementState';
import { findSkill, listSkills, searchSkills, publishSkill, registryStats } from './skillRegistry';
import { listTemplates, getTemplate, searchTemplates, listCategories } from './templateRegistry';
import * as paperclipOrchestrator from './paperclipOrchestrator';
import { getBackendReadiness } from './backendReadiness';
import { getSandboxConversationRecord } from './conversationAccess';
import {
  createOpenclawSandbox,
  dockerExec,
  ensureInteractiveRuntimeServices,
  getContainerName,
  PREVIEW_PORTS,
  reconfigureSandboxLlm,
  restartGateway,
  retrofitSandboxToSharedCodex,
  stopAndRemoveContainer,
  waitForGateway,
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
  createWorkspaceStatusCommand,
  normalizeWorkspaceRelativePath,
} from "./workspaceFiles";
import {
  JSON_BODY_LIMIT,
  validateUuid,
  validateAgentConfigPatchBody,
  validateAgentCreateBody,
  validateAgentMetadataPatchBody,
  validateAgentSandboxAttachBody,
  validateCustomerAgentConfigPatchBody,
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
import { buildConfigurePayloadFromAgent } from './marketplaceRuntime';
import {
  extractToolEventsFromTranscript,
  resolveSessionTranscriptFile,
  type TranscriptToolEvent,
} from './sessionToolTranscript';

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
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-OpenClaw-Session-Key',
      'X-Daytona-Preview-Token',
      'ngrok-skip-browser-warning',
    ],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400,
  }),
);

app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/agents/:agentId', createCostRouter());

// In-memory store for active creation streams (shared registry, exported for test cleanup)
import { streams as _sharedStreams, type StreamEntry } from './streamRegistry';
export type { StreamEntry };
export const _streams = _sharedStreams;

interface ConfigureAgentStepResult {
  kind: 'soul' | 'skill' | 'cron' | 'mcp' | 'runtime_env' | 'webhook';
  target: string;
  ok: boolean;
  message: string;
}

interface ConfigureAgentPayload {
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
}

interface ConfigureAgentApplyResult {
  statusCode: number;
  ok: boolean;
  applied: boolean;
  detail?: string;
  steps: ConfigureAgentStepResult[];
  webhooks?: PublicWebhookProvisioning[];
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

async function ensureLaunchableSandboxRuntime(
  record: store.SandboxRecord,
): Promise<store.SandboxRecord | null> {
  const containerName = getContainerName(record.sandbox_id);
  const running = await dockerContainerRunning(containerName).catch(() => false);
  if (!running) {
    return null;
  }

  await ensureInteractiveRuntimeServices(containerName).catch(() => {});
  const alreadyHealthy = await waitForGateway(containerName).catch(() => false);
  const authBypassEnabled = await isGatewayDeviceAuthBypassEnabled(
    containerName,
  ).catch(() => false);
  if (alreadyHealthy && authBypassEnabled) {
    return refreshSandboxRuntimePorts(record);
  }

  await restartGateway(containerName);
  const recovered = await waitForGateway(containerName).catch(() => false);
  if (!recovered) {
    return null;
  }
  return refreshSandboxRuntimePorts(record);
}

async function isGatewayDeviceAuthBypassEnabled(
  containerName: string,
): Promise<boolean> {
  const [ok, output] = await dockerExec(
    containerName,
    'openclaw config get gateway.controlUi.dangerouslyDisableDeviceAuth',
    10_000,
  );
  if (!ok) {
    return false;
  }
  const normalized = output
    .split('\n')
    .map((line) => line.trim().replace(/^"+|"+$/g, ''))
    .find(Boolean);
  return normalized === 'true';
}

async function resolvePublishedDockerPort(
  containerName: string,
  containerPort: number,
): Promise<number | null> {
  const [exitCode, output] = await dockerSpawn(
    ['port', containerName, `${containerPort}/tcp`],
    10_000,
  );
  if (exitCode !== 0 || !output.trim()) {
    return null;
  }

  const firstMapping = output
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  const parsed = firstMapping
    ? parseInt(firstMapping.split(':').pop() ?? '', 10)
    : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

async function refreshSandboxRuntimePorts(
  record: store.SandboxRecord,
): Promise<store.SandboxRecord> {
  const containerName = getContainerName(record.sandbox_id);
  const [gatewayPort, vncPort] = await Promise.all([
    resolvePublishedDockerPort(containerName, 18789),
    resolvePublishedDockerPort(containerName, 6080),
  ]);

  const nextGatewayPort = gatewayPort ?? record.gateway_port ?? 18789;
  const nextVncPort = vncPort ?? record.vnc_port ?? null;
  if (
    nextGatewayPort === record.gateway_port &&
    nextVncPort === record.vnc_port
  ) {
    return record;
  }

  await store.saveSandbox(
    {
      ...record,
      gateway_port: nextGatewayPort,
      vnc_port: nextVncPort,
    } as unknown as Record<string, unknown>,
    record.sandbox_name,
  );

  return (
    (await store.getSandbox(record.sandbox_id).catch(() => null)) ?? {
      ...record,
      gateway_port: nextGatewayPort,
      vnc_port: nextVncPort,
    }
  );
}

async function readSandboxSessionToolEvents(
  sandboxId: string,
  sessionKey: string,
): Promise<TranscriptToolEvent[]> {
  const [indexCode, indexOutput] = await sandboxExec(
    sandboxId,
    'cat "$HOME/.openclaw/agents/main/sessions/sessions.json" 2>/dev/null',
    10,
  );
  if (indexCode !== 0 || !indexOutput.trim()) {
    return [];
  }

  const sessionFile = resolveSessionTranscriptFile(indexOutput, sessionKey);
  if (!sessionFile) {
    return [];
  }

  const [transcriptCode, transcriptOutput] = await sandboxExec(
    sandboxId,
    `tail -n 400 ${joinShellArgs([sessionFile])} 2>/dev/null`,
    10,
  );
  if (transcriptCode !== 0 || !transcriptOutput.trim()) {
    return [];
  }

  return extractToolEventsFromTranscript(transcriptOutput);
}

async function ensureSandboxBrowserRuntime(
  record: store.SandboxRecord,
): Promise<store.SandboxRecord> {
  const containerName = getContainerName(record.sandbox_id);
  await ensureInteractiveRuntimeServices(containerName).catch(() => {});
  await Bun.sleep(500);
  return refreshSandboxRuntimePorts(record).catch(() => record);
}

async function isSandboxBrowserActive(sandboxId: string): Promise<boolean> {
  const [code, output] = await sandboxExec(sandboxId, 'pgrep -f x11vnc', 5);
  return code === 0 && output.trim().length > 0;
}

async function captureSandboxBrowserScreenshot(
  sandboxId: string,
): Promise<Buffer | null> {
  const [code, output] = await sandboxExec(
    sandboxId,
    'DISPLAY=:99 import -window root -quality 60 jpeg:- 2>/dev/null | base64 -w0',
    10,
  );
  if (code !== 0 || !output.trim()) {
    return null;
  }

  try {
    return Buffer.from(output.trim(), 'base64');
  } catch {
    return null;
  }
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

function requireAdminAccess(req: Request): AuditActor {
  if (req.user?.role === 'admin') {
    return {
      actor_type: 'user',
      actor_id: req.user.userId,
    };
  }

  requireAdmin(req);
  return {
    actor_type: 'admin_token',
    actor_id: 'openclaw_admin_token',
  };
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
      return [];
    }
  }

  return [];
}

function toAdminMembershipResponse(
  membership: organizationMembershipStore.OrganizationMembershipRecord,
) {
  return {
    id: membership.id,
    organizationId: membership.orgId,
    organizationName: membership.organizationName,
    organizationSlug: membership.organizationSlug,
    organizationKind: membership.organizationKind,
    organizationPlan: membership.organizationPlan,
    organizationStatus: membership.organizationStatus,
    role: membership.role,
    status: membership.status,
  };
}

async function buildAdminMemberships(user: userStore.UserRecord) {
  const memberships = await organizationMembershipStore.listMembershipsForUser(user.id);
  if (memberships.length > 0) {
    return memberships.map(toAdminMembershipResponse);
  }

  if (!user.orgId) {
    return [];
  }

  const org = await orgStore.getOrg(user.orgId);
  if (!org) {
    return [];
  }

  return [{
    id: `legacy:${user.id}:${org.id}`,
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    organizationKind: org.kind,
    organizationPlan: org.plan,
    organizationStatus: org.status,
    role: user.role === 'developer' ? 'developer' : 'employee',
    status: 'active',
  }];
}

async function buildAdminUserResponse(user: userStore.UserRecord) {
  const memberships = await buildAdminMemberships(user);
  const platformRole = user.role === 'admin' ? 'platform_admin' : 'user';
  const appAccess = deriveAppAccess({ platformRole, memberships });
  const primaryOrganization =
    memberships.find((membership) => membership.organizationId === user.orgId)
    ?? null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    orgId: user.orgId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    platformRole,
    appAccess,
    memberships,
    primaryOrganization,
  };
}

async function listAdminOrganizationSummaries(filters: {
  kind?: string;
  status?: string;
  search?: string;
} = {}) {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.kind) {
      conditions.push(`o.kind = $${paramIdx++}`);
      params.push(filters.kind);
    }

    if (filters.status) {
      conditions.push(`o.status = $${paramIdx++}`);
      params.push(filters.status);
    }

    if (filters.search) {
      conditions.push(`(o.name ILIKE $${paramIdx} OR o.slug ILIKE $${paramIdx})`);
      params.push(`%${filters.search}%`);
      paramIdx += 1;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await client.query(
      `
      SELECT
        o.id,
        o.name,
        o.slug,
        o.kind,
        o.plan,
        o.status,
        o.created_at,
        o.updated_at,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id) AS member_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active') AS active_member_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active' AND m.role = 'owner') AS owner_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active' AND m.role = 'admin') AS admin_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active' AND m.role = 'developer') AS developer_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active' AND m.role = 'employee') AS employee_count,
        (SELECT COUNT(*) FROM agents a WHERE a.org_id = o.id) AS agent_count,
        (SELECT COUNT(*) FROM agents a WHERE a.org_id = o.id AND a.status = 'active') AS active_agent_count,
        (SELECT COUNT(*) FROM marketplace_listings ml WHERE ml.owner_org_id = o.id) AS listing_count,
        (SELECT COUNT(*) FROM marketplace_listings ml WHERE ml.owner_org_id = o.id AND ml.status = 'published') AS published_listing_count,
        (SELECT COUNT(*) FROM marketplace_runtime_installs mi WHERE mi.org_id = o.id) AS install_count,
        (SELECT COUNT(*) FROM sessions s WHERE s.active_org_id = o.id) AS active_session_count
      FROM organizations o
      ${where}
      ORDER BY member_count DESC, install_count DESC, agent_count DESC, o.created_at DESC
      `,
      params,
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      kind: String(row.kind),
      plan: String(row.plan),
      status: String(row.status ?? 'active'),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      memberCount: Number(row.member_count ?? 0),
      activeMemberCount: Number(row.active_member_count ?? 0),
      membershipBreakdown: {
        owner: Number(row.owner_count ?? 0),
        admin: Number(row.admin_count ?? 0),
        developer: Number(row.developer_count ?? 0),
        employee: Number(row.employee_count ?? 0),
      },
      agentCount: Number(row.agent_count ?? 0),
      activeAgentCount: Number(row.active_agent_count ?? 0),
      listingCount: Number(row.listing_count ?? 0),
      publishedListingCount: Number(row.published_listing_count ?? 0),
      installCount: Number(row.install_count ?? 0),
      activeSessionCount: Number(row.active_session_count ?? 0),
    }));
  });
}

async function loadAdminOrganizationDetail(orgId: string) {
  return withConn(async (client) => {
    const summaryResult = await client.query(
      `
      SELECT
        o.id,
        o.name,
        o.slug,
        o.kind,
        o.plan,
        o.status,
        o.created_at,
        o.updated_at,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id) AS member_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active') AS active_member_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active' AND m.role = 'owner') AS owner_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active' AND m.role = 'admin') AS admin_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active' AND m.role = 'developer') AS developer_count,
        (SELECT COUNT(*) FROM organization_memberships m WHERE m.org_id = o.id AND m.status = 'active' AND m.role = 'employee') AS employee_count,
        (SELECT COUNT(*) FROM agents a WHERE a.org_id = o.id) AS agent_count,
        (SELECT COUNT(*) FROM agents a WHERE a.org_id = o.id AND a.status = 'active') AS active_agent_count,
        (SELECT COUNT(*) FROM marketplace_listings ml WHERE ml.owner_org_id = o.id) AS listing_count,
        (SELECT COUNT(*) FROM marketplace_listings ml WHERE ml.owner_org_id = o.id AND ml.status = 'published') AS published_listing_count,
        (SELECT COUNT(*) FROM marketplace_runtime_installs mi WHERE mi.org_id = o.id) AS install_count,
        (SELECT COUNT(*) FROM sessions s WHERE s.active_org_id = o.id) AS active_session_count
      FROM organizations o
      WHERE o.id = $1
      LIMIT 1
      `,
      [orgId],
    );

    const row = summaryResult.rows[0];
    if (!row) {
      return null;
    }

    const membersResult = await client.query(
      `
      SELECT
        m.id,
        m.org_id,
        m.user_id,
        m.role,
        m.status,
        m.created_at,
        m.updated_at,
        o.name AS organization_name,
        o.slug AS organization_slug,
        o.kind AS organization_kind,
        o.plan AS organization_plan,
        o.status AS organization_status,
        u.email AS user_email,
        u.display_name AS user_display_name,
        u.role AS user_role,
        u.status AS user_status,
        u.email_verified AS user_email_verified,
        u.created_at AS user_created_at
      FROM organization_memberships m
      JOIN organizations o ON o.id = m.org_id
      JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1
      ORDER BY
        CASE m.role
          WHEN 'owner' THEN 0
          WHEN 'admin' THEN 1
          WHEN 'developer' THEN 2
          ELSE 3
        END,
        m.created_at ASC
      `,
      [orgId],
    );

    const agentsResult = await client.query(
      `
      SELECT
        a.id,
        a.name,
        a.description,
        a.status,
        a.created_at,
        a.sandbox_ids,
        a.forge_sandbox_id,
        u.email AS creator_email,
        u.display_name AS creator_display_name
      FROM agents a
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.org_id = $1
      ORDER BY a.created_at DESC
      LIMIT 24
      `,
      [orgId],
    );

    const agentItems = agentsResult.rows.map((agentRow) => ({
      id: String(agentRow.id),
      name: String(agentRow.name),
      description: String(agentRow.description ?? ''),
      status: String(agentRow.status),
      createdAt: String(agentRow.created_at),
      sandboxIds: parseJsonArray<string>(agentRow.sandbox_ids),
      forgeSandboxId: agentRow.forge_sandbox_id ? String(agentRow.forge_sandbox_id) : null,
      creatorEmail: agentRow.creator_email ? String(agentRow.creator_email) : null,
      creatorDisplayName: agentRow.creator_display_name ? String(agentRow.creator_display_name) : null,
    }));

    const listingsResult = await client.query(
      `
      SELECT
        ml.id,
        ml.title,
        ml.slug,
        ml.status,
        ml.version,
        ml.category,
        ml.install_count,
        ml.updated_at,
        u.email AS publisher_email
      FROM marketplace_listings ml
      LEFT JOIN users u ON u.id = ml.publisher_id
      WHERE ml.owner_org_id = $1
      ORDER BY ml.updated_at DESC, ml.created_at DESC
      LIMIT 24
      `,
      [orgId],
    );

    const installsResult = await client.query(
      `
      SELECT
        mri.user_id,
        u.email AS user_email,
        ml.id AS listing_id,
        ml.title AS listing_title,
        mri.agent_id,
        a.name AS agent_name,
        mri.version,
        mri.installed_at,
        mri.last_launched_at
      FROM marketplace_runtime_installs mri
      JOIN users u ON u.id = mri.user_id
      JOIN marketplace_listings ml ON ml.id = mri.listing_id
      LEFT JOIN agents a ON a.id = mri.agent_id
      WHERE mri.org_id = $1
      ORDER BY mri.installed_at DESC
      LIMIT 24
      `,
      [orgId],
    );

    const sessionsResult = await client.query(
      `
      SELECT
        s.id,
        s.user_id,
        s.user_agent,
        s.ip_address,
        s.expires_at,
        s.created_at,
        u.email AS user_email,
        u.display_name AS user_display_name,
        u.role AS user_role,
        u.status AS user_status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.active_org_id = $1
        AND s.expires_at > NOW()
      ORDER BY s.created_at DESC
      LIMIT 50
      `,
      [orgId],
    );

    const runtimeIds = Array.from(
      new Set(
        agentItems.flatMap((agent) => [
          ...agent.sandboxIds,
          ...(agent.forgeSandboxId ? [agent.forgeSandboxId] : []),
        ]),
      ),
    );

    let runtimeItems: Array<Record<string, unknown>> = [];
    if (runtimeIds.length > 0) {
      const runtimeResult = await client.query(
        `
        SELECT
          sandbox_id,
          sandbox_name,
          sandbox_state,
          approved,
          shared_codex_enabled,
          shared_codex_model,
          dashboard_url,
          signed_url,
          standard_url,
          created_at
        FROM sandboxes
        WHERE sandbox_id = ANY($1::text[])
        ORDER BY created_at DESC
        `,
        [runtimeIds],
      );

      runtimeItems = runtimeResult.rows.map((runtimeRow) => {
        const sandboxId = String(runtimeRow.sandbox_id);
        const linkedAgents = agentItems
          .filter(
            (agent) =>
              agent.sandboxIds.includes(sandboxId) || agent.forgeSandboxId === sandboxId,
          )
          .map((agent) => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            attachment: agent.forgeSandboxId === sandboxId ? 'forge' : 'runtime',
          }));

        return {
          sandbox_id: sandboxId,
          sandbox_name: runtimeRow.sandbox_name ? String(runtimeRow.sandbox_name) : null,
          sandbox_state: runtimeRow.sandbox_state ? String(runtimeRow.sandbox_state) : null,
          approved: Boolean(runtimeRow.approved),
          shared_codex_enabled: Boolean(runtimeRow.shared_codex_enabled),
          shared_codex_model: runtimeRow.shared_codex_model ? String(runtimeRow.shared_codex_model) : null,
          dashboard_url: runtimeRow.dashboard_url ? String(runtimeRow.dashboard_url) : null,
          signed_url: runtimeRow.signed_url ? String(runtimeRow.signed_url) : null,
          standard_url: runtimeRow.standard_url ? String(runtimeRow.standard_url) : null,
          created_at: runtimeRow.created_at ? String(runtimeRow.created_at) : null,
          linked_agents: linkedAgents,
        };
      });
    }

    const auditResult = await client.query(
      `
      SELECT
        event_id,
        occurred_at,
        request_id,
        action_type,
        target_type,
        target_id,
        outcome,
        actor_type,
        actor_id,
        origin,
        details
      FROM control_plane_audit_events
      WHERE (target_type = 'organization' AND target_id = $1)
         OR (details->>'org_id' = $1)
      ORDER BY occurred_at DESC, event_id DESC
      LIMIT 30
      `,
      [orgId],
    );

    const organization = {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      kind: String(row.kind),
      plan: String(row.plan),
      status: String(row.status ?? 'active'),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      memberCount: Number(row.member_count ?? 0),
      activeMemberCount: Number(row.active_member_count ?? 0),
      membershipBreakdown: {
        owner: Number(row.owner_count ?? 0),
        admin: Number(row.admin_count ?? 0),
        developer: Number(row.developer_count ?? 0),
        employee: Number(row.employee_count ?? 0),
      },
      agentCount: Number(row.agent_count ?? 0),
      activeAgentCount: Number(row.active_agent_count ?? 0),
      listingCount: Number(row.listing_count ?? 0),
      publishedListingCount: Number(row.published_listing_count ?? 0),
      installCount: Number(row.install_count ?? 0),
      activeSessionCount: Number(row.active_session_count ?? 0),
    };

    const warnings: Array<{
      id: string;
      severity: 'high' | 'medium' | 'low';
      title: string;
      detail: string;
    }> = [];

    if (organization.membershipBreakdown.owner === 0) {
      warnings.push({
        id: 'no-owner',
        severity: 'high',
        title: 'No active owner remains on this organization',
        detail: 'Promote an owner before suspending or removing additional privileged members.',
      });
    }

    if (organization.kind === 'customer' && organization.membershipBreakdown.admin === 0 && organization.membershipBreakdown.owner === 0) {
      warnings.push({
        id: 'no-customer-admin',
        severity: 'medium',
        title: 'Customer organization has no active admin',
        detail: 'The tenant can still hold members, but nobody can actively administer the customer workspace.',
      });
    }

    if (organization.status !== 'active') {
      warnings.push({
        id: 'org-not-active',
        severity: 'medium',
        title: `Organization is ${organization.status}`,
        detail: 'Builder and customer app access are blocked while the organization is suspended or archived.',
      });
    }

    if (organization.activeSessionCount > 0 && organization.status !== 'active') {
      warnings.push({
        id: 'active-session-context',
        severity: 'low',
        title: 'Existing sessions still point at this organization',
        detail: 'Use the session-context reset action to clear active-org selection for current refresh sessions.',
      });
    }

    return {
      organization,
      members: membersResult.rows.map((memberRow) => ({
        id: String(memberRow.id),
        userId: String(memberRow.user_id),
        role: String(memberRow.role),
        status: String(memberRow.status),
        createdAt: String(memberRow.created_at),
        updatedAt: String(memberRow.updated_at),
        user: {
          email: String(memberRow.user_email),
          displayName: String(memberRow.user_display_name ?? ''),
          role: String(memberRow.user_role),
          status: String(memberRow.user_status),
          emailVerified: Boolean(memberRow.user_email_verified),
          createdAt: String(memberRow.user_created_at),
        },
      })),
      agents: agentItems,
      listings: listingsResult.rows.map((listingRow) => ({
        id: String(listingRow.id),
        title: String(listingRow.title),
        slug: String(listingRow.slug),
        status: String(listingRow.status),
        version: String(listingRow.version ?? '1.0.0'),
        category: String(listingRow.category ?? 'general'),
        installCount: Number(listingRow.install_count ?? 0),
        updatedAt: String(listingRow.updated_at),
        publisherEmail: listingRow.publisher_email ? String(listingRow.publisher_email) : null,
      })),
      installs: installsResult.rows.map((installRow) => ({
        userId: String(installRow.user_id),
        userEmail: String(installRow.user_email),
        listingId: String(installRow.listing_id),
        listingTitle: String(installRow.listing_title),
        agentId: String(installRow.agent_id),
        agentName: installRow.agent_name ? String(installRow.agent_name) : null,
        version: String(installRow.version),
        installedAt: String(installRow.installed_at),
        lastLaunchedAt: installRow.last_launched_at ? String(installRow.last_launched_at) : null,
      })),
      sessions: sessionsResult.rows.map((sessionRow) => ({
        id: String(sessionRow.id),
        userId: String(sessionRow.user_id),
        userAgent: sessionRow.user_agent ? String(sessionRow.user_agent) : null,
        ipAddress: sessionRow.ip_address ? String(sessionRow.ip_address) : null,
        createdAt: String(sessionRow.created_at),
        expiresAt: String(sessionRow.expires_at),
        user: {
          email: String(sessionRow.user_email),
          displayName: String(sessionRow.user_display_name ?? ''),
          role: String(sessionRow.user_role),
          status: String(sessionRow.user_status),
        },
      })),
      runtime: runtimeItems,
      audit: {
        items: auditResult.rows,
      },
      warnings,
    };
  });
}

async function getAdminOwnerGuard(orgId: string, membershipId: string) {
  const membership = await organizationMembershipStore.getMembershipById(membershipId);
  if (!membership || membership.orgId !== orgId) {
    throw httpError(404, 'Organization membership not found');
  }

  const memberships = await organizationMembershipStore.listMembershipsForOrg(orgId);
  const activeOwnerCount = memberships.filter(
    (item) => item.role === 'owner' && item.status === 'active',
  ).length;

  return { membership, activeOwnerCount };
}

async function loadAdminMarketplaceData(filters: {
  status?: string;
  search?: string;
} = {}) {
  return withConn(async (client) => {
    const summaryResult = await client.query(
      `
      SELECT
        COUNT(*) AS total_listings,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft_count,
        COUNT(*) FILTER (WHERE status = 'pending_review') AS pending_review_count,
        COUNT(*) FILTER (WHERE status = 'published') AS published_count,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
        COUNT(*) FILTER (WHERE status = 'archived') AS archived_count
      FROM marketplace_listings
      `,
    );

    const installsResult = await client.query(
      'SELECT COUNT(*) AS total_installs FROM marketplace_runtime_installs',
    );

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.status) {
      conditions.push(`ml.status = $${paramIdx++}`);
      params.push(filters.status);
    }

    if (filters.search) {
      conditions.push(
        `(ml.title ILIKE $${paramIdx} OR ml.slug ILIKE $${paramIdx} OR ml.summary ILIKE $${paramIdx} OR COALESCE(u.email, '') ILIKE $${paramIdx} OR COALESCE(o.name, '') ILIKE $${paramIdx})`,
      );
      params.push(`%${filters.search}%`);
      paramIdx += 1;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const selectListings = `
      SELECT
        ml.id,
        ml.title,
        ml.slug,
        ml.category,
        ml.version,
        ml.status,
        ml.install_count,
        ml.avg_rating,
        ml.review_notes,
        ml.reviewed_at,
        ml.published_at,
        ml.created_at,
        ml.updated_at,
        u.email AS publisher_email,
        u.display_name AS publisher_display_name,
        o.name AS owner_org_name,
        o.slug AS owner_org_slug
      FROM marketplace_listings ml
      LEFT JOIN users u ON u.id = ml.publisher_id
      LEFT JOIN organizations o ON o.id = ml.owner_org_id
      ${where}
    `;

    const [recentListingsResult, topListingsResult] = await Promise.all([
      client.query(
        `${selectListings} ORDER BY ml.created_at DESC LIMIT 12`,
        params,
      ),
      client.query(
        `${selectListings} ORDER BY ml.install_count DESC, ml.published_at DESC NULLS LAST, ml.created_at DESC LIMIT 8`,
        params,
      ),
    ]);

    const serializeListing = (row: Record<string, unknown>) => ({
      id: String(row.id),
      title: String(row.title),
      slug: String(row.slug),
      category: String(row.category),
      version: String(row.version),
      status: String(row.status),
      installCount: Number(row.install_count ?? 0),
      avgRating: Number(row.avg_rating ?? 0),
      reviewNotes: row.review_notes ? String(row.review_notes) : null,
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      publishedAt: row.published_at ? String(row.published_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      publisherEmail: row.publisher_email ? String(row.publisher_email) : null,
      publisherDisplayName: row.publisher_display_name ? String(row.publisher_display_name) : null,
      ownerOrgName: row.owner_org_name ? String(row.owner_org_name) : null,
      ownerOrgSlug: row.owner_org_slug ? String(row.owner_org_slug) : null,
    });

    const summary = summaryResult.rows[0] ?? {};
    return {
      summary: {
        totalListings: Number(summary.total_listings ?? 0),
        draft: Number(summary.draft_count ?? 0),
        pendingReview: Number(summary.pending_review_count ?? 0),
        published: Number(summary.published_count ?? 0),
        rejected: Number(summary.rejected_count ?? 0),
        archived: Number(summary.archived_count ?? 0),
        totalInstalls: Number(installsResult.rows[0]?.total_installs ?? 0),
      },
      recentListings: recentListingsResult.rows.map((row) => serializeListing(row as Record<string, unknown>)),
      topListings: topListingsResult.rows.map((row) => serializeListing(row as Record<string, unknown>)),
    };
  });
}

async function loadAdminRuntimeData() {
  const [records, containers, agents] = await Promise.all([
    store.listSandboxes(),
    listManagedSandboxContainers(),
    agentStore.listAgents(),
  ]);

  const report = buildSandboxRuntimeReconciliation({ records, containers });
  const recordById = new Map(records.map((record) => [record.sandbox_id, record]));
  const linkedAgentsBySandboxId = new Map<string, {
    id: string;
    name: string;
    status: string;
    attachment: 'runtime' | 'forge';
  }[]>();

  const pushLinkedAgent = (
    sandboxId: string,
    agent: { id: string; name: string; status: string; attachment: 'runtime' | 'forge' },
  ) => {
    const existing = linkedAgentsBySandboxId.get(sandboxId) ?? [];
    existing.push(agent);
    linkedAgentsBySandboxId.set(sandboxId, existing);
  };

  for (const agent of agents) {
    for (const sandboxId of agent.sandbox_ids) {
      pushLinkedAgent(sandboxId, {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        attachment: 'runtime',
      });
    }

    if (agent.forge_sandbox_id) {
      pushLinkedAgent(agent.forge_sandbox_id, {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        attachment: 'forge',
      });
    }
  }

  const items = report.items.map((item) => {
    const record = recordById.get(item.sandbox_id);
    return {
      ...item,
      sandbox_state: record?.sandbox_state ?? null,
      approved: record?.approved ?? false,
      shared_codex_enabled: record?.shared_codex_enabled ?? false,
      shared_codex_model: record?.shared_codex_model ?? null,
      dashboard_url: record?.dashboard_url ?? null,
      signed_url: record?.signed_url ?? null,
      standard_url: record?.standard_url ?? null,
      gateway_port: record?.gateway_port ?? null,
      vnc_port: record?.vnc_port ?? null,
      linked_agents: linkedAgentsBySandboxId.get(item.sandbox_id) ?? [],
    };
  });

  return {
    summary: {
      ...report.summary,
      approved: records.filter((record) => record.approved).length,
      sharedCodexEnabled: records.filter((record) => record.shared_codex_enabled).length,
    },
    items,
  };
}

async function loadAdminOverview() {
  const [userCounts, agentCounts, organizationItems, runtime, marketplace, recentAudit] = await Promise.all([
    withConn(async (client) => {
      const result = await client.query(
        `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE role = 'admin') AS admin_count,
          COUNT(*) FILTER (WHERE role = 'developer') AS developer_count,
          COUNT(*) FILTER (WHERE role = 'end_user') AS end_user_count,
          COUNT(*) FILTER (WHERE status = 'active') AS active_count,
          COUNT(*) FILTER (WHERE status = 'suspended') AS suspended_count,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_count
        FROM users
        `,
      );
      return result.rows[0] ?? {};
    }),
    withConn(async (client) => {
      const result = await client.query(
        `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'active') AS active_count,
          COUNT(*) FILTER (WHERE status = 'draft') AS draft_count,
          COUNT(*) FILTER (WHERE status = 'forging') AS forging_count
        FROM agents
        `,
      );
      return result.rows[0] ?? {};
    }),
    listAdminOrganizationSummaries(),
    loadAdminRuntimeData(),
    loadAdminMarketplaceData(),
    auditStore.listAuditEvents({ limit: 8 }),
  ]);

  const organizationTotals = {
    total: organizationItems.length,
    developer: organizationItems.filter((org) => org.kind === 'developer').length,
    customer: organizationItems.filter((org) => org.kind === 'customer').length,
  };

  const attention = [];
  if (runtime.summary.db_only > 0 || runtime.summary.container_only > 0) {
    attention.push({
      id: 'runtime-drift',
      severity: 'high',
      title: 'Runtime drift needs cleanup',
      detail: `${runtime.summary.db_only} DB-only and ${runtime.summary.container_only} container-only sandboxes need operator action.`,
      href: '/runtime',
    });
  }
  if (runtime.summary.gateway_unreachable > 0) {
    attention.push({
      id: 'gateway-unreachable',
      severity: 'medium',
      title: 'Some sandboxes are unreachable',
      detail: `${runtime.summary.gateway_unreachable} sandboxes exist in both DB and Docker but the gateway does not appear healthy.`,
      href: '/runtime',
    });
  }
  if (Number(marketplace.summary.pendingReview) > 0) {
    attention.push({
      id: 'marketplace-review',
      severity: 'medium',
      title: 'Marketplace review queue is not empty',
      detail: `${marketplace.summary.pendingReview} listings are waiting for review.`,
      href: '/marketplace',
    });
  }
  if (Number(userCounts.suspended_count ?? 0) > 0) {
    attention.push({
      id: 'suspended-users',
      severity: 'low',
      title: 'There are suspended users to review',
      detail: `${userCounts.suspended_count} user accounts are currently suspended.`,
      href: '/users',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: Number(userCounts.total ?? 0),
      byRole: {
        admin: Number(userCounts.admin_count ?? 0),
        developer: Number(userCounts.developer_count ?? 0),
        endUser: Number(userCounts.end_user_count ?? 0),
      },
      byStatus: {
        active: Number(userCounts.active_count ?? 0),
        suspended: Number(userCounts.suspended_count ?? 0),
        pending: Number(userCounts.pending_count ?? 0),
      },
    },
    organizations: {
      ...organizationTotals,
      top: organizationItems.slice(0, 6),
    },
    agents: {
      total: Number(agentCounts.total ?? 0),
      byStatus: {
        active: Number(agentCounts.active_count ?? 0),
        draft: Number(agentCounts.draft_count ?? 0),
        forging: Number(agentCounts.forging_count ?? 0),
      },
    },
    runtime: {
      summary: runtime.summary,
      issues: runtime.items.filter((item) => item.drift_state !== 'healthy').slice(0, 8),
    },
    marketplace,
    activity: {
      recentAuditEvents: recentAudit.items,
    },
    attention,
  };
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

async function applyAgentConfiguration(
  req: Request,
  sandboxId: string,
  payload: ConfigureAgentPayload,
): Promise<ConfigureAgentApplyResult> {
  const record = await getRecord(sandboxId);
  const containerName = getContainerName(record.sandbox_id);
  const {
    system_name,
    soul_content,
    skills,
    cron_jobs,
    runtime_inputs,
    agent_id,
  } = payload;

  const steps: ConfigureAgentStepResult[] = [];
  let provisionedWebhooks: PublicWebhookProvisioning[] = [];

  const pushStep = (step: ConfigureAgentStepResult) => {
    steps.push(step);
    return step.ok;
  };

  const fail = async (
    detail: string,
    statusCode = 500,
  ): Promise<ConfigureAgentApplyResult> => {
    await recordAuditEvent(req, {
      action_type: 'sandbox.configure_agent',
      target_type: 'sandbox',
      target_id: sandboxId,
      outcome: 'failure',
      details: {
        system_name: typeof system_name === 'string' ? system_name : '',
        skill_count: Array.isArray(skills) ? skills.length : 0,
        cron_job_count: Array.isArray(cron_jobs) ? cron_jobs.length : 0,
        step_count: steps.length,
        failed_step: steps[steps.length - 1],
      },
    });
    return {
      statusCode,
      ok: false,
      applied: false,
      detail,
      steps,
    };
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
    return {
      statusCode: 400,
      ok: false,
      applied: false,
      detail: `Missing required runtime inputs: ${missingRuntimeInputs.map((input) => input.key).join(', ')}`,
      steps,
    };
  }

  if (soul_content) {
    const [ok, out] = await dockerExec(
      containerName,
      buildHomeFileWriteCommand('.openclaw/workspace/SOUL.md', soul_content),
      30_000,
    );
    if (!pushStep({
      kind: 'soul',
      target: 'SOUL.md',
      ok,
      message: ok ? 'SOUL.md written' : `SOUL.md failed: ${out}`,
    })) {
      return fail('Agent config apply failed');
    }
  }

  for (const skill of (skills ?? [])) {
    const normalizedSkillId = normalizePathSegment(String(skill.skill_id ?? ''));
    const registrySkill = findSkill(skill.skill_id) ?? findSkill(skill.name);
    const skillContent = skill.skill_md || registrySkill?.skill_md || buildFallbackSkillContent(skill);
    const skillMessage = skill.skill_md
      ? `Skill ${normalizedSkillId}: built (wizard-provided)`
      : registrySkill
        ? `Skill ${normalizedSkillId}: registry match (${registrySkill.skill_id})`
        : `Skill ${normalizedSkillId}: stub (no registry entry)`;
    const [ok, out] = await dockerExec(
      containerName,
      buildHomeFileWriteCommand(
        `.openclaw/workspace/skills/${normalizedSkillId}/SKILL.md`,
        skillContent,
      ),
      20_000,
    );
    if (!pushStep({
      kind: 'skill',
      target: normalizedSkillId,
      ok,
      message: ok ? skillMessage : `Skill ${normalizedSkillId} failed: ${out}`,
    })) {
      return fail('Agent config apply failed');
    }
  }

  for (const job of (cron_jobs ?? [])) {
    const [ok, out] = await dockerExec(
      containerName,
      buildConfigureAgentCronAddCommand({
        name: String(job.name ?? ''),
        schedule: String(job.schedule ?? ''),
        message: String(job.message ?? ''),
      }),
      20_000,
    );
    if (!pushStep({
      kind: 'cron',
      target: String(job.name ?? ''),
      ok,
      message: ok ? `Cron ${job.name} registered` : `Cron ${job.name} failed: ${out}`,
    })) {
      return fail('Agent config apply failed');
    }
  }

  if ((runtime_inputs ?? []).length > 0) {
    const runtimeEnvContent = buildRuntimeEnvFileContent(
      (runtime_inputs ?? []).map((input) => ({
        key: String(input.key ?? ''),
        value: String(input.value ?? '').trim() || String((input as Record<string, unknown>).defaultValue ?? ''),
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
      return fail('Agent config apply failed');
    }
  }

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
          return fail('Agent config apply failed');
        }

        const cred = credentialByToolId.get(toolId);
        if (!cred) {
          pushStep({ kind: 'mcp', target: toolId, ok: false, message: `Missing saved credentials for selected MCP tool ${toolId}` });
          return fail('Agent config apply failed');
        }

        try {
          mcpServers[toolId] = {
            command: 'npx',
            args: ['-y', pkg.pkg],
            env: decryptCredentials(cred.encrypted, cred.iv),
          };
        } catch {
          pushStep({ kind: 'mcp', target: toolId, ok: false, message: `Failed to decrypt credentials for ${toolId}` });
          return fail('Agent config apply failed');
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
        return fail('Agent config apply failed');
      }
    } catch (err) {
      pushStep({
        kind: 'mcp',
        target: 'mcp-config',
        ok: false,
        message: `MCP config error: ${err instanceof Error ? err.message : 'unknown'}`,
      });
      return fail('Agent config apply failed');
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
    target_id: sandboxId,
    outcome: 'success',
    details: {
      system_name: typeof system_name === 'string' ? system_name : '',
      skill_count: Array.isArray(skills) ? skills.length : 0,
      cron_job_count: Array.isArray(cron_jobs) ? cron_jobs.length : 0,
      step_count: steps.length,
    },
  });

  return {
    statusCode: 200,
    ok: true,
    applied: true,
    steps,
    ...(provisionedWebhooks.length > 0 ? { webhooks: provisionedWebhooks } : {}),
  };
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

app.get('/api/agents/:id/system-events', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
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
          if (!entry.result?.['sandbox_id']) {
            sendEvent('error', { message: 'Cannot approve: sandbox result is missing or has no sandbox_id' });
            break;
          }
          await store.markApproved(entry.result['sandbox_id'] as string);
          entry.status = 'done';
          await recordSystemEvent(req, {
            level: 'info',
            category: 'sandbox.lifecycle',
            action: 'sandbox.create.approved',
            status: 'success',
            message: `Sandbox ${String(entry.result['sandbox_id'])} device approval succeeded`,
            sandbox_id: String(entry.result['sandbox_id']),
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
    'OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 nohup openclaw gateway > /tmp/openclaw-gateway.log 2>&1 & sleep 2 && curl -sf http://localhost:18789/ > /dev/null && echo "GATEWAY_OK" || echo "GATEWAY_FAIL"',
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

app.get('/api/skills', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    res.json(searchSkills(q));
  } else {
    res.json(listSkills());
  }
}));

app.get('/api/skills/stats', asyncHandler(async (_req, res) => {
  res.json(registryStats());
}));

app.get('/api/skills/:skill_id', asyncHandler(async (req, res) => {
  const skill = findSkill(req.params.skill_id);
  if (!skill) throw httpError(404, 'Skill not found');
  res.json(skill);
}));

app.post('/api/skills', requireAuth, asyncHandler(async (req, res) => {
  const { skill_id, name, description, tags, skill_md, agent_id } = req.body as {
    skill_id: string; name: string; description: string;
    tags: string[]; skill_md: string; agent_id?: string;
  };
  if (!skill_id || !name || !skill_md) {
    throw httpError(400, 'skill_id, name, and skill_md are required');
  }
  const added = publishSkill({
    skill_id, name,
    description: description || name,
    tags: Array.isArray(tags) ? tags : [],
    skill_md,
    source: 'community',
    publishedBy: typeof agent_id === 'string' ? agent_id : undefined,
  });
  res.status(added ? 201 : 200).json({ ok: true, added, skill_id });
}));

// ── Agent Templates ───────────────────────────────────────────────────────────
// Public — no auth required. Templates are read-only seed data.

app.get('/api/templates', asyncHandler(async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  let results;
  if (q) {
    results = searchTemplates(q);
    if (category) {
      const cat = category.toLowerCase();
      results = results.filter((t) => t.category.toLowerCase() === cat);
    }
  } else {
    results = listTemplates(category);
  }

  // Strip architecturePlan from the list response to keep payloads small.
  // Callers fetch the full template via GET /api/templates/:id before deploy.
  const lightweight = results.map(({ architecturePlan: _plan, ...rest }) => rest);
  res.json(lightweight);
}));

app.get('/api/templates/categories', asyncHandler(async (_req, res) => {
  res.json(listCategories());
}));

app.get('/api/templates/:id', asyncHandler(async (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) throw httpError(404, 'Template not found');
  res.json(template);
}));

async function getAgentRecord(agentId: string): Promise<agentStore.AgentRecord> {
  const record = await agentStore.getAgent(agentId);
  if (!record) throw httpError(404, 'Agent not found');
  return record;
}

async function requireBuilderContext(req: Request) {
  return requireActiveDeveloperOrg(req.user);
}

async function getActiveOrgKind(req: Request): Promise<'developer' | 'customer' | null> {
  if (!req.user?.orgId) {
    return null;
  }
  const organization = await orgStore.getOrg(req.user.orgId);
  return organization?.kind ?? null;
}

async function getOwnedAgentRecord(req: Request, agentId: string): Promise<agentStore.AgentRecord> {
  await requireBuilderContext(req);
  const record = await agentStore.getAgentForCreator(agentId, req.user!.userId);
  if (!record) throw httpError(404, 'Agent not found');
  return record;
}

async function getCustomerOwnedAgentRecord(req: Request, agentId: string): Promise<agentStore.AgentRecord> {
  const customer = await requireActiveCustomerOrg(req.user);
  const record = await agentStore.getAgentForCreatorInOrg(
    agentId,
    req.user!.userId,
    customer.organization.id,
  );
  if (!record) {
    throw httpError(404, 'Agent not found');
  }
  return record;
}

async function getReadableAgentRecord(req: Request, agentId: string): Promise<agentStore.AgentRecord> {
  const activeOrgKind = await getActiveOrgKind(req);
  if (activeOrgKind === 'customer') {
    return getCustomerOwnedAgentRecord(req, agentId);
  }
  return getOwnedAgentRecord(req, agentId);
}

function buildCustomerAgentConfigResponse(record: agentStore.AgentRecord) {
  const safeRecord = redactAgentWebhookSecrets(record);
  const workspaceMemory = safeRecord.workspace_memory ?? {
    instructions: '',
    continuity_summary: '',
    pinned_paths: [],
    updated_at: null,
  };

  return {
    agent: {
      id: safeRecord.id,
      name: safeRecord.name,
      avatar: safeRecord.avatar,
      description: safeRecord.description,
      status: safeRecord.status,
      sandboxIds: safeRecord.sandbox_ids ?? [],
      createdAt: safeRecord.created_at,
      updatedAt: safeRecord.updated_at,
    },
    skills: safeRecord.skills ?? [],
    agentRules: safeRecord.agent_rules ?? [],
    runtimeInputs: safeRecord.runtime_inputs ?? [],
    toolConnections: (safeRecord.tool_connections ?? []).map((tool) => ({
      toolId: tool.toolId,
      name: tool.name,
      description: tool.description,
      status: tool.status,
      connectorType: tool.connectorType,
      authKind: tool.authKind,
      configSummary: tool.configSummary,
    })),
    triggers: safeRecord.triggers ?? [],
    channels: safeRecord.channels ?? [],
    workspaceMemory: {
      instructions: workspaceMemory.instructions ?? '',
      continuitySummary: workspaceMemory.continuity_summary ?? '',
      pinnedPaths: workspaceMemory.pinned_paths ?? [],
      updatedAt: workspaceMemory.updated_at ?? null,
    },
    creationSession: safeRecord.creation_session ?? null,
  };
}

function applyCustomerRuntimeInputValues(
  currentInputs: agentStore.AgentRuntimeInputRecord[],
  updates: Array<{ key: string; value: string }>,
) {
  const nextValueByKey = new Map(updates.map((entry) => [entry.key, entry.value]));
  for (const entry of updates) {
    const match = currentInputs.find((input) => input.key === entry.key);
    if (!match) {
      throw httpError(422, `Unknown runtime input key: ${entry.key}`);
    }
  }

  return currentInputs.map((input) => (
    nextValueByKey.has(input.key)
      ? { ...input, value: nextValueByKey.get(input.key) ?? '' }
      : input
  ));
}

app.get('/api/agents', requireAuth, asyncHandler(async (req, res) => {
  const activeOrgKind = await getActiveOrgKind(req);
  if (activeOrgKind === 'customer') {
    const customer = await requireActiveCustomerOrg(req.user);
    const agents = await agentStore.listAgentsForCreatorInOrg(
      req.user!.userId,
      customer.organization.id,
    );
    res.json(agents.map(redactAgentWebhookSecrets));
    return;
  }

  await requireBuilderContext(req);
  const agents = await agentStore.listAgentsForCreator(req.user!.userId);
  res.json(agents.map(redactAgentWebhookSecrets));
}));

app.post('/api/agents', requireAuth, asyncHandler(async (req, res) => {
  const builder = await requireBuilderContext(req);
  const body = validateAgentCreateBody(req.body);
  res.json(redactAgentWebhookSecrets(await agentStore.saveAgent({
    ...body,
    createdBy: req.user!.userId,
    orgId: builder.organization.id,
  })));
}));

app.get('/api/agents/:id', requireAuth, asyncHandler(async (req, res) => {
  res.json(redactAgentWebhookSecrets(await getReadableAgentRecord(req, req.params.id)));
}));

app.get('/api/agents/:id/customer-config', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getCustomerOwnedAgentRecord(req, req.params.id);
  res.json(buildCustomerAgentConfigResponse(agent));
}));

app.patch('/api/agents/:id/customer-config', requireAuth, asyncHandler(async (req, res) => {
  let agent = await getCustomerOwnedAgentRecord(req, req.params.id);
  const body = validateCustomerAgentConfigPatchBody(req.body);

  if (body.name !== undefined || body.description !== undefined) {
    agent = await agentStore.updateAgent(req.params.id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    }) ?? agent;
  }

  if (body.agentRules !== undefined || body.runtimeInputValues !== undefined) {
    const runtimeInputs = body.runtimeInputValues === undefined
      ? agent.runtime_inputs
      : applyCustomerRuntimeInputValues(
          agent.runtime_inputs ?? [],
          body.runtimeInputValues,
        );

    agent = await agentStore.updateAgentConfig(req.params.id, {
      ...(body.agentRules !== undefined ? { agentRules: body.agentRules } : {}),
      ...(body.runtimeInputValues !== undefined ? { runtimeInputs } : {}),
    }) ?? agent;
  }

  res.json(buildCustomerAgentConfigResponse(agent));
}));

app.post('/api/agents/:id/launch', requireAuth, asyncHandler(async (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);

  const customer = await requireActiveCustomerOrg(req.user);
  let agent = await agentStore.getAgentForCreatorInOrg(
    req.params.id,
    req.user!.userId,
    customer.organization.id,
  );
  if (!agent) {
    throw httpError(404, 'Agent not found');
  }

  // Validate that required user_required inputs have values
  const missingInputs = (agent.runtime_inputs ?? []).filter(
    (input: { required?: boolean; populationStrategy?: string; value?: string; defaultValue?: string }) =>
      input.required &&
      (input.populationStrategy ?? 'user_required') === 'user_required' &&
      !(input.value?.trim()) &&
      !(input.defaultValue?.trim()),
  );
  if (missingInputs.length > 0) {
    const keys = missingInputs.map((i: { key: string }) => i.key).join(', ');
    throw httpError(400, `Missing required configuration: ${keys}. Please complete setup first.`);
  }

  const activeSandbox = await resolveActiveSandboxForAgent(agent);
  if (activeSandbox) {
    const readySandbox = await ensureLaunchableSandboxRuntime(activeSandbox);
    if (!readySandbox) {
      throw httpError(
        503,
        'Existing sandbox is running but its gateway could not be repaired. Please restart the runtime.',
      );
    }
    res.json({
      launched: false,
      sandboxId: readySandbox.sandbox_id,
      agent: redactAgentWebhookSecrets(agent),
    });
    return;
  }

  const sandboxName = `customer-${normalizePathSegment(agent.name || 'agent').slice(0, 32)}-${agent.id.slice(0, 8)}`;
  const config = getConfig();
  let createdSandbox: Record<string, unknown> | null = null;

  for await (const [eventType, data] of createOpenclawSandbox({
    anthropicApiKey: config.anthropicApiKey ?? '',
    openaiApiKey: config.openaiApiKey ?? '',
    openrouterApiKey: config.openrouterApiKey ?? '',
    geminiApiKey: config.geminiApiKey ?? '',
    ollamaBaseUrl: config.ollamaBaseUrl ?? undefined,
    ollamaModel: config.ollamaModel,
    telegramBotToken: config.telegramBotToken ?? '',
    discordBotToken: config.discordBotToken ?? '',
    sandboxName,
  })) {
    if (eventType === 'result') {
      createdSandbox = data as Record<string, unknown>;
      await store.saveSandbox(createdSandbox, sandboxName);
    } else if (eventType === 'approved' && createdSandbox?.sandbox_id) {
      await store.markApproved(String(createdSandbox.sandbox_id));
    } else if (eventType === 'error') {
      throw httpError(502, String(data));
    }
  }

  if (!createdSandbox?.sandbox_id) {
    throw httpError(502, 'Sandbox provisioning did not return a sandbox id');
  }

  const sandboxId = String(createdSandbox.sandbox_id);
  await agentStore.addSandboxToAgent(agent.id, sandboxId);
  agent = await getCustomerOwnedAgentRecord(req, agent.id);

  const configureResult = await applyAgentConfiguration(
    req,
    sandboxId,
    buildConfigurePayloadFromAgent(agent),
  );
  if (!configureResult.ok) {
    throw httpError(
      configureResult.statusCode,
      configureResult.detail ?? 'Agent launch configuration failed',
    );
  }

  agent = await getCustomerOwnedAgentRecord(req, agent.id);
  res.json({
    launched: true,
    sandboxId,
    agent: redactAgentWebhookSecrets(agent),
    steps: configureResult.steps,
    ...(configureResult.webhooks ? { webhooks: configureResult.webhooks } : {}),
  });
}));

app.patch('/api/agents/:id', requireAuth, asyncHandler(async (req, res) => {
  const existing = await getOwnedAgentRecord(req, req.params.id);
  const body = validateAgentMetadataPatchBody(req.body);
  const updated = await agentStore.updateAgent(req.params.id, body);

  // Auto-snapshot a config version whenever the agent becomes active
  if (body.status === 'active' && existing.status !== 'active' && updated) {
    const snapshot = {
      skillGraph: updated.skill_graph,
      workflow: updated.workflow,
      agentRules: updated.agent_rules,
      runtimeInputs: updated.runtime_inputs,
      toolConnections: updated.tool_connections,
      triggers: updated.triggers,
      discoveryDocuments: updated.discovery_documents,
    };
    agentStore.createAgentConfigVersion(
      updated.id,
      snapshot,
      'Auto-snapshot on activation',
      req.user!.userId,
    ).catch(() => {});
  }

  res.json(updated ? redactAgentWebhookSecrets(updated) : updated);
}));

app.delete('/api/agents/:id', requireAuth, asyncHandler(async (req, res) => {
  // Read agent first to get sandbox_ids for cascade cleanup
  const agent = await getOwnedAgentRecord(req, req.params.id);

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

app.post('/api/agents/bulk-delete', requireAuth, asyncHandler(async (req, res) => {
  await requireBuilderContext(req);
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
      const agent = await agentStore.getAgentForCreator(agentId, req.user!.userId);
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

// ── Eval Results ────────────────────────────────────────────────────────────

app.post('/api/agents/:id/eval-results', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const body = req.body as Record<string, unknown>;
  const result = await evalResultStore.createEvalResult({
    agent_id: req.params.id,
    sandbox_id: (body.sandbox_id as string) ?? null,
    mode: (body.mode as string) ?? 'mock',
    tasks: Array.isArray(body.tasks) ? body.tasks : [],
    loop_state: body.loop_state ?? null,
    pass_rate: Number(body.pass_rate) || 0,
    avg_score: Number(body.avg_score) || 0,
    total_tasks: Number(body.total_tasks) || 0,
    passed_tasks: Number(body.passed_tasks) || 0,
    failed_tasks: Number(body.failed_tasks) || 0,
    iterations: Number(body.iterations) || 1,
    stop_reason: (body.stop_reason as string) ?? null,
  });
  res.status(201).json(result);
}));

app.get('/api/agents/:id/eval-results', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const results = await evalResultStore.listEvalResults(req.params.id, { limit, offset });
  res.json(results);
}));

app.get('/api/agents/:id/eval-results/:evalId', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const result = await evalResultStore.getEvalResult(req.params.evalId);
  if (!result || result.agent_id !== req.params.id) throw httpError(404, 'Eval result not found');
  res.json(result);
}));

app.delete('/api/agents/:id/eval-results/:evalId', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const deleted = await evalResultStore.deleteEvalResult(req.params.evalId);
  if (!deleted) throw httpError(404, 'Eval result not found');
  res.json({ deleted: req.params.evalId });
}));

// ── Clone / Fork Agent ────────────────────────────────────────────────────────

app.post('/api/agents/:id/clone', requireAuth, asyncHandler(async (req, res) => {
  const source = await getOwnedAgentRecord(req, req.params.id);
  const builder = await requireBuilderContext(req);

  const clone = await agentStore.saveAgent({
    name: `${source.name} (Copy)`,
    avatar: source.avatar,
    description: source.description,
    skills: source.skills,
    triggerLabel: source.trigger_label,
    status: 'draft',
    skillGraph: source.skill_graph,
    workflow: source.workflow,
    agentRules: source.agent_rules,
    runtimeInputs: source.runtime_inputs,
    toolConnections: source.tool_connections,
    triggers: source.triggers,
    discoveryDocuments: source.discovery_documents,
    createdBy: req.user!.userId,
    orgId: builder.organization.id,
  });

  await recordAuditEvent(req, {
    action_type: 'agent.clone',
    target_type: 'agent',
    target_id: clone.id,
    outcome: 'success',
    details: { source_agent_id: source.id },
  });

  res.status(201).json(redactAgentWebhookSecrets(clone));
}));

// ── Infer Runtime Input Values (AI auto-population) ─────────────────────────

async function inferInputValues(
  agentName: string,
  agentDescription: string,
  variables: Array<{ key: string; label: string; description: string; example?: string; options?: string[] }>,
): Promise<Record<string, string>> {
  const config = getConfig();

  if (!variables?.length) return {};

  const apiKey = config.openrouterApiKey || config.anthropicApiKey || config.openaiApiKey;
  if (!apiKey) return {};

  const variablesList = variables
    .map((v) => `- ${v.key} (${v.label}): ${v.description}${v.example ? ` Example: ${v.example}` : ''}${v.options?.length ? ` Options: ${v.options.join(', ')}` : ''}`)
    .join('\n');

  const prompt = `Given this AI agent:
- Name: ${agentName}
- Description: ${agentDescription || 'No description'}

Suggest realistic, sensible values for these configuration variables. These are NOT secrets — they are behavioral settings, preferences, and metadata that can be inferred from the agent's purpose.

Variables:
${variablesList}

Respond with ONLY a JSON object mapping variable keys to suggested values. No explanation, no markdown fences.
Example: {"TIMEZONE": "America/New_York", "COMPANY_NAME": "Acme Corp"}`;

  let values: Record<string, string> = {};

  if (config.openrouterApiKey) {
    const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'anthropic/claude-haiku',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    }, {
      headers: {
        'Authorization': `Bearer ${config.openrouterApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    const text = resp.data?.choices?.[0]?.message?.content ?? '{}';
    values = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
  } else if (config.anthropicApiKey) {
    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }, {
      headers: {
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    const text = resp.data?.content?.[0]?.text ?? '{}';
    values = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
  } else if (config.openaiApiKey) {
    const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    }, {
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    const text = resp.data?.choices?.[0]?.message?.content ?? '{}';
    values = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
  }

  // Only return values for keys that were requested
  const filtered: Record<string, string> = {};
  for (const v of variables) {
    if (values[v.key] !== undefined) {
      filtered[v.key] = String(values[v.key]);
    }
  }
  return filtered;
}

// Per-agent route (setup page — agent already exists)
app.post('/api/agents/:id/infer-inputs', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);

  const { variables } = req.body as {
    variables: Array<{ key: string; label: string; description: string; example?: string; options?: string[] }>;
  };

  try {
    const values = await inferInputValues(agent.name, agent.description ?? '', variables ?? []);
    res.json({ values });
  } catch (err) {
    appLogger.warn(`infer-inputs LLM call failed: ${(err as Error).message}`);
    res.json({ values: {} });
  }
}));

// Generic route (creation flow — agent not yet saved)
app.post('/api/infer-inputs', requireAuth, asyncHandler(async (req, res) => {
  const { agentName, agentDescription, variables } = req.body as {
    agentName: string;
    agentDescription: string;
    variables: Array<{ key: string; label: string; description: string; example?: string; options?: string[] }>;
  };

  if (!agentName) {
    res.status(400).json({ error: 'agentName is required' });
    return;
  }

  try {
    const values = await inferInputValues(agentName, agentDescription ?? '', variables ?? []);
    res.json({ values });
  } catch (err) {
    appLogger.warn(`infer-inputs LLM call failed: ${(err as Error).message}`);
    res.json({ values: {} });
  }
}));

// ── Agent Config Versioning ───────────────────────────────────────────────────

app.post('/api/agents/:id/versions', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  const message = typeof req.body?.message === 'string' ? req.body.message : undefined;

  const snapshot = {
    skillGraph: agent.skill_graph,
    workflow: agent.workflow,
    agentRules: agent.agent_rules,
    runtimeInputs: agent.runtime_inputs,
    toolConnections: agent.tool_connections,
    triggers: agent.triggers,
    discoveryDocuments: agent.discovery_documents,
  };

  const version = await agentStore.createAgentConfigVersion(
    agent.id,
    snapshot,
    message,
    req.user!.userId,
  );
  res.status(201).json(version);
}));

app.get('/api/agents/:id/versions', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const versions = await agentStore.listAgentConfigVersions(req.params.id, limit);
  res.json(versions);
}));

app.get('/api/agents/:id/versions/:version', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const versionNumber = parseInt(req.params.version, 10);
  if (isNaN(versionNumber) || versionNumber < 1) throw httpError(400, 'version must be a positive integer');
  const version = await agentStore.getAgentConfigVersion(req.params.id, versionNumber);
  if (!version) throw httpError(404, 'Version not found');
  res.json(version);
}));

app.post('/api/agents/:id/versions/:version/rollback', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const versionNumber = parseInt(req.params.version, 10);
  if (isNaN(versionNumber) || versionNumber < 1) throw httpError(400, 'version must be a positive integer');

  const updated = await agentStore.rollbackAgentToConfigVersion(req.params.id, versionNumber);
  if (!updated) throw httpError(404, 'Version not found');

  await recordAuditEvent(req, {
    action_type: 'agent.config.rollback',
    target_type: 'agent',
    target_id: req.params.id,
    outcome: 'success',
    details: { version_number: versionNumber },
  });

  res.json(redactAgentWebhookSecrets(updated));
}));

// ── Agent Monitoring ──────────────────────────────────────────────────────────

app.get('/api/agents/:id/metrics', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const agentId = req.params.id;

  const metrics = await withConn(async (client) => {
    const [totalConvsRes, totalMsgsRes, errorsRes, lastActiveRes, toolUsageRes] =
      await Promise.all([
        client.query(
          `SELECT COUNT(DISTINCT details->>'conversation_id') AS count
           FROM control_plane_audit_events
           WHERE target_id = $1 AND action_type = 'sandbox.chat'`,
          [agentId],
        ),
        client.query(
          `SELECT COUNT(*) AS count
           FROM control_plane_audit_events
           WHERE target_id = $1 AND action_type = 'sandbox.chat'`,
          [agentId],
        ),
        client.query(
          `SELECT COUNT(*) AS count
           FROM control_plane_audit_events
           WHERE target_id = $1
             AND outcome = 'failure'
             AND occurred_at >= NOW() - INTERVAL '24 hours'`,
          [agentId],
        ),
        client.query(
          `SELECT MAX(occurred_at) AS last_active
           FROM control_plane_audit_events
           WHERE target_id = $1`,
          [agentId],
        ),
        client.query(
          `SELECT details->>'tool_name' AS tool_name, COUNT(*) AS count
           FROM control_plane_audit_events
           WHERE target_id = $1
             AND action_type = 'sandbox.tool_call'
             AND details->>'tool_name' IS NOT NULL
           GROUP BY details->>'tool_name'
           ORDER BY count DESC`,
          [agentId],
        ),
      ]);

    const toolUsage: Record<string, number> = {};
    for (const row of toolUsageRes.rows) {
      toolUsage[String(row.tool_name)] = Number(row.count);
    }

    return {
      total_conversations: Number(totalConvsRes.rows[0]?.count ?? 0),
      total_messages: Number(totalMsgsRes.rows[0]?.count ?? 0),
      errors_last_24h: Number(errorsRes.rows[0]?.count ?? 0),
      last_active: lastActiveRes.rows[0]?.last_active instanceof Date
        ? lastActiveRes.rows[0].last_active.toISOString()
        : (lastActiveRes.rows[0]?.last_active ?? null),
      tool_usage: toolUsage,
    };
  });

  res.json(metrics);
}));

app.get('/api/agents/:id/activity', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const agentId = req.params.id;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

  const events = await withConn(async (client) => {
    const res = await client.query(
      `SELECT event_id, occurred_at, action_type, outcome, details
       FROM control_plane_audit_events
       WHERE target_id = $1
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [agentId, limit],
    );
    return res.rows;
  });

  const activity = events.map((row: Record<string, unknown>) => {
    const details = (row.details && typeof row.details === 'object') ? row.details as Record<string, unknown> : {};
    const actionType = String(row.action_type);
    const outcome = String(row.outcome);

    let type = actionType;
    let summary = actionType;
    if (actionType === 'sandbox.chat') {
      type = outcome === 'failure' ? 'error' : 'message';
      summary = outcome === 'failure' ? 'Chat error' : 'Conversation message';
    } else if (actionType === 'sandbox.tool_call') {
      type = 'tool_call';
      summary = details.tool_name ? `Tool: ${details.tool_name}` : 'Tool call';
    } else if (actionType === 'agent.deploy') {
      type = 'deploy';
      summary = 'Agent deployed';
    } else if (actionType === 'agent.clone') {
      type = 'clone';
      summary = 'Agent cloned';
    }

    return {
      id: String(row.event_id),
      type,
      timestamp: row.occurred_at instanceof Date
        ? (row.occurred_at as Date).toISOString()
        : String(row.occurred_at),
      summary,
      details,
    };
  });

  res.json(activity);
}));

app.post('/api/agents/:id/sandbox', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const { sandbox_id } = validateAgentSandboxAttachBody(req.body);
  const updated = await agentStore.addSandboxToAgent(req.params.id, sandbox_id);
  res.json(updated ? redactAgentWebhookSecrets(updated) : updated);
}));

app.delete('/api/agents/:id/sandbox/:sandbox_id', requireAuth, asyncHandler(async (req, res) => {
  const { id: agentId, sandbox_id: sandboxId } = req.params;
  const agent = await getOwnedAgentRecord(req, agentId);
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
app.post('/api/agents/create', requireAuth, asyncHandler(async (req, res) => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw httpError(400, 'name is required');
  }

  const span = startAgentSpan('agent.create', { 'agent.name': name.trim() });
  try {
    // 1. Create the agent record with "forging" status — shown as "In the Forge" in agents list
    const builder = await requireBuilderContext(req);
    const agent = await agentStore.saveAgent({
      name: name.trim(),
      description: description ? String(description).trim() : '',
      status: 'forging',
      createdBy: req.user!.userId,
      orgId: builder.organization.id,
    });
    // Track the creation lifecycle — starts at "think"
    await agentStore.updateAgent(agent.id, { forge_stage: 'think' });

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
app.post('/api/agents/:id/forge', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);

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
app.get('/api/agents/:id/forge/stream/:stream_id', requireAuth, asyncHandler(async (req, res) => {
  const { id: agentId, stream_id } = req.params;
  await getOwnedAgentRecord(req, agentId);

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
        if (!entry.result?.['sandbox_id']) {
          sendEvent('error', { message: 'Cannot approve: forge result is missing or has no sandbox_id' });
          break;
        }
        await store.markApproved(entry.result['sandbox_id'] as string);
        entry.status = 'done';
        await recordSystemEvent(req, {
          level: 'info',
          category: 'sandbox.lifecycle',
          action: 'agent.forge.approved',
          status: 'success',
          message: `Forge sandbox ${String(entry.result['sandbox_id'])} device approval succeeded`,
          sandbox_id: String(entry.result['sandbox_id']),
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

            // Run agent setup if requested (v3 marketplace install flow)
            if (entry.request.run_agent_setup) {
              sendEvent('log', { message: 'Running agent setup from .openclaw/setup.json...' });
              try {
                const { runAgentSetup } = await import('./agentSetup');
                const setupResult = await runAgentSetup(sandboxIdStr, (msg) => {
                  sendEvent('log', { message: msg });
                });
                if (setupResult.ok) {
                  sendEvent('log', { message: 'Agent setup complete — all services running.' });
                } else {
                  sendEvent('log', { message: 'Agent setup completed with issues.' });
                }
              } catch (setupErr) {
                sendEvent('log', { message: `Agent setup error: ${setupErr instanceof Error ? setupErr.message : String(setupErr)}` });
              }
            }

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

        // Inject backend URL + agent ID so the Architect can sync skills back
        if (sandboxIdStr) {
          const backendPort = getConfig().port ?? 8000;
          const backendUrl = `http://host.docker.internal:${backendPort}`;
          const forgeCName = getContainerName(sandboxIdStr);
          await dockerExec(
            forgeCName,
            `echo 'export RUH_BACKEND_URL="${backendUrl}"\nexport RUH_AGENT_ID="${agentId}"' >> /root/.bashrc`,
            10_000,
          ).catch(() => {});
          // Also write a convenience script the Architect can call
          await dockerExec(
            forgeCName,
            buildHomeFileWriteCommand('.openclaw/sync-skills.sh',
              `#!/bin/bash\ncurl -sf -X POST "$RUH_BACKEND_URL/api/agents/$RUH_AGENT_ID/forge/sync-workspace" -H "Content-Type: application/json" && echo "\\nSkills synced to backend." || echo "\\nSync failed."`),
            10_000,
          ).catch(() => {});
          await dockerExec(forgeCName, 'chmod +x /root/.openclaw/sync-skills.sh', 5_000).catch(() => {});
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
app.get('/api/agents/:id/forge', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
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

app.get('/api/agents/:id/forge/status', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  if (!agent.forge_sandbox_id) {
    res.json({ active: false, status: 'none', reason: 'No forge sandbox provisioned' });
    return;
  }

  const record = await store.getSandbox(agent.forge_sandbox_id).catch(() => null);
  if (!record) {
    res.json({ active: false, status: 'missing', reason: 'Forge sandbox record not found' });
    return;
  }

  const containerName = getContainerName(agent.forge_sandbox_id);
  const running = await dockerContainerRunning(containerName).catch(() => false);

  // Reconcile: if forge_stage is "complete" (Ship finished) but agent status
  // is still "forging", promote to "active". This handles the case where the
  // frontend completed Ship but the status update failed or browser closed.
  // We ONLY promote when forge_stage explicitly says "complete" — never guess
  // from file existence, because that skips review/test/ship stages.
  let reconciled = false;
  if (agent.status === 'forging' && agent.forge_stage === 'complete') {
    await agentStore.updateAgent(req.params.id, { status: 'active' });
    reconciled = true;
  }

  res.json({
    active: running,
    status: running ? 'ready' : 'stopped',
    forge_sandbox_id: agent.forge_sandbox_id,
    forge_stage: agent.forge_stage,
    vnc_port: record.vnc_port ?? null,
    gateway_port: record.gateway_port,
    standard_url: record.standard_url,
    reconciled,
    agent_status: reconciled ? 'active' : agent.status,
  });
}));

/**
 * Update the agent's forge stage. Called by the frontend on each lifecycle
 * stage transition so the backend always knows where the creation process is.
 * This is the source of truth for resuming interrupted builds.
 */
const VALID_FORGE_STAGES = ['think', 'plan', 'build', 'review', 'test', 'ship', 'complete'];
app.patch('/api/agents/:id/forge/stage', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  const { stage } = req.body;

  if (!stage || !VALID_FORGE_STAGES.includes(stage)) {
    throw httpError(400, `Invalid stage: ${stage}. Must be one of: ${VALID_FORGE_STAGES.join(', ')}`);
  }

  // When stage reaches "complete", also promote status to "active"
  const statusUpdate = stage === 'complete' ? { status: 'active' as const, forge_stage: stage as agentStore.AgentForgeStage } : { forge_stage: stage as agentStore.AgentForgeStage };
  await agentStore.updateAgent(req.params.id, statusUpdate);

  // Auto-commit at stage transitions (Agent-as-Code)
  const STAGE_COMMITS: Record<string, string> = {
    plan: 'think: complete requirements discovery',
    build: 'plan: lock architecture',
    review: 'build: generate skills and configuration',
    test: 'review: configuration validated',
    ship: 'test: evaluation complete',
  };
  if (STAGE_COMMITS[stage] && agent.forge_sandbox_id) {
    try {
      const gw = await import('./gitWorkspace');
      const result = await gw.commitWorkspace(agent.forge_sandbox_id, `${STAGE_COMMITS[stage]} — ${agent.name}`);
      if (result.sha && agent.repo_url) {
        await gw.pushBranch(agent.forge_sandbox_id, agent.active_branch || 'main').catch(() => {});
      }
    } catch { /* non-blocking */ }
  }

  res.json({ id: agent.id, forge_stage: stage, status: stage === 'complete' ? 'active' : agent.status });
}));

/**
 * Delete the agent's forge: stops and removes the Docker container,
 * cleans up the sandbox record, and deletes the agent itself.
 * This is a full discard — the agent and all its work are gone.
 */
app.delete('/api/agents/:id/forge', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
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
app.patch('/api/agents/:id/mode', requireAuth, asyncHandler(async (req, res) => {
  const { mode } = req.body as { mode?: string };
  if (mode !== 'building' && mode !== 'live') {
    throw httpError(400, 'mode must be "building" or "live"');
  }

  const agent = await getOwnedAgentRecord(req, req.params.id);
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
app.post('/api/agents/:id/forge/promote', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
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

// scaffold-skills endpoint removed — the architect now writes SKILL.md files
// directly via tool execution through the WebSocket gateway. See Phase 2 of
// the event architecture plan.

/**
 * Sync workspace skills from the forge sandbox back to the agent record.
 *
 * Reads skill directories from the container's workspace, parses SKILL.md
 * frontmatter, and updates the agent's skill_graph + skills in the DB.
 *
 * This can be called by the Architect from inside the container via:
 *   curl -s -X POST $RUH_BACKEND_URL/api/agents/$RUH_AGENT_ID/forge/sync-workspace
 *
 * Or by the frontend as a fallback.
 */
app.post('/api/agents/:id/forge/sync-workspace', asyncHandler(async (req, res) => {
  const agent = await getAgentRecord(req.params.id);
  const sandboxId = agent.forge_sandbox_id;
  if (!sandboxId) {
    throw httpError(400, 'Agent has no forge sandbox');
  }

  const containerName = getContainerName(sandboxId);

  // 1. List skill directories in the workspace
  const [lsOk, lsOut] = await dockerExec(
    containerName,
    'ls -1 ~/.openclaw/workspace/skills/ 2>/dev/null || echo ""',
    15_000,
  );
  if (!lsOk || !lsOut.trim()) {
    res.json({ synced: 0, skills: [], message: 'No skills found in workspace' });
    return;
  }

  const skillDirs = lsOut.trim().split('\n').filter(Boolean);
  const nodes: Array<{ skill_id: string; name: string; description: string; skill_md: string }> = [];

  // 2. Read each SKILL.md and parse frontmatter
  for (const dir of skillDirs) {
    const safeName = normalizePathSegment(dir);
    const [readOk, content] = await dockerExec(
      containerName,
      `cat ~/.openclaw/workspace/skills/${safeName}/SKILL.md 2>/dev/null || echo ""`,
      10_000,
    ).catch(() => [false, ''] as [boolean, string]);
    if (!readOk || !content.trim()) continue;

    // Parse YAML frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = fmMatch?.[1] ?? '';
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*"?(.+?)"?\s*$/m);

    nodes.push({
      skill_id: safeName,
      name: nameMatch?.[1]?.trim() ?? safeName,
      description: descMatch?.[1]?.trim() ?? '',
      skill_md: content,
    });
  }

  if (nodes.length === 0) {
    res.json({ synced: 0, skills: [], message: 'No valid SKILL.md files found' });
    return;
  }

  // 3. Read workflow.json if present
  const [wfOk, wfOut] = await dockerExec(
    containerName,
    'cat ~/.openclaw/workspace/.openclaw/workflow.json 2>/dev/null || echo ""',
    10_000,
  ).catch(() => [false, ''] as [boolean, string]);
  let workflow: unknown = undefined;
  if (wfOk && wfOut.trim()) {
    try { workflow = JSON.parse(wfOut.trim()); } catch { /* skip */ }
  }

  // 4. Update agent record: skill_graph + skills array
  const skillNames = nodes.map((n) => n.name);
  await agentStore.updateAgentConfig(req.params.id, {
    skillGraph: nodes,
    ...(workflow ? { workflow } : {}),
  });
  await agentStore.updateAgent(req.params.id, {
    skills: skillNames,
    description: agent.description || `Runs ${nodes.length} skills: ${skillNames.join(', ')}`,
  });

  console.info(`[sync-workspace] Agent ${req.params.id}: synced ${nodes.length} skills from forge sandbox`);
  res.json({ synced: nodes.length, skills: skillNames });
}));

/**
 * Reproduce an agent from a GitHub repo template.
 * Creates a new agent + spins up a container + clones the repo workspace.
 * Returns { agent_id, stream_id } — stream SSE for progress.
 */
app.post('/api/agents/reproduce', requireAuth, asyncHandler(async (req, res) => {
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
    const builder = await requireBuilderContext(req);
    const agent = await agentStore.saveAgent({
      name: name.trim(),
      description: description?.trim() ?? `Reproduced from ${repo_url}`,
      status: 'draft',
      createdBy: req.user!.userId,
      orgId: builder.organization.id,
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

app.patch('/api/agents/:id/config', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const body = validateAgentConfigPatchBody(req.body);
  const updated = await agentStore.updateAgentConfig(req.params.id, body);
  res.json(updated ? redactAgentWebhookSecrets(updated) : updated);
}));

app.get('/api/agents/:id/workspace-memory', requireAuth, asyncHandler(async (req, res) => {
  await getReadableAgentRecord(req, req.params.id);
  const memory = await agentStore.getAgentWorkspaceMemory(req.params.id);
  res.json(memory);
}));

app.patch('/api/agents/:id/workspace-memory', requireAuth, asyncHandler(async (req, res) => {
  await getReadableAgentRecord(req, req.params.id);
  const body = validateAgentWorkspaceMemoryPatchBody(req.body);
  const updated = await agentStore.updateAgentWorkspaceMemory(req.params.id, body);
  res.json(updated);
}));

// ── Agent credentials ─────────────────────────────────────────────────────────

app.get('/api/agents/:id/credentials', requireAuth, asyncHandler(async (req, res, _next) => {
  await getOwnedAgentRecord(req, req.params.id);
  const summary = await agentStore.getAgentCredentialSummary(req.params.id);
  res.json(summary);
}));

app.put('/api/agents/:id/credentials/:toolId', requireAuth, asyncHandler(async (req, res, _next) => {
  await getOwnedAgentRecord(req, req.params.id);

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

app.delete('/api/agents/:id/credentials/:toolId', requireAuth, asyncHandler(async (req, res, _next) => {
  await getOwnedAgentRecord(req, req.params.id);

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

  // Runtime inputs are end-user configuration collected at first chat, not
  // developer build-time requirements. Developers ship agents to the
  // marketplace without filling them in — end users provide values when
  // they start using the agent. Log missing inputs as warnings, not errors.
  const missingRuntimeInputs = (runtime_inputs ?? []).filter(
    (input) => input.required && String(input.value ?? '').trim().length === 0,
  );
  for (const input of missingRuntimeInputs) {
    pushStep({
      kind: 'runtime_env',
      target: input.key,
      ok: true,
      message: `Runtime input "${input.key}" not set — will be collected from end user at first chat`,
    });
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
        value: String(input.value ?? '').trim() || String((input as Record<string, unknown>).defaultValue ?? ''),
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
  const [url, headers] = gatewayUrlAndHeaders(record, '/health');
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

app.get('/api/admin/sandboxes/reconcile', optionalAuth, asyncHandler(async (req, res) => {
  requireAdminAccess(req);
  const runtime = await loadAdminRuntimeData();
  res.json({
    summary: runtime.summary,
    items: runtime.items,
  });
}));

app.post('/api/admin/sandboxes/:sandbox_id/reconcile/repair', optionalAuth, asyncHandler(async (req, res) => {
  const actor = requireAdminAccess(req);
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
  }, actor);

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

app.post('/api/admin/sandboxes/:sandbox_id/retrofit-shared-codex', optionalAuth, asyncHandler(async (req, res) => {
  const actor = requireAdminAccess(req);

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
  }, actor);
  res.json(result);
}));

app.post('/api/admin/sandboxes/:sandbox_id/restart', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { sandbox_id } = req.params;
  await getRecord(sandbox_id);
  const containerName = getContainerName(sandbox_id);

  const running = await dockerContainerRunning(containerName).catch(() => false);
  if (!running) {
    const [startCode] = await dockerSpawn(['start', containerName], 30_000);
    if (startCode !== 0) {
      throw httpError(
        409,
        'Container does not exist or cannot be started. Please redeploy this agent.',
      );
    }
  }

  await restartGateway(containerName);

  await recordAuditEvent(req, {
    action_type: 'sandbox.restart',
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: { restarted: true, initiated_from: 'admin_panel' },
  });
  res.json({ restarted: true, sandbox_id });
}));

app.post('/api/admin/sandboxes/:sandbox_id/gateway/restart', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { sandbox_id } = req.params;
  await getRecord(sandbox_id);
  const containerName = getContainerName(sandbox_id);
  const running = await dockerContainerRunning(containerName).catch(() => false);

  if (!running) {
    throw httpError(409, 'Container is not running. Restart the sandbox before restarting its gateway.');
  }

  await restartGateway(containerName);
  await recordAuditEvent(req, {
    action_type: 'sandbox.gateway_restart',
    target_type: 'sandbox',
    target_id: sandbox_id,
    outcome: 'success',
    details: { restarted: true, initiated_from: 'admin_panel' },
  });
  res.json({ restarted: true, sandbox_id, gateway: true });
}));

app.get('/api/admin/audit-events', optionalAuth, asyncHandler(async (req, res) => {
  requireAdminAccess(req);
  const limit = Math.min(parsePositiveIntParam(req.query.limit, 50, 'audit-event limit'), 100);
  const result = await auditStore.listAuditEvents({
    action_type: req.query.action_type == null ? undefined : String(req.query.action_type),
    target_type: req.query.target_type == null ? undefined : String(req.query.target_type),
    target_id: req.query.target_id == null ? undefined : String(req.query.target_id),
    actor_type: req.query.actor_type == null ? undefined : String(req.query.actor_type),
    actor_id: req.query.actor_id == null ? undefined : String(req.query.actor_id),
    request_id: req.query.request_id == null ? undefined : String(req.query.request_id),
    outcome: req.query.outcome == null ? undefined : String(req.query.outcome),
    limit,
  });
  res.json(result);
}));

// ── JWT-authenticated admin panel routes ──────────────────────────────────────

app.get('/api/admin/stats', requireAuth, requireRole('admin'), asyncHandler(async (_req, res) => {
  const overview = await loadAdminOverview();
  res.json({
    totalUsers: overview.users.total,
    totalAgents: overview.agents.total,
    activeSandboxes: overview.runtime.summary.healthy,
    marketplaceListings: overview.marketplace.summary.totalListings,
  });
}));

app.get('/api/admin/overview', requireAuth, requireRole('admin'), asyncHandler(async (_req, res) => {
  const overview = await loadAdminOverview();
  res.json(overview);
}));

const ADMIN_BILLING_STATUS_VALUES: billingStore.BillingStatus[] = [
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
];
const ADMIN_BILLING_STATUSES = new Set<string>(ADMIN_BILLING_STATUS_VALUES);

const ADMIN_ENTITLEMENT_STATUS_VALUES: billingStore.EntitlementStatus[] = [
  'active',
  'grace_period',
  'suspended',
  'revoked',
  'override_active',
];
const ADMIN_ENTITLEMENT_STATUSES = new Set<string>(ADMIN_ENTITLEMENT_STATUS_VALUES);

const ADMIN_OVERRIDE_KINDS = new Set([
  'temporary_access',
  'manual_resume',
  'manual_suspend',
  'credit_hold',
  'seat_comp',
]);

const BILLING_RISK_ORDER: Record<'high' | 'medium' | 'low', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function hasOwnKey(value: unknown, key: string): boolean {
  return Boolean(value) && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);
}

function parseOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseRequiredTrimmedString(field: string, value: unknown): string {
  const parsed = parseOptionalTrimmedString(value);
  if (!parsed) throw httpError(400, `${field} is required`);
  return parsed;
}

function parseOptionalIsoTimestamp(field: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw httpError(400, `${field} must be a valid ISO timestamp`);
  }
  return parsed.toISOString();
}

function parseOptionalInteger(field: string, value: unknown, options: { min?: number } = {}): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw httpError(400, `${field} must be an integer`);
  }
  const min = options.min ?? 0;
  if (parsed < min) {
    throw httpError(400, `${field} must be at least ${min}`);
  }
  return parsed;
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw httpError(400, 'Boolean field must be true or false');
}

function getAdminActorUserId(req: Request): string | null {
  const actor = (req as Request & { user?: { id?: string } }).user;
  return actor?.id ? String(actor.id) : null;
}

function resolveBillingRiskLevel(attention: Array<{ severity: 'high' | 'medium' | 'low' }>): 'high' | 'medium' | 'low' {
  if (attention.some((item) => item.severity === 'high')) return 'high';
  if (attention.some((item) => item.severity === 'medium')) return 'medium';
  return 'low';
}

async function loadMarketplaceListingMeta(listingIds: string[]) {
  const uniqueIds = Array.from(new Set(listingIds.filter(Boolean)));
  if (!uniqueIds.length) {
    return new Map<string, { title: string; slug: string; status: string }>();
  }

  const result = await withConn(async (client) => client.query(
    `
    SELECT id, title, slug, status
    FROM marketplace_listings
    WHERE id = ANY($1::uuid[])
    `,
    [uniqueIds],
  ));

  return new Map<string, { title: string; slug: string; status: string }>(
    result.rows.map((row) => [
      String(row.id),
      {
        title: String(row.title),
        slug: String(row.slug),
        status: String(row.status),
      },
    ]),
  );
}

async function getAdminBillingEntitlementOrThrow(orgId: string, entitlementId: string) {
  const organization = await orgStore.getOrg(orgId);
  if (!organization) throw httpError(404, 'Organization not found');

  const summary = await billingStore.listOrgBillingSummary(orgId);
  const entitlement = summary.entitlements.find((item) => item.id === entitlementId) ?? null;
  if (!entitlement) throw httpError(404, 'Entitlement not found');

  return { organization, summary, entitlement };
}

async function loadAdminOrganizationBillingDetail(orgId: string) {
  const organization = await orgStore.getOrg(orgId);
  if (!organization) return null;

  const summary = await billingStore.listOrgBillingSummary(orgId);
  const listingMeta = await loadMarketplaceListingMeta([
    ...summary.entitlements.map((item) => item.listingId).filter(Boolean) as string[],
    ...summary.subscriptions.map((item) => item.listingId).filter(Boolean) as string[],
  ]);

  const overridesByEntitlement = new Map<string, billingStore.OrgEntitlementOverrideRecord[]>();
  for (const override of summary.overrides) {
    const existing = overridesByEntitlement.get(override.entitlementId) ?? [];
    existing.push(override);
    overridesByEntitlement.set(override.entitlementId, existing);
  }

  const subscriptionsByEntitlementId = new Map<string, billingStore.BillingSubscriptionRecord>();
  for (const subscription of summary.subscriptions) {
    if (subscription.entitlementId) {
      subscriptionsByEntitlementId.set(subscription.entitlementId, subscription);
    }
  }

  const entitlements = summary.entitlements.map((entitlement) => {
    const overrides = overridesByEntitlement.get(entitlement.id) ?? [];
    const access = resolveEntitlementAccess({
      billingStatus: entitlement.billingStatus,
      entitlementStatus: entitlement.entitlementStatus,
      graceEndsAt: entitlement.graceEndsAt,
      overrides,
    });
    const listing = entitlement.listingId ? listingMeta.get(entitlement.listingId) : null;
    const linkedSubscription = subscriptionsByEntitlementId.get(entitlement.id)
      ?? (entitlement.billingSubscriptionId
        ? summary.subscriptions.find((item) => item.id === entitlement.billingSubscriptionId) ?? null
        : null);

    return {
      ...entitlement,
      listingTitle: listing?.title ?? null,
      listingSlug: listing?.slug ?? null,
      listingStatus: listing?.status ?? null,
      access,
      overrides,
      subscription: linkedSubscription,
    };
  });

  const now = Date.now();
  const invoices = summary.invoices.map((invoice) => ({
    ...invoice,
    isPastDue:
      Boolean(invoice.dueAt)
      && new Date(String(invoice.dueAt)).getTime() < now
      && invoice.amountRemaining > 0
      && invoice.status !== 'paid',
  }));

  const subscriptions = summary.subscriptions.map((subscription) => {
    const listing = subscription.listingId ? listingMeta.get(subscription.listingId) : null;
    return {
      ...subscription,
      listingTitle: listing?.title ?? null,
      listingSlug: listing?.slug ?? null,
      listingStatus: listing?.status ?? null,
    };
  });

  const blockedEntitlements = entitlements.filter((item) => !item.access.canAccess);
  const pastDueEntitlements = entitlements.filter(
    (item) => item.billingStatus === 'past_due' || item.billingStatus === 'unpaid',
  );
  const overrideActiveEntitlements = entitlements.filter((item) => item.access.overrideActive);
  const overCapacityEntitlements = entitlements.filter((item) => item.seatInUse > item.seatCapacity);
  const overdueInvoices = invoices.filter((item) => item.isPastDue);
  const payableInvoices = invoices.filter((item) => item.amountRemaining > 0);

  const attention: Array<{
    id: string;
    severity: 'high' | 'medium' | 'low';
    title: string;
    detail: string;
  }> = [];

  if (!summary.customer && organization.kind === 'customer') {
    attention.push({
      id: 'missing-customer',
      severity: 'medium',
      title: 'Billing customer not linked',
      detail: 'This organization has no billing customer record yet, so Stripe state cannot be mirrored or reconciled.',
    });
  }

  if (!entitlements.length && organization.kind === 'customer') {
    attention.push({
      id: 'missing-entitlement',
      severity: 'low',
      title: 'No entitlements configured',
      detail: 'No org entitlement exists yet. Customer access and seat governance will stay undefined until at least one entitlement is attached.',
    });
  }

  if (blockedEntitlements.length) {
    attention.push({
      id: 'blocked-access',
      severity: 'high',
      title: 'Customer access is currently blocked',
      detail: `${blockedEntitlements.length} entitlement${blockedEntitlements.length === 1 ? '' : 's'} cannot access the product right now.`,
    });
  }

  if (pastDueEntitlements.length) {
    attention.push({
      id: 'past-due',
      severity: 'high',
      title: 'Past-due billing requires intervention',
      detail: `${pastDueEntitlements.length} entitlement${pastDueEntitlements.length === 1 ? '' : 's'} are in past_due or unpaid billing state.`,
    });
  }

  if (overCapacityEntitlements.length) {
    attention.push({
      id: 'seat-overage',
      severity: 'medium',
      title: 'Seat usage exceeds purchased capacity',
      detail: `${overCapacityEntitlements.length} entitlement${overCapacityEntitlements.length === 1 ? '' : 's'} are over their recorded seat limit.`,
    });
  }

  if (overdueInvoices.length) {
    attention.push({
      id: 'overdue-invoices',
      severity: 'high',
      title: 'Invoices are overdue',
      detail: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? '' : 's'} are past due with a remaining balance.`,
    });
  }

  const totalSeatCapacity = entitlements.reduce((sum, item) => sum + item.seatCapacity, 0);
  const totalSeatInUse = entitlements.reduce((sum, item) => sum + item.seatInUse, 0);
  const totalAmountDue = payableInvoices.reduce((sum, item) => sum + item.amountRemaining, 0);

  return {
    organization,
    customer: summary.customer,
    subscriptions,
    invoices,
    entitlements,
    overrides: summary.overrides.slice(0, 25),
    events: summary.events.slice(0, 25),
    attention,
    summary: {
      activeEntitlements: entitlements.filter((item) => item.access.canAccess).length,
      blockedEntitlements: blockedEntitlements.length,
      pastDueEntitlements: pastDueEntitlements.length,
      overrideActiveEntitlements: overrideActiveEntitlements.length,
      seatCapacity: totalSeatCapacity,
      seatInUse: totalSeatInUse,
      payableInvoices: payableInvoices.length,
      amountDue: totalAmountDue,
    },
  };
}

async function loadAdminBillingOps(filters: {
  search?: string;
  status?: string;
  risk?: string;
}) {
  const organizations = await listAdminOrganizationSummaries({
    kind: 'customer',
    status: filters.status,
    search: filters.search,
  });

  const details = (await Promise.all(
    organizations.map((organization) => loadAdminOrganizationBillingDetail(organization.id)),
  )).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof loadAdminOrganizationBillingDetail>>>[];

  let items = details.map((detail) => ({
    orgId: detail.organization.id,
    orgName: detail.organization.name,
    orgSlug: detail.organization.slug,
    orgStatus: detail.organization.status,
    plan: detail.organization.plan,
    customerLinked: Boolean(detail.customer),
    activeEntitlements: detail.summary.activeEntitlements,
    blockedEntitlements: detail.summary.blockedEntitlements,
    pastDueEntitlements: detail.summary.pastDueEntitlements,
    overrideActiveEntitlements: detail.summary.overrideActiveEntitlements,
    payableInvoices: detail.summary.payableInvoices,
    amountDue: detail.summary.amountDue,
    seatCapacity: detail.summary.seatCapacity,
    seatInUse: detail.summary.seatInUse,
    risk: resolveBillingRiskLevel(detail.attention),
    signals: detail.attention.map((item) => item.title),
    lastEventAt: detail.events[0]?.createdAt ?? null,
  }));

  if (filters.risk && ['high', 'medium', 'low'].includes(filters.risk)) {
    items = items.filter((item) => item.risk === filters.risk);
  }

  items.sort((left, right) => {
    const riskDiff = BILLING_RISK_ORDER[left.risk] - BILLING_RISK_ORDER[right.risk];
    if (riskDiff !== 0) return riskDiff;
    if (right.amountDue !== left.amountDue) return right.amountDue - left.amountDue;
    return left.orgName.localeCompare(right.orgName);
  });

  const events = details
    .flatMap((detail) =>
      detail.events.slice(0, 5).map((event) => ({
        ...event,
        orgId: detail.organization.id,
        orgName: detail.organization.name,
        orgSlug: detail.organization.slug,
      })),
    )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 20);

  return {
    summary: {
      customerOrgs: items.length,
      activeEntitlements: items.reduce((sum, item) => sum + item.activeEntitlements, 0),
      pastDueOrgs: items.filter((item) => item.pastDueEntitlements > 0).length,
      blockedOrgs: items.filter((item) => item.blockedEntitlements > 0).length,
      missingCustomerLinks: items.filter((item) => !item.customerLinked).length,
      overrideActiveEntitlements: items.reduce((sum, item) => sum + item.overrideActiveEntitlements, 0),
      invoicesDue: items.reduce((sum, item) => sum + item.payableInvoices, 0),
      amountDue: items.reduce((sum, item) => sum + item.amountDue, 0),
    },
    items,
    events,
  };
}

app.get('/api/admin/billing/ops', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const data = await loadAdminBillingOps({
    search: req.query.search ? String(req.query.search) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
    risk: req.query.risk ? String(req.query.risk) : undefined,
  });
  res.json(data);
}));

app.get('/api/admin/organizations/:id/billing', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const detail = await loadAdminOrganizationBillingDetail(req.params.id);
  if (!detail) throw httpError(404, 'Organization not found');
  res.json(detail);
}));

app.post('/api/admin/organizations/:id/billing/customer', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const organization = await orgStore.getOrg(req.params.id);
  if (!organization) throw httpError(404, 'Organization not found');

  const customer = await billingStore.upsertBillingCustomer({
    orgId: req.params.id,
    stripeCustomerId: parseRequiredTrimmedString('stripeCustomerId', req.body.stripeCustomerId),
    billingEmail: parseOptionalTrimmedString(req.body.billingEmail),
    companyName: parseOptionalTrimmedString(req.body.companyName),
    taxCountry: parseOptionalTrimmedString(req.body.taxCountry),
    taxId: parseOptionalTrimmedString(req.body.taxId),
    defaultPaymentMethodBrand: parseOptionalTrimmedString(req.body.defaultPaymentMethodBrand),
    defaultPaymentMethodLast4: parseOptionalTrimmedString(req.body.defaultPaymentMethodLast4),
  });

  await billingStore.recordBillingEvent({
    orgId: req.params.id,
    source: 'admin',
    eventType: 'billing.customer.upsert',
    status: 'success',
    payload: {
      billing_customer_id: customer.id,
      stripe_customer_id: customer.stripeCustomerId,
    },
  });

  await recordAuditEvent(req, {
    action_type: 'billing.customer_upsert',
    target_type: 'billing_customer',
    target_id: customer.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      stripe_customer_id: customer.stripeCustomerId,
      billing_email: customer.billingEmail,
      company_name: customer.companyName,
    },
  });

  res.json(customer);
}));

app.post('/api/admin/organizations/:id/billing/subscriptions', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const organization = await orgStore.getOrg(req.params.id);
  if (!organization) throw httpError(404, 'Organization not found');

  const subscription = await billingStore.upsertBillingSubscription({
    orgId: req.params.id,
    listingId: parseOptionalTrimmedString(req.body.listingId),
    entitlementId: parseOptionalTrimmedString(req.body.entitlementId),
    stripeSubscriptionId: parseRequiredTrimmedString('stripeSubscriptionId', req.body.stripeSubscriptionId),
    stripePriceId: parseOptionalTrimmedString(req.body.stripePriceId),
    stripeProductId: parseOptionalTrimmedString(req.body.stripeProductId),
    status: parseRequiredTrimmedString('status', req.body.status),
    quantity: parseOptionalInteger('quantity', req.body.quantity, { min: 1 }) ?? 1,
    cancelAtPeriodEnd: parseOptionalBoolean(req.body.cancelAtPeriodEnd) ?? false,
    currentPeriodStart: parseOptionalIsoTimestamp('currentPeriodStart', req.body.currentPeriodStart),
    currentPeriodEnd: parseOptionalIsoTimestamp('currentPeriodEnd', req.body.currentPeriodEnd),
    trialEndsAt: parseOptionalIsoTimestamp('trialEndsAt', req.body.trialEndsAt),
    graceEndsAt: parseOptionalIsoTimestamp('graceEndsAt', req.body.graceEndsAt),
    lastSyncedAt: new Date().toISOString(),
  });

  await billingStore.recordBillingEvent({
    orgId: req.params.id,
    entitlementId: subscription.entitlementId,
    source: 'admin',
    eventType: 'billing.subscription.upsert',
    status: 'success',
    payload: {
      billing_subscription_id: subscription.id,
      stripe_subscription_id: subscription.stripeSubscriptionId,
      status: subscription.status,
      quantity: subscription.quantity,
    },
  });

  await recordAuditEvent(req, {
    action_type: 'billing.subscription_upsert',
    target_type: 'billing_subscription',
    target_id: subscription.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      entitlement_id: subscription.entitlementId,
      stripe_subscription_id: subscription.stripeSubscriptionId,
      status: subscription.status,
      quantity: subscription.quantity,
    },
  });

  res.json(subscription);
}));

app.post('/api/admin/organizations/:id/billing/invoices', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const organization = await orgStore.getOrg(req.params.id);
  if (!organization) throw httpError(404, 'Organization not found');

  const invoice = await billingStore.upsertBillingInvoice({
    orgId: req.params.id,
    entitlementId: parseOptionalTrimmedString(req.body.entitlementId),
    billingSubscriptionId: parseOptionalTrimmedString(req.body.billingSubscriptionId),
    stripeInvoiceId: parseRequiredTrimmedString('stripeInvoiceId', req.body.stripeInvoiceId),
    stripeSubscriptionId: parseOptionalTrimmedString(req.body.stripeSubscriptionId),
    status: parseRequiredTrimmedString('status', req.body.status),
    currency: parseOptionalTrimmedString(req.body.currency) ?? 'usd',
    amountDue: parseOptionalInteger('amountDue', req.body.amountDue, { min: 0 }) ?? 0,
    amountPaid: parseOptionalInteger('amountPaid', req.body.amountPaid, { min: 0 }) ?? 0,
    amountRemaining: parseOptionalInteger('amountRemaining', req.body.amountRemaining, { min: 0 }) ?? 0,
    hostedInvoiceUrl: parseOptionalTrimmedString(req.body.hostedInvoiceUrl),
    invoicePdfUrl: parseOptionalTrimmedString(req.body.invoicePdfUrl),
    dueAt: parseOptionalIsoTimestamp('dueAt', req.body.dueAt),
    paidAt: parseOptionalIsoTimestamp('paidAt', req.body.paidAt),
    lastSyncedAt: new Date().toISOString(),
  });

  await billingStore.recordBillingEvent({
    orgId: req.params.id,
    entitlementId: invoice.entitlementId,
    source: 'admin',
    eventType: 'billing.invoice.upsert',
    status: 'success',
    payload: {
      billing_invoice_id: invoice.id,
      stripe_invoice_id: invoice.stripeInvoiceId,
      status: invoice.status,
      amount_remaining: invoice.amountRemaining,
    },
  });

  await recordAuditEvent(req, {
    action_type: 'billing.invoice_upsert',
    target_type: 'billing_invoice',
    target_id: invoice.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      entitlement_id: invoice.entitlementId,
      stripe_invoice_id: invoice.stripeInvoiceId,
      status: invoice.status,
      amount_due: invoice.amountDue,
      amount_remaining: invoice.amountRemaining,
    },
  });

  res.json(invoice);
}));

app.post('/api/admin/organizations/:id/billing/entitlements', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const organization = await orgStore.getOrg(req.params.id);
  if (!organization) throw httpError(404, 'Organization not found');

  const billingStatus = parseOptionalTrimmedString(req.body.billingStatus) ?? 'active';
  const entitlementStatus = parseOptionalTrimmedString(req.body.entitlementStatus) ?? 'active';
  if (!ADMIN_BILLING_STATUSES.has(billingStatus)) {
    throw httpError(400, 'Invalid billing status');
  }
  if (!ADMIN_ENTITLEMENT_STATUSES.has(entitlementStatus)) {
    throw httpError(400, 'Invalid entitlement status');
  }

  const customer = await billingStore.getBillingCustomerByOrgId(req.params.id);
  const entitlement = await billingStore.upsertOrgEntitlement({
    orgId: req.params.id,
    listingId: parseOptionalTrimmedString(req.body.listingId),
    billingCustomerId: customer?.id ?? null,
    billingSubscriptionId: parseOptionalTrimmedString(req.body.billingSubscriptionId),
    billingModel: parseRequiredTrimmedString('billingModel', req.body.billingModel),
    billingStatus: billingStatus as billingStore.BillingStatus,
    entitlementStatus: entitlementStatus as billingStore.EntitlementStatus,
    seatCapacity: parseOptionalInteger('seatCapacity', req.body.seatCapacity, { min: 0 }) ?? 1,
    seatInUse: parseOptionalInteger('seatInUse', req.body.seatInUse, { min: 0 }) ?? 0,
    graceEndsAt: parseOptionalIsoTimestamp('graceEndsAt', req.body.graceEndsAt),
    accessStartsAt: parseOptionalIsoTimestamp('accessStartsAt', req.body.accessStartsAt),
    accessEndsAt: parseOptionalIsoTimestamp('accessEndsAt', req.body.accessEndsAt),
  });

  await billingStore.recordBillingEvent({
    orgId: req.params.id,
    entitlementId: entitlement.id,
    source: 'admin',
    eventType: 'billing.entitlement.upsert',
    status: 'success',
    payload: {
      entitlement_id: entitlement.id,
      billing_model: entitlement.billingModel,
      billing_status: entitlement.billingStatus,
      entitlement_status: entitlement.entitlementStatus,
      seat_capacity: entitlement.seatCapacity,
      seat_in_use: entitlement.seatInUse,
    },
  });

  await recordAuditEvent(req, {
    action_type: 'billing.entitlement_upsert',
    target_type: 'org_entitlement',
    target_id: entitlement.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      billing_model: entitlement.billingModel,
      billing_status: entitlement.billingStatus,
      entitlement_status: entitlement.entitlementStatus,
      seat_capacity: entitlement.seatCapacity,
      seat_in_use: entitlement.seatInUse,
    },
  });

  res.json(entitlement);
}));

app.patch('/api/admin/organizations/:id/billing/entitlements/:entitlementId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { entitlement } = await getAdminBillingEntitlementOrThrow(req.params.id, req.params.entitlementId);
  const customer = await billingStore.getBillingCustomerByOrgId(req.params.id);

  const billingStatus = hasOwnKey(req.body, 'billingStatus')
    ? parseOptionalTrimmedString(req.body.billingStatus)
    : entitlement.billingStatus;
  const entitlementStatus = hasOwnKey(req.body, 'entitlementStatus')
    ? parseOptionalTrimmedString(req.body.entitlementStatus)
    : entitlement.entitlementStatus;

  if (!billingStatus || !ADMIN_BILLING_STATUSES.has(billingStatus)) {
    throw httpError(400, 'Invalid billing status');
  }
  if (!entitlementStatus || !ADMIN_ENTITLEMENT_STATUSES.has(entitlementStatus)) {
    throw httpError(400, 'Invalid entitlement status');
  }

  const updated = await billingStore.upsertOrgEntitlement({
    id: entitlement.id,
    orgId: req.params.id,
    listingId: hasOwnKey(req.body, 'listingId')
      ? parseOptionalTrimmedString(req.body.listingId)
      : entitlement.listingId,
    billingCustomerId: customer?.id ?? entitlement.billingCustomerId,
    billingSubscriptionId: hasOwnKey(req.body, 'billingSubscriptionId')
      ? parseOptionalTrimmedString(req.body.billingSubscriptionId)
      : entitlement.billingSubscriptionId,
    billingModel: hasOwnKey(req.body, 'billingModel')
      ? parseRequiredTrimmedString('billingModel', req.body.billingModel)
      : entitlement.billingModel,
    billingStatus: billingStatus as billingStore.BillingStatus,
    entitlementStatus: entitlementStatus as billingStore.EntitlementStatus,
    seatCapacity: hasOwnKey(req.body, 'seatCapacity')
      ? parseOptionalInteger('seatCapacity', req.body.seatCapacity, { min: 0 }) ?? 0
      : entitlement.seatCapacity,
    seatInUse: hasOwnKey(req.body, 'seatInUse')
      ? parseOptionalInteger('seatInUse', req.body.seatInUse, { min: 0 }) ?? 0
      : entitlement.seatInUse,
    graceEndsAt: hasOwnKey(req.body, 'graceEndsAt')
      ? parseOptionalIsoTimestamp('graceEndsAt', req.body.graceEndsAt)
      : entitlement.graceEndsAt,
    accessStartsAt: hasOwnKey(req.body, 'accessStartsAt')
      ? parseOptionalIsoTimestamp('accessStartsAt', req.body.accessStartsAt)
      : entitlement.accessStartsAt,
    accessEndsAt: hasOwnKey(req.body, 'accessEndsAt')
      ? parseOptionalIsoTimestamp('accessEndsAt', req.body.accessEndsAt)
      : entitlement.accessEndsAt,
  });

  await billingStore.recordBillingEvent({
    orgId: req.params.id,
    entitlementId: updated.id,
    source: 'admin',
    eventType: 'billing.entitlement.update',
    status: 'success',
    payload: {
      entitlement_id: updated.id,
      billing_status: updated.billingStatus,
      entitlement_status: updated.entitlementStatus,
      seat_capacity: updated.seatCapacity,
      seat_in_use: updated.seatInUse,
    },
  });

  await recordAuditEvent(req, {
    action_type: 'billing.entitlement_update',
    target_type: 'org_entitlement',
    target_id: updated.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      billing_status: updated.billingStatus,
      entitlement_status: updated.entitlementStatus,
      seat_capacity: updated.seatCapacity,
      seat_in_use: updated.seatInUse,
    },
  });

  res.json(updated);
}));

app.post('/api/admin/organizations/:id/billing/entitlements/:entitlementId/pause', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { entitlement } = await getAdminBillingEntitlementOrThrow(req.params.id, req.params.entitlementId);
  const actorUserId = getAdminActorUserId(req);

  const reason = parseOptionalTrimmedString(req.body.reason) ?? 'Paused by admin';

  await withConn(async (client) => client.query(
    `
    UPDATE org_entitlement_overrides
    SET status = 'inactive'
    WHERE entitlement_id = $1
      AND status = 'active'
      AND kind IN ('manual_resume', 'temporary_access', 'seat_comp')
    `,
    [entitlement.id],
  ));

  const override = await billingStore.createOrgEntitlementOverride({
    entitlementId: entitlement.id,
    kind: 'manual_suspend',
    reason,
    createdBy: actorUserId,
  });

  await billingStore.recordBillingEvent({
    orgId: req.params.id,
    entitlementId: entitlement.id,
    source: 'admin',
    eventType: 'billing.entitlement.pause',
    status: 'success',
    payload: {
      entitlement_id: entitlement.id,
      override_id: override.id,
      reason,
    },
  });

  await recordAuditEvent(req, {
    action_type: 'billing.entitlement_pause',
    target_type: 'org_entitlement',
    target_id: entitlement.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      override_id: override.id,
      reason,
    },
  });

  res.json({ paused: true, override });
}));

app.post('/api/admin/organizations/:id/billing/entitlements/:entitlementId/resume', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { entitlement } = await getAdminBillingEntitlementOrThrow(req.params.id, req.params.entitlementId);
  const actorUserId = getAdminActorUserId(req);

  const reason = parseOptionalTrimmedString(req.body.reason) ?? 'Resumed by admin';
  const effectiveEndsAt = parseOptionalIsoTimestamp('effectiveEndsAt', req.body.effectiveEndsAt);

  const deactivated = await withConn(async (client) => client.query(
    `
    UPDATE org_entitlement_overrides
    SET status = 'inactive'
    WHERE entitlement_id = $1
      AND status = 'active'
      AND kind IN ('manual_suspend', 'credit_hold')
    RETURNING id
    `,
    [entitlement.id],
  ));

  const override = await billingStore.createOrgEntitlementOverride({
    entitlementId: entitlement.id,
    kind: 'manual_resume',
    reason,
    effectiveEndsAt,
    createdBy: actorUserId,
  });

  await billingStore.recordBillingEvent({
    orgId: req.params.id,
    entitlementId: entitlement.id,
    source: 'admin',
    eventType: 'billing.entitlement.resume',
    status: 'success',
    payload: {
      entitlement_id: entitlement.id,
      override_id: override.id,
      overrides_deactivated: deactivated.rowCount ?? 0,
      reason,
    },
  });

  await recordAuditEvent(req, {
    action_type: 'billing.entitlement_resume',
    target_type: 'org_entitlement',
    target_id: entitlement.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      override_id: override.id,
      overrides_deactivated: deactivated.rowCount ?? 0,
      reason,
      effective_ends_at: effectiveEndsAt,
    },
  });

  res.json({
    resumed: true,
    override,
    deactivatedBlockingOverrides: Number(deactivated.rowCount ?? 0),
  });
}));

app.post('/api/admin/organizations/:id/billing/entitlements/:entitlementId/grant-temporary-access', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { entitlement } = await getAdminBillingEntitlementOrThrow(req.params.id, req.params.entitlementId);
  const actorUserId = getAdminActorUserId(req);

  const effectiveEndsAt = parseOptionalIsoTimestamp('effectiveEndsAt', req.body.effectiveEndsAt);
  if (!effectiveEndsAt) throw httpError(400, 'effectiveEndsAt is required');

  const reason = parseOptionalTrimmedString(req.body.reason) ?? 'Temporary access granted by admin';

  const override = await billingStore.createOrgEntitlementOverride({
    entitlementId: entitlement.id,
    kind: 'temporary_access',
    reason,
    effectiveEndsAt,
    createdBy: actorUserId,
  });

  await billingStore.recordBillingEvent({
    orgId: req.params.id,
    entitlementId: entitlement.id,
    source: 'admin',
    eventType: 'billing.entitlement.temporary_access',
    status: 'success',
    payload: {
      entitlement_id: entitlement.id,
      override_id: override.id,
      effective_ends_at: effectiveEndsAt,
      reason,
    },
  });

  await recordAuditEvent(req, {
    action_type: 'billing.entitlement_temporary_access',
    target_type: 'org_entitlement',
    target_id: entitlement.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      override_id: override.id,
      effective_ends_at: effectiveEndsAt,
      reason,
    },
  });

  res.json({ granted: true, override });
}));

app.post('/api/admin/organizations/:id/billing/entitlements/:entitlementId/overrides', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { entitlement } = await getAdminBillingEntitlementOrThrow(req.params.id, req.params.entitlementId);
  const actorUserId = getAdminActorUserId(req);

  const kind = parseRequiredTrimmedString('kind', req.body.kind);
  if (!ADMIN_OVERRIDE_KINDS.has(kind)) {
    throw httpError(400, 'Invalid entitlement override kind');
  }

  const override = await billingStore.createOrgEntitlementOverride({
    entitlementId: entitlement.id,
    kind,
    status: parseOptionalTrimmedString(req.body.status) ?? 'active',
    reason: parseOptionalTrimmedString(req.body.reason) ?? '',
    effectiveStartsAt: parseOptionalIsoTimestamp('effectiveStartsAt', req.body.effectiveStartsAt),
    effectiveEndsAt: parseOptionalIsoTimestamp('effectiveEndsAt', req.body.effectiveEndsAt),
    createdBy: actorUserId,
  });

  await billingStore.recordBillingEvent({
    orgId: req.params.id,
    entitlementId: entitlement.id,
    source: 'admin',
    eventType: 'billing.entitlement.override',
    status: 'success',
    payload: {
      entitlement_id: entitlement.id,
      override_id: override.id,
      kind: override.kind,
      status: override.status,
    },
  });

  await recordAuditEvent(req, {
    action_type: 'billing.entitlement_override',
    target_type: 'org_entitlement_override',
    target_id: override.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      entitlement_id: entitlement.id,
      kind: override.kind,
      status: override.status,
      reason: override.reason,
    },
  });

  res.json(override);
}));

app.post('/api/admin/organizations', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) throw httpError(400, 'Organization name is required');

  const kind = typeof req.body.kind === 'string' ? req.body.kind.trim() : 'customer';
  const plan = typeof req.body.plan === 'string' ? req.body.plan.trim() : 'free';
  const status = typeof req.body.status === 'string' ? req.body.status.trim() : 'active';
  const ownerRole = typeof req.body.ownerRole === 'string' ? req.body.ownerRole.trim() : 'owner';
  const ownerStatus = typeof req.body.ownerStatus === 'string' ? req.body.ownerStatus.trim() : 'active';

  if (!['developer', 'customer'].includes(kind)) {
    throw httpError(400, 'Invalid organization kind');
  }
  if (!['active', 'suspended', 'archived'].includes(status)) {
    throw httpError(400, 'Invalid organization status');
  }
  if (!['owner', 'admin', 'developer', 'employee'].includes(ownerRole)) {
    throw httpError(400, 'Invalid owner membership role');
  }
  if (!['active', 'invited', 'suspended'].includes(ownerStatus)) {
    throw httpError(400, 'Invalid owner membership status');
  }

  const explicitSlug = typeof req.body.slug === 'string' ? req.body.slug.trim() : '';
  const fallbackSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const slug = explicitSlug || fallbackSlug;
  if (!slug) throw httpError(400, 'Organization slug is required');

  let ownerUser: userStore.UserRecord | null = null;
  if (typeof req.body.userId === 'string' && req.body.userId.trim()) {
    ownerUser = await userStore.getUserById(req.body.userId.trim());
  } else if (typeof req.body.ownerEmail === 'string' && req.body.ownerEmail.trim()) {
    ownerUser = await userStore.getUserByEmail(req.body.ownerEmail.trim().toLowerCase());
  }

  if (
    (typeof req.body.userId === 'string' && req.body.userId.trim())
    || (typeof req.body.ownerEmail === 'string' && req.body.ownerEmail.trim())
  ) {
    if (!ownerUser) {
      throw httpError(404, 'Owner user not found');
    }
  }

  let created: orgStore.OrgRecord;
  try {
    created = await orgStore.createOrg(name, slug, kind as orgStore.OrgRecord['kind'], {
      plan,
      status: status as orgStore.OrgRecord['status'],
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw httpError(409, 'Organization slug already exists');
    }
    throw error;
  }

  if (ownerUser) {
    await organizationMembershipStore.createMembership(
      created.id,
      ownerUser.id,
      ownerRole as organizationMembershipStore.OrganizationMembershipRecord['role'],
      ownerStatus as organizationMembershipStore.OrganizationMembershipRecord['status'],
    );
  }

  await recordAuditEvent(req, {
    action_type: 'organization.create',
    target_type: 'organization',
    target_id: created.id,
    outcome: 'success',
    details: {
      org_id: created.id,
      name,
      slug,
      kind,
      plan,
      status,
      ...(ownerUser
        ? {
          owner_user_id: ownerUser.id,
          owner_email: ownerUser.email,
          owner_role: ownerRole,
          owner_status: ownerStatus,
        }
        : {}),
    },
  });

  const detail = await loadAdminOrganizationDetail(created.id);
  res.status(201).json(detail ?? { organization: created });
}));

app.get('/api/admin/organizations', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const items = await listAdminOrganizationSummaries({
    kind: req.query.kind ? String(req.query.kind) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
  });
  res.json({ items, total: items.length });
}));

app.get('/api/admin/organizations/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const detail = await loadAdminOrganizationDetail(req.params.id);
  if (!detail) throw httpError(404, 'Organization not found');
  res.json(detail);
}));

app.patch('/api/admin/organizations/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : undefined;
  const slug = typeof req.body.slug === 'string' ? req.body.slug.trim() : undefined;
  const plan = typeof req.body.plan === 'string' ? req.body.plan.trim() : undefined;
  const status = typeof req.body.status === 'string' ? req.body.status.trim() : undefined;

  if (status && !['active', 'suspended', 'archived'].includes(status)) {
    throw httpError(400, 'Invalid organization status');
  }

  const updated = await orgStore.updateOrg(req.params.id, {
    ...(name ? { name } : {}),
    ...(slug ? { slug } : {}),
    ...(plan ? { plan } : {}),
    ...(status ? { status: status as 'active' | 'suspended' | 'archived' } : {}),
  });
  if (!updated) throw httpError(404, 'Organization not found');
  await recordAuditEvent(req, {
    action_type: 'organization.update',
    target_type: 'organization',
    target_id: req.params.id,
    outcome: 'success',
    details: {
      ...(name ? { name } : {}),
      ...(slug ? { slug } : {}),
      ...(plan ? { plan } : {}),
      ...(status ? { status } : {}),
    },
  });
  res.json(updated);
}));

app.post('/api/admin/organizations/:id/members', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const org = await orgStore.getOrg(req.params.id);
  if (!org) throw httpError(404, 'Organization not found');

  const role = typeof req.body.role === 'string' ? req.body.role.trim() : 'employee';
  const status = typeof req.body.status === 'string' ? req.body.status.trim() : 'active';
  if (!['owner', 'admin', 'developer', 'employee'].includes(role)) {
    throw httpError(400, 'Invalid membership role');
  }
  if (!['active', 'invited', 'suspended'].includes(status)) {
    throw httpError(400, 'Invalid membership status');
  }

  let user: userStore.UserRecord | null = null;
  if (typeof req.body.userId === 'string' && req.body.userId.trim()) {
    user = await userStore.getUserById(req.body.userId.trim());
  } else if (typeof req.body.email === 'string' && req.body.email.trim()) {
    user = await userStore.getUserByEmail(req.body.email.trim().toLowerCase());
  }

  if (!user) {
    throw httpError(404, 'User not found');
  }

  const existing = await organizationMembershipStore.getMembershipForUserOrg(user.id, req.params.id);
  const membership = existing
    ? await organizationMembershipStore.updateMembership(existing.id, {
      role: role as organizationMembershipStore.OrganizationMembershipRecord['role'],
      status: status as organizationMembershipStore.OrganizationMembershipRecord['status'],
    })
    : await organizationMembershipStore.createMembership(
      req.params.id,
      user.id,
      role as organizationMembershipStore.OrganizationMembershipRecord['role'],
      status as organizationMembershipStore.OrganizationMembershipRecord['status'],
    );

  await recordAuditEvent(req, {
    action_type: 'organization.membership_upsert',
    target_type: 'organization_membership',
    target_id: membership?.id ?? `${req.params.id}:${user.id}`,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      user_id: user.id,
      email: user.email,
      role,
      status,
    },
  });

  res.json(membership);
}));

app.patch('/api/admin/organizations/:id/members/:membershipId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const role = typeof req.body.role === 'string' ? req.body.role.trim() : undefined;
  const status = typeof req.body.status === 'string' ? req.body.status.trim() : undefined;
  if (role && !['owner', 'admin', 'developer', 'employee'].includes(role)) {
    throw httpError(400, 'Invalid membership role');
  }
  if (status && !['active', 'invited', 'suspended'].includes(status)) {
    throw httpError(400, 'Invalid membership status');
  }

  const { membership, activeOwnerCount } = await getAdminOwnerGuard(
    req.params.id,
    req.params.membershipId,
  );

  const nextRole = role ?? membership.role;
  const nextStatus = status ?? membership.status;
  if (
    membership.role === 'owner' &&
    membership.status === 'active' &&
    activeOwnerCount <= 1 &&
    (nextRole !== 'owner' || nextStatus !== 'active')
  ) {
    throw httpError(409, 'Cannot demote or suspend the last active owner');
  }

  const updated = await organizationMembershipStore.updateMembership(req.params.membershipId, {
    ...(role ? { role: role as organizationMembershipStore.OrganizationMembershipRecord['role'] } : {}),
    ...(status ? { status: status as organizationMembershipStore.OrganizationMembershipRecord['status'] } : {}),
  });
  if (!updated) throw httpError(404, 'Organization membership not found');

  await recordAuditEvent(req, {
    action_type: 'organization.membership_update',
    target_type: 'organization_membership',
    target_id: req.params.membershipId,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      user_id: updated.userId,
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    },
  });

  res.json(updated);
}));

app.delete('/api/admin/organizations/:id/members/:membershipId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { membership, activeOwnerCount } = await getAdminOwnerGuard(
    req.params.id,
    req.params.membershipId,
  );

  if (membership.role === 'owner' && membership.status === 'active' && activeOwnerCount <= 1) {
    throw httpError(409, 'Cannot remove the last active owner');
  }

  const deleted = await organizationMembershipStore.deleteMembership(req.params.membershipId);
  if (!deleted) throw httpError(404, 'Organization membership not found');

  await recordAuditEvent(req, {
    action_type: 'organization.membership_delete',
    target_type: 'organization_membership',
    target_id: req.params.membershipId,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      user_id: membership.userId,
      role: membership.role,
      status: membership.status,
    },
  });

  res.json({ deleted: true, membershipId: req.params.membershipId });
}));

app.post('/api/admin/organizations/:id/session-context/reset', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const org = await orgStore.getOrg(req.params.id);
  if (!org) throw httpError(404, 'Organization not found');

  const cleared = await sessionStore.clearActiveOrgForOrganization(req.params.id);
  await recordAuditEvent(req, {
    action_type: 'organization.session_context_reset',
    target_type: 'organization',
    target_id: req.params.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      sessions_cleared: cleared,
    },
  });
  res.json({ cleared });
}));

app.delete('/api/admin/organizations/:id/sessions/:sessionId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const org = await orgStore.getOrg(req.params.id);
  if (!org) throw httpError(404, 'Organization not found');

  const sessionResult = await withConn(async (client) => client.query(
    `
    SELECT id, user_id
    FROM sessions
    WHERE id = $1
      AND active_org_id = $2
    LIMIT 1
    `,
    [req.params.sessionId, req.params.id],
  ));

  const sessionRow = sessionResult.rows[0];
  if (!sessionRow) throw httpError(404, 'Organization session not found');

  await sessionStore.deleteSession(req.params.sessionId);

  await recordAuditEvent(req, {
    action_type: 'organization.session_revoke',
    target_type: 'organization',
    target_id: req.params.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      session_id: req.params.sessionId,
      user_id: String(sessionRow.user_id),
    },
  });

  res.json({ deleted: true, sessionId: req.params.sessionId });
}));

app.delete('/api/admin/organizations/:id/sessions', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const org = await orgStore.getOrg(req.params.id);
  if (!org) throw httpError(404, 'Organization not found');

  const deleteResult = await withConn(async (client) => client.query(
    `
    DELETE FROM sessions
    WHERE active_org_id = $1
    RETURNING id
    `,
    [req.params.id],
  ));

  await recordAuditEvent(req, {
    action_type: 'organization.sessions_revoke_all',
    target_type: 'organization',
    target_id: req.params.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      sessions_revoked: deleteResult.rowCount ?? 0,
    },
  });

  res.json({ deleted: Number(deleteResult.rowCount ?? 0) });
}));

app.delete('/api/admin/organizations/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const detail = await loadAdminOrganizationDetail(req.params.id);
  if (!detail) throw httpError(404, 'Organization not found');

  if (detail.organization.status !== 'archived') {
    throw httpError(409, 'Archive the organization before deleting it');
  }

  if (
    detail.organization.memberCount > 0 ||
    detail.organization.agentCount > 0 ||
    detail.organization.listingCount > 0 ||
    detail.organization.installCount > 0
  ) {
    throw httpError(409, 'Only empty archived organizations can be deleted');
  }

  const deleted = await orgStore.deleteOrg(req.params.id);
  if (!deleted) throw httpError(404, 'Organization not found');

  await recordAuditEvent(req, {
    action_type: 'organization.delete',
    target_type: 'organization',
    target_id: req.params.id,
    outcome: 'success',
    details: {
      org_id: req.params.id,
      deleted: true,
    },
  });

  res.json({ deleted: true, organizationId: req.params.id });
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
  const items = await Promise.all(result.items.map((user) => buildAdminUserResponse(user)));
  res.json({ items, total: result.total });
}));

app.patch('/api/admin/users/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { role, status } = req.body;
  const updated = await userStore.updateUser(req.params.id, { role, status });
  if (!updated) throw httpError(404, 'User not found');
  await recordAuditEvent(req, {
    action_type: 'user.update',
    target_type: 'user',
    target_id: req.params.id,
    outcome: 'success',
    details: {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    },
  });
  res.json(updated);
}));

app.delete('/api/admin/users/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const deleted = await userStore.deleteUser(req.params.id);
  if (!deleted) throw httpError(404, 'User not found');
  await recordAuditEvent(req, {
    action_type: 'user.delete',
    target_type: 'user',
    target_id: req.params.id,
    outcome: 'success',
    details: { deleted: true, initiated_from: 'admin_panel' },
  });
  res.json({ message: 'User deleted' });
}));

app.get('/api/admin/agents', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (req.query.status) {
    conditions.push(`a.status = $${paramIdx++}`);
    params.push(String(req.query.status));
  }

  if (req.query.search) {
    conditions.push(`(a.name ILIKE $${paramIdx} OR a.description ILIKE $${paramIdx} OR COALESCE(u.email, '') ILIKE $${paramIdx} OR COALESCE(o.name, '') ILIKE $${paramIdx})`);
    params.push(`%${String(req.query.search)}%`);
    paramIdx += 1;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

  const result = await withConn(async (client) => {
    const countResult = await client.query(
      `
      SELECT COUNT(*) AS total
      FROM agents a
      LEFT JOIN users u ON u.id = a.created_by
      LEFT JOIN organizations o ON o.id = a.org_id
      ${where}
      `,
      params,
    );

    const rowsResult = await client.query(
      `
      SELECT
        a.id,
        a.name,
        a.description,
        a.status,
        a.created_at,
        a.updated_at,
        a.sandbox_ids,
        a.forge_sandbox_id,
        a.runtime_inputs,
        a.tool_connections,
        a.triggers,
        a.channels,
        a.improvements,
        a.created_by,
        a.org_id,
        u.email AS creator_email,
        u.display_name AS creator_display_name,
        o.name AS org_name,
        o.slug AS org_slug,
        o.kind AS org_kind
      FROM agents a
      LEFT JOIN users u ON u.id = a.created_by
      LEFT JOIN organizations o ON o.id = a.org_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `,
      [...params, limit, offset],
    );

    return {
      total: Number(countResult.rows[0]?.total ?? 0),
      items: rowsResult.rows.map((row) => {
        const sandboxIds = parseJsonArray<string>(row.sandbox_ids);
        return {
          id: String(row.id),
          name: String(row.name),
          description: String(row.description ?? ''),
          status: String(row.status),
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
          sandboxIds,
          sandboxCount: sandboxIds.length,
          forgeSandboxId: row.forge_sandbox_id ? String(row.forge_sandbox_id) : null,
          runtimeInputCount: parseJsonArray(row.runtime_inputs).length,
          toolConnectionCount: parseJsonArray(row.tool_connections).length,
          triggerCount: parseJsonArray(row.triggers).length,
          channelCount: parseJsonArray(row.channels).length,
          improvementCount: parseJsonArray(row.improvements).length,
          createdBy: row.created_by ? String(row.created_by) : null,
          creatorEmail: row.creator_email ? String(row.creator_email) : null,
          creatorDisplayName: row.creator_display_name ? String(row.creator_display_name) : null,
          orgId: row.org_id ? String(row.org_id) : null,
          orgName: row.org_name ? String(row.org_name) : null,
          orgSlug: row.org_slug ? String(row.org_slug) : null,
          orgKind: row.org_kind ? String(row.org_kind) : null,
        };
      }),
    };
  });

  res.json(result);
}));

app.delete('/api/admin/agents/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const agent = await agentStore.getAgent(req.params.id);
  if (!agent) throw httpError(404, 'Agent not found');

  paperclipOrchestrator.teardownPaperclipCompany(req.params.id).catch(() => {});

  const sandboxIds: string[] = agent.sandbox_ids ?? [];
  for (const sid of sandboxIds) {
    await store.deleteSandbox(sid).catch(() => {});
    stopAndRemoveContainer(sid).catch(() => {});
  }

  if (agent.forge_sandbox_id) {
    await store.deleteSandbox(agent.forge_sandbox_id).catch(() => {});
    stopAndRemoveContainer(agent.forge_sandbox_id).catch(() => {});
  }

  const deleted = await agentStore.deleteAgent(req.params.id);
  if (!deleted) throw httpError(404, 'Agent not found');

  await recordAuditEvent(req, {
    action_type: 'agent.delete',
    target_type: 'agent',
    target_id: req.params.id,
    outcome: 'success',
    details: {
      deleted: true,
      sandboxesCleaned: sandboxIds.length + (agent.forge_sandbox_id ? 1 : 0),
      initiated_from: 'admin_panel',
    },
  });

  res.json({
    deleted: req.params.id,
    sandboxesCleaned: sandboxIds.length,
    forgeSandboxCleaned: Boolean(agent.forge_sandbox_id),
  });
}));

app.get('/api/admin/runtime', requireAuth, requireRole('admin'), asyncHandler(async (_req, res) => {
  const runtime = await loadAdminRuntimeData();
  res.json(runtime);
}));

app.get('/api/admin/marketplace', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const marketplace = await loadAdminMarketplaceData({
    status: req.query.status ? String(req.query.status) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
  });
  res.json(marketplace);
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
  const origin = 'http://localhost';

  // Set up SSE response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sseSend = (event: string, data: unknown) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch { /* client may have disconnected */ }
  };
  const emitToolEnd = (toolName: string, output?: string) => {
    sseSend('tool_end', {
      tool: toolName,
      name: toolName,
      output: output ?? `Completed: ${toolName}`,
    });
  };

  let assistantText = '';
  let activeToolName: string | null = null;
  let sawLiveToolEvents = false;
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
          sawLiveToolEvents = true;
          emitToolEnd(activeToolName);
          activeToolName = null;
        }
        if (phase === 'end') {
          if (!sawLiveToolEvents) {
            const transcriptToolEvents = await readSandboxSessionToolEvents(
              req.params.sandbox_id,
              sessionKey,
            ).catch(() => []);
            for (const event of transcriptToolEvents) {
              sseSend(event.type, {
                tool: event.tool,
                name: event.name,
                ...(event.type === 'tool_start'
                  ? { input: event.input ?? event.tool }
                  : { output: event.output ?? `Completed: ${event.tool}` }),
              });
            }
          }

          // Persist conversation
          if (conversationId && persistedUserMessage && assistantText) {
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
      const toolInputValue =
        payload.input ??
        payload.args ??
        payload.command ??
        payload.description ??
        toolName;
      const summary = typeof toolInputValue === 'string'
        ? toolInputValue
        : JSON.stringify(toolInputValue);

      // End previous tool if still active
      if (activeToolName) {
        emitToolEnd(activeToolName);
      }
      activeToolName = toolName;
      sawLiveToolEvents = true;

      sseSend('tool_start', {
        tool: toolName,
        name: toolName,
        input: summary,
      });

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
  let record = await getRecord(req.params.sandbox_id);
  let active = await isSandboxBrowserActive(req.params.sandbox_id);
  if (!active) {
    record = await ensureSandboxBrowserRuntime(record);
    active = await isSandboxBrowserActive(req.params.sandbox_id);
  }
  res.json({
    active: active && Boolean(record.vnc_port),
    vnc_port: record.vnc_port,
  });
}));

app.get('/api/sandboxes/:sandbox_id/browser/screenshot', asyncHandler(async (req, res) => {
  let record = await getRecord(req.params.sandbox_id);
  let buffer = await captureSandboxBrowserScreenshot(req.params.sandbox_id);
  if (buffer == null) {
    record = await ensureSandboxBrowserRuntime(record);
    buffer = await captureSandboxBrowserScreenshot(req.params.sandbox_id);
  }
  if (buffer == null) {
    // Display not available — return a 1x1 transparent PNG
    res.setHeader('Content-Type', 'image/png');
    res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
    return;
  }
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
  await getRecord(req.params.sandbox_id);
  const containerPort = parseInt(req.params.port, 10);
  if (isNaN(containerPort) || !PREVIEW_PORTS.includes(containerPort)) {
    throw httpError(400, `Port ${req.params.port} is not a valid preview port`);
  }

  const containerName = getContainerName(req.params.sandbox_id);
  const proxyPath = req.params[0] || '';
  const qs = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
  const internalUrl = `http://127.0.0.1:${containerPort}/${proxyPath}${qs}`;
  // Use frontend rewrite path so sub-resource requests from the iframe
  // flow through the same-origin Next.js rewrite
  const proxyBase = `/api/sandbox-preview/${req.params.sandbox_id}/proxy/${containerPort}`;

  // Use docker exec + curl to reach the container's localhost-bound service.
  const acceptHeader = (req.headers.accept || '*/*').replace(/'/g, "'\\''");
  const curlCmd = `curl -s -i --max-time 15 -H 'Accept: ${acceptHeader}' '${internalUrl.replace(/'/g, "'\\''")}'`;

  try {
    const execProc = Bun.spawnSync(['docker', 'exec', containerName, 'sh', '-c', curlCmd], { timeout: 20_000 });
    const rawBytes = execProc.stdout as Uint8Array;

    if (execProc.exitCode !== 0 || !rawBytes || rawBytes.length === 0) {
      throw httpError(502, `Preview proxy: container curl failed (exit ${execProc.exitCode})`);
    }

    // Find the blank line separating HTTP headers from body (\r\n\r\n)
    let headerEndIdx = -1;
    for (let i = 0; i < rawBytes.length - 3; i++) {
      if (rawBytes[i] === 0x0d && rawBytes[i + 1] === 0x0a && rawBytes[i + 2] === 0x0d && rawBytes[i + 3] === 0x0a) {
        headerEndIdx = i;
        break;
      }
    }
    if (headerEndIdx === -1) {
      res.status(200);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      res.setHeader('Content-Security-Policy', 'frame-ancestors *');
      res.send(Buffer.from(rawBytes));
      return;
    }

    const headerText = Buffer.from(rawBytes.slice(0, headerEndIdx)).toString('utf-8');
    const bodyBytes = rawBytes.slice(headerEndIdx + 4);

    const statusMatch = headerText.match(/^HTTP\/[\d.]+ (\d+)/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    const ctMatch = headerText.match(/^content-type:\s*(.+)$/im);
    const contentType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    res.status(statusCode);
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Rewrite absolute paths in HTML so sub-resources load through the proxy,
    // and inject a fetch shim so dashboard API calls route to the agent's backend.
    if (contentType.includes('text/html')) {
      let html = Buffer.from(bodyBytes).toString('utf-8');
      html = html.replace(/((?:src|href|action)\s*=\s*["'])\//g, `$1${proxyBase}/`);
      html = html.replace(/"(\/_next\/)/g, `"${proxyBase}/_next/`);

      const backendPort = parseInt(String(req.query.backendPort), 10) || 3100;
      const apiBase = `/api/sandbox-preview/${req.params.sandbox_id}/proxy/${backendPort}`;
      const fetchShim = `<script>window.__DASHBOARD_API_BASE__="${apiBase}";`
        + `(function(){var f=window.fetch;window.fetch=function(u,o){`
        + `if(typeof u==='string'&&u.startsWith('/api/'))u=window.__DASHBOARD_API_BASE__+u;`
        + `return f.call(this,u,o);};})();</script>`;
      html = html.replace(/<head([^>]*)>/, `<head$1>${fetchShim}`);

      res.send(html);
    } else {
      res.send(Buffer.from(bodyBytes));
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
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

app.get('/api/sandboxes/:sandbox_id/workspace/status', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const [code, output] = await sandboxExec(req.params.sandbox_id, createWorkspaceStatusCommand(), 10);
  if (code !== 0) classifyWorkspaceExecError(output, 'status');
  try {
    res.json(parseJsonOutput(output));
  } catch {
    throw httpError(502, 'Failed to parse workspace status output');
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

// ── Workspace write (v3 build pipeline) ──────────────────────────────────────

import { writeWorkspaceFile as writeWsFile, writeWorkspaceFiles as writeWsFiles, mergeWorkspaceCopilotToMain, readWorkspaceCopilotFile } from './workspaceWriter';
import { pushWorkspaceToGitHub } from './workspaceGitPush';
import { shipAgent } from './agentRepo';

app.post('/api/sandboxes/:sandbox_id/workspace/write', requireAuth, asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const { path, content } = req.body ?? {};
  if (typeof path !== 'string' || !path.trim()) throw httpError(400, 'path is required');
  if (typeof content !== 'string') throw httpError(400, 'content is required');
  const result = await writeWsFile(req.params.sandbox_id, path, content);
  if (!result.ok) throw httpError(500, result.error ?? 'Write failed');
  res.json(result);
}));

app.post('/api/sandboxes/:sandbox_id/workspace/write-batch', requireAuth, asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const { files } = req.body ?? {};
  if (!Array.isArray(files)) throw httpError(400, 'files array is required');
  if (files.length === 0) throw httpError(400, 'files array is empty');
  if (files.length > 50) throw httpError(400, 'Maximum 50 files per batch');
  for (const f of files) {
    if (typeof f?.path !== 'string' || !f.path.trim()) throw httpError(400, 'Each file must have a path');
    if (typeof f?.content !== 'string') throw httpError(400, 'Each file must have content');
  }
  const results = await writeWsFiles(req.params.sandbox_id, files);
  const failed = results.filter((r) => !r.ok);
  res.json({ ok: failed.length === 0, results, failed: failed.length, succeeded: results.length - failed.length });
}));

app.get('/api/sandboxes/:sandbox_id/workspace-copilot/file', requireAuth, asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const filePath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!filePath) throw httpError(400, 'path query parameter is required');
  const content = await readWorkspaceCopilotFile(req.params.sandbox_id, filePath);
  if (content === null) throw httpError(404, 'File not found in copilot workspace');
  res.json({ path: filePath, content });
}));

app.post('/api/sandboxes/:sandbox_id/workspace/merge-copilot', requireAuth, asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const ok = await mergeWorkspaceCopilotToMain(req.params.sandbox_id);
  if (!ok) throw httpError(500, 'Failed to merge copilot workspace into main workspace');

  // Auto-commit after workspace merge (Agent-as-Code)
  try {
    const gw = await import('./gitWorkspace');
    const commitResult = await gw.commitWorkspace(req.params.sandbox_id, 'build: merge copilot workspace');
    if (commitResult.sha) {
      const agentForSandbox = await agentStore.getAgentBySandboxId(req.params.sandbox_id);
      if (agentForSandbox?.repo_url) {
        await gw.pushBranch(req.params.sandbox_id, agentForSandbox.active_branch || 'main').catch(() => {});
      }
    }
  } catch { /* non-blocking */ }

  res.json({ ok: true });
}));

// Push workspace directly to GitHub from inside the container
// Auth via GitHub PAT in the request body — no JWT needed
app.post('/api/sandboxes/:sandbox_id/workspace/git-push', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const { repo, githubToken, commitMessage, agentName } = req.body ?? {};
  if (typeof repo !== 'string' || !repo.trim()) throw httpError(400, 'repo is required (owner/repo)');
  const result = await pushWorkspaceToGitHub({
    sandboxId: req.params.sandbox_id,
    repoUrl: repo.trim(),
    githubToken: typeof githubToken === 'string' ? githubToken.trim() : undefined,
    commitMessage: typeof commitMessage === 'string' ? commitMessage : undefined,
    agentName: typeof agentName === 'string' ? agentName : undefined,
  });
  res.json(result);
}));

// ── Agent Setup (start services after build) ─────────────────────────────────

app.post('/api/sandboxes/:sandbox_id/setup', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const { runAgentSetup } = await import('./agentSetup');
  const result = await runAgentSetup(req.params.sandbox_id, (msg) => {
    console.log(`[setup:${req.params.sandbox_id.slice(0, 8)}] ${msg}`);
  });

  // Persist service ports on the agent record so the Dashboard tab can discover them.
  if (result.services?.length) {
    try {
      let agent = await agentStore.getAgentBySandboxId(req.params.sandbox_id);
      if (!agent) {
        const allAgents = await agentStore.listAgents();
        agent = allAgents.find((a: agentStore.AgentRecord) => a.forge_sandbox_id === req.params.sandbox_id) ?? null;
      }
      if (agent) {
        const ports = result.services.map((s: { name: string; port: number; healthy?: boolean }) => ({
          name: s.name, port: s.port, healthy: s.healthy ?? false,
        }));
        await agentStore.updateAgentConfig(agent.id, { servicePorts: ports });
        appLogger.info({ agentId: agent.id, servicePorts: ports }, `[setup] Persisted service ports for agent ${agent.id.slice(0, 8)}`);
      }
    } catch (err) {
      appLogger.warn({ err, sandboxId: req.params.sandbox_id }, `[setup] Failed to persist service ports`);
    }
  }

  res.json(result);
}));

// ── Deep Validation (post-build integration checks) ─────────────────────────

app.post('/api/sandboxes/:sandbox_id/validate', asyncHandler(async (req, res) => {
  await getRecord(req.params.sandbox_id);
  const { plan } = req.body ?? {};
  if (!plan) throw httpError(400, 'Architecture plan is required in request body');

  const sandboxShort = req.params.sandbox_id.slice(0, 8);
  const startTime = Date.now();
  appLogger.info({ sandboxId: req.params.sandbox_id, endpointCount: plan.apiEndpoints?.length ?? 0 }, `[validate:${sandboxShort}] Starting deep validation`);

  const { runDeepValidation } = await import('./agentValidation');
  const report = await runDeepValidation(req.params.sandbox_id, plan, (msg) => {
    appLogger.debug({ sandboxId: req.params.sandbox_id }, `[validate:${sandboxShort}] ${msg}`);
  });

  appLogger.info({
    sandboxId: req.params.sandbox_id,
    overallStatus: report.overallStatus,
    passCount: report.passCount,
    failCount: report.failCount,
    durationMs: Date.now() - startTime,
  }, `[validate:${sandboxShort}] Completed: ${report.passCount} pass, ${report.failCount} fail (${Date.now() - startTime}ms)`);

  res.json(report);
}));

// ── Agent Ship (persistent repo) ──────────────────────────────────────────────

app.post('/api/agents/:id/ship', requireAuth, asyncHandler(async (req, res) => {
  const agent = await agentStore.getAgent(req.params.id);
  if (!agent) throw httpError(404, 'Agent not found');
  const sandboxId = agent.forge_sandbox_id || (agent.sandbox_ids?.[0] ?? null);
  if (!sandboxId) throw httpError(400, 'Agent has no sandbox — build the agent first');
  const { githubToken, commitMessage, repoName } = req.body ?? {};
  if (typeof githubToken !== 'string' || !githubToken.trim()) throw httpError(400, 'githubToken is required');
  const result = await shipAgent({
    agentId: req.params.id,
    sandboxId,
    githubToken: githubToken.trim(),
    repoName: typeof repoName === 'string' ? repoName.trim() : undefined,
    commitMessage: typeof commitMessage === 'string' ? commitMessage : undefined,
    onLog: (msg) => console.log(`[ship:${req.params.id.slice(0,8)}] ${msg}`),
  });
  res.json(result);
}));

// ── Agent Branches (Agent-as-Code: feature branch workflow) ───────────────────

import * as agentBranchStore from './agentBranchStore';
import * as gitWorkspace from './gitWorkspace';

app.post('/api/agents/:id/branches', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  const { title, description } = req.body ?? {};
  if (!title || typeof title !== 'string' || !title.trim()) throw httpError(400, 'title is required');
  const sandboxId = agent.forge_sandbox_id || (agent.sandbox_ids?.[0] ?? null);
  if (!sandboxId) throw httpError(400, 'Agent has no sandbox');

  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'feature';
  const branchName = `feature/${slug}`;

  await gitWorkspace.ensureGitInit(sandboxId);
  await gitWorkspace.commitWorkspace(sandboxId, `wip: save before branching to ${branchName}`);
  const branchResult = await gitWorkspace.createBranch(sandboxId, branchName);
  if (!branchResult.ok) throw httpError(500, branchResult.error ?? 'Failed to create branch');

  if (agent.repo_url && agent.repo_owner && agent.repo_name) {
    try {
      const { getAccessToken } = await import('./githubConnectionStore');
      const conn = await getAccessToken(req.user!.userId);
      if (conn) {
        await gitWorkspace.setRemoteOrigin(sandboxId, gitWorkspace.buildAuthUrl(conn.token, agent.repo_owner, agent.repo_name));
        await gitWorkspace.pushBranch(sandboxId, branchName).catch(() => {});
      }
    } catch { /* non-blocking */ }
  }

  const skillGraph = Array.isArray(agent.skill_graph) ? agent.skill_graph as Array<{ name?: string; skill_id?: string }> : [];
  const featureContext: agentBranchStore.FeatureContext = {
    title: title.trim(),
    description: typeof description === 'string' ? description.trim() : '',
    baselineAgent: {
      name: agent.name,
      skillCount: skillGraph.length,
      toolCount: Array.isArray(agent.tool_connections) ? agent.tool_connections.length : 0,
      triggerCount: Array.isArray(agent.triggers) ? agent.triggers.length : 0,
      ruleCount: Array.isArray(agent.agent_rules) ? agent.agent_rules.length : 0,
      skills: skillGraph.map((s) => s.name ?? s.skill_id ?? 'unnamed').slice(0, 20),
    },
  };

  const branch = await agentBranchStore.createBranch({
    agentId: req.params.id, branchName, baseBranch: agent.active_branch || 'main',
    title: title.trim(), description: typeof description === 'string' ? description.trim() : '',
    createdBy: req.user!.userId,
  });
  await agentBranchStore.updateFeatureSession(req.params.id, branchName, { featureStage: 'think', featureContext });
  await agentStore.updateAgentConfig(req.params.id, { activeBranch: branchName });
  const updated = await agentBranchStore.getBranch(req.params.id, branchName);
  res.status(201).json(updated ?? branch);
}));

app.get('/api/agents/:id/branches', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const status = req.query.status as 'open' | 'merged' | 'closed' | undefined;
  res.json({ branches: await agentBranchStore.listBranches(req.params.id, status) });
}));

app.get('/api/agents/:id/branches/:branch', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const branch = await agentBranchStore.getBranch(req.params.id, req.params.branch);
  if (!branch) throw httpError(404, 'Branch not found');
  res.json(branch);
}));

app.post('/api/agents/:id/branches/:branch/checkout', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  const sandboxId = agent.forge_sandbox_id || (agent.sandbox_ids?.[0] ?? null);
  if (!sandboxId) throw httpError(400, 'Agent has no sandbox');
  await gitWorkspace.commitWorkspace(sandboxId, `wip: save before checkout ${req.params.branch}`);
  const result = await gitWorkspace.checkoutBranch(sandboxId, req.params.branch);
  if (!result.ok) throw httpError(500, result.error ?? 'Checkout failed');
  await agentStore.updateAgentConfig(req.params.id, { activeBranch: req.params.branch });
  res.json({ ok: true, branch: req.params.branch });
}));

app.post('/api/agents/:id/branches/:branch/commit', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  const sandboxId = agent.forge_sandbox_id || (agent.sandbox_ids?.[0] ?? null);
  if (!sandboxId) throw httpError(400, 'Agent has no sandbox');
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : `update: ${agent.name}`;
  const result = await gitWorkspace.commitWorkspace(sandboxId, message);
  if (result.sha && agent.repo_url && agent.repo_owner && agent.repo_name) {
    try {
      const { getAccessToken } = await import('./githubConnectionStore');
      const conn = await getAccessToken(req.user!.userId);
      if (conn) {
        await gitWorkspace.setRemoteOrigin(sandboxId, gitWorkspace.buildAuthUrl(conn.token, agent.repo_owner, agent.repo_name));
        await gitWorkspace.pushBranch(sandboxId, req.params.branch).catch(() => {});
      }
    } catch { /* non-blocking */ }
  }
  res.json({ sha: result.sha, filesChanged: result.filesChanged });
}));

app.get('/api/agents/:id/branches/:branch/diff', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  const sandboxId = agent.forge_sandbox_id || (agent.sandbox_ids?.[0] ?? null);
  if (!sandboxId) throw httpError(400, 'Agent has no sandbox');
  const branch = await agentBranchStore.getBranch(req.params.id, req.params.branch);
  if (!branch) throw httpError(404, 'Branch not found');
  res.json(await gitWorkspace.getDiffSummary(sandboxId, branch.base_branch, req.params.branch));
}));

app.get('/api/agents/:id/branches/:branch/session', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const branch = await agentBranchStore.getBranch(req.params.id, req.params.branch);
  if (!branch) throw httpError(404, 'Branch not found');
  res.json({
    featureStage: branch.feature_stage, featureContext: branch.feature_context,
    featurePrd: branch.feature_prd, featurePlan: branch.feature_plan,
    branchName: branch.branch_name, baseBranch: branch.base_branch,
    title: branch.title, status: branch.status,
  });
}));

app.patch('/api/agents/:id/branches/:branch/session', requireAuth, asyncHandler(async (req, res) => {
  await getOwnedAgentRecord(req, req.params.id);
  const branch = await agentBranchStore.getBranch(req.params.id, req.params.branch);
  if (!branch) throw httpError(404, 'Branch not found');
  const { featureStage, featurePrd, featurePlan } = req.body ?? {};
  const patch: Parameters<typeof agentBranchStore.updateFeatureSession>[2] = {};
  if (typeof featureStage === 'string') patch.featureStage = featureStage as agentBranchStore.FeatureStage;
  if (typeof featurePrd === 'string') patch.featurePrd = featurePrd;
  if (featurePlan !== undefined) patch.featurePlan = featurePlan;
  const updated = await agentBranchStore.updateFeatureSession(req.params.id, req.params.branch, patch);
  if (!updated) throw httpError(500, 'Failed to update session');
  res.json({ featureStage: updated.feature_stage, featureContext: updated.feature_context, featurePrd: updated.feature_prd, featurePlan: updated.feature_plan });
}));

app.post('/api/agents/:id/branches/:branch/pr', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  if (!agent.repo_url || !agent.repo_owner || !agent.repo_name) throw httpError(400, 'Agent has no GitHub repository');
  const branch = await agentBranchStore.getBranch(req.params.id, req.params.branch);
  if (!branch) throw httpError(404, 'Branch not found');
  if (branch.pr_number) { res.json({ ok: true, prNumber: branch.pr_number, prUrl: branch.pr_url, alreadyExists: true }); return; }

  const { getAccessToken } = await import('./githubConnectionStore');
  const conn = await getAccessToken(req.user!.userId);
  if (!conn) throw httpError(400, 'No GitHub connection');

  const sandboxId = agent.forge_sandbox_id || (agent.sandbox_ids?.[0] ?? null);
  if (sandboxId) {
    await gitWorkspace.setRemoteOrigin(sandboxId, gitWorkspace.buildAuthUrl(conn.token, agent.repo_owner, agent.repo_name));
    await gitWorkspace.commitWorkspace(sandboxId, `feat: ${branch.title}`);
    await gitWorkspace.pushBranch(sandboxId, branch.branch_name).catch(() => {});
  }

  const prResult = await gitWorkspace.createPullRequest(conn.token, agent.repo_owner, agent.repo_name, branch.branch_name, branch.base_branch, branch.title, branch.description || `Feature branch for ${agent.name}.`);
  if (!prResult.ok) throw httpError(500, prResult.error ?? 'Failed to create PR');
  await agentBranchStore.updateBranch(req.params.id, req.params.branch, { prNumber: prResult.prNumber ?? null, prUrl: prResult.prUrl ?? null });
  res.json({ ok: true, prNumber: prResult.prNumber, prUrl: prResult.prUrl });
}));

app.post('/api/agents/:id/branches/:branch/merge', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  if (!agent.repo_url || !agent.repo_owner || !agent.repo_name) throw httpError(400, 'Agent has no GitHub repository');
  const branch = await agentBranchStore.getBranch(req.params.id, req.params.branch);
  if (!branch) throw httpError(404, 'Branch not found');
  if (!branch.pr_number) throw httpError(400, 'No PR exists — create one first');

  const { getAccessToken } = await import('./githubConnectionStore');
  const conn = await getAccessToken(req.user!.userId);
  if (!conn) throw httpError(400, 'No GitHub connection');

  const mergeResult = await gitWorkspace.squashMergePullRequest(conn.token, agent.repo_owner, agent.repo_name, branch.pr_number, `feat: ${branch.title}`);
  if (!mergeResult.ok) throw httpError(500, mergeResult.error ?? 'Merge failed');

  const sandboxId = agent.forge_sandbox_id || (agent.sandbox_ids?.[0] ?? null);
  if (sandboxId) {
    await gitWorkspace.setRemoteOrigin(sandboxId, gitWorkspace.buildAuthUrl(conn.token, agent.repo_owner, agent.repo_name));
    await gitWorkspace.checkoutBranch(sandboxId, branch.base_branch);
    await dockerExec(getContainerName(sandboxId), `cd ~/.openclaw/workspace && git pull origin ${branch.base_branch} 2>&1`, 30_000).catch(() => {});
  }

  await agentBranchStore.updateBranch(req.params.id, req.params.branch, { status: 'merged', mergedAt: new Date().toISOString() });
  await agentStore.updateAgentConfig(req.params.id, { activeBranch: branch.base_branch });

  try {
    const updatedAgent = await agentStore.getAgent(req.params.id);
    if (updatedAgent) {
      await agentStore.createAgentConfigVersion(req.params.id, {
        skillGraph: updatedAgent.skill_graph, workflow: updatedAgent.workflow,
        agentRules: updatedAgent.agent_rules, triggers: updatedAgent.triggers, channels: updatedAgent.channels,
      }, `feat: ${branch.title}`, req.user!.userId);
    }
  } catch { /* non-blocking */ }

  res.json({ ok: true, sha: mergeResult.sha, branch: branch.base_branch });
}));

app.delete('/api/agents/:id/branches/:branch', requireAuth, asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentRecord(req, req.params.id);
  const branch = await agentBranchStore.getBranch(req.params.id, req.params.branch);
  if (!branch) throw httpError(404, 'Branch not found');
  const sandboxId = agent.forge_sandbox_id || (agent.sandbox_ids?.[0] ?? null);
  if (sandboxId && agent.active_branch === branch.branch_name) {
    await gitWorkspace.checkoutBranch(sandboxId, branch.base_branch).catch(() => {});
    await agentStore.updateAgentConfig(req.params.id, { activeBranch: branch.base_branch });
  }
  await agentBranchStore.updateBranch(req.params.id, req.params.branch, { status: 'closed' });
  res.json({ ok: true });
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
