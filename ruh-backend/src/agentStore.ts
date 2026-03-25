/**
 * PostgreSQL-backed store for agent records.
 */

import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface AgentRecord {
  id: string;
  name: string;
  avatar: string;
  description: string;
  skills: string[];
  trigger_label: string;
  status: 'active' | 'draft';
  sandbox_ids: string[];
  skill_graph: unknown | null;
  workflow: unknown | null;
  agent_rules: string[];
  created_at: string;
  updated_at: string;
}

export async function initDb(): Promise<void> {
  await withConn(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id              TEXT        PRIMARY KEY,
        name            TEXT        NOT NULL,
        avatar          TEXT        NOT NULL DEFAULT '',
        description     TEXT        NOT NULL DEFAULT '',
        skills          JSONB       NOT NULL DEFAULT '[]',
        trigger_label   TEXT        NOT NULL DEFAULT '',
        status          TEXT        NOT NULL DEFAULT 'draft',
        sandbox_ids     JSONB       NOT NULL DEFAULT '[]',
        skill_graph     JSONB,
        workflow        JSONB,
        agent_rules     JSONB       NOT NULL DEFAULT '[]',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents (status)
    `);
  });
}

export async function saveAgent(data: {
  name: string;
  avatar?: string;
  description?: string;
  skills?: string[];
  triggerLabel?: string;
  status?: 'active' | 'draft';
  skillGraph?: unknown;
  workflow?: unknown;
  agentRules?: string[];
}): Promise<AgentRecord> {
  const id = uuidv4();
  await withConn(async (client) => {
    await client.query(
      `INSERT INTO agents (id, name, avatar, description, skills, trigger_label, status, skill_graph, workflow, agent_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
    status?: 'active' | 'draft';
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
  },
): Promise<AgentRecord | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (config.skillGraph !== undefined) { sets.push(`skill_graph = $${idx++}`); vals.push(JSON.stringify(config.skillGraph)); }
  if (config.workflow !== undefined) { sets.push(`workflow = $${idx++}`); vals.push(JSON.stringify(config.workflow)); }
  if (config.agentRules !== undefined) { sets.push(`agent_rules = $${idx++}`); vals.push(JSON.stringify(config.agentRules)); }

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

export async function deleteAgent(id: string): Promise<boolean> {
  return withConn(async (client) => {
    const res = await client.query(
      'DELETE FROM agents WHERE id = $1',
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

function serialize(row: Record<string, unknown>): AgentRecord {
  if (row['created_at'] instanceof Date) {
    row['created_at'] = row['created_at'].toISOString();
  }
  if (row['updated_at'] instanceof Date) {
    row['updated_at'] = row['updated_at'].toISOString();
  }
  return row as unknown as AgentRecord;
}
