import { describe, expect, test } from 'bun:test';
import { getConfig, parseBackendConfig } from '../../src/config';

describe('parseBackendConfig', () => {
  test('applies documented defaults and normalizes optional values', () => {
    const config = parseBackendConfig({
      DATABASE_URL: 'postgres://openclaw:changeme@localhost:5432/openclaw',
    });

    expect(config.port).toBe(8000);
    expect(config.allowedOrigins).toEqual(['http://localhost:3000']);
    expect(config.ollamaBaseUrl).toBe('http://host.docker.internal:11434/v1');
    expect(config.ollamaModel).toBe('qwen3-coder:30b');
    expect(config.openclawSharedCodexModel).toBe('openai-codex/gpt-5.4');
    expect(config.openclawSharedOauthJsonPath).toContain('.openclaw/credentials/oauth.json');
    expect(config.codexAuthJsonPath).toContain('.codex/auth.json');
    expect(config.openaiApiKey).toBeNull();
    expect(config.agentCredentialsKey).toBeNull();
  });

  test('throws one aggregated error for missing and malformed variables', () => {
    expect(() =>
      parseBackendConfig({
        PORT: 'abc',
        OLLAMA_BASE_URL: 'not-a-url',
        AGENT_CREDENTIALS_KEY: 'short',
      }),
    ).toThrow(/DATABASE_URL/);

    expect(() =>
      parseBackendConfig({
        PORT: 'abc',
        OLLAMA_BASE_URL: 'not-a-url',
        AGENT_CREDENTIALS_KEY: 'short',
      }),
    ).toThrow(/PORT/);

    expect(() =>
      parseBackendConfig({
        PORT: 'abc',
        OLLAMA_BASE_URL: 'not-a-url',
        AGENT_CREDENTIALS_KEY: 'short',
      }),
    ).toThrow(/OLLAMA_BASE_URL/);

    expect(() =>
      parseBackendConfig({
        PORT: 'abc',
        OLLAMA_BASE_URL: 'not-a-url',
        AGENT_CREDENTIALS_KEY: 'short',
      }),
    ).toThrow(/AGENT_CREDENTIALS_KEY/);
  });

  test('rejects blank origins and trims comma-separated origin lists', () => {
    const config = parseBackendConfig({
      DATABASE_URL: 'postgres://openclaw:changeme@localhost:5432/openclaw',
      ALLOWED_ORIGINS: ' https://app.ruh.ai , http://localhost:3000 , https://app.ruh.ai ',
    });

    expect(config.allowedOrigins).toEqual([
      'https://app.ruh.ai',
      'http://localhost:3000',
    ]);

    expect(() =>
      parseBackendConfig({
        DATABASE_URL: 'postgres://openclaw:changeme@localhost:5432/openclaw',
        ALLOWED_ORIGINS: 'relative-origin',
      }),
    ).toThrow(/ALLOWED_ORIGINS/);
  });
});

describe('OTEL config', () => {
  const baseEnv = { DATABASE_URL: 'postgres://openclaw:changeme@localhost:5432/openclaw' };

  test('defaults otelEnabled to false when OTEL_ENABLED absent', () => {
    const config = parseBackendConfig(baseEnv);
    expect(config.otelEnabled).toBe(false);
    expect(config.otelServiceName).toBe('ruh-backend');
    expect(config.otelSampleRate).toBe(1.0);
  });

  test('parses OTEL_ENABLED=true and related fields', () => {
    const config = parseBackendConfig({
      ...baseEnv,
      OTEL_ENABLED: 'true',
      OTEL_SERVICE_NAME: 'my-service',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:3002/api/public/otel',
      OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer dGVzdA==',
      OTEL_SAMPLE_RATE: '0.5',
    });
    expect(config.otelEnabled).toBe(true);
    expect(config.otelServiceName).toBe('my-service');
    expect(config.otelExporterOtlpEndpoint).toBe('http://localhost:3002/api/public/otel');
    expect(config.otelExporterOtlpHeaders).toBe('Authorization=Bearer dGVzdA==');
    expect(config.otelSampleRate).toBe(0.5);
  });

  test('rejects invalid OTEL_SAMPLE_RATE', () => {
    expect(() =>
      parseBackendConfig({ ...baseEnv, OTEL_SAMPLE_RATE: '2.0' }),
    ).toThrow(/OTEL_SAMPLE_RATE/);

    expect(() =>
      parseBackendConfig({ ...baseEnv, OTEL_SAMPLE_RATE: 'abc' }),
    ).toThrow(/OTEL_SAMPLE_RATE/);
  });

  test('validates OTEL_EXPORTER_OTLP_ENDPOINT as URL when OTEL is enabled', () => {
    expect(() =>
      parseBackendConfig({
        ...baseEnv,
        OTEL_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'not-a-url',
      }),
    ).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);
  });
});

describe('getConfig', () => {
  test('returns a frozen config object based on the provided env snapshot', () => {
    const config = getConfig({
      DATABASE_URL: 'postgres://openclaw:changeme@localhost:5432/openclaw',
      PORT: '18000',
    });

    expect(config.port).toBe(18000);
    expect(Object.isFrozen(config)).toBe(true);
  });
});
