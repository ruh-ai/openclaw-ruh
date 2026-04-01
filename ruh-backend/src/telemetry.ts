/**
 * Optional OpenTelemetry tracing for ruh-backend.
 *
 * When OTEL_ENABLED=true and an OTLP endpoint is configured, initializes a
 * BasicTracerProvider that exports spans via HTTP/JSON to the configured
 * collector (typically Langfuse's OTLP ingestion endpoint).
 *
 * When disabled, all trace.getTracer() calls return the OTEL API's built-in
 * no-op tracer — zero overhead.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { BackendConfig } from './config';

let provider: BasicTracerProvider | null = null;

/**
 * Initialize the OTEL trace pipeline. Call once at startup, before any other
 * module creates spans. Safe to call when OTEL is disabled — returns immediately.
 */
export function initTelemetry(config: BackendConfig): void {
  if (!config.otelEnabled || !config.otelExporterOtlpEndpoint) return;

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.otelServiceName,
  });

  const headers: Record<string, string> = {};
  if (config.otelExporterOtlpHeaders) {
    for (const pair of config.otelExporterOtlpHeaders.split(',')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        headers[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
      }
    }
  }

  const exporter = new OTLPTraceExporter({
    url: `${config.otelExporterOtlpEndpoint.replace(/\/$/, '')}/v1/traces`,
    headers,
  });

  provider = new BasicTracerProvider({
    resource,
    sampler: new TraceIdRatioBasedSampler(config.otelSampleRate),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();
}

/**
 * Flush pending spans and shut down the trace pipeline.
 * Call during graceful shutdown (SIGTERM).
 */
export async function shutdownTelemetry(): Promise<void> {
  if (provider) {
    await provider.shutdown();
    provider = null;
  }
}

/** Returns the named tracer. No-op when OTEL is disabled. */
export function getTracer(name = 'ruh-backend'): Tracer {
  return trace.getTracer(name);
}
