import { randomUUID } from 'node:crypto';
import { withConn } from './db';

export interface SystemEventRecord {
  event_id: string;
  occurred_at: string;
  level: string;
  category: string;
  action: string;
  status: string;
  message: string;
  request_id: string | null;
  trace_id: string | null;
  span_id: string | null;
  sandbox_id: string | null;
  agent_id: string | null;
  conversation_id: string | null;
  source: string;
  details: Record<string, unknown>;
}

export interface WriteSystemEventInput {
  level: string;
  category: string;
  action: string;
  status: string;
  message: string;
  request_id?: string | null;
  trace_id?: string | null;
  span_id?: string | null;
  sandbox_id?: string | null;
  agent_id?: string | null;
  conversation_id?: string | null;
  source: string;
  details?: Record<string, unknown>;
}

export interface SystemEventFilters {
  level?: string;
  category?: string;
  action?: string;
  status?: string;
  request_id?: string;
  trace_id?: string;
  sandbox_id?: string;
  agent_id?: string;
  conversation_id?: string;
  source?: string;
  limit?: number;
}

export interface SystemEventListResult {
  items: SystemEventRecord[];
  has_more: boolean;
}

const SENSITIVE_KEY_PATTERN = /(token|secret|api[_-]?key|authorization|cookie|credential|password|prompt|soul)/i;
const MAX_STRING_LENGTH = 500;

export async function writeSystemEvent(input: WriteSystemEventInput): Promise<void> {
  const eventId = randomUUID();
  const message = truncateString(input.message);
  const details = sanitizeSystemEventDetails(input.details ?? {});

  await withConn(async (client) => {
    await client.query(
      `
      INSERT INTO system_events (
        event_id, level, category, action, status, message,
        request_id, trace_id, span_id, sandbox_id, agent_id,
        conversation_id, source, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        eventId,
        input.level,
        input.category,
        input.action,
        input.status,
        message,
        input.request_id ?? null,
        input.trace_id ?? null,
        input.span_id ?? null,
        input.sandbox_id ?? null,
        input.agent_id ?? null,
        input.conversation_id ?? null,
        input.source,
        details,
      ],
    );
  });
}

export async function listSystemEvents(filters: SystemEventFilters = {}): Promise<SystemEventListResult> {
  const where: string[] = [];
  const params: unknown[] = [];

  const addFilter = (field: string, value: string | undefined) => {
    if (!value) return;
    params.push(value);
    where.push(`${field} = $${params.length}`);
  };

  addFilter('level', filters.level);
  addFilter('category', filters.category);
  addFilter('action', filters.action);
  addFilter('status', filters.status);
  addFilter('request_id', filters.request_id);
  addFilter('trace_id', filters.trace_id);
  addFilter('sandbox_id', filters.sandbox_id);
  addFilter('agent_id', filters.agent_id);
  addFilter('conversation_id', filters.conversation_id);
  addFilter('source', filters.source);

  const limit = Math.min(Math.max(Number(filters.limit ?? 50), 1), 100);
  params.push(limit + 1);

  const sql = `
    SELECT event_id, occurred_at, level, category, action, status, message,
           request_id, trace_id, span_id, sandbox_id, agent_id,
           conversation_id, source, details
    FROM system_events
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

export function sanitizeSystemEventDetails(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeSystemEventValue(value);
  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== 'object') {
    return {};
  }
  return sanitized as Record<string, unknown>;
}

function sanitizeSystemEventValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeSystemEventValue(entry))
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
    const sanitizedValue = sanitizeSystemEventValue(nestedValue);
    if (sanitizedValue !== undefined) {
      result[key] = sanitizedValue;
    }
  }
  return result;
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH - 3)}...`;
}

function serialize(row: Record<string, unknown>): SystemEventRecord {
  if (row['occurred_at'] instanceof Date) {
    row['occurred_at'] = row['occurred_at'].toISOString();
  }
  return row as unknown as SystemEventRecord;
}
