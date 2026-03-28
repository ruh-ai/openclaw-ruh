/**
 * PostgreSQL-backed store for agent records.
 */

import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface AgentWorkspaceMemory {
  instructions: string;
  continuity_summary: string;
  pinned_paths: string[];
  updated_at: string | null;
}

export interface AgentToolConnectionRecord {
  toolId: string;
  name: string;
  description: string;
  status: 'available' | 'configured' | 'missing_secret' | 'unsupported';
  authKind: 'oauth' | 'api_key' | 'service_account' | 'none';
  connectorType: 'mcp' | 'api' | 'cli';
  configSummary: string[];
}

export interface AgentRuntimeInputRecord {
  key: string;
  label: string;
  description: string;
  required: boolean;
  source: 'architect_requirement' | 'skill_requirement';
  value: string;
}

export interface AgentDiscoveryDocumentSectionRecord {
  heading: string;
  content: string;
}

export interface AgentDiscoveryDocumentRecord {
  title: string;
  sections: AgentDiscoveryDocumentSectionRecord[];
}

export interface AgentDiscoveryDocumentsRecord {
  prd: AgentDiscoveryDocumentRecord;
  trd: AgentDiscoveryDocumentRecord;
}

export interface AgentTriggerRecord {
  id: string;
  title: string;
  kind: 'manual' | 'schedule' | 'webhook';
  status: 'supported' | 'unsupported';
  description: string;
  schedule?: string;
  webhookPublicId?: string;
  webhookSecretHash?: string;
  webhookSecretLastFour?: string;
  webhookSecretIssuedAt?: string;
  webhookLastDeliveryAt?: string;
  webhookLastDeliveryStatus?: 'delivered' | 'failed';
}

export interface AgentImprovementRecord {
  id: string;
  kind: 'tool_connection' | 'trigger' | 'workflow';
  status: 'pending' | 'accepted' | 'dismissed';
  scope: 'builder';
  title: string;
  summary: string;
  rationale: string;
  targetId?: string;
}

export interface AgentChannelRecord {
  kind: 'telegram' | 'slack' | 'discord';
  status: 'planned' | 'configured' | 'unsupported';
  label: string;
  description: string;
}

export interface AgentCredentialRecord {
  toolId: string;
  encrypted: string;
  iv: string;
  createdAt: string;
}

export interface AgentCredentialSummary {
  toolId: string;
  hasCredentials: boolean;
  createdAt: string;
}

export type AgentStatus = 'active' | 'draft' | 'forging';

export interface AgentRecord {
  id: string;
  name: string;
  avatar: string;
  description: string;
  skills: string[];
  trigger_label: string;
  status: AgentStatus;
  sandbox_ids: string[];
  forge_sandbox_id: string | null;
  skill_graph: unknown | null;
  workflow: unknown | null;
  agent_rules: string[];
  runtime_inputs: AgentRuntimeInputRecord[];
  tool_connections: AgentToolConnectionRecord[];
  triggers: AgentTriggerRecord[];
  improvements: AgentImprovementRecord[];
  channels: AgentChannelRecord[];
  discovery_documents: AgentDiscoveryDocumentsRecord | null;
  workspace_memory: AgentWorkspaceMemory;
  created_at: string;
  updated_at: string;
}

export async function saveAgent(data: {
  name: string;
  avatar?: string;
  description?: string;
  skills?: string[];
  triggerLabel?: string;
  status?: AgentStatus;
  skillGraph?: unknown;
  workflow?: unknown;
  agentRules?: string[];
  runtimeInputs?: AgentRuntimeInputRecord[];
  toolConnections?: AgentToolConnectionRecord[];
  triggers?: AgentTriggerRecord[];
  improvements?: AgentImprovementRecord[];
  channels?: AgentChannelRecord[];
  discoveryDocuments?: AgentDiscoveryDocumentsRecord | null;
  forge_sandbox_id?: string;
}): Promise<AgentRecord> {
  const id = uuidv4();
  await withConn(async (client) => {
    await client.query(
      `INSERT INTO agents (id, name, avatar, description, skills, trigger_label, status, skill_graph, workflow, agent_rules, runtime_inputs, tool_connections, triggers, improvements, channels, discovery_documents, forge_sandbox_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        data.name,
        data.avatar ?? '',
        data.description ?? '',
        JSON.stringify(data.skills ?? []),
        data.triggerLabel ?? '',
        data.status ?? 'draft',
        data.skillGraph ? JSON.stringify(data.skillGraph) : null,
        data.workflow ? JSON.stringify(data.workflow) : null,
        JSON.stringify(data.agentRules ?? []),
        JSON.stringify(data.runtimeInputs ?? []),
        JSON.stringify(data.toolConnections ?? []),
        JSON.stringify(data.triggers ?? []),
        JSON.stringify(data.improvements ?? []),
        JSON.stringify(data.channels ?? []),
        data.discoveryDocuments ? JSON.stringify(data.discoveryDocuments) : null,
        data.forge_sandbox_id ?? null,
      ],
    );
  });
  const agent = await getAgent(id);
  if (!agent) throw new Error('Failed to create agent');
  return agent;
}

export async function listAgents(): Promise<AgentRecord[]> {
  return withConn(async (client) => {
    const res = await client.query(
      'SELECT * FROM agents ORDER BY created_at DESC',
    );
    return res.rows.map(serialize);
  });
}

export async function getAgent(id: string): Promise<AgentRecord | null> {
  return withConn(async (client) => {
    const res = await client.query(
      'SELECT * FROM agents WHERE id = $1',
      [id],
    );
    return res.rows.length > 0 ? serialize(res.rows[0]) : null;
  });
}

export async function updateAgent(
  id: string,
  patch: {
    name?: string;
    avatar?: string;
    description?: string;
    skills?: string[];
    triggerLabel?: string;
    status?: AgentStatus;
    channels?: AgentChannelRecord[];
    forge_sandbox_id?: string;
  },
): Promise<AgentRecord | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (patch.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(patch.name); }
  if (patch.avatar !== undefined) { sets.push(`avatar = $${idx++}`); vals.push(patch.avatar); }
  if (patch.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(patch.description); }
  if (patch.skills !== undefined) { sets.push(`skills = $${idx++}`); vals.push(JSON.stringify(patch.skills)); }
  if (patch.triggerLabel !== undefined) { sets.push(`trigger_label = $${idx++}`); vals.push(patch.triggerLabel); }
  if (patch.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(patch.status); }
  if (patch.channels !== undefined) { sets.push(`channels = $${idx++}`); vals.push(JSON.stringify(patch.channels)); }
  if (patch.forge_sandbox_id !== undefined) { sets.push(`forge_sandbox_id = $${idx++}`); vals.push(patch.forge_sandbox_id); }

  if (sets.length === 0) return getAgent(id);

  sets.push(`updated_at = NOW()`);
  vals.push(id);

  await withConn(async (client) => {
    await client.query(
      `UPDATE agents SET ${sets.join(', ')} WHERE id = $${idx}`,
      vals,
    );
  });
  return getAgent(id);
}

export async function updateAgentConfig(
  id: string,
  config: {
    skillGraph?: unknown;
    workflow?: unknown;
    agentRules?: string[];
    runtimeInputs?: AgentRuntimeInputRecord[];
    toolConnections?: AgentToolConnectionRecord[];
    triggers?: AgentTriggerRecord[];
    improvements?: AgentImprovementRecord[];
    channels?: AgentChannelRecord[];
    discoveryDocuments?: AgentDiscoveryDocumentsRecord | null;
  },
): Promise<AgentRecord | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (config.skillGraph !== undefined) { sets.push(`skill_graph = $${idx++}`); vals.push(JSON.stringify(config.skillGraph)); }
  if (config.workflow !== undefined) { sets.push(`workflow = $${idx++}`); vals.push(JSON.stringify(config.workflow)); }
  if (config.agentRules !== undefined) { sets.push(`agent_rules = $${idx++}`); vals.push(JSON.stringify(config.agentRules)); }
  if (config.runtimeInputs !== undefined) { sets.push(`runtime_inputs = $${idx++}`); vals.push(JSON.stringify(config.runtimeInputs)); }
  if (config.toolConnections !== undefined) { sets.push(`tool_connections = $${idx++}`); vals.push(JSON.stringify(config.toolConnections)); }
  if (config.triggers !== undefined) { sets.push(`triggers = $${idx++}`); vals.push(JSON.stringify(config.triggers)); }
  if (config.improvements !== undefined) { sets.push(`improvements = $${idx++}`); vals.push(JSON.stringify(config.improvements)); }
  if (config.channels !== undefined) { sets.push(`channels = $${idx++}`); vals.push(JSON.stringify(config.channels)); }
  if (config.discoveryDocuments !== undefined) { sets.push(`discovery_documents = $${idx++}`); vals.push(config.discoveryDocuments ? JSON.stringify(config.discoveryDocuments) : null); }

  if (sets.length === 0) return getAgent(id);

  sets.push(`updated_at = NOW()`);
  vals.push(id);

  await withConn(async (client) => {
    await client.query(
      `UPDATE agents SET ${sets.join(', ')} WHERE id = $${idx}`,
      vals,
    );
  });
  return getAgent(id);
}

export async function addSandboxToAgent(agentId: string, sandboxId: string): Promise<AgentRecord | null> {
  await withConn(async (client) => {
    await client.query(
      `UPDATE agents
       SET sandbox_ids = sandbox_ids || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2
         AND NOT sandbox_ids @> $1::jsonb`,
      [JSON.stringify([sandboxId]), agentId],
    );
  });
  return getAgent(agentId);
}

export async function removeSandboxFromAgent(agentId: string, sandboxId: string): Promise<AgentRecord | null> {
  await withConn(async (client) => {
    await client.query(
      `UPDATE agents
       SET sandbox_ids = (
         SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
         FROM jsonb_array_elements(sandbox_ids) elem
         WHERE elem #>> '{}' <> $1
       ),
       updated_at = NOW()
       WHERE id = $2`,
      [sandboxId, agentId],
    );
  });
  return getAgent(agentId);
}

// ─── Forge lifecycle ─────────────────────────────────────────────────────────

/**
 * Link a forge sandbox to an agent and set status to 'forging'.
 * Also adds the sandbox to sandbox_ids if not already present.
 */
export async function setForgeSandbox(agentId: string, sandboxId: string): Promise<AgentRecord | null> {
  await withConn(async (client) => {
    await client.query(
      `UPDATE agents
       SET forge_sandbox_id = $1,
           status = 'forging',
           sandbox_ids = CASE
             WHEN NOT sandbox_ids @> $2::jsonb THEN sandbox_ids || $2::jsonb
             ELSE sandbox_ids
           END,
           updated_at = NOW()
       WHERE id = $3`,
      [sandboxId, JSON.stringify([sandboxId]), agentId],
    );
  });
  return getAgent(agentId);
}

/**
 * Promote a forge sandbox to production: clear forge_sandbox_id, set status to 'active'.
 * The sandbox remains in sandbox_ids as a production sandbox.
 */
export async function promoteForgeSandbox(agentId: string): Promise<AgentRecord | null> {
  // First read the agent to get the forge_sandbox_id
  const agent = await getAgent(agentId);
  if (!agent?.forge_sandbox_id) return agent;

  const forgeSid = agent.forge_sandbox_id;
  const currentIds: string[] = agent.sandbox_ids ?? [];
  const newIds = currentIds.includes(forgeSid) ? currentIds : [...currentIds, forgeSid];

  await withConn(async (client) => {
    await client.query(
      `UPDATE agents
       SET sandbox_ids = $1::jsonb,
           forge_sandbox_id = NULL,
           status = 'active',
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(newIds), agentId],
    );
  });
  return getAgent(agentId);
}

/**
 * Clear forge sandbox without promoting (e.g. on failure or discard).
 * Reverts status to 'draft'.
 */
export async function clearForgeSandbox(agentId: string): Promise<AgentRecord | null> {
  await withConn(async (client) => {
    await client.query(
      `UPDATE agents
       SET forge_sandbox_id = NULL,
           status = 'draft',
           updated_at = NOW()
       WHERE id = $1`,
      [agentId],
    );
  });
  return getAgent(agentId);
}

export async function deleteAgent(id: string): Promise<boolean> {
  return withConn(async (client) => {
    const res = await client.query(
      'DELETE FROM agents WHERE id = $1',
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

export async function getAgentWorkspaceMemory(id: string): Promise<AgentWorkspaceMemory | null> {
  const agent = await getAgent(id);
  if (!agent) {
    return null;
  }
  return normalizeWorkspaceMemory(agent.workspace_memory);
}

export async function updateAgentWorkspaceMemory(
  id: string,
  patch: {
    instructions?: string;
    continuitySummary?: string;
    pinnedPaths?: string[];
  },
): Promise<AgentWorkspaceMemory | null> {
  const existing = await getAgent(id);
  if (!existing) {
    return null;
  }

  const next: AgentWorkspaceMemory = {
    ...normalizeWorkspaceMemory(existing.workspace_memory),
    ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
    ...(patch.continuitySummary !== undefined ? { continuity_summary: patch.continuitySummary } : {}),
    ...(patch.pinnedPaths !== undefined ? { pinned_paths: patch.pinnedPaths } : {}),
    updated_at: new Date().toISOString(),
  };

  await withConn(async (client) => {
    await client.query(
      `UPDATE agents SET workspace_memory = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(next), id],
    );
  });

  const updated = await getAgent(id);
  return updated ? normalizeWorkspaceMemory(updated.workspace_memory) : null;
}

function serialize(row: Record<string, unknown>): AgentRecord {
  if (row['created_at'] instanceof Date) {
    row['created_at'] = row['created_at'].toISOString();
  }
  if (row['updated_at'] instanceof Date) {
    row['updated_at'] = row['updated_at'].toISOString();
  }
  row['tool_connections'] = normalizeToolConnections(row['tool_connections']);
  row['runtime_inputs'] = normalizeRuntimeInputs(row['runtime_inputs']);
  row['triggers'] = normalizeTriggers(row['triggers']);
  row['improvements'] = normalizeImprovements(row['improvements']);
  row['channels'] = normalizeChannels(row['channels']);
  row['discovery_documents'] = normalizeDiscoveryDocuments(row['discovery_documents']);
  row['workspace_memory'] = normalizeWorkspaceMemory(row['workspace_memory']);
  // Normalize forge_sandbox_id: null if not present or not a string
  row['forge_sandbox_id'] = typeof row['forge_sandbox_id'] === 'string' ? row['forge_sandbox_id'] : null;
  return row as unknown as AgentRecord;
}

function normalizeToolConnections(value: unknown): AgentToolConnectionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      toolId: typeof item.toolId === 'string' ? item.toolId : '',
      name: typeof item.name === 'string' ? item.name : '',
      description: typeof item.description === 'string' ? item.description : '',
      status:
        item.status === 'available' || item.status === 'configured' || item.status === 'missing_secret' || item.status === 'unsupported'
          ? item.status
          : 'available',
      authKind:
        item.authKind === 'oauth' || item.authKind === 'api_key' || item.authKind === 'service_account' || item.authKind === 'none'
          ? item.authKind
          : 'none',
      connectorType:
        item.connectorType === 'api' || item.connectorType === 'cli' || item.connectorType === 'mcp'
          ? item.connectorType
          : 'mcp',
      configSummary: Array.isArray(item.configSummary)
        ? item.configSummary.filter((entry): entry is string => typeof entry === 'string')
        : [],
    }))
    .filter((item) => item.toolId && item.name);
}

function normalizeRuntimeInputs(value: unknown): AgentRuntimeInputRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      key: typeof item.key === 'string' ? item.key : '',
      label: typeof item.label === 'string' ? item.label : '',
      description: typeof item.description === 'string' ? item.description : '',
      required: item.required !== false,
      source:
        item.source === 'skill_requirement' || item.source === 'architect_requirement'
          ? item.source
          : 'architect_requirement',
      value: typeof item.value === 'string' ? item.value : '',
    }))
    .filter((item) => item.key);
}

function normalizeTriggers(value: unknown): AgentTriggerRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      title: typeof item.title === 'string' ? item.title : '',
      kind: item.kind === 'schedule' || item.kind === 'webhook' ? item.kind : 'manual',
      status: item.status === 'supported' ? 'supported' : 'unsupported',
      description: typeof item.description === 'string' ? item.description : '',
      ...(typeof item.schedule === 'string' ? { schedule: item.schedule } : {}),
      ...(typeof item.webhookPublicId === 'string' ? { webhookPublicId: item.webhookPublicId } : {}),
      ...(typeof item.webhookSecretHash === 'string' ? { webhookSecretHash: item.webhookSecretHash } : {}),
      ...(typeof item.webhookSecretLastFour === 'string' ? { webhookSecretLastFour: item.webhookSecretLastFour } : {}),
      ...(typeof item.webhookSecretIssuedAt === 'string' ? { webhookSecretIssuedAt: item.webhookSecretIssuedAt } : {}),
      ...(typeof item.webhookLastDeliveryAt === 'string' ? { webhookLastDeliveryAt: item.webhookLastDeliveryAt } : {}),
      ...(item.webhookLastDeliveryStatus === 'delivered' || item.webhookLastDeliveryStatus === 'failed'
        ? { webhookLastDeliveryStatus: item.webhookLastDeliveryStatus }
        : {}),
    }))
    .filter((item) => item.id && item.title);
}

function normalizeImprovements(value: unknown): AgentImprovementRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      kind:
        item.kind === 'trigger' || item.kind === 'workflow' || item.kind === 'tool_connection'
          ? item.kind
          : 'workflow',
      status:
        item.status === 'accepted' || item.status === 'dismissed' || item.status === 'pending'
          ? item.status
          : 'pending',
      scope: 'builder' as const,
      title: typeof item.title === 'string' ? item.title : '',
      summary: typeof item.summary === 'string' ? item.summary : '',
      rationale: typeof item.rationale === 'string' ? item.rationale : '',
      ...(typeof item.targetId === 'string' ? { targetId: item.targetId } : {}),
    }))
    .filter((item) => item.id && item.title && item.summary && item.rationale);
}

function normalizeChannels(value: unknown): AgentChannelRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      kind:
        item.kind === 'telegram' || item.kind === 'slack' || item.kind === 'discord'
          ? item.kind
          : 'slack',
      status:
        item.status === 'configured' || item.status === 'unsupported' || item.status === 'planned'
          ? item.status
          : 'planned',
      label: typeof item.label === 'string' ? item.label : '',
      description: typeof item.description === 'string' ? item.description : '',
    }))
    .filter((item) => item.label.trim().length > 0);
}

function normalizeDiscoveryDocuments(value: unknown): AgentDiscoveryDocumentsRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as Record<string, unknown>;
  const normalizeDocument = (doc: unknown): AgentDiscoveryDocumentRecord | null => {
    if (!doc || typeof doc !== 'object') {
      return null;
    }
    const raw = doc as Record<string, unknown>;
    if (typeof raw.title !== 'string' || !Array.isArray(raw.sections)) {
      return null;
    }

    return {
      title: raw.title,
      sections: raw.sections.flatMap((section) => {
        if (!section || typeof section !== 'object') {
          return [];
        }
        const rawSection = section as Record<string, unknown>;
        if (typeof rawSection.heading !== 'string' || typeof rawSection.content !== 'string') {
          return [];
        }
        return [{
          heading: rawSection.heading,
          content: rawSection.content,
        }];
      }),
    };
  };

  const prd = normalizeDocument(input['prd']);
  const trd = normalizeDocument(input['trd']);
  if (!prd || !trd) {
    return null;
  }

  return { prd, trd };
}

function normalizeWorkspaceMemory(value: unknown): AgentWorkspaceMemory {
  const raw = (value && typeof value === 'object' && !Array.isArray(value))
    ? value as Record<string, unknown>
    : {};

  const updatedAtRaw = raw['updated_at'];
  const updatedAt = updatedAtRaw instanceof Date
    ? updatedAtRaw.toISOString()
    : typeof updatedAtRaw === 'string'
    ? updatedAtRaw
    : null;

  return {
    instructions: typeof raw['instructions'] === 'string' ? raw['instructions'] : '',
    continuity_summary: typeof raw['continuity_summary'] === 'string' ? raw['continuity_summary'] : '',
    pinned_paths: Array.isArray(raw['pinned_paths'])
      ? raw['pinned_paths'].filter((item): item is string => typeof item === 'string')
      : [],
    updated_at: updatedAt,
  };
}

// ─── Credential CRUD ──────────────────────────────────────────────────────────

function normalizeCredentials(raw: unknown): AgentCredentialRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is AgentCredentialRecord =>
    typeof item === 'object' &&
    item !== null &&
    typeof (item as Record<string, unknown>).toolId === 'string' &&
    typeof (item as Record<string, unknown>).encrypted === 'string'
  );
}

export async function saveAgentCredential(
  agentId: string,
  toolId: string,
  encrypted: string,
  iv: string,
): Promise<void> {
  await withConn(async (client) => {
    // Read current credentials, upsert the entry for this toolId
    const result = await client.query(
      'SELECT agent_credentials FROM agents WHERE id = $1',
      [agentId],
    );
    if (result.rows.length === 0) throw new Error(`Agent ${agentId} not found`);

    const existing = normalizeCredentials(result.rows[0].agent_credentials);
    const filtered = existing.filter((c) => c.toolId !== toolId);
    const updated = [
      ...filtered,
      { toolId, encrypted, iv, createdAt: new Date().toISOString() },
    ];

    await client.query(
      'UPDATE agents SET agent_credentials = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updated), agentId],
    );
  });
}

export async function deleteAgentCredential(
  agentId: string,
  toolId: string,
): Promise<void> {
  await withConn(async (client) => {
    const result = await client.query(
      'SELECT agent_credentials FROM agents WHERE id = $1',
      [agentId],
    );
    if (result.rows.length === 0) throw new Error(`Agent ${agentId} not found`);

    const existing = normalizeCredentials(result.rows[0].agent_credentials);
    const updated = existing.filter((c) => c.toolId !== toolId);

    await client.query(
      'UPDATE agents SET agent_credentials = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updated), agentId],
    );
  });
}

export async function getAgentCredentials(
  agentId: string,
): Promise<AgentCredentialRecord[]> {
  return await withConn(async (client) => {
    const result = await client.query(
      'SELECT agent_credentials FROM agents WHERE id = $1',
      [agentId],
    );
    if (result.rows.length === 0) return [];
    return normalizeCredentials(result.rows[0].agent_credentials);
  });
}

export async function getAgentCredentialSummary(
  agentId: string,
): Promise<AgentCredentialSummary[]> {
  const creds = await getAgentCredentials(agentId);
  return creds.map((c) => ({
    toolId: c.toolId,
    hasCredentials: true,
    createdAt: c.createdAt,
  }));
}
