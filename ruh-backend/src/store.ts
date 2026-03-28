/**
 * PostgreSQL-backed store for OpenClaw sandbox records.
 */

import { withConn } from './db';

export interface SandboxRecord {
  sandbox_id: string;
  sandbox_name: string;
  sandbox_state: string;
  dashboard_url: string | null;
  signed_url: string | null;
  standard_url: string | null;
  preview_token: string | null;
  gateway_token: string | null;
  gateway_port: number;
  vnc_port: number | null;
  ssh_command: string;
  created_at: string;
  approved: boolean;
  shared_codex_enabled: boolean;
  shared_codex_model: string | null;
}

export async function saveSandbox(
  result: Record<string, unknown>,
  sandboxName = '',
): Promise<void> {
  await withConn(async (client) => {
    await client.query(
      `
      INSERT INTO sandboxes (
        sandbox_id, sandbox_name, sandbox_state, dashboard_url,
        signed_url, standard_url, preview_token, gateway_token,
        gateway_port, vnc_port, ssh_command, shared_codex_enabled, shared_codex_model
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (sandbox_id) DO UPDATE SET
        sandbox_name  = EXCLUDED.sandbox_name,
        sandbox_state = EXCLUDED.sandbox_state,
        dashboard_url = EXCLUDED.dashboard_url,
        signed_url    = EXCLUDED.signed_url,
        standard_url  = EXCLUDED.standard_url,
        preview_token = EXCLUDED.preview_token,
        gateway_token = EXCLUDED.gateway_token,
        gateway_port  = EXCLUDED.gateway_port,
        vnc_port      = EXCLUDED.vnc_port,
        ssh_command   = EXCLUDED.ssh_command,
        shared_codex_enabled = EXCLUDED.shared_codex_enabled,
        shared_codex_model = EXCLUDED.shared_codex_model
      `,
      [
        result['sandbox_id'],
        sandboxName || result['sandbox_name'] || 'openclaw-gateway',
        result['sandbox_state'] ?? '',
        result['dashboard_url'] ?? null,
        result['signed_url'] ?? null,
        result['standard_url'] ?? null,
        result['preview_token'] ?? null,
        result['gateway_token'] ?? null,
        result['gateway_port'] ?? 18789,
        typeof result['vnc_port'] === 'number' ? result['vnc_port'] : null,
        result['ssh_command'] ?? '',
        Boolean(result['shared_codex_enabled']),
        typeof result['shared_codex_model'] === 'string' ? result['shared_codex_model'] : null,
      ],
    );
  });
}

export async function markApproved(sandboxId: string): Promise<void> {
  await withConn(async (client) => {
    await client.query(
      'UPDATE sandboxes SET approved = TRUE WHERE sandbox_id = $1',
      [sandboxId],
    );
  });
}

export async function updateSandboxSharedCodex(
  sandboxId: string,
  enabled: boolean,
  model: string | null,
): Promise<void> {
  await withConn(async (client) => {
    await client.query(
      `UPDATE sandboxes
       SET shared_codex_enabled = $2,
           shared_codex_model = $3,
           sandbox_state = COALESCE(NULLIF(sandbox_state, ''), 'running')
       WHERE sandbox_id = $1`,
      [sandboxId, enabled, model],
    );
  });
}

export async function listSandboxes(): Promise<SandboxRecord[]> {
  return withConn(async (client) => {
    const res = await client.query(
      'SELECT * FROM sandboxes ORDER BY created_at DESC',
    );
    return res.rows.map(serialize);
  });
}

export async function getSandbox(sandboxId: string): Promise<SandboxRecord | null> {
  return withConn(async (client) => {
    const res = await client.query(
      'SELECT * FROM sandboxes WHERE sandbox_id = $1',
      [sandboxId],
    );
    return res.rows.length > 0 ? serialize(res.rows[0]) : null;
  });
}

export async function deleteSandbox(sandboxId: string): Promise<boolean> {
  return withConn(async (client) => {
    await client.query(
      'DELETE FROM conversations WHERE sandbox_id = $1',
      [sandboxId],
    );
    const res = await client.query(
      'DELETE FROM sandboxes WHERE sandbox_id = $1',
      [sandboxId],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

function serialize(row: Record<string, unknown>): SandboxRecord {
  if (row['created_at'] instanceof Date) {
    row['created_at'] = row['created_at'].toISOString();
  }
  return row as unknown as SandboxRecord;
}
