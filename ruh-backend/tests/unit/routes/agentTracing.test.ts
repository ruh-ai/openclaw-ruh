/**
 * Unit tests for agentTracing.ts — the trace helper used by v2 agent endpoints.
 * Mocks OpenTelemetry API to verify span creation, attributes, and lifecycle.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock OpenTelemetry ──────────────────────────────────────────────────────

const mockEnd = mock(() => {});
const mockSetStatus = mock(() => {});
const mockSetAttribute = mock(() => {});
const mockRecordException = mock(() => {});
const mockSpanContext = mock(() => ({ traceId: 'trace-abc', spanId: 'span-def' }));

const mockStartSpan = mock(() => ({
  end: mockEnd,
  setStatus: mockSetStatus,
  setAttribute: mockSetAttribute,
  recordException: mockRecordException,
  spanContext: mockSpanContext,
}));

const mockGetTracer = mock(() => ({ startSpan: mockStartSpan }));

mock.module('@opentelemetry/api', () => ({
  trace: { getTracer: mockGetTracer },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

const { startAgentSpan, endSpanOk, endSpanError, spanTraceContext } = await import('../../../src/agentTracing');

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockStartSpan.mockClear();
  mockEnd.mockClear();
  mockSetStatus.mockClear();
  mockSetAttribute.mockClear();
  mockRecordException.mockClear();
});

describe('startAgentSpan', () => {
  test('creates a span with the given name', () => {
    startAgentSpan('agent.create', { 'agent.id': 'abc' });
    expect(mockStartSpan).toHaveBeenCalledTimes(1);
    const [name, opts] = mockStartSpan.mock.calls[0] as [string, { attributes: Record<string, unknown> }];
    expect(name).toBe('agent.create');
    expect(opts.attributes['agent.id']).toBe('abc');
  });

  test('filters out undefined attributes', () => {
    startAgentSpan('agent.test', { 'agent.id': 'x', 'sandbox.id': undefined });
    const [, opts] = mockStartSpan.mock.calls[0] as [string, { attributes: Record<string, unknown> }];
    expect(opts.attributes).not.toHaveProperty('sandbox.id');
    expect(opts.attributes['agent.id']).toBe('x');
  });

  test('returns the span object', () => {
    const span = startAgentSpan('agent.test', {});
    expect(span).toHaveProperty('end');
    expect(span).toHaveProperty('setStatus');
  });
});

describe('endSpanOk', () => {
  test('sets OK status and ends the span', () => {
    const span = startAgentSpan('agent.ok', {});
    endSpanOk(span);
    expect(mockSetStatus).toHaveBeenCalledWith({ code: 1 }); // SpanStatusCode.OK = 1
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });
});

describe('endSpanError', () => {
  test('sets ERROR status with message from Error', () => {
    const span = startAgentSpan('agent.err', {});
    endSpanError(span, new Error('something broke'));
    expect(mockSetStatus).toHaveBeenCalledWith({ code: 2, message: 'something broke' });
    expect(mockRecordException).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  test('handles string errors', () => {
    const span = startAgentSpan('agent.err', {});
    endSpanError(span, 'raw string error');
    expect(mockSetStatus).toHaveBeenCalledWith({ code: 2, message: 'raw string error' });
    expect(mockRecordException).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });
});

describe('spanTraceContext', () => {
  test('extracts trace_id and span_id', () => {
    const span = startAgentSpan('agent.ctx', {});
    const ctx = spanTraceContext(span);
    expect(ctx.trace_id).toBe('trace-abc');
    expect(ctx.span_id).toBe('span-def');
  });
});
