/**
 * Optional OpenTelemetry tracing for hermes-backend.
 *
 * Sends traces to SigNoz (or any OTLP collector) when OTEL_ENABLED=true.
 * When disabled, all trace calls are zero-overhead no-ops.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let provider: BasicTracerProvider | null = null;

export function initTelemetry(): void {
  const enabled = process.env.OTEL_ENABLED === 'true';
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!enabled || !endpoint) return;

  const serviceName = process.env.OTEL_SERVICE_NAME || 'hermes-backend';
  const sampleRate = Number(process.env.OTEL_SAMPLE_RATE) || 1.0;

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
  });

  const exporter = new OTLPTraceExporter({
    url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
  });

  provider = new BasicTracerProvider({
    resource,
    sampler: new TraceIdRatioBasedSampler(sampleRate),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  provider.register();
}

export function getTracer(name = 'hermes-backend'): Tracer {
  return trace.getTracer(name);
}

export async function shutdownTelemetry(): Promise<void> {
  if (provider) {
    await provider.shutdown();
    provider = null;
  }
}
