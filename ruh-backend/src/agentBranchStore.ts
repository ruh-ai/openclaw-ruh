/**
 * agentBranchStore.ts — CRUD for agent_branches table + feature sessions.
 */

import { withConn } from './db';

export type FeatureStage = 'think' | 'plan' | 'build' | 'review' | 'test' | 'ship' | 'reflect' | 'complete';

export interface FeatureContext {
  title: string;
  description: string;
  baselineAgent: {
    name: string;
    skillCount: number;
    toolCount: number;
    triggerCount: number;
    ruleCount: number;
    skills: string[];
  };
}

export interface AgentBranchRecord {
  id: string;
  agent_id: string;
  branch_name: string;
  base_branch: string;
  title: string;
  description: string;
  status: 'open' | 'merged' | 'closed';
  pr_number: number | null;
  pr_url: string | null;
  created_by: string | null;
  merged_at: string | null;
  feature_stage: FeatureStage;
  feature_context: FeatureContext | null;
  feature_prd: string | null;
  feature_plan: unknown | null;
  created_at: string;
  updated_at: string;
}

const BRANCH_COLUMNS = `
  id, agent_id, branch_name, base_branch, title, description,
  status, pr_number, pr_url, created_by, merged_at,
  feature_stage, feature_context, feature_prd, feature_plan,
  created_at, updated_at
`;

function rowToBranch(row: Record<string, unknown>): AgentBranchRecord {
  return {
    id: row.id as string,
    agent_id: row.agent_id as string,
    branch_name: row.branch_name as string,
    base_branch: row.base_branch as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as 'open' | 'merged' | 'closed',
    pr_number: (row.pr_number as number | null) ?? null,
    pr_url: (row.pr_url as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    merged_at: row.merged_at ? String(row.merged_at) : null,
    feature_stage: (row.feature_stage as FeatureStage) ?? 'think',
    feature_context: (row.feature_context as FeatureContext | null) ?? null,
    feature_prd: (row.feature_prd as string | null) ?? null,
    feature_plan: (row.feature_plan as unknown) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function createBranch(data: {
  agentId: string; branchName: string; baseBranch?: string;
  title: string; description?: string; createdBy?: string;
}): Promise<AgentBranchRecord> {
  return withConn(async (client) => {
    const res = await client.query(
      `INSERT INTO agent_branches (agent_id, branch_name, base_branch, title, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${BRANCH_COLUMNS}`,
      [data.agentId, data.branchName, data.baseBranch ?? 'main', data.title, data.description ?? '', data.createdBy ?? null],
    );
    return rowToBranch(res.rows[0]);
  });
}

export async function getBranch(agentId: string, branchName: string): Promise<AgentBranchRecord | null> {
  return withConn(async (client) => {
    const res = await client.query(`SELECT ${BRANCH_COLUMNS} FROM agent_branches WHERE agent_id = $1 AND branch_name = $2`, [agentId, branchName]);
    return res.rows[0] ? rowToBranch(res.rows[0]) : null;
  });
}

export async function listBranches(agentId: string, status?: 'open' | 'merged' | 'closed'): Promise<AgentBranchRecord[]> {
  return withConn(async (client) => {
    if (status) {
      const res = await client.query(`SELECT ${BRANCH_COLUMNS} FROM agent_branches WHERE agent_id = $1 AND status = $2 ORDER BY created_at DESC`, [agentId, status]);
      return res.rows.map(rowToBranch);
    }
    const res = await client.query(`SELECT ${BRANCH_COLUMNS} FROM agent_branches WHERE agent_id = $1 ORDER BY created_at DESC`, [agentId]);
    return res.rows.map(rowToBranch);
  });
}

export async function updateBranch(agentId: string, branchName: string, patch: {
  status?: 'open' | 'merged' | 'closed'; prNumber?: number | null; prUrl?: string | null; mergedAt?: string | null;
}): Promise<AgentBranchRecord | null> {
  const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
  if (patch.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(patch.status); }
  if (patch.prNumber !== undefined) { sets.push(`pr_number = $${idx++}`); vals.push(patch.prNumber); }
  if (patch.prUrl !== undefined) { sets.push(`pr_url = $${idx++}`); vals.push(patch.prUrl); }
  if (patch.mergedAt !== undefined) { sets.push(`merged_at = $${idx++}`); vals.push(patch.mergedAt); }
  if (sets.length === 0) return getBranch(agentId, branchName);
  sets.push(`updated_at = NOW()`); vals.push(agentId, branchName);
  return withConn(async (client) => {
    const res = await client.query(`UPDATE agent_branches SET ${sets.join(', ')} WHERE agent_id = $${idx++} AND branch_name = $${idx} RETURNING ${BRANCH_COLUMNS}`, vals);
    return res.rows[0] ? rowToBranch(res.rows[0]) : null;
  });
}

export async function deleteBranch(agentId: string, branchName: string): Promise<boolean> {
  return withConn(async (client) => {
    const res = await client.query(`DELETE FROM agent_branches WHERE agent_id = $1 AND branch_name = $2`, [agentId, branchName]);
    return (res.rowCount ?? 0) > 0;
  });
}

export async function updateFeatureSession(agentId: string, branchName: string, patch: {
  featureStage?: FeatureStage; featureContext?: FeatureContext | null; featurePrd?: string | null; featurePlan?: unknown | null;
}): Promise<AgentBranchRecord | null> {
  const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
  if (patch.featureStage !== undefined) { sets.push(`feature_stage = $${idx++}`); vals.push(patch.featureStage); }
  if (patch.featureContext !== undefined) { sets.push(`feature_context = $${idx++}`); vals.push(patch.featureContext ? JSON.stringify(patch.featureContext) : null); }
  if (patch.featurePrd !== undefined) { sets.push(`feature_prd = $${idx++}`); vals.push(patch.featurePrd); }
  if (patch.featurePlan !== undefined) { sets.push(`feature_plan = $${idx++}`); vals.push(patch.featurePlan ? JSON.stringify(patch.featurePlan) : null); }
  if (sets.length === 0) return getBranch(agentId, branchName);
  sets.push(`updated_at = NOW()`); vals.push(agentId, branchName);
  return withConn(async (client) => {
    const res = await client.query(`UPDATE agent_branches SET ${sets.join(', ')} WHERE agent_id = $${idx++} AND branch_name = $${idx} RETURNING ${BRANCH_COLUMNS}`, vals);
    return res.rows[0] ? rowToBranch(res.rows[0]) : null;
  });
}
