/**
 * Unit tests for src/telemetryHealth.ts — covers the three probe surfaces
 * (Langfuse via fetch, OTEL via config, Sentry via config) and the aggregate
 * status logic.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { buildTelemetryHealthReport } from '../../src/telemetryHealth';
import type { BackendConfig } from '../../src/config';

const originalFetch = globalThis.fetch;

function makeConfig(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    databaseUrl: '',
    port: 8000,
    allowedOrigins: [],
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
    jwtAccessSecret: 'x',
    jwtRefreshSecret: 'y',
    otelEnabled: true,
    otelServiceName: 'ruh-backend',
    otelExporterOtlpEndpoint: 'http://localhost:4318',
    otelExporterOtlpHeaders: null,
    otelSampleRate: 1.0,
    langfuseBaseUrl: 'http://localhost:3002',
    sentryDsn: 'https://example@sentry/1',
    logLevel: 'info',
    paperclipApiUrl: null,
    openspaceMcpEnabled: false,
    githubClientId: null,
    githubClientSecret: null,
    githubCallbackUrl: '',
    ...overrides,
  } as BackendConfig;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('buildTelemetryHealthReport', () => {
  test('reports ok when all three surfaces are healthy', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ status: 'OK', version: '3.40.0' }), { status: 200 })
    ) as typeof fetch;

    const report = await buildTelemetryHealthReport(makeConfig());

    expect(report.status).toBe('ok');
    expect(report.surfaces.langfuse.ok).toBe(true);
    expect(report.surfaces.langfuse.version).toBe('3.40.0');
    expect(report.surfaces.otel.ok).toBe(true);
    expect(report.surfaces.sentry.ok).toBe(true);
  });

  test('reports degraded when Langfuse returns non-2xx', async () => {
    globalThis.fetch = mock(async () => new Response('down', { status: 503 })) as typeof fetch;

    const report = await buildTelemetryHealthReport(makeConfig());

    expect(report.status).toBe('degraded');
    expect(report.surfaces.langfuse.ok).toBe(false);
    expect(report.surfaces.langfuse.reason).toContain('503');
  });

  test('reports degraded when Langfuse fetch throws (e.g. ECONNREFUSED)', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:3002');
    }) as typeof fetch;

    const report = await buildTelemetryHealthReport(makeConfig());

    expect(report.status).toBe('degraded');
    expect(report.surfaces.langfuse.ok).toBe(false);
    expect(report.surfaces.langfuse.reason).toContain('ECONNREFUSED');
  });

  test('marks Langfuse missing when LANGFUSE_BASE_URL is null', async () => {
    let fetchCalled = false;
    globalThis.fetch = mock(async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const report = await buildTelemetryHealthReport(makeConfig({ langfuseBaseUrl: null }));

    expect(report.surfaces.langfuse.ok).toBe(false);
    expect(report.surfaces.langfuse.reason).toContain('LANGFUSE_BASE_URL');
    expect(fetchCalled).toBe(false);
  });

  test('marks OTEL not-ok when disabled', async () => {
    globalThis.fetch = mock(async () => new Response('{}', { status: 200 })) as typeof fetch;
    const report = await buildTelemetryHealthReport(makeConfig({ otelEnabled: false }));
    expect(report.surfaces.otel.ok).toBe(false);
    expect(report.surfaces.otel.reason).toContain('OTEL_ENABLED=false');
  });

  test('marks OTEL not-ok when enabled but endpoint missing', async () => {
    globalThis.fetch = mock(async () => new Response('{}', { status: 200 })) as typeof fetch;
    const report = await buildTelemetryHealthReport(
      makeConfig({ otelEnabled: true, otelExporterOtlpEndpoint: null }),
    );
    expect(report.surfaces.otel.ok).toBe(false);
    expect(report.surfaces.otel.reason).toContain('OTEL_EXPORTER_OTLP_ENDPOINT');
  });

  test('marks Sentry not-ok when DSN missing', async () => {
    globalThis.fetch = mock(async () => new Response('{}', { status: 200 })) as typeof fetch;
    const report = await buildTelemetryHealthReport(makeConfig({ sentryDsn: null }));
    expect(report.surfaces.sentry.ok).toBe(false);
    expect(report.surfaces.sentry.reason).toContain('SENTRY_DSN');
  });
});
