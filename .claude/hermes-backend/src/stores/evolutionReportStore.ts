import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';
import { httpError } from '../utils';

export interface EvolutionReport {
  id: string;
  reportType: string;
  summary: string;
  details: unknown;
  actionsTaken: unknown;
  trigger: string;
  createdAt: string;
}

function serialize(row: Record<string, unknown>): EvolutionReport {
  return {
    id: String(row.id),
    reportType: String(row.report_type),
    summary: String(row.summary),
    details: row.details ?? null,
    actionsTaken: row.actions_taken ?? null,
    trigger: String(row.trigger ?? 'scheduled'),
    createdAt: String(row.created_at),
  };
}

export async function listReports(filters?: {
  reportType?: string;
  limit?: number;
}): Promise<EvolutionReport[]> {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.reportType) { conditions.push(`report_type = $${idx++}`); params.push(filters.reportType); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;

    const result = await client.query(
      `SELECT * FROM evolution_reports ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      [...params, limit],
    );
    return result.rows.map(serialize);
  });
}

export async function getReport(id: string): Promise<EvolutionReport> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM evolution_reports WHERE id = $1', [id]);
    if (!result.rows[0]) throw httpError(404, 'Evolution report not found');
    return serialize(result.rows[0]);
  });
}

export async function getAgentTrends(days: number = 7): Promise<Array<{
  agentName: string;
  date: string;
  total: number;
  passed: number;
  failed: number;
  avgScore: number;
}>> {
  return withConn(async (client) => {
    const result = await client.query(`
      SELECT
        agent_name,
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE passed = true) as passed,
        COUNT(*) FILTER (WHERE passed = false) as failed,
        COALESCE(AVG(score), 0) as avg_score
      FROM agent_scores
      WHERE created_at > NOW() - INTERVAL '1 day' * $1
      GROUP BY agent_name, DATE(created_at)
      ORDER BY date DESC, agent_name
    `, [days]);

    return result.rows.map(row => ({
      agentName: String(row.agent_name),
      date: String(row.date),
      total: Number(row.total),
      passed: Number(row.passed),
      failed: Number(row.failed),
      avgScore: Number(Number(row.avg_score).toFixed(1)),
    }));
  });
}
