/**
 * Thin tracing helpers for agent lifecycle operations.
 * Follows the same pattern as sandboxManager.ts (trace.getTracer + startSpan).
 *
 * All spans use the "ruh-backend" tracer and include agent.id when available.
 * When OTEL is disabled, getTracer() returns a no-op tracer — zero overhead.
 */

import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

const TRACER_NAME = 'ruh-backend';

/**
 * Start a named span with agent-related attributes.
 * Always call endSpanOk() or endSpanError() when done.
 */
export function startAgentSpan(
  name: string,
  attrs: Record<string, string | number | boolean | undefined>,
): Span {
  // Filter out undefined values
  const cleanAttrs: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) cleanAttrs[k] = v;
  }
  return trace.getTracer(TRACER_NAME).startSpan(name, { attributes: cleanAttrs });
}

/** Mark span as successful and end it. */
export function endSpanOk(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/** Mark span as failed, record the exception, and end it. */
export function endSpanError(span: Span, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.recordException(err instanceof Error ? err : new Error(message));
  span.end();
}

/** Extract trace_id and span_id from a span for system event correlation. */
export function spanTraceContext(span: Span): { trace_id: string; span_id: string } {
  const ctx = span.spanContext();
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}
