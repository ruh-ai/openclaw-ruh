import { describe, expect, test } from 'bun:test';
import { trace } from '@opentelemetry/api';
import { initTelemetry, shutdownTelemetry, getTracer } from '../../../src/telemetry';
import type { BackendConfig } from '../../../src/config';

function makeConfig(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    databaseUrl: '',
    port: 8000,
    allowedOrigins: ['http://localhost:3000'],
    openclawAdminToken: null,
    openclawSharedOauthJsonPath: '',
    codexAuthJsonPath: '',
    openclawSharedCodexModel: '',
    anthropicApiKey: null,
    openaiApiKey: null,
    openrouterApiKey: null,
    geminiApiKey: null,
    ollamaBaseUrl: null,
    ollamaModel: '',
    telegramBotToken: null,
    discordBotToken: null,
    agentCredentialsKey: null,
    otelEnabled: false,
    otelServiceName: 'ruh-backend',
    otelExporterOtlpEndpoint: null,
    otelExporterOtlpHeaders: null,
    otelSampleRate: 1.0,
    ...overrides,
  };
}

describe('telemetry', () => {
  test('getTracer returns a tracer even when OTEL is disabled (no-op)', () => {
    const tracer = getTracer();
    expect(tracer).toBeDefined();
    const span = tracer.startSpan('test');
    expect(span).toBeDefined();
    span.end();
  });

  test('initTelemetry does nothing when otelEnabled is false', () => {
    initTelemetry(makeConfig({ otelEnabled: false }));
    const tracer = getTracer();
    expect(tracer).toBeDefined();
    const span = tracer.startSpan('test');
    span.end();
  });

  test('initTelemetry does nothing when endpoint is missing', () => {
    initTelemetry(makeConfig({ otelEnabled: true, otelExporterOtlpEndpoint: null }));
    const tracer = getTracer();
    expect(tracer).toBeDefined();
    const span = tracer.startSpan('test');
    span.end();
  });

  test('shutdownTelemetry is safe to call when no provider is active', async () => {
    await shutdownTelemetry();
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });

  // This test must be last — it registers a global provider with an unreachable
  // endpoint, which cannot be cleanly shut down in-process without a timeout.
  test('initTelemetry registers a provider when fully configured', () => {
    initTelemetry(
      makeConfig({
        otelEnabled: true,
        otelExporterOtlpEndpoint: 'http://192.0.2.1:19999',
        otelExporterOtlpHeaders: 'Authorization=Bearer dGVzdA==',
        otelSampleRate: 1.0,
      }),
    );

    const tracer = trace.getTracer('ruh-backend');
    const span = tracer.startSpan('test-span');
    const ctx = span.spanContext();
    expect(ctx.traceId).not.toBe('00000000000000000000000000000000');
    expect(ctx.spanId).not.toBe('0000000000000000');
    span.end();
  });
});
