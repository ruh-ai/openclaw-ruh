/**
 * Pure utility helpers shared across the app and exported for unit testing.
 *
 * @kb: 002-backend-overview
 */

import type { SandboxRecord } from './store';

function stripAnsi(input: string): string {
  return input.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

export function httpError(status: number, detail: string): Error & { status: number } {
  const err = new Error(detail) as Error & { status: number };
  err.status = status;
  return err;
}

export function gatewayUrlAndHeaders(
  record: SandboxRecord,
  path: string,
): [string, Record<string, string>] {
  const gatewayHost = process.env.DOCKER_HOST_IP || '127.0.0.1';
  const localGatewayBase =
    Number.isFinite(record.gateway_port) && record.gateway_port > 0
      ? `http://${gatewayHost}:${record.gateway_port}`
      : null;
  const signed = record.signed_url?.trim() || null;
  const standard = record.standard_url?.trim() || null;
  const dashboard = record.dashboard_url?.trim() || null;

  const base = localGatewayBase ?? signed ?? standard ?? dashboard;
  const usingSignedGateway = !localGatewayBase && Boolean(signed);
  if (!base) throw httpError(503, 'No gateway URL available for this sandbox');

  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw httpError(502, `Malformed gateway URL: ${base}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw httpError(502, `Unsupported gateway URL protocol: ${parsed.protocol}`);
  }

  const headers: Record<string, string> = {};
  if (!usingSignedGateway && record.preview_token) {
    headers['X-Daytona-Preview-Token'] = record.preview_token;
  }
  if (!usingSignedGateway && record.gateway_token) {
    headers['Authorization'] = `Bearer ${record.gateway_token}`;
  }
  return [base.replace(/\/$/, '') + path, headers];
}

export function parseJsonOutput(output: string): unknown {
  const lines = stripAnsi(output).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (stripped.startsWith('{') || stripped.startsWith('[')) {
      const candidate = lines.slice(i).join('\n');
      try {
        return JSON.parse(candidate);
      } catch {
        const endChar = stripped.startsWith('{') ? '}' : ']';
        const endIdx = candidate.lastIndexOf(endChar);
        if (endIdx !== -1) {
          try {
            return JSON.parse(candidate.slice(0, endIdx + 1));
          } catch {
            continue;
          }
        }
      }
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
