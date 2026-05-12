/**
 * Telemetry health probes — surfaced via GET /health/telemetry so we notice
 * when an observability surface goes silent. Today's pain: Langfuse web exited
 * 10 days ago and nobody noticed because nothing checks it.
 *
 * Each probe returns `{ ok, reason?, latencyMs?, version? }`. When all probes
 * are `ok`, the response status is 200; if any surface is misconfigured or
 * unreachable, the response is 503 with details. The endpoint is intentionally
 * public (matches `/health` / `/ready`) so external monitors can scrape it.
 */

import type { BackendConfig } from './config';

export interface TelemetryProbe {
  ok: boolean;
  reason?: string;
  latencyMs?: number;
  version?: string;
  endpoint?: string;
}

export interface TelemetryHealthReport {
  status: 'ok' | 'degraded';
  surfaces: {
    langfuse: TelemetryProbe;
    otel: TelemetryProbe;
    sentry: TelemetryProbe;
  };
}

const LANGFUSE_PROBE_TIMEOUT_MS = 2000;

async function probeLangfuse(baseUrl: string | null): Promise<TelemetryProbe> {
  if (!baseUrl) {
    return { ok: false, reason: 'LANGFUSE_BASE_URL not set' };
  }
  const url = `${baseUrl.replace(/\/$/, '')}/api/public/health`;
  const t0 = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(LANGFUSE_PROBE_TIMEOUT_MS) });
    const latencyMs = Date.now() - t0;
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}`, latencyMs, endpoint: url };
    }
    const payload = (await response.json().catch(() => null)) as { version?: string; status?: string } | null;
    return {
      ok: true,
      latencyMs,
      endpoint: url,
      ...(payload?.version ? { version: payload.version } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'fetch failed',
      latencyMs: Date.now() - t0,
      endpoint: url,
    };
  }
}

function probeOtel(config: BackendConfig): TelemetryProbe {
  if (!config.otelEnabled) {
    return { ok: false, reason: 'OTEL_ENABLED=false' };
  }
  if (!config.otelExporterOtlpEndpoint) {
    return { ok: false, reason: 'OTEL_EXPORTER_OTLP_ENDPOINT not set' };
  }
  return { ok: true, endpoint: config.otelExporterOtlpEndpoint };
}

function probeSentry(config: BackendConfig): TelemetryProbe {
  if (!config.sentryDsn) {
    return { ok: false, reason: 'SENTRY_DSN not set' };
  }
  return { ok: true };
}

export async function buildTelemetryHealthReport(config: BackendConfig): Promise<TelemetryHealthReport> {
  const [langfuse, otel, sentry] = await Promise.all([
    probeLangfuse(config.langfuseBaseUrl),
    Promise.resolve(probeOtel(config)),
    Promise.resolve(probeSentry(config)),
  ]);
  const allOk = langfuse.ok && otel.ok && sentry.ok;
  return {
    status: allOk ? 'ok' : 'degraded',
    surfaces: { langfuse, otel, sentry },
  };
}
