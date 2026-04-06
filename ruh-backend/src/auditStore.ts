import { randomUUID } from 'node:crypto';
import { withConn } from './db';

export interface AuditEventRecord {
  event_id: string;
  occurred_at: string;
  request_id: string | null;
  action_type: string;
  target_type: string;
  target_id: string;
  outcome: string;
  actor_type: string;
  actor_id: string;
  origin: string | null;
  details: Record<string, unknown>;
}

export interface WriteAuditEventInput {
  request_id?: string | null;
  action_type: string;
  target_type: string;
  target_id: string;
  outcome: string;
  actor_type: string;
  actor_id: string;
  origin?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditEventFilters {
  action_type?: string;
  target_type?: string;
  target_id?: string;
  actor_type?: string;
  actor_id?: string;
  request_id?: string;
  outcome?: string;
  limit?: number;
}

export interface AuditEventListResult {
  items: AuditEventRecord[];
  has_more: boolean;
}

const SENSITIVE_KEY_PATTERN = /(token|secret|api[_-]?key|authorization|cookie|credential|password)/i;

export async function writeAuditEvent(input: WriteAuditEventInput): Promise<void> {
  const eventId = randomUUID();
  const details = sanitizeAuditDetails(input.details ?? {});

  await withConn(async (client) => {
    await client.query(
      `
      INSERT INTO control_plane_audit_events (
        event_id, request_id, action_type, target_type, target_id,
        outcome, actor_type, actor_id, origin, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        eventId,
        input.request_id ?? null,
        input.action_type,
        input.target_type,
        input.target_id,
        input.outcome,
        input.actor_type,
        input.actor_id,
        input.origin ?? null,
        details,
      ],
    );
  });
}

export async function listAuditEvents(filters: AuditEventFilters = {}): Promise<AuditEventListResult> {
  const where: string[] = [];
  const params: unknown[] = [];

  const addFilter = (field: string, value: string | undefined) => {
    if (!value) return;
    params.push(value);
    where.push(`${field} = $${params.length}`);
  };

  addFilter('action_type', filters.action_type);
  addFilter('target_type', filters.target_type);
  addFilter('target_id', filters.target_id);
  addFilter('actor_type', filters.actor_type);
  addFilter('actor_id', filters.actor_id);
  addFilter('request_id', filters.request_id);
  addFilter('outcome', filters.outcome);

  const limit = Math.min(Math.max(Number(filters.limit ?? 50), 1), 100);
  params.push(limit + 1);

  const sql = `
    SELECT event_id, occurred_at, request_id, action_type, target_type, target_id,
           outcome, actor_type, actor_id, origin, details
    FROM control_plane_audit_events
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY occurred_at DESC, event_id DESC
    LIMIT $${params.length}
  `;

  return withConn(async (client) => {
    const res = await client.query(sql, params);
    const rows = res.rows.map(serialize);
    return {
      items: rows.slice(0, limit),
      has_more: rows.length > limit,
    };
  });
}

export function sanitizeAuditDetails(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeAuditValue(value);
  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== 'object') {
    return {};
  }
  return sanitized as Record<string, unknown>;
}

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAuditValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    const sanitizedValue = sanitizeAuditValue(nestedValue);
    if (sanitizedValue !== undefined) {
      result[key] = sanitizedValue;
    }
  }
  return result;
}

function serialize(row: Record<string, unknown>): AuditEventRecord {
  if (row['occurred_at'] instanceof Date) {
    row['occurred_at'] = row['occurred_at'].toISOString();
  }
  return row as unknown as AuditEventRecord;
}
