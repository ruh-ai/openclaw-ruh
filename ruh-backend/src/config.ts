import os from 'node:os';
import path from 'node:path';

export interface BackendConfig {
  databaseUrl: string;
  port: number;
  allowedOrigins: string[];
  openclawAdminToken: string | null;
  openclawSharedOauthJsonPath: string;
  codexAuthJsonPath: string;
  openclawSharedCodexModel: string;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  openrouterApiKey: string | null;
  geminiApiKey: string | null;
  ollamaBaseUrl: string | null;
  ollamaModel: string;
  telegramBotToken: string | null;
  discordBotToken: string | null;
  agentCredentialsKey: string | null;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  otelEnabled: boolean;
  otelServiceName: string;
  otelExporterOtlpEndpoint: string | null;
  otelExporterOtlpHeaders: string | null;
  otelSampleRate: number;
  logLevel: string;
  paperclipApiUrl: string | null;
  openspaceMcpEnabled: boolean;
}

type EnvLike = Record<string, string | undefined>;
interface ConfigParseOptions {
  requireDatabaseUrl?: boolean;
}

const DEFAULT_ALLOWED_ORIGIN = 'http://localhost:3000';
const DEFAULT_OLLAMA_BASE_URL = 'http://host.docker.internal:11434/v1';
const DEFAULT_OLLAMA_MODEL = 'qwen3-coder:30b';
const DEFAULT_SHARED_CODEX_MODEL = 'openai-codex/gpt-5.4';
const DEV_JWT_ACCESS_SECRET = `dev-access-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const DEV_JWT_REFRESH_SECRET = `dev-refresh-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function readRaw(env: EnvLike, key: string): string | undefined {
  const value = env[key];
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parseUrlField(value: string | undefined, key: string, errors: string[]): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('must use http or https');
    }
    return parsed.toString().replace(/\/$/, '') + (parsed.pathname.endsWith('/') && parsed.pathname !== '/' ? '' : '');
  } catch {
    errors.push(`${key} must be a valid absolute http(s) URL`);
    return null;
  }
}

function parseOrigins(value: string | undefined, errors: string[]): string[] {
  const rawOrigins = value
    ? value.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [DEFAULT_ALLOWED_ORIGIN];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const origin of rawOrigins) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
      const normalizedOrigin = parsed.origin;
      if (!seen.has(normalizedOrigin)) {
        seen.add(normalizedOrigin);
        normalized.push(normalizedOrigin);
      }
    } catch {
      errors.push(`ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  return normalized;
}

function parsePort(value: string | undefined, errors: string[]): number {
  if (!value) return 8000;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    errors.push('PORT must be an integer between 1 and 65535');
    return 8000;
  }
  return parsed;
}

function parseRequiredString(value: string | undefined, key: string, errors: string[]): string {
  if (!value) {
    errors.push(`${key} is required`);
    return '';
  }
  return value;
}

function normalizeOptionalString(value: string | undefined): string | null {
  return value ?? null;
}

function defaultPath(relativeSegments: string[]): string {
  return path.join(os.homedir(), ...relativeSegments);
}

export function parseBackendConfig(
  env: EnvLike = process.env,
  options: ConfigParseOptions = {},
): BackendConfig {
  const errors: string[] = [];
  const requireDatabaseUrl = options.requireDatabaseUrl ?? true;
  const databaseUrl = requireDatabaseUrl
    ? parseRequiredString(readRaw(env, 'DATABASE_URL'), 'DATABASE_URL', errors)
    : readRaw(env, 'DATABASE_URL') ?? '';
  const port = parsePort(readRaw(env, 'PORT'), errors);
  const allowedOrigins = parseOrigins(readRaw(env, 'ALLOWED_ORIGINS'), errors);
  const openclawAdminToken = normalizeOptionalString(readRaw(env, 'OPENCLAW_ADMIN_TOKEN'));

  const openclawSharedOauthJsonPath = readRaw(env, 'OPENCLAW_SHARED_OAUTH_JSON_PATH')
    ?? defaultPath(['.openclaw', 'credentials', 'oauth.json']);
  const codexAuthJsonPath = readRaw(env, 'CODEX_AUTH_JSON_PATH')
    ?? defaultPath(['.codex', 'auth.json']);
  const openclawSharedCodexModel = readRaw(env, 'OPENCLAW_SHARED_CODEX_MODEL')
    ?? DEFAULT_SHARED_CODEX_MODEL;

  const anthropicApiKey = normalizeOptionalString(readRaw(env, 'ANTHROPIC_API_KEY'));
  const openaiApiKey = normalizeOptionalString(readRaw(env, 'OPENAI_API_KEY'));
  const openrouterApiKey = normalizeOptionalString(readRaw(env, 'OPENROUTER_API_KEY'));
  const geminiApiKey = normalizeOptionalString(readRaw(env, 'GEMINI_API_KEY'));

  const rawOllamaBaseUrl = readRaw(env, 'OLLAMA_BASE_URL');
  const ollamaBaseUrl = rawOllamaBaseUrl === undefined
    ? DEFAULT_OLLAMA_BASE_URL
    : parseUrlField(rawOllamaBaseUrl, 'OLLAMA_BASE_URL', errors);

  const ollamaModel = readRaw(env, 'OLLAMA_MODEL') ?? DEFAULT_OLLAMA_MODEL;
  const telegramBotToken = normalizeOptionalString(readRaw(env, 'TELEGRAM_BOT_TOKEN'));
  const discordBotToken = normalizeOptionalString(readRaw(env, 'DISCORD_BOT_TOKEN'));
  const agentCredentialsKey = normalizeOptionalString(readRaw(env, 'AGENT_CREDENTIALS_KEY'));

  // JWT secrets: required in production, auto-generated in development.
  // Never use hardcoded defaults — generate random secrets for dev mode.
  const isDev = readRaw(env, 'NODE_ENV') === 'development' || !readRaw(env, 'NODE_ENV');
  const jwtAccessSecret = readRaw(env, 'JWT_ACCESS_SECRET')
    ?? (isDev ? DEV_JWT_ACCESS_SECRET : '');
  const jwtRefreshSecret = readRaw(env, 'JWT_REFRESH_SECRET')
    ?? (isDev ? DEV_JWT_REFRESH_SECRET : '');

  if (!isDev && (!jwtAccessSecret || !jwtRefreshSecret)) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production');
  }

  const otelEnabled = readRaw(env, 'OTEL_ENABLED') === 'true';
  const otelServiceName = readRaw(env, 'OTEL_SERVICE_NAME') ?? 'ruh-backend';
  const otelExporterOtlpEndpoint = otelEnabled
    ? parseUrlField(readRaw(env, 'OTEL_EXPORTER_OTLP_ENDPOINT'), 'OTEL_EXPORTER_OTLP_ENDPOINT', errors)
    : normalizeOptionalString(readRaw(env, 'OTEL_EXPORTER_OTLP_ENDPOINT'));
  const otelExporterOtlpHeaders = normalizeOptionalString(readRaw(env, 'OTEL_EXPORTER_OTLP_HEADERS'));
  const rawSampleRate = readRaw(env, 'OTEL_SAMPLE_RATE');
  let otelSampleRate = 1.0;
  if (rawSampleRate !== undefined) {
    const parsed = Number.parseFloat(rawSampleRate);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
      errors.push('OTEL_SAMPLE_RATE must be a number between 0 and 1');
    } else {
      otelSampleRate = parsed;
    }
  }

  const logLevel = readRaw(env, 'LOG_LEVEL') ?? 'info';

  const paperclipApiUrl = parseUrlField(readRaw(env, 'PAPERCLIP_API_URL'), 'PAPERCLIP_API_URL', errors);
  const openspaceMcpEnabled = readRaw(env, 'OPENSPACE_MCP_ENABLED') === 'true';

  if (agentCredentialsKey && !/^[0-9a-fA-F]{64}$/.test(agentCredentialsKey)) {
    errors.push('AGENT_CREDENTIALS_KEY must be exactly 64 hexadecimal characters');
  }

  if (allowedOrigins.length === 0) {
    errors.push('ALLOWED_ORIGINS must contain at least one valid origin');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid backend environment:\n- ${errors.join('\n- ')}`);
  }

  return Object.freeze({
    databaseUrl,
    port,
    allowedOrigins,
    openclawAdminToken,
    openclawSharedOauthJsonPath,
    codexAuthJsonPath,
    openclawSharedCodexModel,
    anthropicApiKey,
    openaiApiKey,
    openrouterApiKey,
    geminiApiKey,
    ollamaBaseUrl,
    ollamaModel,
    telegramBotToken,
    discordBotToken,
    agentCredentialsKey,
    jwtAccessSecret,
    jwtRefreshSecret,
    otelEnabled,
    otelServiceName,
    otelExporterOtlpEndpoint,
    otelExporterOtlpHeaders,
    otelSampleRate,
    logLevel,
    paperclipApiUrl,
    openspaceMcpEnabled,
  });
}

export function getConfig(env: EnvLike = process.env, options: ConfigParseOptions = {}): BackendConfig {
  return parseBackendConfig(env, { requireDatabaseUrl: false, ...options });
}
