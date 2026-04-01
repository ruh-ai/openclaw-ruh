import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';
import { httpError } from '../utils';

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  version: number;
  model: string;
  status: string;
  filePath: string | null;
  promptHash: string | null;
  tools: string;
  stack: string;
  skills: string[];
  promptSize: number;
  circuitState: string;
  consecutiveFailures: number;
  tasksTotal: number;
  tasksPassed: number;
  tasksFailed: number;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function serialize(row: Record<string, unknown>): Agent {
  let skills: string[] = [];
  try {
    const raw = row.skills;
    if (typeof raw === 'string') skills = JSON.parse(raw);
    else if (Array.isArray(raw)) skills = raw as string[];
  } catch { /* default empty */ }

  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    version: Number(row.version),
    model: String(row.model),
    status: String(row.status),
    filePath: row.file_path ? String(row.file_path) : null,
    promptHash: row.prompt_hash ? String(row.prompt_hash) : null,
    tools: row.tools ? String(row.tools) : '',
    stack: row.stack ? String(row.stack) : '',
    skills,
    promptSize: Number(row.prompt_size ?? 0),
    circuitState: String(row.circuit_state ?? 'closed'),
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    tasksTotal: Number(row.tasks_total),
    tasksPassed: Number(row.tasks_passed),
    tasksFailed: Number(row.tasks_failed),
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listAgents(): Promise<Agent[]> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM agents ORDER BY name');
    return result.rows.map(serialize);
  });
}

export async function getAgent(name: string): Promise<Agent> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM agents WHERE name = $1', [name]);
    if (!result.rows[0]) throw httpError(404, `Agent '${name}' not found`);
    return serialize(result.rows[0]);
  });
}

export async function createAgent(data: {
  name: string;
  description?: string;
  model?: string;
  filePath?: string;
  promptHash?: string;
}): Promise<Agent> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO agents (id, name, description, model, file_path, prompt_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, data.name, data.description || null, data.model || 'sonnet', data.filePath || null, data.promptHash || null],
    );
    return serialize(result.rows[0]);
  });
}

export async function updateAgent(
  name: string,
  patch: Partial<Pick<Agent, 'description' | 'version' | 'model' | 'status' | 'promptHash' | 'tasksTotal' | 'tasksPassed' | 'tasksFailed'>>,
): Promise<Agent> {
  return withConn(async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.description !== undefined) { sets.push(`description = $${idx++}`); params.push(patch.description); }
    if (patch.version !== undefined) { sets.push(`version = $${idx++}`); params.push(patch.version); }
    if (patch.model !== undefined) { sets.push(`model = $${idx++}`); params.push(patch.model); }
    if (patch.status !== undefined) { sets.push(`status = $${idx++}`); params.push(patch.status); }
    if (patch.promptHash !== undefined) { sets.push(`prompt_hash = $${idx++}`); params.push(patch.promptHash); }
    if (patch.tasksTotal !== undefined) { sets.push(`tasks_total = $${idx++}`); params.push(patch.tasksTotal); }
    if (patch.tasksPassed !== undefined) { sets.push(`tasks_passed = $${idx++}`); params.push(patch.tasksPassed); }
    if (patch.tasksFailed !== undefined) { sets.push(`tasks_failed = $${idx++}`); params.push(patch.tasksFailed); }

    if (sets.length === 0) return getAgent(name);

    sets.push(`updated_at = NOW()`);
    const result = await client.query(
      `UPDATE agents SET ${sets.join(', ')} WHERE name = $${idx} RETURNING *`,
      [...params, name],
    );
    if (!result.rows[0]) throw httpError(404, `Agent '${name}' not found`);
    return serialize(result.rows[0]);
  });
}

export async function incrementAgentScore(agentName: string, passed: boolean): Promise<void> {
  return withConn(async (client) => {
    const field = passed ? 'tasks_passed' : 'tasks_failed';
    await client.query(
      `UPDATE agents SET tasks_total = tasks_total + 1, ${field} = ${field} + 1, updated_at = NOW() WHERE name = $1`,
      [agentName],
    );
  });
}

export async function deleteAgent(name: string): Promise<boolean> {
  return withConn(async (client) => {
    const result = await client.query('DELETE FROM agents WHERE name = $1', [name]);
    return (result.rowCount ?? 0) > 0;
  });
}
