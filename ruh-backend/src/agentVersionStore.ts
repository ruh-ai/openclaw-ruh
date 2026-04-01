import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface AgentVersionRecord<TSnapshot = unknown> {
  id: string;
  agentId: string;
  version: string;
  changelog: string;
  snapshot: TSnapshot;
  createdBy: string;
  createdAt: string;
}

function serialize<TSnapshot>(row: Record<string, unknown>): AgentVersionRecord<TSnapshot> {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    version: String(row.version),
    changelog: String(row.changelog ?? ''),
    snapshot: row.snapshot as TSnapshot,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

export async function getAgentVersionByVersion<TSnapshot = unknown>(
  agentId: string,
  version: string,
): Promise<AgentVersionRecord<TSnapshot> | null> {
  return withConn(async (client) => {
    const result = await client.query(
      `SELECT * FROM agent_versions WHERE agent_id = $1 AND version = $2 LIMIT 1`,
      [agentId, version],
    );
    return result.rows[0] ? serialize<TSnapshot>(result.rows[0]) : null;
  });
}

export async function createAgentVersion<TSnapshot = unknown>(data: {
  agentId: string;
  version: string;
  changelog?: string;
  snapshot: TSnapshot;
  createdBy: string;
}): Promise<AgentVersionRecord<TSnapshot>> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO agent_versions (id, agent_id, version, changelog, snapshot, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [
        id,
        data.agentId,
        data.version,
        data.changelog ?? '',
        JSON.stringify(data.snapshot),
        data.createdBy,
      ],
    );
    return serialize<TSnapshot>(result.rows[0]);
  });
}
