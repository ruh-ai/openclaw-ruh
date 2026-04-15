/**
 * Sandbox manager: creates and manages local Docker containers pre-configured for OpenClaw.
 * Yields progress events as [eventType, data] tuples for SSE streaming.
 *
 * @kb: 003-sandbox-lifecycle 001-architecture
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { dockerSpawn, dockerExec, getContainerName } from './docker';
import { getConfig } from './config';
import { httpError, parseJsonOutput } from './utils';

// Re-export for consumers (channelManager, tests)
export { dockerExec, getContainerName, PREVIEW_PORTS };

const GATEWAY_PORT = 18789;
const VNC_WS_PORT = 6080;

/**
 * Sandbox Docker image. Use the pre-built ruh-sandbox image for fast startup (~5s).
 * Falls back to raw node:22-bookworm if the pre-built image isn't available (legacy path).
 * Set SANDBOX_IMAGE env var to override.
 */
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'ruh-sandbox:latest';
const LEGACY_IMAGE = 'node:22-bookworm';

/** Common dev server ports exposed for preview. Docker assigns random host ports. */
const PREVIEW_PORTS = [3000, 3001, 3002, 3100, 3200, 4173, 5173, 5174, 8000, 8080];
const DEFAULT_SHARED_CODEX_MODEL = 'openai-codex/gpt-5.4';
const SHARED_CODEX_ONBOARD_CMD =
  'openclaw onboard --non-interactive --secret-input-mode plaintext --accept-risk --skip-health --auth-choice skip';

export interface SandboxCreationOptions {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  telegramBotToken?: string;
  discordBotToken?: string;
  sandboxName?: string;
  sharedOpenClawOauthPath?: string;
  sharedCodexAuthPath?: string;
  sharedCodexModel?: string;
}

interface SharedAuthSeed {
  kind: 'openclaw-oauth' | 'codex-auth';
  hostPath: string;
  containerPath: string;
  label: string;
}

export type LlmProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

export interface SandboxLlmReconfigureOptions {
  provider: LlmProviderId;
  apiKey?: string;
  model?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

export interface SandboxLlmReconfigureResult {
  ok: true;
  provider: LlmProviderId;
  model: string;
  logs: string[];
  configured: {
    apiKey?: string;
    envVar?: string;
    baseUrl?: string;
  };
}

export interface SharedCodexRetrofitOptions {
  sharedOpenClawOauthPath?: string;
  sharedCodexAuthPath?: string;
  sharedCodexModel?: string;
}

export interface SharedCodexRetrofitResult {
  ok: true;
  containerName: string;
  model: string;
  homeDir: string;
  authSource: string;
  logs: string[];
}

interface ProviderModelDefinition {
  id: string;
  label: string;
  reasoning?: boolean;
  input?: string[];
  maxTokens?: number;
  contextWindow?: number;
}

interface ProviderDefinition {
  label: string;
  envVar?: string;
  requiresApiKey: boolean;
  defaultModel: string;
  baseUrl: string;
  models: ProviderModelDefinition[];
}

interface BootstrapCommandStep {
  id: string;
  label: string;
  command: string;
  timeoutSec?: number;
}

interface BootstrapConfigExpectation {
  path: string;
  expected: unknown;
}

const PROVIDER_DEFINITIONS: Record<LlmProviderId, ProviderDefinition> = {
  anthropic: {
    label: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    requiresApiKey: true,
    defaultModel: 'claude-sonnet-4-6',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', reasoning: true, contextWindow: 200_000, maxTokens: 16_384 },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', reasoning: true, contextWindow: 200_000, maxTokens: 16_384 },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', contextWindow: 200_000, maxTokens: 8192 },
    ],
  },
  openai: {
    label: 'OpenAI / Codex',
    envVar: 'OPENAI_API_KEY',
    requiresApiKey: true,
    defaultModel: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', contextWindow: 128_000, maxTokens: 16_384 },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', contextWindow: 128_000, maxTokens: 16_384 },
      { id: 'o3', label: 'o3', reasoning: true, contextWindow: 200_000, maxTokens: 100_000 },
      { id: 'o4-mini', label: 'o4-mini', reasoning: true, contextWindow: 200_000, maxTokens: 100_000 },
      { id: 'codex-mini-latest', label: 'Codex Mini', reasoning: true, contextWindow: 200_000, maxTokens: 100_000 },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    envVar: 'GEMINI_API_KEY',
    requiresApiKey: true,
    defaultModel: 'gemini-2.5-pro',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', contextWindow: 1_000_000, maxTokens: 65_536 },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    requiresApiKey: true,
    defaultModel: 'openrouter/auto',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'openrouter/auto', label: 'Auto (OpenRouter routing)', reasoning: true, contextWindow: 200_000, maxTokens: 65_536 },
    ],
  },
  ollama: {
    label: 'Ollama (local)',
    requiresApiKey: false,
    defaultModel: 'qwen3-coder:30b',
    baseUrl: 'http://host.docker.internal:11434/v1',
    models: [
      { id: 'qwen3-coder:30b', label: 'Qwen3-Coder 30B', reasoning: true, contextWindow: 32_768, maxTokens: 8192 },
      { id: 'qwen3-coder:14b', label: 'Qwen3-Coder 14B', reasoning: true, contextWindow: 32_768, maxTokens: 8192 },
      { id: 'llama3.3:70b', label: 'Llama 3.3 70B', reasoning: true, contextWindow: 32_768, maxTokens: 8192 },
      { id: 'mistral', label: 'Mistral', contextWindow: 32_768, maxTokens: 8192 },
    ],
  },
};

const RECONFIGURE_LLM_NODE_SCRIPT = `
const fs = require('fs');
const os = require('os');
const path = require('path');

const payload = JSON.parse(Buffer.from(process.argv[1], 'base64').toString('utf8'));
const home = os.homedir();
const configPath = path.join(home, '.openclaw', 'openclaw.json');
const envPath = path.join(home, '.openclaw', '.env');
const authPath = path.join(home, '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  config = {};
}

config.models = config.models ?? {};
config.models.providers = config.models.providers ?? {};
config.models.providers[payload.providerId] = payload.providerConfig;

fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

const providers = config.models.providers ?? {};
const profiles = {};
for (const [id, provider] of Object.entries(providers)) {
  if (provider && provider.apiKey) {
    profiles[id + '-key'] = {
      type: 'api_key',
      provider: id,
      key: provider.apiKey,
    };
  }
}

fs.mkdirSync(path.dirname(authPath), { recursive: true });
fs.writeFileSync(authPath, JSON.stringify({ profiles }, null, 2));

const env = {};
try {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\\r?\\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    env[line.slice(0, idx)] = line.slice(idx + 1);
  }
} catch {}

for (const [key, value] of Object.entries(payload.envUpdates ?? {})) {
  if (value == null || value === '') delete env[key];
  else env[key] = String(value);
}

const envLines = Object.entries(env).map(([key, value]) => \`\${key}=\${value}\`);
fs.mkdirSync(path.dirname(envPath), { recursive: true });
fs.writeFileSync(envPath, envLines.join('\\n') + (envLines.length ? '\\n' : ''));

process.stdout.write('Config updated');
`;

export type SandboxEvent =
  | ['log', string]
  | ['result', Record<string, unknown>]
  | ['approved', Record<string, unknown>]
  | ['error', string];

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function resolveSharedAuthSeed(opts: SandboxCreationOptions): SharedAuthSeed | null {
  const config = getConfig();
  const openclawOauthPath = firstNonEmpty(
    opts.sharedOpenClawOauthPath,
    config.openclawSharedOauthJsonPath,
  );
  if (openclawOauthPath && fs.existsSync(openclawOauthPath)) {
    return {
      kind: 'openclaw-oauth',
      hostPath: openclawOauthPath,
      containerPath: '/root/.openclaw/credentials/oauth.json',
      label: 'OpenClaw OAuth state',
    };
  }

  const codexAuthPath = firstNonEmpty(
    opts.sharedCodexAuthPath,
    config.codexAuthJsonPath,
  );
  if (codexAuthPath && fs.existsSync(codexAuthPath)) {
    return {
      kind: 'codex-auth',
      hostPath: codexAuthPath,
      containerPath: '/root/.codex/auth.json',
      label: 'Codex CLI auth',
    };
  }

  return null;
}

function resolveSharedCodexModel(opts: SandboxCreationOptions): string {
  const config = getConfig();
  return (
    firstNonEmpty(
      opts.sharedCodexModel,
      config.openclawSharedCodexModel,
      DEFAULT_SHARED_CODEX_MODEL,
    ) || DEFAULT_SHARED_CODEX_MODEL
  );
}

function assertSharedCodexProbeSucceeded(output: string): void {
  const parsed = parseJsonOutput(output) as {
    defaultModel?: string;
    resolvedDefault?: string;
    auth?: {
      missingProvidersInUse?: string[];
      probes?: {
        totalTargets?: number;
        results?: Array<{ status?: string }>;
      };
    };
  };

  const totalTargets = Number(parsed?.auth?.probes?.totalTargets ?? 0);
  const results = Array.isArray(parsed?.auth?.probes?.results)
    ? parsed.auth?.probes?.results ?? []
    : [];
  const hasOkResult = results.some((result) => result?.status === 'ok');

  if (totalTargets < 1 || !hasOkResult) {
    throw httpError(502, 'Shared Codex auth probe returned no usable targets');
  }
}

function assertExpectedResolvedModel(
  output: string,
  expectedModel: string,
  context: string,
): void {
  const parsed = parseJsonOutput(output) as {
    defaultModel?: string;
    resolvedDefault?: string;
    auth?: {
      missingProvidersInUse?: string[];
    };
  };

  if (parsed.defaultModel && parsed.defaultModel !== expectedModel) {
    throw httpError(
      502,
      `${context} defaultModel mismatch: expected ${expectedModel}, got ${parsed.defaultModel}`,
    );
  }

  if (parsed.resolvedDefault && parsed.resolvedDefault !== expectedModel) {
    throw httpError(
      502,
      `${context} resolvedDefault mismatch: expected ${expectedModel}, got ${parsed.resolvedDefault}`,
    );
  }

  const missingProviders = Array.isArray(parsed.auth?.missingProvidersInUse)
    ? parsed.auth?.missingProvidersInUse ?? []
    : [];
  if (missingProviders.length > 0) {
    throw httpError(
      502,
      `${context} still references missing providers: ${missingProviders.join(', ')}`,
    );
  }
}

async function seedSharedAuthState(
  containerName: string,
  seed: SharedAuthSeed,
  homeDir = '/root',
): Promise<void> {
  const destination = seed.containerPath.replace(/^\/root/, homeDir);
  const payload = fs.readFileSync(seed.hostPath).toString('base64');
  const script =
    "const fs=require('fs');const path=require('path');const destination=process.argv[1];const content=Buffer.from(process.argv[2],'base64');if(fs.existsSync(destination)){process.stdout.write('present');process.exit(0)}fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content);process.stdout.write('seeded');";
  const [ok, out] = await dockerExec(
    containerName,
    `node -e ${JSON.stringify(script)} ${JSON.stringify(destination)} ${JSON.stringify(payload)} 2>&1`,
    45_000,
  );

  if (!ok) {
    throw new Error(`Failed to seed ${seed.label}: ${out.slice(0, 400)}`);
  }
}

async function syncCodexAuthProfile(
  containerName: string,
  homeDir: string,
): Promise<void> {
  const script = "const fs=require('fs');const path=require('path');const homeDir=process.argv[1];const codexPath=path.join(homeDir,'.codex','auth.json');const authStorePath=path.join(homeDir,'.openclaw','agents','main','agent','auth-profiles.json');const codex=JSON.parse(fs.readFileSync(codexPath,'utf8'));const access=codex&&codex.tokens&&codex.tokens.access_token;const refresh=codex&&codex.tokens&&codex.tokens.refresh_token;const accountId=codex&&codex.tokens&&codex.tokens.account_id;if(!access||!refresh||!accountId) throw new Error('Codex auth file is missing access_token, refresh_token, or account_id');const jwtPart=String(access).split('.')[1]||'';const normalized=jwtPart.replace(/-/g,'+').replace(/_/g,'/');const jwtPayload=JSON.parse(Buffer.from(normalized,'base64').toString('utf8'));const expires=typeof jwtPayload.exp==='number'?jwtPayload.exp*1000:null;if(!expires) throw new Error('Could not derive Codex token expiry from access token');let authStore={version:1,profiles:{},lastGood:{},usageStats:{}};try{authStore=JSON.parse(fs.readFileSync(authStorePath,'utf8'));}catch{}authStore.version=1;authStore.profiles=authStore.profiles||{};authStore.lastGood=authStore.lastGood||{};authStore.usageStats=authStore.usageStats||{};authStore.profiles['openai-codex:default']={type:'oauth',provider:'openai-codex',access,refresh,expires,accountId};authStore.lastGood['openai-codex']='openai-codex:default';fs.mkdirSync(path.dirname(authStorePath),{recursive:true});fs.writeFileSync(authStorePath,JSON.stringify(authStore,null,2));process.stdout.write('synced');";

  const [ok, out] = await dockerExec(
    containerName,
    `node -e ${JSON.stringify(script)} ${JSON.stringify(homeDir)} 2>&1`,
    45_000,
  );

  if (!ok) {
    throw httpError(502, `Failed to sync Codex auth into OpenClaw profiles: ${out.slice(0, 400)}`);
  }
}

async function alignArchitectAgentModel(
  containerName: string,
  homeDir: string,
  sharedCodexModel: string,
): Promise<boolean> {
  const script = "const fs=require('fs');const path=require('path');const homeDir=process.argv[1];const model=process.argv[2];const configPath=path.join(homeDir,'.openclaw','openclaw.json');let config={};try{config=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch{process.stdout.write('absent');process.exit(0)}const agents=Array.isArray(config?.agents?.list)?config.agents.list:[];let found=false;for(const agent of agents){if(!agent||typeof agent!=='object'||agent.id!=='architect') continue;found=true;if(agent.model!==model){agent.model=model;fs.writeFileSync(configPath,JSON.stringify(config,null,2));process.stdout.write('updated');process.exit(0)}}process.stdout.write(found?'present':'absent');";

  const [ok, out] = await dockerExec(
    containerName,
    `node -e ${JSON.stringify(script)} ${JSON.stringify(homeDir)} ${JSON.stringify(sharedCodexModel)} 2>&1`,
    45_000,
  );

  if (!ok) {
    throw httpError(502, `Failed to align architect agent model: ${out.slice(0, 400)}`);
  }

  return out.trim() !== 'absent';
}

function maskSecret(v: string): string {
  if (!v) return '';
  if (v.length <= 8) return '***';
  return v.slice(0, 4) + '***' + v.slice(-4);
}

function truncateBootstrapDiagnostic(output: string, limit = 200): string {
  const compact = String(output ?? '').trim().replace(/\s+/g, ' ');
  if (!compact) return 'no diagnostic output';
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

async function verifyBootstrapConfig(
  containerName: string,
  expectations: BootstrapConfigExpectation[],
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const encodedExpectations = Buffer.from(JSON.stringify(expectations), 'utf8').toString('base64');
  const script = [
    "const fs=require('fs');",
    "const os=require('os');",
    "const path=require('path');",
    "const verificationMarker='bootstrap-config-verify';",
    "void verificationMarker;",
    "function getByPath(input,dottedPath){",
    "return dottedPath.split('.').reduce((current,part)=>{",
    "if(current==null||typeof current!=='object') return undefined;",
    "return current[part];",
    "},input);",
    "}",
    "const expectations=JSON.parse(Buffer.from(process.argv[1],'base64').toString('utf8'));",
    "const configPath=path.join(os.homedir(),'.openclaw','openclaw.json');",
    "const config=JSON.parse(fs.readFileSync(configPath,'utf8'));",
    "const failures=[];",
    "for(const item of expectations){",
    "const actual=getByPath(config,item.path);",
    "if(JSON.stringify(actual)!==JSON.stringify(item.expected)){",
    "failures.push({path:item.path,expected:item.expected,actual:actual===undefined?null:actual});",
    "}",
    "}",
    "process.stdout.write(JSON.stringify({ok:failures.length===0,failures}));",
  ].join('');

  const [ok, output] = await dockerExec(
    containerName,
    `node -e ${JSON.stringify(script)} ${JSON.stringify(encodedExpectations)} 2>&1`,
    30_000,
  );

  if (!ok) {
    return {
      ok: false,
      detail: `bootstrap verification command failed: ${truncateBootstrapDiagnostic(output)}`,
    };
  }

  try {
    const parsed = parseJsonOutput(output) as {
      ok?: boolean;
      failures?: Array<{ path?: string; expected?: unknown; actual?: unknown }>;
    };
    if (parsed.ok) return { ok: true };
    const firstFailure = Array.isArray(parsed.failures) ? parsed.failures[0] : null;
    if (!firstFailure?.path) {
      return { ok: false, detail: 'bootstrap verification reported an unknown mismatch' };
    }
    return {
      ok: false,
      detail: `${firstFailure.path} expected ${JSON.stringify(firstFailure.expected)} but found ${JSON.stringify(firstFailure.actual)}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `bootstrap verification returned invalid JSON: ${truncateBootstrapDiagnostic(
        error instanceof Error ? error.message : String(error),
      )}`,
    };
  }
}

function buildProviderModels(
  provider: LlmProviderId,
  modelDefs: ProviderModelDefinition[],
): Array<Record<string, unknown>> {
  return modelDefs.map((model) => ({
    id: model.id,
    name: model.label,
    description: model.label,
    reasoning: Boolean(model.reasoning),
    input: model.input ?? ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    maxTokens: model.maxTokens ?? 16_384,
    contextWindow: model.contextWindow ?? 200_000,
    source: { type: 'openai', model: model.id },
    ...(provider === 'gemini' ? { compat: { supportsStore: false } } : {}),
  }));
}

function resolveProviderOptions(
  opts: SandboxLlmReconfigureOptions,
): {
  providerId: LlmProviderId;
  providerDef: ProviderDefinition;
  modelId: string;
  baseUrl: string;
  apiKey: string;
  envUpdates: Record<string, string>;
  providerConfig: Record<string, unknown>;
} {
  const providerId = String(opts.provider ?? '').trim() as LlmProviderId;
  const providerDef = PROVIDER_DEFINITIONS[providerId];

  if (!providerDef) {
    throw httpError(400, `Unsupported provider: ${String(opts.provider ?? '')}`);
  }

  const modelDefs = [...providerDef.models];
  if (providerId === 'ollama') {
    const requestedOllamaModel = String(opts.ollamaModel ?? opts.model ?? '').trim();
    if (requestedOllamaModel && !modelDefs.some((model) => model.id === requestedOllamaModel)) {
      modelDefs.unshift({
        id: requestedOllamaModel,
        label: requestedOllamaModel,
        reasoning: true,
        contextWindow: 32_768,
        maxTokens: 8192,
      });
    }
  }

  const modelId = String(
    opts.model ??
      (providerId === 'ollama' ? opts.ollamaModel : '') ??
      providerDef.defaultModel,
  ).trim() || providerDef.defaultModel;

  if (!modelDefs.some((model) => model.id === modelId)) {
    throw httpError(400, `Model "${modelId}" does not belong to provider "${providerId}"`);
  }

  const apiKey = String(opts.apiKey ?? '').trim();
  if (providerDef.requiresApiKey && !apiKey) {
    throw httpError(400, `apiKey is required for provider "${providerId}"`);
  }

  const baseUrl =
    providerId === 'ollama'
      ? String(opts.ollamaBaseUrl ?? providerDef.baseUrl).trim() || providerDef.baseUrl
      : providerDef.baseUrl;

  const providerConfig: Record<string, unknown> = {
    name: providerDef.label,
    api: 'openai-completions',
    baseUrl,
    apiKey: providerId === 'ollama' ? 'ollama-local' : apiKey,
    models: buildProviderModels(providerId, modelDefs),
  };

  const envUpdates: Record<string, string> = {};
  if (providerDef.envVar && apiKey) {
    envUpdates[providerDef.envVar] = apiKey;
  }
  if (providerId === 'ollama') {
    envUpdates['OLLAMA_BASE_URL'] = baseUrl;
    envUpdates['OLLAMA_MODEL'] = modelId;
  }

  return { providerId, providerDef, modelId, baseUrl, apiKey, envUpdates, providerConfig };
}

export async function ensureInteractiveRuntimeServices(containerName: string): Promise<void> {
  await dockerExec(
    containerName,
    'pgrep -f "Xvfb :99" >/dev/null || nohup Xvfb :99 -screen 0 1280x720x24 -ac > /tmp/openclaw-xvfb.log 2>&1 &',
    10_000,
  );
  await Bun.sleep(500);
  await dockerExec(
    containerName,
    'command -v x11vnc >/dev/null 2>&1 && (pgrep -f x11vnc >/dev/null || DISPLAY=:99 nohup x11vnc -display :99 -nopw -listen localhost -forever -shared -rfbport 5900 > /tmp/openclaw-x11vnc.log 2>&1 &) || true',
    10_000,
  );
  await dockerExec(
    containerName,
    `command -v websockify >/dev/null 2>&1 && (pgrep -f "websockify.*${VNC_WS_PORT}" >/dev/null || (websockify --web /usr/share/novnc --daemon ${VNC_WS_PORT} localhost:5900 > /tmp/openclaw-websockify.log 2>&1 || true)) || true`,
    10_000,
  );
}

async function ensureGatewayControlUiBypass(containerName: string): Promise<void> {
  await dockerExec(
    containerName,
    'openclaw config set gateway.controlUi.allowInsecureAuth true >/dev/null && openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true >/dev/null',
    15_000,
  );
}

export async function restartGateway(containerName: string): Promise<void> {
  await ensureGatewayControlUiBypass(containerName);
  await dockerExec(containerName, 'openclaw gateway stop 2>/dev/null || true', 15_000);
  await Bun.sleep(2000);
  await ensureInteractiveRuntimeServices(containerName);
  await dockerExec(
    containerName,
    `DISPLAY=:99 OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 nohup openclaw gateway run --bind lan --port ${GATEWAY_PORT} > /tmp/openclaw-gateway.log 2>&1 &`,
    10_000,
  );
}

async function detectContainerHomeDir(containerName: string): Promise<string> {
  const [ok, out] = await dockerExec(
    containerName,
    `node -e "process.stdout.write(require('os').homedir())"`,
    10_000,
  );

  const homeDir = out.trim();
  if (!ok || !homeDir) {
    throw httpError(502, `Failed to determine container home directory: ${out.slice(0, 400)}`);
  }
  return homeDir;
}

export async function waitForGateway(containerName: string): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    const [ok] = await dockerExec(
      containerName,
      `node -e "const n=require('net');const c=n.connect(${GATEWAY_PORT},'127.0.0.1',()=>{c.end();process.exit(0)});c.on('error',()=>process.exit(1))"`,
      5000,
    );
    if (ok) return true;
    await Bun.sleep(1500);
  }
  return false;
}

export async function retrofitContainerToSharedCodex(
  containerName: string,
  opts: SharedCodexRetrofitOptions = {},
): Promise<SharedCodexRetrofitResult> {
  const sharedAuthSeed = resolveSharedAuthSeed(opts);
  if (!sharedAuthSeed) {
    throw httpError(400, 'No shared OpenClaw OAuth or Codex auth file is available on the host');
  }

  const sharedCodexModel = resolveSharedCodexModel(opts);
  const homeDir = await detectContainerHomeDir(containerName);
  await seedSharedAuthState(containerName, sharedAuthSeed, homeDir);

  const [onboardOk, onboardOut] = await dockerExec(
    containerName,
    SHARED_CODEX_ONBOARD_CMD,
    120_000,
  );
  if (!onboardOk) {
    throw httpError(502, `Failed to refresh OpenClaw onboarding for shared Codex auth: ${onboardOut.slice(0, 400)}`);
  }
  if (sharedAuthSeed.kind === 'codex-auth') {
    await syncCodexAuthProfile(containerName, homeDir);
  }

  const [setModelOk, setModelOut] = await dockerExec(
    containerName,
    `openclaw config set agents.defaults.model.primary ${sharedCodexModel}`,
    30_000,
  );
  if (!setModelOk) {
    throw httpError(502, `Failed to set shared Codex model: ${setModelOut.slice(0, 400)}`);
  }

  const hasArchitectAgent = await alignArchitectAgentModel(
    containerName,
    homeDir,
    sharedCodexModel,
  );

  const [probeOk, probeOut] = await dockerExec(
    containerName,
    'openclaw models status --probe --probe-provider openai-codex --json',
    30_000,
  );
  if (!probeOk) {
    throw httpError(502, `Shared Codex auth probe failed: ${probeOut.slice(0, 400)}`);
  }
  assertSharedCodexProbeSucceeded(probeOut);
  assertExpectedResolvedModel(probeOut, sharedCodexModel, 'Shared Codex auth');

  if (hasArchitectAgent) {
    const [architectProbeOk, architectProbeOut] = await dockerExec(
      containerName,
      'openclaw models status --agent architect --probe --probe-provider openai-codex --json',
      30_000,
    );
    if (!architectProbeOk) {
      throw httpError(502, `Architect shared Codex auth probe failed: ${architectProbeOut.slice(0, 400)}`);
    }
    assertSharedCodexProbeSucceeded(architectProbeOut);
    assertExpectedResolvedModel(architectProbeOut, sharedCodexModel, 'Architect shared Codex auth');
  }

  await restartGateway(containerName);
  const healthy = await waitForGateway(containerName);
  if (!healthy) {
    throw httpError(502, 'Gateway did not become healthy after shared Codex retrofit');
  }

  return {
    ok: true,
    containerName,
    model: sharedCodexModel,
    homeDir,
    authSource: sharedAuthSeed.label,
    logs: [
      'Shared auth ready',
      'Onboarding refreshed',
      'Default model set',
      ...(hasArchitectAgent ? ['Architect model aligned'] : []),
      'Gateway restarted',
    ],
  };
}

export async function retrofitSandboxToSharedCodex(
  sandboxId: string,
  opts: SharedCodexRetrofitOptions = {},
): Promise<SharedCodexRetrofitResult & { sandboxId: string }> {
  const result = await retrofitContainerToSharedCodex(getContainerName(sandboxId), opts);
  return {
    ...result,
    sandboxId,
  };
}

export async function reconfigureSandboxLlm(
  sandboxId: string,
  opts: SandboxLlmReconfigureOptions,
): Promise<SandboxLlmReconfigureResult> {
  const {
    providerId,
    providerDef,
    modelId,
    baseUrl,
    apiKey,
    envUpdates,
    providerConfig,
  } = resolveProviderOptions(opts);

  const payload = Buffer.from(
    JSON.stringify({
      providerId,
      providerConfig,
      envUpdates,
    }),
    'utf8',
  ).toString('base64');

  const containerName = getContainerName(sandboxId);
  const [writeOk, writeOut] = await dockerExec(
    containerName,
    `node -e ${JSON.stringify(RECONFIGURE_LLM_NODE_SCRIPT)} ${JSON.stringify(payload)} 2>&1`,
    45_000,
  );

  if (!writeOk) {
    throw httpError(502, `Failed to update LLM config: ${writeOut.slice(0, 400)}`);
  }

  await restartGateway(containerName);
  const healthy = await waitForGateway(containerName);
  if (!healthy) {
    throw httpError(502, 'Gateway did not become healthy after LLM reconfiguration');
  }

  return {
    ok: true,
    provider: providerId,
    model: modelId,
    logs: ['Config updated', 'Auth profiles written', 'Gateway restarted'],
    configured: {
      ...(apiKey ? { apiKey: maskSecret(apiKey) } : {}),
      ...(providerDef.envVar ? { envVar: providerDef.envVar } : {}),
      baseUrl,
    },
  };
}

export async function stopAndRemoveContainer(sandboxId: string): Promise<void> {
  await dockerSpawn(['rm', '-f', getContainerName(sandboxId)], 15_000);
}

export async function* createOpenclawSandbox(
  opts: SandboxCreationOptions,
): AsyncGenerator<SandboxEvent> {
  const {
    anthropicApiKey = '',
    openaiApiKey = '',
    openrouterApiKey = '',
    geminiApiKey = '',
    ollamaBaseUrl = 'http://host.docker.internal:11434/v1',
    ollamaModel = 'qwen3-coder:30b',
    telegramBotToken = '',
    discordBotToken = '',
    sandboxName = 'openclaw-gateway',
  } = opts;

  const sandboxId = uuidv4();
  const containerName = getContainerName(sandboxId);
  const sharedAuthSeed = resolveSharedAuthSeed(opts);
  const sharedCodexModel = resolveSharedCodexModel(opts);
  const createSpan = trace.getTracer('ruh-backend').startSpan('sandbox.create', {
    attributes: { 'sandbox.name': sandboxName, 'sandbox.id': sandboxId },
  });

  // Collect env vars to forward into the container
  const keyMap: Record<string, string> = {
    ...(sharedAuthSeed
      ? {}
      : {
          ANTHROPIC_API_KEY: anthropicApiKey,
          OPENAI_API_KEY: openaiApiKey,
          OPENROUTER_API_KEY: openrouterApiKey,
          GEMINI_API_KEY: geminiApiKey,
        }),
    TELEGRAM_BOT_TOKEN: telegramBotToken,
    DISCORD_BOT_TOKEN: discordBotToken,
  };
  const envArgs: string[] = [];
  for (const [key, val] of Object.entries(keyMap)) {
    if (val) {
      envArgs.push('-e', `${key}=${val}`);
      yield ['log', `Forwarding ${key} into container`];
    }
  }

  // Resolve sandbox image — prefer pre-built ruh-sandbox, fall back to legacy
  let sandboxImage = SANDBOX_IMAGE;
  let usingPrebuiltImage = false;
  const [prebuiltInspectCode] = await dockerSpawn(['image', 'inspect', SANDBOX_IMAGE], 10_000);
  if (prebuiltInspectCode === 0) {
    usingPrebuiltImage = true;
    yield ['log', `Using pre-built sandbox image: ${SANDBOX_IMAGE}`];
  } else {
    // Fall back to legacy image
    sandboxImage = LEGACY_IMAGE;
    yield ['log', `Pre-built image not found, falling back to ${LEGACY_IMAGE}...`];
    const [legacyInspectCode] = await dockerSpawn(['image', 'inspect', LEGACY_IMAGE], 10_000);
    if (legacyInspectCode !== 0) {
      yield ['log', `Pulling ${LEGACY_IMAGE} image...`];
      const [pullCode, pullOut] = await dockerSpawn(['pull', LEGACY_IMAGE], 180_000);
      if (pullCode !== 0) {
        yield ['error', `Failed to pull ${LEGACY_IMAGE} image: ${pullOut}`];
        return;
      }
    }
  }

  yield ['log', `Creating container '${containerName}'...`];
  const [createCode, createOut] = await dockerSpawn(
    [
      'run', '-d',
      '--name', containerName,
      '--memory', '2g',            // Resource limit: prevent runaway containers
      '--cpus', '2',               // CPU limit
      '--restart', 'unless-stopped', // Auto-restart on crash
      '-p', `${GATEWAY_PORT}`,     // Docker assigns a random host port
      '-p', `${VNC_WS_PORT}`,      // VNC websockify port
      ...PREVIEW_PORTS.flatMap(p => ['-p', `${p}`]), // Dev server preview ports
      ...envArgs,
      sandboxImage,
      'tail', '-f', '/dev/null',   // Keep container alive
    ],
    30_000,
  );

  if (createCode !== 0) {
    yield ['error', `Failed to create container: ${createOut}`];
    return;
  }
  yield ['log', `Container started: ${containerName}`];

  const removeContainer = async () => {
    await dockerSpawn(['rm', '-f', containerName], 15_000);
  };

  const failCreate = async (message: string): Promise<SandboxEvent> => {
    createSpan.setStatus({ code: SpanStatusCode.ERROR, message });
    createSpan.end();
    await removeContainer();
    return ['error', message];
  };

  // Resolve the host port Docker assigned
  await Bun.sleep(500);
  const [portCode, portOut] = await dockerSpawn(
    ['port', containerName, `${GATEWAY_PORT}/tcp`],
    10_000,
  );
  if (portCode !== 0 || !portOut) {
    yield await failCreate(`Failed to get port mapping: ${portOut}`);
    return;
  }

  // portOut is like "0.0.0.0:32769" or ":::32769"
  const hostPort = portOut.trim().split(':').pop() ?? '';
  if (!hostPort || isNaN(parseInt(hostPort))) {
    yield await failCreate(`Could not parse host port from: ${portOut}`);
    return;
  }

  // Use Docker host IP when running in a container (e.g. via docker compose),
  // so sibling containers (builder UI) can reach the sandbox gateway.
  const dockerHostIp = process.env.DOCKER_HOST_IP ?? 'localhost';
  const gatewayUrl = `http://${dockerHostIp}:${hostPort}`;
  yield ['log', `Gateway will be accessible at ${gatewayUrl}`];

  // Resolve VNC websockify host port
  const [vncPortCode, vncPortOut] = await dockerSpawn(
    ['port', containerName, `${VNC_WS_PORT}/tcp`],
    10_000,
  );
  let vncHostPort: number | null = null;
  if (vncPortCode === 0 && vncPortOut) {
    const parsed = parseInt(vncPortOut.trim().split(':').pop() ?? '', 10);
    if (!isNaN(parsed)) {
      vncHostPort = parsed;
      yield ['log', `VNC websockify will be accessible on host port ${vncHostPort}`];
    }
  }

  // Resolve agent dashboard host port (8080 inside container)
  const [dashPortCode, dashPortOut] = await dockerSpawn(
    ['port', containerName, '8080/tcp'],
    10_000,
  );
  let dashboardHostPort: number | null = null;
  if (dashPortCode === 0 && dashPortOut) {
    const parsed = parseInt(dashPortOut.trim().split(':').pop() ?? '', 10);
    if (!isNaN(parsed)) dashboardHostPort = parsed;
  }

  const run = (cmd: string, timeoutSec = 300) =>
    dockerExec(containerName, cmd, timeoutSec * 1000);

  const runRequiredBootstrapStep = async (
    step: BootstrapCommandStep,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const [stepOk, stepOut] = await run(step.command, step.timeoutSec ?? 30);
    if (!stepOk) {
      return {
        ok: false,
        error: `Required bootstrap step failed (${step.id}): ${truncateBootstrapDiagnostic(stepOut)}`,
      };
    }
    return { ok: true };
  };

  const runOptionalBootstrapStep = async (
    label: string,
    command: string,
    timeoutSec = 30,
  ): Promise<string | null> => {
    const [stepOk, stepOut] = await run(command, timeoutSec);
    if (!stepOk) {
      return `Warning: optional bootstrap step failed (${label}): ${truncateBootstrapDiagnostic(stepOut)}`;
    }
    return null;
  };

  // ── OpenClaw + Browser install (skip if using pre-built image) ──────────
  if (usingPrebuiltImage) {
    // Pre-built image has everything installed — just verify and start VNC
    const [verOk, ver] = await run('openclaw --version');
    if (!verOk) {
      yield await failCreate('openclaw binary not found in pre-built image — rebuild with: scripts/build-sandbox-image.sh');
      return;
    }
    yield ['log', `OpenClaw ready: ${ver}`];

    // Start VNC stack using the baked-in script
    yield ['log', 'Starting VNC services...'];
    const [vncOk, vncOut] = await run('sandbox-vnc-start', 15);
    if (!vncOk) {
      yield ['log', `Warning: VNC startup failed (live browser view unavailable): ${truncateBootstrapDiagnostic(vncOut)}`];
    } else {
      yield ['log', 'VNC services started'];
    }

    // Start agent runtime (per-agent backend + dashboard on port 8080)
    yield ['log', 'Starting agent dashboard...'];
    const [runtimeOk, runtimeOut] = await run('sandbox-agent-runtime', 20);
    if (!runtimeOk) {
      yield ['log', `Warning: Agent dashboard startup failed (non-fatal): ${truncateBootstrapDiagnostic(runtimeOut)}`];
    } else {
      yield ['log', 'Agent dashboard ready on port 8080'];
    }
  } else {
    // Legacy path: install everything from scratch (slow ~3min)
    yield ['log', 'Installing OpenClaw (npm install -g openclaw@latest)...'];
    let [ok, out] = await run('npm install -g openclaw@latest', 600);
    if (!ok) {
      yield ['log', 'Retrying with --unsafe-perm...'];
      [ok, out] = await run('npm install -g --unsafe-perm openclaw@latest', 600);
      if (!ok) {
        yield await failCreate(`OpenClaw installation failed: ${out}`);
        return;
      }
    }

    const [verOk, ver] = await run('openclaw --version');
    if (!verOk) {
      yield await failCreate('openclaw binary not found after install');
      return;
    }
    yield ['log', `OpenClaw installed: ${ver}`];

    // ── Install browser + VNC stack for live browser view ──────────────────
    yield ['log', 'Installing browser & VNC stack (xvfb, x11vnc, websockify, chromium)...'];
    const [browserOk, browserOut] = await run(
      'apt-get update -qq && apt-get install -y --no-install-recommends ' +
      'xvfb x11vnc websockify novnc chromium ' +
      'fonts-liberation fonts-noto-color-emoji ' +
      '&& rm -rf /var/lib/apt/lists/*',
      600,
    );
    if (!browserOk) {
      // Non-fatal — sandbox still works without live browser view
      yield ['log', `Warning: browser stack install failed (live browser view unavailable): ${browserOut.slice(0, 200)}`];
    } else {
      yield ['log', 'Browser & VNC stack installed'];

      // Start the display server stack
      yield ['log', 'Starting virtual display (Xvfb) and VNC services...'];
      // Xvfb — virtual framebuffer
      const xvfbWarning = await runOptionalBootstrapStep('browser.xvfb', 'Xvfb :99 -screen 0 1280x720x24 -ac &', 10);
      if (xvfbWarning) yield ['log', xvfbWarning];
      // Set DISPLAY for all subsequent processes
      const bashrcWarning = await runOptionalBootstrapStep('browser.display-export', 'echo "export DISPLAY=:99" >> /root/.bashrc', 5);
      if (bashrcWarning) yield ['log', bashrcWarning];
      // x11vnc — VNC server on port 5900
      const x11vncWarning = await runOptionalBootstrapStep(
        'browser.x11vnc',
        'DISPLAY=:99 x11vnc -display :99 -nopw -listen localhost -forever -shared -rfbport 5900 &',
      10,
    );
    if (x11vncWarning) yield ['log', x11vncWarning];
    // websockify — bridges VNC (5900) to WebSocket (6080) and serves noVNC web client
    const websockifyWarning = await runOptionalBootstrapStep(
      'browser.websockify',
      `websockify --web /usr/share/novnc --daemon ${VNC_WS_PORT} localhost:5900`,
      10,
    );
    if (websockifyWarning) yield ['log', websockifyWarning];
    yield ['log', `VNC services started (websockify on port ${VNC_WS_PORT})`];
  }
  } // end legacy install path

  if (sharedAuthSeed) {
    yield ['log', `Seeding shared ${sharedAuthSeed.label} into sandbox...`];
    try {
      await seedSharedAuthState(containerName, sharedAuthSeed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield await failCreate(msg);
      return;
    }
  }

  // Build onboard command
  let onboardCmd =
    'openclaw onboard --non-interactive --secret-input-mode plaintext --accept-risk --skip-health';

  if (sharedAuthSeed) {
    onboardCmd += ' --auth-choice skip';
    yield ['log', `LLM provider: Shared Codex OAuth via ${sharedAuthSeed.label}`];
  } else if (openrouterApiKey) {
    onboardCmd +=
      ' --auth-choice custom-api-key' +
      ' --custom-base-url https://openrouter.ai/api/v1' +
      ' --custom-model-id openrouter/auto' +
      ` --custom-api-key ${openrouterApiKey}` +
      ' --custom-compatibility openai';
    yield ['log', 'LLM provider: OpenRouter'];
  } else if (openaiApiKey) {
    onboardCmd += ` --auth-choice openai-api-key --custom-api-key ${openaiApiKey}`;
    yield ['log', 'LLM provider: OpenAI'];
  } else if (anthropicApiKey) {
    onboardCmd +=
      ' --auth-choice custom-api-key' +
      ' --custom-base-url https://api.anthropic.com/v1' +
      ' --custom-model-id claude-sonnet-4-20250514' +
      ` --custom-api-key ${anthropicApiKey}` +
      ' --custom-compatibility openai';
    yield ['log', 'LLM provider: Anthropic'];
  } else if (geminiApiKey) {
    onboardCmd +=
      ' --auth-choice custom-api-key' +
      ' --custom-base-url https://generativelanguage.googleapis.com/v1beta/openai' +
      ' --custom-model-id gemini-2.5-flash' +
      ` --custom-api-key ${geminiApiKey}` +
      ' --custom-compatibility openai';
    yield ['log', 'LLM provider: Gemini'];
  } else {
    // Fallback: use local Ollama
    onboardCmd +=
      ' --auth-choice custom-api-key' +
      ` --custom-base-url ${ollamaBaseUrl}` +
      ` --custom-model-id ${ollamaModel}` +
      ' --custom-api-key ollama-local' +
      ' --custom-compatibility openai';
    yield ['log', `LLM provider: Ollama (${ollamaModel})`];
  }

  yield ['log', 'Running OpenClaw onboarding...'];
  const [onboardOk, onboardOut] = await run(onboardCmd, 120);
  if (!onboardOk) {
    yield await failCreate(`Onboarding failed: ${onboardOut}`);
    return;
  }
  yield ['log', 'Onboarding completed!'];

  if (sharedAuthSeed) {
    const [setModelOk, setModelOut] = await run(
      `openclaw config set agents.defaults.model.primary ${sharedCodexModel}`,
      30,
    );
    if (!setModelOk) {
      yield await failCreate(`Failed to set shared Codex model: ${setModelOut}`);
      return;
    }
    if (sharedAuthSeed.kind === 'codex-auth') {
      try {
        await syncCodexAuthProfile(containerName, '/root');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        yield await failCreate(msg);
        return;
      }
    }
    yield ['log', `Default model set to ${sharedCodexModel}`];

    // Only probe Codex targets when using codex-auth; OpenClaw OAuth doesn't need this check
    if (sharedAuthSeed.kind === 'codex-auth') {
    const [probeOk, probeOut] = await run(
      'openclaw models status --probe --probe-provider openai-codex --json',
      30,
    );
    if (!probeOk) {
      yield await failCreate(`Shared Codex auth probe failed: ${probeOut}`);
      return;
    }
    try {
      assertSharedCodexProbeSucceeded(probeOut);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield await failCreate(msg);
      return;
    }
    yield ['log', 'Shared Codex auth probe succeeded'];
    } // end codex-auth probe
  } else {
    // Write auth-profiles.json for the custom provider
    // OpenClaw's gateway requires this for API-key based custom providers.
    // The onboard command writes the provider into openclaw.json but not auth-profiles.json.
    const [authProfilesOk, authProfilesOut] = await run(`node -e "
      const fs=require('fs'),os=require('os');
      const cfgPath=os.homedir()+'/.openclaw/openclaw.json';
      const c=JSON.parse(fs.readFileSync(cfgPath,'utf8'));
      const providers=c?.models?.providers??{};
      const profiles={};
      Object.entries(providers).forEach(([id,p])=>{
        if(p.apiKey){
          profiles[id+'-key']={type:'api_key',provider:id,key:p.apiKey};
        }
      });
      const authDir=os.homedir()+'/.openclaw/agents/main/agent';
      fs.mkdirSync(authDir,{recursive:true});
      fs.writeFileSync(authDir+'/auth-profiles.json',JSON.stringify({profiles},null,2));
    " 2>&1`);
    if (!authProfilesOk) {
      yield await failCreate(
        `Required bootstrap step failed (auth-profiles.json): ${truncateBootstrapDiagnostic(authProfilesOut)}`,
      );
      return;
    }
    yield ['log', 'Auth profiles written'];
  }

  // Patch openclaw.json: set compat.supportsStore=false for Gemini models
  // Gemini's OpenAI-compat endpoint rejects the `store` field openclaw sends by default
  if (!sharedAuthSeed && geminiApiKey) {
    const [geminiPatchOk, geminiPatchOut] = await run(`node -e "
      const fs=require('fs'),path=require('os').homedir()+'/.openclaw/openclaw.json';
      const c=JSON.parse(fs.readFileSync(path,'utf8'));
      const providers=c?.models?.providers??{};
      Object.values(providers).forEach(p=>{
        (p.models??[]).forEach(m=>{ (m.compat=m.compat??{}).supportsStore=false; });
      });
      fs.writeFileSync(path,JSON.stringify(c,null,2));
    " 2>&1`);
    if (!geminiPatchOk) {
      yield await failCreate(
        `Required bootstrap step failed (gemini.compat.supportsStore): ${truncateBootstrapDiagnostic(geminiPatchOut)}`,
      );
      return;
    }
    yield ['log', 'Gemini compat patch applied'];
  }

  const gatewayAllowedOrigins = [
    'http://localhost',
    'https://localhost',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:80',
    'http://localhost:8000',
    // Include configured origins (e.g. https://builder.codezero2pi.com) so the
    // bridge can reach the sandbox gateway in production deployments.
    ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) ?? []),
  ];
  const gatewayTrustedProxies = ['127.0.0.1', '172.0.0.0/8', '10.0.0.0/8'];
  const requiredBootstrapSteps: BootstrapCommandStep[] = [
    {
      id: 'gateway.bind',
      label: 'gateway bind',
      command: 'openclaw config set gateway.bind lan',
    },
    {
      id: 'gateway.controlUi.allowedOrigins',
      label: 'gateway control UI allowed origins',
      command: `openclaw config set gateway.controlUi.allowedOrigins '${JSON.stringify(gatewayAllowedOrigins)}'`,
    },
    {
      id: 'gateway.trustedProxies',
      label: 'gateway trusted proxies',
      command: `openclaw config set gateway.trustedProxies '${JSON.stringify(gatewayTrustedProxies)}'`,
    },
    {
      id: 'gateway.controlUi.allowInsecureAuth',
      label: 'gateway insecure auth override',
      command: 'openclaw config set gateway.controlUi.allowInsecureAuth true',
    },
    {
      id: 'gateway.controlUi.dangerouslyDisableDeviceAuth',
      label: 'gateway device auth override',
      command: 'openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true',
    },
    {
      id: 'gateway.http.endpoints.chatCompletions.enabled',
      label: 'chat completions endpoint',
      command: 'openclaw config set gateway.http.endpoints.chatCompletions.enabled true',
    },
    {
      id: 'browser.noSandbox',
      label: 'browser no-sandbox mode',
      command: 'openclaw config set browser.noSandbox true',
    },
    {
      id: 'browser.headless',
      label: 'browser headed mode',
      command: 'openclaw config set browser.headless false',
    },
    {
      id: 'tools.profile',
      label: 'full tools profile',
      command: 'openclaw config set tools.profile full',
    },
    {
      id: 'commands.native',
      label: 'native command execution',
      command: 'openclaw config set commands.native true',
    },
    {
      id: 'commands.nativeSkills',
      label: 'native command skills',
      command: 'openclaw config set commands.nativeSkills true',
    },
  ];

  // Inject OTEL diagnostics config so the gateway exports traces
  const backendConfig = getConfig();
  if (backendConfig.otelEnabled && backendConfig.otelExporterOtlpEndpoint) {
    const containerOtelEndpoint = backendConfig.otelExporterOtlpEndpoint
      .replace('localhost', 'host.docker.internal')
      .replace('127.0.0.1', 'host.docker.internal');

    const otelSteps: BootstrapCommandStep[] = [
      {
        id: 'diagnostics.otel.enabled',
        label: 'OTEL diagnostics enabled',
        command: 'openclaw config set diagnostics.otel.enabled true',
      },
      {
        id: 'diagnostics.otel.endpoint',
        label: 'OTEL diagnostics endpoint',
        command: `openclaw config set diagnostics.otel.endpoint '${containerOtelEndpoint}/v1/traces'`,
      },
      {
        id: 'diagnostics.otel.protocol',
        label: 'OTEL diagnostics protocol',
        command: "openclaw config set diagnostics.otel.protocol 'http/protobuf'",
      },
      {
        id: 'diagnostics.otel.serviceName',
        label: 'OTEL diagnostics service name',
        command: `openclaw config set diagnostics.otel.serviceName 'openclaw-gateway-${sandboxId}'`,
      },
      {
        id: 'diagnostics.otel.traces',
        label: 'OTEL diagnostics traces',
        command: 'openclaw config set diagnostics.otel.traces true',
      },
      {
        id: 'diagnostics.otel.sampleRate',
        label: 'OTEL diagnostics sample rate',
        command: `openclaw config set diagnostics.otel.sampleRate ${backendConfig.otelSampleRate}`,
      },
    ];

    if (backendConfig.otelExporterOtlpHeaders) {
      otelSteps.push({
        id: 'diagnostics.otel.headers',
        label: 'OTEL diagnostics headers',
        command: `openclaw config set diagnostics.otel.headers '${JSON.stringify(
          Object.fromEntries(
            backendConfig.otelExporterOtlpHeaders.split(',').map((pair) => {
              const eqIdx = pair.indexOf('=');
              return [pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim()];
            }),
          ),
        )}'`,
      });
    }

    requiredBootstrapSteps.push(...otelSteps);
    yield ['log', 'OTEL diagnostics config will be applied to gateway'];
  }

  // Batch all config into a single docker exec to avoid 11+ sequential CLI calls.
  // Each `openclaw config set` takes ~2-3s due to Node.js startup + JSON read/write.
  // Batching saves ~25-30s of provisioning time.
  yield ['log', 'Applying required bootstrap config...'];
  const batchedConfigScript = requiredBootstrapSteps
    .map((step) => step.command)
    .join(' && ');
  const [batchOk, batchOut] = await run(batchedConfigScript, 60);
  if (!batchOk) {
    // Fallback: run steps individually to identify which one failed
    yield ['log', 'Batched config failed — retrying steps individually...'];
    for (const step of requiredBootstrapSteps) {
      yield ['log', `Applying required bootstrap step: ${step.label}...`];
      const stepApplied = await runRequiredBootstrapStep(step);
      if (!stepApplied.ok) {
        yield await failCreate(stepApplied.error);
        return;
      }
    }
  } else {
    yield ['log', `Applied ${requiredBootstrapSteps.length} config steps`];
  }

  // Read gateway token — prefer the device operator token (has operator.write scope)
  // over the config auth token (may lack write scope in OpenClaw 2026.3.28+)
  let gatewayToken: string | null = null;
  const [deviceTokenOk, deviceTokenOut] = await run(
    `node -e "const fs=require('fs');const path=require('path');const os=require('os');` +
    `try{const p=path.join(os.homedir(),'.openclaw','devices','paired.json');` +
    `const d=JSON.parse(fs.readFileSync(p,'utf8'));` +
    `const dev=Object.values(d)[0];` +
    `const t=dev?.tokens?.operator?.token;` +
    `if(t){process.stdout.write(t)}else{throw new Error('no device token')}}` +
    `catch{const c=path.join(os.homedir(),'.openclaw','openclaw.json');` +
    `process.stdout.write(JSON.parse(fs.readFileSync(c,'utf8')).gateway.auth.token)}"`,
  );
  if (deviceTokenOk && deviceTokenOut.trim()) {
    gatewayToken = deviceTokenOut.trim();
    yield ['log', 'Gateway token retrieved'];
  } else {
    yield await failCreate(
      `Required bootstrap step failed (gateway.auth.token): ${truncateBootstrapDiagnostic(deviceTokenOut)}`,
    );
    return;
  }

  // Write env file inside container
  const envEntries = Object.entries(keyMap).filter(([, v]) => v);
  if (envEntries.length > 0) {
    yield ['log', 'Writing env vars to ~/.openclaw/.env...'];
    const envLines = envEntries.map(([k, v]) => `${k}=${v}`);
    const envPayload = Buffer.from(`${envLines.join('\n')}\n`, 'utf8').toString('base64');
    const [envOk, envOut] = await run(
      `node -e "const fs=require('fs');const os=require('os');const path=require('path');const target=path.join(os.homedir(),'.openclaw','.env');const content=Buffer.from(process.argv[1],'base64').toString('utf8');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);" ${JSON.stringify(envPayload)}`,
    );
    if (!envOk) {
      yield await failCreate(
        `Required bootstrap step failed (.openclaw/.env): ${truncateBootstrapDiagnostic(envOut)}`,
      );
      return;
    }
  }

  // Start gateway (with DISPLAY=:99 so browser tools render on the virtual display)
  yield ['log', 'Starting OpenClaw gateway...'];
  await run('openclaw gateway stop 2>/dev/null || true');
  const [gatewayStartOk, gatewayStartOut] = await run(
    `DISPLAY=:99 OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 nohup openclaw gateway run --bind lan --port ${GATEWAY_PORT} > /tmp/openclaw-gateway.log 2>&1 &`,
  );
  if (!gatewayStartOk) {
    yield await failCreate(
      `Required bootstrap step failed (gateway.start): ${truncateBootstrapDiagnostic(gatewayStartOut)}`,
    );
    return;
  }

  yield ['log', 'Waiting for gateway to become healthy...'];
  let healthy = false;
  // Poll every 1s instead of 3s — gateway typically starts in 2-5s
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(1000);
    const [portCheck] = await run(
      `node -e "const n=require('net');const c=n.connect(${GATEWAY_PORT},'127.0.0.1',()=>{c.end();process.exit(0)});c.on('error',()=>process.exit(1))"`,
    );
    if (portCheck) { healthy = true; break; }
  }

  if (!healthy) {
    const [, logOut] = await run('tail -20 /tmp/openclaw-gateway.log');
    const diagnostics = logOut
      ? ` Gateway logs: ${truncateBootstrapDiagnostic(logOut, 400)}`
      : '';
    yield await failCreate(`Gateway did not start within 60s.${diagnostics}`);
    return;
  }
  yield ['log', 'Gateway is listening!'];

  yield ['log', 'Verifying required bootstrap config...'];
  const verification = await verifyBootstrapConfig(containerName, [
    { path: 'gateway.bind', expected: 'lan' },
    { path: 'gateway.controlUi.allowedOrigins', expected: gatewayAllowedOrigins },
    { path: 'gateway.trustedProxies', expected: gatewayTrustedProxies },
    { path: 'gateway.controlUi.allowInsecureAuth', expected: true },
    { path: 'gateway.http.endpoints.chatCompletions.enabled', expected: true },
    { path: 'browser.noSandbox', expected: true },
    { path: 'browser.headless', expected: false },
    { path: 'tools.profile', expected: 'full' },
    { path: 'commands.native', expected: true },
    { path: 'commands.nativeSkills', expected: true },
  ]);
  if (!verification.ok) {
    yield await failCreate(`Required bootstrap verification failed: ${verification.detail}`);
    return;
  }
  yield ['log', 'Required bootstrap config verified'];

  // Install the task-planner skill so the architect agent can use plan mode
  yield ['log', 'Installing task-planner skill...'];
  const taskPlannerSkillMd = [
    '---',
    'name: task-planner',
    'version: 1.0.0',
    'description: "Plan mode — break tasks into subtasks with a structured plan. Use when asked to plan, break down, or organize a multi-step task."',
    'user-invocable: true',
    '---',
    '',
    '# Task Planner',
    '',
    'When asked to plan a task, output a `<plan>` XML block:',
    '',
    '<plan>',
    '- [ ] First task',
    '- [ ] Second task',
    '</plan>',
    '',
    'As you complete each task, emit: `<task_update index="0" status="done"/>`',
    'Mark active tasks: `<task_update index="1" status="active"/>`',
  ].join('\n');
  const taskPlannerPayload = Buffer.from(taskPlannerSkillMd, 'utf8').toString('base64');
  await run(
    `mkdir -p ~/.openclaw/workspace/skills/task-planner && node -e "const fs=require('fs');fs.writeFileSync(require('path').join(require('os').homedir(),'.openclaw','workspace','skills','task-planner','SKILL.md'),Buffer.from(process.argv[1],'base64').toString('utf8'))" ${JSON.stringify(taskPlannerPayload)}`,
  );

  // ── Pre-pair a device so the frontend can connect immediately ──
  // The gateway requires device pairing for WS connect. We trigger a local
  // connection from inside the container, approve it, then re-read the
  // device operator token (which the gateway validates on WS connect).
  yield ['log', 'Pre-pairing gateway device...'];

  // Trigger a local connection + immediately approve in a tight loop.
  // The `openclaw chat` command connects via WS, creating a pending request.
  await run(
    `( timeout 8 openclaw chat --message "exit" --no-conversation 2>/dev/null || true ) &`,
    3,
  );

  // Approve the pending device in a tight loop (polls every 500ms)
  let prePaired = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    await Bun.sleep(500);
    const [, approveOut] = await run('openclaw devices approve --latest 2>&1', 10);
    if (approveOut.includes('Approved')) {
      yield ['log', `Device pre-paired: ${approveOut.split('\n').find(l => l.includes('Approved'))?.trim() ?? 'OK'}`];
      prePaired = true;
      break;
    }
  }

  if (!prePaired) {
    yield ['log', 'Device pre-pairing skipped (may already be paired or using insecure auth)'];
  }

  // Re-read the device operator token now that a device may be paired.
  // The device operator token is what the gateway's WS connect method
  // validates — the config auth token alone is not sufficient in v2026.3.24.
  const [deviceTokenRefreshOk, deviceTokenRefreshOut] = await run(
    `node -e "const fs=require('fs');const path=require('path');const os=require('os');` +
    `try{const p=path.join(os.homedir(),'.openclaw','devices','paired.json');` +
    `const d=JSON.parse(fs.readFileSync(p,'utf8'));` +
    `const dev=Object.values(d)[0];` +
    `const t=dev?.tokens?.operator?.token;` +
    `if(t){process.stdout.write(t)}else{process.exit(1)}}catch{process.exit(1)}"`,
  );
  if (deviceTokenRefreshOk && deviceTokenRefreshOut.trim()) {
    gatewayToken = deviceTokenRefreshOut.trim();
    yield ['log', 'Gateway device token refreshed'];
  }

  createSpan.setStatus({ code: SpanStatusCode.OK });
  createSpan.end();

  const resultData: Record<string, unknown> = {
    sandbox_id: sandboxId,
    sandbox_name: sandboxName,
    sandbox_state: 'running',
    dashboard_url: gatewayUrl,
    signed_url: null,
    standard_url: gatewayUrl,
    preview_token: null,
    gateway_token: gatewayToken,
    gateway_port: parseInt(hostPort),
    vnc_port: vncHostPort,
    dashboard_port: dashboardHostPort,
    ssh_command: `docker exec -it ${containerName} bash`,
    shared_codex_enabled: Boolean(sharedAuthSeed),
    shared_codex_model: sharedAuthSeed ? sharedCodexModel : null,
  };
  yield ['result', resultData];

  // Post-result approval loop — handles any additional devices that connect
  // after the initial pre-pair (e.g., the actual frontend connection).
  const APPROVAL_TIMEOUT = 60_000;
  const approvedLines = new Set<string>();
  const deadline = Date.now() + APPROVAL_TIMEOUT;

  while (Date.now() < deadline) {
    const [, output] = await run('openclaw devices approve --latest 2>&1', 10);
    if (output.includes('Approved')) {
      for (const line of output.split('\n')) {
        if (line.includes('Approved') && !approvedLines.has(line)) {
          approvedLines.add(line);
          yield ['approved', { message: line }];
          yield ['log', `Device approved: ${line}`];
        }
      }
      break;
    }
    await Bun.sleep(2000);
  }
}
