/**
 * agentSetup.ts — Post-clone setup runner for installed agents.
 *
 * @kb: 008-agent-builder-ui 003-sandbox-lifecycle
 *
 * Reads .openclaw/setup.json from the workspace and executes:
 * 1. Infrastructure provisioning (PostgreSQL if required)
 * 2. Dependency installation (npm install)
 * 3. Setup steps (migrations, seeding)
 * 4. Service startup (backend, dashboard)
 * 5. Health check verification
 *
 * All commands run inside the sandbox container via docker exec.
 */

import { dockerExec, getContainerName, shellQuote } from './docker';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetupStep {
  name: string;
  command: string;
  condition?: string;   // "file:<path>" — only run if file exists
  optional?: boolean;
}

interface ServiceDef {
  name: string;
  command: string;
  port: number;
  healthCheck?: string; // HTTP path, e.g. "/health"
  optional?: boolean;
}

interface SetupManifest {
  schemaVersion: number;
  install?: string;
  setup?: SetupStep[];
  services?: ServiceDef[];
  requires?: {
    postgres?: boolean;
    redis?: boolean;
  };
}

interface StepResult {
  name: string;
  ok: boolean;
  output?: string;
  skipped?: boolean;
}

interface ServiceResult {
  name: string;
  started: boolean;
  port: number;
  healthy: boolean;
  optional?: boolean;
  error?: string;
}

export interface SetupResult {
  manifest: SetupManifest | null;
  infrastructure: StepResult[];
  install: StepResult | null;
  setup: StepResult[];
  services: ServiceResult[];
  ok: boolean;
}

type LogFn = (message: string) => void;

// ─── Manifest reader ─────────────────────────────────────────────────────────

async function readSetupManifest(
  containerName: string,
): Promise<SetupManifest | null> {
  const [ok, output] = await dockerExec(
    containerName,
    'cat $HOME/.openclaw/workspace/.openclaw/setup.json 2>/dev/null',
    10_000,
  );
  if (!ok || !output.trim()) return null;
  try {
    return JSON.parse(output.trim()) as SetupManifest;
  } catch {
    return null;
  }
}

// ─── Infrastructure ──────────────────────────────────────────────────────────

async function installPostgres(
  containerName: string,
  log: LogFn,
): Promise<StepResult> {
  log('Installing PostgreSQL...');

  // Check if already installed
  const [, installedOutput] = await dockerExec(
    containerName,
    'which pg_isready >/dev/null 2>&1 && echo YES || echo NO',
    5_000,
  );
  const alreadyInstalled = installedOutput.includes('YES');
  if (alreadyInstalled) {
    const [, checkOutput] = await dockerExec(containerName, 'pg_isready 2>/dev/null && echo YES || echo NO', 5_000);
    if (checkOutput.includes('YES')) {
      log('PostgreSQL already running.');
    }
  }

  // Install PostgreSQL
  if (!alreadyInstalled) {
    const [installOk, installOut] = await dockerExec(
      containerName,
      [
        'apt-get update -qq',
        'DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql postgresql-client >/dev/null 2>&1',
      ].join(' && '),
      120_000,
    );
    if (!installOk) {
      return { name: 'postgres', ok: false, output: installOut };
    }
  }

  // Start PostgreSQL
  log('Starting PostgreSQL...');
  const [startOk, startOut] = await dockerExec(
    containerName,
    [
      'pg_isready >/dev/null 2>&1 || pg_ctlcluster 16 main start 2>/dev/null || pg_ctlcluster 15 main start 2>/dev/null || service postgresql start 2>/dev/null',
      'sleep 2',
      'su - postgres -c "createuser -s root 2>/dev/null || true"',
      'su - postgres -c "psql -c \\"ALTER USER root WITH PASSWORD \'root\';\\""',
      'createdb agent 2>/dev/null || true',
      'mkdir -p $HOME/.openclaw && touch $HOME/.openclaw/.env',
      'sed -i "s#DATABASE_URL=postgresql://root[^[:space:]]*##g; /^DATABASE_URL=/d" $HOME/.openclaw/.env',
      'printf "\\nDATABASE_URL=postgresql://root:root@localhost:5432/agent\\n" >> $HOME/.openclaw/.env',
    ].join(' && '),
    30_000,
  );

  if (!startOk) {
    return { name: 'postgres', ok: false, output: startOut };
  }

  // Verify it's running
  const [verifyOk] = await dockerExec(containerName, 'pg_isready', 5_000);
  log(verifyOk ? 'PostgreSQL ready.' : 'PostgreSQL may not be healthy.');
  return { name: 'postgres', ok: verifyOk, output: startOut };
}

async function installRedis(
  containerName: string,
  log: LogFn,
): Promise<StepResult> {
  log('Installing Redis...');
  const [ok, output] = await dockerExec(
    containerName,
    [
      'apt-get update -qq',
      'DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends redis-server >/dev/null 2>&1',
      'redis-server --daemonize yes',
      'sleep 1',
      'redis-cli ping',
    ].join(' && '),
    60_000,
  );
  return { name: 'redis', ok, output };
}

// ─── Setup steps ─────────────────────────────────────────────────────────────

async function checkCondition(
  containerName: string,
  condition: string,
): Promise<boolean> {
  if (condition.startsWith('file:')) {
    const path = condition.slice(5);
    const [, output] = await dockerExec(
      containerName,
      `test -e "$HOME/.openclaw/workspace/${path}" && echo YES || echo NO`,
      5_000,
    );
    return output.trim() === 'YES';
  }
  return true;
}

async function runInstallStep(
  containerName: string,
  command: string,
  log: LogFn,
): Promise<StepResult> {
  log(`Running: ${command}`);
  const sanitizeNpmConfig = [
    'if [ -f .npmrc ]; then sed -i "/^omit[[:space:]]*=[[:space:]]*$/d" .npmrc; fi',
    'npm config delete omit --location=project >/dev/null 2>&1 || true',
  ].join(' && ');
  const [ok, output] = await dockerExec(
    containerName,
    `cd $HOME/.openclaw/workspace && ${sanitizeNpmConfig} && ${command} 2>&1`,
    300_000, // 5 min for npm install
  );
  return { name: 'install', ok, output: output.slice(-500) };
}

async function runSetupStep(
  containerName: string,
  step: SetupStep,
  log: LogFn,
): Promise<StepResult> {
  // Check condition
  if (step.condition) {
    const conditionMet = await checkCondition(containerName, step.condition);
    if (!conditionMet) {
      log(`Skipping ${step.name}: condition not met (${step.condition})`);
      return { name: step.name, ok: true, skipped: true };
    }
  }

  log(`Running ${step.name}...`);
  const [ok, output] = await dockerExec(
    containerName,
    `cd $HOME/.openclaw/workspace && if [ -f $HOME/.openclaw/.env ]; then set -a; . $HOME/.openclaw/.env; set +a; fi && ${step.command} 2>&1`,
    120_000,
  );

  if (!ok && !step.optional) {
    log(`${step.name} failed: ${output.slice(-200)}`);
    return { name: step.name, ok: false, output: output.slice(-500) };
  }

  log(`${step.name} ${ok ? 'complete' : 'failed (optional, continuing)'}.`);
  return { name: step.name, ok, output: output.slice(-500) };
}

// ─── Service management ──────────────────────────────────────────────────────

async function waitForServiceHealth(
  containerName: string,
  service: ServiceDef,
  log: LogFn,
): Promise<boolean> {
  if (service.healthCheck) {
    log(`Waiting for ${service.name} health check...`);
    for (let i = 0; i < 30; i++) {
      const [, output] = await dockerExec(
        containerName,
        `if curl -sf http://localhost:${service.port}${service.healthCheck} >/dev/null 2>&1; then echo OK; else echo WAIT; fi`,
        3_000,
      );
      if (output.trim() === 'OK') {
        return true;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    return false;
  }

  // No explicit health check: prefer HTTP probes, then fall back to listening port.
  await new Promise((r) => setTimeout(r, 2_000));
  const [, output] = await dockerExec(
    containerName,
    [
      `if curl -sf http://localhost:${service.port}/health >/dev/null 2>&1; then echo OK`,
      `elif curl -sfI http://localhost:${service.port}/ >/dev/null 2>&1; then echo OK`,
      `elif command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ":${service.port}"; then echo OK`,
      `else echo WAIT`,
      `fi`,
    ].join('; '),
    3_000,
  );
  return output.trim() === 'OK';
}

async function startService(
  containerName: string,
  service: ServiceDef,
  log: LogFn,
): Promise<ServiceResult> {
  const command = (service.command ?? '').trim();

  if (!command) {
    log(`Checking ${service.name} on shared port ${service.port}...`);
    const healthy = await waitForServiceHealth(containerName, service, log);
    log(
      healthy
        ? `${service.name} available on port ${service.port}.`
        : `${service.name} shared port check ${service.optional ? 'failed (optional)' : 'failed'}.`,
    );
    return {
      name: service.name,
      started: healthy,
      port: service.port,
      healthy,
      optional: service.optional,
      error: healthy ? undefined : 'No command configured and shared port was not healthy',
    };
  }

  log(`Starting ${service.name} on port ${service.port}...`);

  // Kill any existing process on this port
  await dockerExec(
    containerName,
    `kill $(cat /tmp/agent-${service.name}.pid 2>/dev/null) 2>/dev/null; fuser -k ${service.port}/tcp 2>/dev/null; sleep 1`,
    10_000,
  ).catch(() => {});

  // Load env vars and start service with nohup
  const [startOk, startOut] = await dockerExec(
    containerName,
    [
      `cd $HOME/.openclaw/workspace`,
      `if [ -f $HOME/.openclaw/.env ]; then set -a; . $HOME/.openclaw/.env; set +a; fi`,
      `nohup sh -c ${shellQuote(`exec ${command}`)} > /tmp/agent-${service.name}.log 2>&1 < /dev/null & echo $! > /tmp/agent-${service.name}.pid`,
    ].join(' && '),
    15_000,
  );

  if (!startOk) {
    return {
      name: service.name,
      started: false,
      port: service.port,
      healthy: false,
      optional: service.optional,
      error: startOut,
    };
  }

  // Health check: poll until the service responds
  const healthy = await waitForServiceHealth(containerName, service, log);

  log(
    healthy
      ? `${service.name} ready on port ${service.port}.`
      : `${service.name} started but health check ${service.optional ? 'failed (optional)' : 'failed'}.`,
  );

  return {
    name: service.name,
    started: true,
    port: service.port,
    healthy,
    optional: service.optional,
    error: healthy ? undefined : 'Health check timed out',
  };
}

// ─── Main runner ─────────────────────────────────────────────────────────────

/**
 * Read .openclaw/setup.json and execute the full setup pipeline.
 * Called after a GitHub repo is cloned into the workspace.
 */
export async function runAgentSetup(
  sandboxId: string,
  log: LogFn,
): Promise<SetupResult> {
  const containerName = getContainerName(sandboxId);

  const result: SetupResult = {
    manifest: null,
    infrastructure: [],
    install: null,
    setup: [],
    services: [],
    ok: false,
  };

  // 1. Read manifest
  log('Reading setup manifest...');
  const manifest = await readSetupManifest(containerName);
  result.manifest = manifest;

  if (!manifest) {
    log('No .openclaw/setup.json found — skipping setup.');
    result.ok = true;
    return result;
  }

  log(`Setup manifest v${manifest.schemaVersion}: ${manifest.setup?.length ?? 0} steps, ${manifest.services?.length ?? 0} services`);

  // 2. Infrastructure
  if (manifest.requires?.postgres) {
    const pgResult = await installPostgres(containerName, log);
    result.infrastructure.push(pgResult);
    if (!pgResult.ok) {
      log('PostgreSQL setup failed — aborting.');
      return result;
    }
  }

  if (manifest.requires?.redis) {
    const redisResult = await installRedis(containerName, log);
    result.infrastructure.push(redisResult);
    if (!redisResult.ok) {
      log('Redis setup failed — continuing (non-critical).');
    }
  }

  // 3. Install dependencies
  if (manifest.install) {
    result.install = await runInstallStep(containerName, manifest.install, log);
    if (!result.install.ok) {
      log('Dependency install failed — continuing (services may still start with partial deps).');
    }
  }

  // 4. Run setup steps
  // Continue past failures instead of aborting — AI-generated setup steps
  // frequently have issues (broken migrations, missing types, etc.).
  // The deep validation + auto-fix loop catches and repairs these.
  // Aborting here prevents dashboard builds and service starts from ever running.
  if (manifest.setup) {
    for (const step of manifest.setup) {
      const stepResult = await runSetupStep(containerName, step, log);
      result.setup.push(stepResult);
      if (!stepResult.ok && !step.optional) {
        log(`Setup step "${step.name}" failed — continuing with remaining steps.`);
      }
    }
  }

  // 5. Start services
  if (manifest.services) {
    for (const service of manifest.services) {
      const serviceResult = await startService(containerName, service, log);
      result.services.push(serviceResult);
      if (!serviceResult.healthy && !service.optional) {
        log(`Required service "${service.name}" failed health check.`);
        // Don't abort — other services may still start
      }
    }
  }

  // 6. Summary
  const failedRequired = [
    ...result.infrastructure.filter((r) => !r.ok),
    ...(result.install && !result.install.ok ? [result.install] : []),
    ...result.setup.filter((r) => !r.ok && !r.skipped),
    ...result.services.filter((r) => !r.healthy && !r.optional).map((r) => ({ name: r.name, ok: false })),
  ];

  result.ok = failedRequired.length === 0;
  log(result.ok ? 'Setup complete — all services running.' : `Setup completed with ${failedRequired.length} issue(s).`);

  return result;
}
