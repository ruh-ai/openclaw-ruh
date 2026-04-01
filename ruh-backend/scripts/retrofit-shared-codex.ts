#!/usr/bin/env bun

import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';

import { initPool } from '../src/db';
import * as store from '../src/store';
import { dockerExec, dockerSpawn } from '../src/docker';
import { getContainerName, retrofitContainerToSharedCodex } from '../src/sandboxManager';
import { parseJsonOutput } from '../src/utils';

dotenvConfig({ path: path.join(import.meta.dir, '..', '.env') });

const DEFAULT_SHARED_CODEX_MODEL = 'openai-codex/gpt-5.4';
const DEFAULT_BACKEND_BASE_URL = `http://127.0.0.1:${process.env.PORT ?? '8000'}`;
const DEFAULT_BUILDER_CONTAINER = 'openclaw-openclaw-gateway-1';
const DEFAULT_BUILDER_SERVICE = 'openclaw-gateway';
const DEFAULT_BUILDER_COMPOSE_FILE = '/Users/prasanjitdey/Research/Openclaw/docker-compose.yml';

function requireEnv(name: string, fallback?: string): string {
  const value = String(process.env[name] ?? fallback ?? '').trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

async function listRunningOpenclawContainers(): Promise<string[]> {
  const [code, output] = await dockerSpawn(['ps', '--format', '{{.Names}}']);
  if (code !== 0) {
    throw new Error(`Failed to list Docker containers: ${output}`);
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('openclaw-'));
}

async function retrofitSandboxViaAdminApi(
  backendBaseUrl: string,
  adminToken: string,
  sandboxId: string,
  model: string,
): Promise<void> {
  console.log(`[retrofit] sandbox ${sandboxId}: requesting admin retrofit`);

  const response = await fetch(
    `${backendBaseUrl}/api/admin/sandboxes/${sandboxId}/retrofit-shared-codex`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model }),
    },
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Retrofit API failed for sandbox ${sandboxId}: ${String((result as { detail?: string }).detail ?? response.statusText)}`,
    );
  }

  const verifyResponse = await fetch(`${backendBaseUrl}/api/sandboxes/${sandboxId}`);
  const verified = await verifyResponse.json().catch(() => ({}));
  if (!verifyResponse.ok) {
    throw new Error(`Verification fetch failed for sandbox ${sandboxId}: ${verifyResponse.statusText}`);
  }

  const verifiedRecord = verified as { shared_codex_enabled?: boolean; shared_codex_model?: string | null };
  if (!verifiedRecord.shared_codex_enabled || verifiedRecord.shared_codex_model !== model) {
    throw new Error(
      `Sandbox ${sandboxId} metadata did not persist shared Codex state (enabled=${String(verifiedRecord.shared_codex_enabled)}, model=${String(verifiedRecord.shared_codex_model)})`,
    );
  }

  console.log(`[retrofit] sandbox ${sandboxId}: ok -> ${model}`);
}

async function recreateBuilderGateway(composeFile: string, serviceName: string): Promise<void> {
  console.log(`[retrofit] builder gateway: recreating ${serviceName} from ${composeFile}`);
  const [code, output] = await dockerSpawn([
    'compose',
    '-f',
    composeFile,
    'up',
    '-d',
    '--force-recreate',
    serviceName,
  ]);

  if (code !== 0) {
    throw new Error(`Failed to recreate builder gateway: ${output}`);
  }
}

async function verifyBuilderGateway(containerName: string, model: string, homeDir: string): Promise<void> {
  const [statusOk, statusOutput] = await dockerExec(
    containerName,
    'openclaw models status --probe --probe-provider openai-codex --json',
    30_000,
  );
  if (!statusOk) {
    throw new Error(`Builder gateway model status failed: ${statusOutput}`);
  }

  let statusJson: {
    defaultModel?: string;
    resolvedDefault?: string;
    auth?: { probes?: { totalTargets?: number; results?: Array<{ status?: string }> } };
  } = {};
  try {
    statusJson = parseJsonOutput(statusOutput) as {
      defaultModel?: string;
      resolvedDefault?: string;
      auth?: { probes?: { totalTargets?: number; results?: Array<{ status?: string }> } };
    };
  } catch {
    throw new Error(`Builder gateway model status was not valid JSON: ${statusOutput}`);
  }

  if (statusJson.defaultModel && statusJson.defaultModel !== model) {
    throw new Error(`Builder gateway defaultModel mismatch: expected ${model}, got ${statusJson.defaultModel}`);
  }
  if (statusJson.resolvedDefault && statusJson.resolvedDefault !== model) {
    throw new Error(`Builder gateway resolvedDefault mismatch: expected ${model}, got ${statusJson.resolvedDefault}`);
  }
  const totalTargets = Number(statusJson.auth?.probes?.totalTargets ?? 0);
  const hasOkProbe = (statusJson.auth?.probes?.results ?? []).some((result) => result?.status === 'ok');
  if (totalTargets < 1 || !hasOkProbe) {
    throw new Error('Builder gateway shared Codex probe returned no usable targets');
  }

  const [architectOk, architectOutput] = await dockerExec(
    containerName,
    'openclaw models status --agent architect --probe --probe-provider openai-codex --json',
    30_000,
  );
  if (!architectOk) {
    throw new Error(`Builder architect model status failed: ${architectOutput}`);
  }

  let architectJson: {
    defaultModel?: string;
    resolvedDefault?: string;
    auth?: {
      missingProvidersInUse?: string[];
      probes?: { totalTargets?: number; results?: Array<{ status?: string }> };
    };
  } = {};
  try {
    architectJson = parseJsonOutput(architectOutput) as {
      defaultModel?: string;
      resolvedDefault?: string;
      auth?: {
        missingProvidersInUse?: string[];
        probes?: { totalTargets?: number; results?: Array<{ status?: string }> };
      };
    };
  } catch {
    throw new Error(`Builder architect model status was not valid JSON: ${architectOutput}`);
  }

  if (architectJson.defaultModel && architectJson.defaultModel !== model) {
    throw new Error(`Builder architect defaultModel mismatch: expected ${model}, got ${architectJson.defaultModel}`);
  }
  if (architectJson.resolvedDefault && architectJson.resolvedDefault !== model) {
    throw new Error(`Builder architect resolvedDefault mismatch: expected ${model}, got ${architectJson.resolvedDefault}`);
  }
  const missingProviders = architectJson.auth?.missingProvidersInUse ?? [];
  if (missingProviders.length > 0) {
    throw new Error(`Builder architect still references missing providers: ${missingProviders.join(', ')}`);
  }
  const architectTargets = Number(architectJson.auth?.probes?.totalTargets ?? 0);
  const architectHasOkProbe = (architectJson.auth?.probes?.results ?? []).some(
    (result) => result?.status === 'ok',
  );
  if (architectTargets < 1 || !architectHasOkProbe) {
    throw new Error('Builder architect shared Codex probe returned no usable targets');
  }

  const [authOk, authOutput] = await dockerExec(
    containerName,
    `test -f ${JSON.stringify(path.posix.join(homeDir, '.codex', 'auth.json'))} || test -f ${JSON.stringify(path.posix.join(homeDir, '.openclaw', 'credentials', 'oauth.json'))}`,
    10_000,
  );
  if (!authOk) {
    throw new Error(`Builder gateway auth seed not found in container home: ${authOutput}`);
  }
}

async function retrofitBuilderGateway(
  builderContainerName: string,
  builderComposeFile: string,
  builderServiceName: string,
  sharedCodexModel: string,
): Promise<void> {
  await recreateBuilderGateway(builderComposeFile, builderServiceName);
  const result = await retrofitContainerToSharedCodex(builderContainerName, {
    sharedCodexModel,
  });
  await verifyBuilderGateway(builderContainerName, result.model, result.homeDir);
  console.log(`[retrofit] builder gateway ${builderContainerName}: ok -> ${result.model}`);
}

async function main(): Promise<void> {
  const backendBaseUrl = normalizeBaseUrl(
    requireEnv('OPENCLAW_RETROFIT_BASE_URL', DEFAULT_BACKEND_BASE_URL),
  );
  const adminToken = requireEnv('OPENCLAW_ADMIN_TOKEN');
  const sharedCodexModel = requireEnv('OPENCLAW_SHARED_CODEX_MODEL', DEFAULT_SHARED_CODEX_MODEL);
  const builderContainerName = requireEnv(
    'OPENCLAW_BUILDER_CONTAINER_NAME',
    DEFAULT_BUILDER_CONTAINER,
  );
  const builderServiceName = requireEnv(
    'OPENCLAW_BUILDER_COMPOSE_SERVICE',
    DEFAULT_BUILDER_SERVICE,
  );
  const builderComposeFile = requireEnv(
    'OPENCLAW_BUILDER_COMPOSE_FILE',
    DEFAULT_BUILDER_COMPOSE_FILE,
  );

  initPool();
  await store.initDb();

  const sandboxes = await store.listSandboxes();
  console.log(`[retrofit] DB-tracked sandboxes: ${sandboxes.length}`);

  const runningContainers = await listRunningOpenclawContainers();
  const trackedContainerNames = new Set(sandboxes.map((sandbox) => getContainerName(sandbox.sandbox_id)));
  const skippedContainers = runningContainers.filter(
    (containerName) =>
      containerName !== builderContainerName && !trackedContainerNames.has(containerName),
  );

  if (skippedContainers.length > 0) {
    console.log('[retrofit] skipping unmanaged containers:');
    for (const containerName of skippedContainers) {
      console.log(`  - ${containerName}`);
    }
  }

  for (const sandbox of sandboxes) {
    await retrofitSandboxViaAdminApi(
      backendBaseUrl,
      adminToken,
      sandbox.sandbox_id,
      sharedCodexModel,
    );
  }

  await retrofitBuilderGateway(
    builderContainerName,
    builderComposeFile,
    builderServiceName,
    sharedCodexModel,
  );

  console.log('[retrofit] completed successfully');
}

main().catch((error) => {
  console.error(
    `[retrofit] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
