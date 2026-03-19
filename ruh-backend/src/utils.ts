/**
 * Pure utility helpers shared across the app and exported for unit testing.
 */

import type { SandboxRecord } from './store';

export function httpError(status: number, detail: string): Error & { status: number } {
  const err = new Error(detail) as Error & { status: number };
  err.status = status;
  return err;
}

export function gatewayUrlAndHeaders(
  record: SandboxRecord,
  path: string,
): [string, Record<string, string>] {
  const base = record.signed_url ?? record.standard_url ?? record.dashboard_url ?? '';
  if (!base) throw httpError(503, 'No gateway URL available for this sandbox');

  const headers: Record<string, string> = {};
  if (!record.signed_url && record.preview_token) {
    headers['X-Daytona-Preview-Token'] = record.preview_token;
  }
  if (record.gateway_token) {
    headers['Authorization'] = `Bearer ${record.gateway_token}`;
  }
  return [base.replace(/\/$/, '') + path, headers];
}

export function parseJsonOutput(output: string): unknown {
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (stripped.startsWith('{') || stripped.startsWith('[')) {
      return JSON.parse(lines.slice(i).join('\n'));
    }
  }
  throw new Error(`No JSON found in output: ${output.slice(0, 200)}`);
}

export function syntheticModels(): Record<string, unknown> {
  return {
    object: 'list',
    data: [{ id: 'openclaw-default', object: 'model', created: 0, owned_by: 'openclaw' }],
    _synthetic: true,
  };
}
