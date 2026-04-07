#!/usr/bin/env bun
/**
 * test-daytona-flow.ts
 *
 * End-to-end smoke test for the Daytona sandbox provisioning pipeline.
 * Mirrors the exact sequence used in daytonaProvider + sandboxManager so
 * failures are caught and fixed here without needing a running UI.
 *
 * Usage:
 *   cd ruh-backend
 *   bun run scripts/test-daytona-flow.ts
 *
 * Reads DAYTONA_API_KEY and DAYTONA_API_URL from .env (or environment).
 * Cleans up the sandbox on exit (pass/fail).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Load .env ───────────────────────────────────────────────────────────────
function loadEnv(envPath: string) {
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && val && !process.env[key]) process.env[key] = val;
    }
  } catch { /* no .env — rely on process.env */ }
}
loadEnv(resolve(import.meta.dir, '../.env'));

// ─── Config ──────────────────────────────────────────────────────────────────
const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY ?? '';
const DAYTONA_API_URL = process.env.DAYTONA_API_URL ?? 'https://app.daytona.io/api';
const GATEWAY_PORT = 18789;

if (!DAYTONA_API_KEY || DAYTONA_API_KEY === 'your_daytona_api_key_here') {
  console.error('❌  DAYTONA_API_KEY is not set in .env');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

function log(msg: string) { console.log(`  ${msg}`); }
function step(msg: string) { console.log(`\n${BOLD}${CYAN}▶ ${msg}${RESET}`); }
function ok(msg: string) { console.log(`  ${GREEN}✓ ${msg}${RESET}`); }
function warn(msg: string) { console.log(`  ${YELLOW}⚠ ${msg}${RESET}`); }
function fail(msg: string) { console.log(`  ${RED}✗ ${msg}${RESET}`); }
function elapsed(ms: number) { return ms >= 60000 ? `${(ms/60000).toFixed(1)}m` : `${(ms/1000).toFixed(1)}s`; }

async function apiRequest<T>(method: string, path: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${DAYTONA_API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DAYTONA_API_KEY}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) as T : {} as T;
  } finally {
    clearTimeout(timer);
  }
}

async function toolboxExec(
  toolboxProxyUrl: string,
  sandboxId: string,
  cmd: string,
  timeoutSec = 120,
): Promise<{ ok: boolean; out: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (timeoutSec + 10) * 1000);
  try {
    const res = await fetch(`${toolboxProxyUrl}/${sandboxId}/process/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DAYTONA_API_KEY}` },
      body: JSON.stringify({ command: cmd, timeout: timeoutSec }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, out: `HTTP ${res.status}: ${text.slice(0, 400)}` };
    }
    const result = await res.json() as { exitCode: number; result: string };
    return { ok: result.exitCode === 0, out: result.result ?? '' };
  } catch (e) {
    return { ok: false, out: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
let sandboxDaytonaId: string | null = null;
let toolboxProxyUrl = 'https://proxy.app.daytona.io/toolbox';

async function cleanup() {
  if (!sandboxDaytonaId) return;
  console.log(`\n${YELLOW}🧹 Cleaning up sandbox ${sandboxDaytonaId}...${RESET}`);
  try {
    await apiRequest('DELETE', `/sandbox/${sandboxDaytonaId}`, undefined, 30_000);
    ok('Sandbox deleted');
  } catch (e) {
    warn(`Cleanup failed: ${e instanceof Error ? e.message : e}`);
  }
}

process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });

interface DaytonaSandbox {
  id: string;
  state: string;
  snapshot?: string;
  toolboxProxyUrl?: string;
  errorReason?: string | null;
}

interface DaytonaPreviewUrl {
  url: string;
  token?: string;
}

async function run() {
  const startTime = Date.now();
  console.log(`\n${BOLD}Daytona End-to-End Flow Test${RESET}`);
  console.log(`API: ${DAYTONA_API_URL}`);
  console.log(`Key: ${DAYTONA_API_KEY.slice(0, 12)}...`);

  // ── Step 1: Create sandbox ─────────────────────────────────────────────────
  step('Creating Daytona sandbox');
  let sandbox: DaytonaSandbox;
  try {
    sandbox = await apiRequest<DaytonaSandbox>('POST', '/sandbox', {
      labels: { 'ruh-managed': 'test' },
      envVars: {},
      resources: { cpu: 2, memory: 8, disk: 10 },
      autoStopInterval: 0,
    }, 120_000);
    sandboxDaytonaId = sandbox.id;
    ok(`Sandbox created: ${sandbox.id} (image: ${sandbox.snapshot ?? 'default'})`);
  } catch (e) {
    fail(`Failed to create sandbox: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  // ── Step 2: Wait for sandbox to start ────────────────────────────────────
  step('Waiting for sandbox to start (up to 3 min)');
  const startDeadline = Date.now() + 180_000;
  while (Date.now() < startDeadline) {
    sandbox = await apiRequest<DaytonaSandbox>('GET', `/sandbox/${sandbox.id}`);
    log(`  state: ${sandbox.state}`);
    if (sandbox.state === 'started' || sandbox.state === 'running') break;
    if (['error', 'failed', 'stopped'].includes(sandbox.state)) {
      fail(`Sandbox entered ${sandbox.state}: ${sandbox.errorReason ?? 'unknown'}`);
      await cleanup(); process.exit(1);
    }
    await Bun.sleep(3000);
  }
  if (sandbox.state !== 'started' && sandbox.state !== 'running') {
    fail('Sandbox did not start within 3 min');
    await cleanup(); process.exit(1);
  }
  ok(`Sandbox running (state: ${sandbox.state})`);
  toolboxProxyUrl = sandbox.toolboxProxyUrl ?? toolboxProxyUrl;
  log(`Toolbox proxy: ${toolboxProxyUrl}`);

  // ── Step 3: Probe toolbox until exec is available ─────────────────────────
  step('Probing toolbox (waiting for exec to become available)');
  const probeDeadline = Date.now() + 180_000;
  let probeAttempts = 0;
  let probeOk = false;
  while (Date.now() < probeDeadline) {
    probeAttempts++;
    const r = await toolboxExec(toolboxProxyUrl, sandbox.id, 'echo __TOOLBOX_READY__', 5);
    if (r.ok && r.out.includes('__TOOLBOX_READY__')) {
      probeOk = true;
      ok(`Toolbox ready after ${probeAttempts} probe(s)`);
      break;
    }
    log(`  attempt ${probeAttempts}: ${r.out.slice(0, 120)}`);
    await Bun.sleep(5000);
  }
  if (!probeOk) {
    fail('Toolbox never became ready within 3 min');
    await cleanup(); process.exit(1);
  }

  // ── Step 4: Resolve gateway preview URL ───────────────────────────────────
  step('Resolving gateway preview URL');
  let gatewayUrl: string;
  try {
    const preview = await apiRequest<DaytonaPreviewUrl>(
      'GET', `/sandbox/${sandbox.id}/ports/${GATEWAY_PORT}/preview-url`, undefined, 15_000,
    );
    gatewayUrl = preview.url;
    ok(`Gateway URL: ${gatewayUrl}`);
  } catch (e) {
    gatewayUrl = `https://${GATEWAY_PORT}-${sandbox.id}.daytonaproxy01.net`;
    warn(`Preview URL API failed — using constructed URL: ${gatewayUrl}`);
  }

  // Helper that wraps toolboxExec with PATH prepend and timing
  const exec = async (label: string, cmd: string, timeoutSec = 120): Promise<string> => {
    const t0 = Date.now();
    const fullCmd = `export PATH="$HOME/.local/bin:$PATH" && ${cmd}`;
    log(`  running: ${label}...`);
    const r = await toolboxExec(toolboxProxyUrl, sandbox.id, fullCmd, timeoutSec);
    const dur = elapsed(Date.now() - t0);
    if (r.ok) {
      ok(`${label} (${dur})`);
    } else {
      fail(`${label} (${dur})\n  output: ${r.out.slice(0, 500)}`);
      throw new Error(`Step failed: ${label}`);
    }
    return r.out;
  };

  // ── Step 5: Detect user ───────────────────────────────────────────────────
  step('Detecting sandbox user');
  let whoami = 'unknown';
  try {
    whoami = (await exec('whoami', 'whoami 2>/dev/null || echo unknown', 10)).trim();
    const isRoot = whoami === 'root';
    log(`  user: ${whoami}, root: ${isRoot}`);
  } catch { /* non-fatal */ }

  const isRoot = whoami === 'root';

  // ── Step 6: Install openclaw ──────────────────────────────────────────────
  step('Installing openclaw');
  if (isRoot) {
    try {
      await exec('npm install -g openclaw@latest', 'npm install -g openclaw@latest --no-fund 2>&1', 600);
    } catch {
      await exec('npm install -g openclaw@latest (retry)', 'npm install -g openclaw@latest --no-fund 2>&1', 600);
    }
  } else {
    // Step 1: install pnpm (fast, small package)
    log('  Step 1: installing pnpm...');
    await toolboxExec(toolboxProxyUrl, sandbox.id,
      'export PATH="$HOME/.local/bin:$PATH" && npm install -g pnpm 2>&1', 60);
    // Step 2: install openclaw via pnpm (uses <512MB, ~20s)
    log('  Step 2: pnpm add openclaw...');
    const { ok: installOk, out: installOut } = await toolboxExec(
      toolboxProxyUrl, sandbox.id,
      `export PATH="$HOME/.local/bin:$PATH" && ` +
      'mkdir -p $HOME/openclaw-pkg $HOME/.local/bin && cd $HOME/openclaw-pkg && ' +
      '{ echo \'{"name":"openclaw-install","version":"1.0.0"}\' > package.json; } && ' +
      'pnpm add openclaw@latest 2>&1 && ' +
      'ln -sf $HOME/openclaw-pkg/node_modules/.bin/openclaw $HOME/.local/bin/openclaw 2>/dev/null && ' +
      'echo __INSTALL_OK__',
      300,
    );
    if (installOk || installOut.includes('__INSTALL_OK__')) {
      ok('openclaw installed (non-root)');
    } else {
      fail(`Install failed:\n${installOut.slice(-800)}`);
      await cleanup(); process.exit(1);
    }
  }

  // ── Step 7: Verify binary ─────────────────────────────────────────────────
  step('Verifying openclaw binary');
  const ver = await exec('openclaw --version', 'openclaw --version', 15);
  log(`  version: ${ver.trim()}`);

  // ── Step 8: Onboard (skip LLM auth for infra test) ───────────────────────
  step('Running openclaw onboard (--auth-choice skip)');
  await exec(
    'openclaw onboard',
    'openclaw onboard --non-interactive --secret-input-mode plaintext --accept-risk --skip-health --auth-choice skip',
    120,
  );

  // ── Step 9: Apply gateway config ─────────────────────────────────────────
  step('Applying gateway config');
  const configCmds = [
    'openclaw config set gateway.bind lan',
    'openclaw config set gateway.controlUi.allowInsecureAuth true',
    'openclaw config set gateway.http.endpoints.chatCompletions.enabled true',
    'openclaw config set browser.noSandbox true',
    'openclaw config set browser.headless false',
    'openclaw config set tools.profile full',
    'openclaw config set commands.native true',
    'openclaw config set commands.nativeSkills true',
  ].join(' && ');
  await exec('gateway config batch', configCmds, 120);

  // ── Step 10: Read gateway token ───────────────────────────────────────────
  step('Reading gateway token');
  const tokenOut = await exec(
    'read gateway token',
    `node -e "
      const fs=require('fs'),path=require('path'),os=require('os');
      try{
        const p=path.join(os.homedir(),'.openclaw','devices','paired.json');
        const d=JSON.parse(fs.readFileSync(p,'utf8'));
        const dev=Object.values(d)[0];
        const t=dev?.tokens?.operator?.token;
        if(t){process.stdout.write(t)}else{throw new Error('no device token')}
      }catch{
        const c=path.join(os.homedir(),'.openclaw','openclaw.json');
        process.stdout.write(JSON.parse(fs.readFileSync(c,'utf8')).gateway.auth.token)
      }
    "`.replace(/\n\s+/g, ' '),
    15,
  );
  ok(`Token (first 20): ${tokenOut.trim().slice(0, 20)}...`);

  // ── Step 11: Start gateway ────────────────────────────────────────────────
  step('Starting openclaw gateway');
  await exec(
    'gateway start (setsid)',
    `bash -c 'OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 setsid openclaw gateway run --bind lan --port ${GATEWAY_PORT} > /tmp/openclaw-gateway.log 2>&1 &' && sleep 3`,
    20,
  );

  // ── Step 12: Health check ─────────────────────────────────────────────────
  step(`Health-checking gateway on port ${GATEWAY_PORT} (up to 60s)`);
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(2000);
    const { ok: portOk } = await toolboxExec(
      toolboxProxyUrl, sandbox.id,
      `export PATH="$HOME/.local/bin:$PATH" && node -e "
        const n=require('net'),os=require('os');
        const ifaces=os.networkInterfaces();
        const hosts=['127.0.0.1'];
        Object.values(ifaces).forEach(a=>(a||[]).forEach(i=>{ if(!i.internal&&i.family==='IPv4') hosts.push(i.address); }));
        let tried=0;
        function tryNext(){ if(tried>=hosts.length){process.exit(1);} const h=hosts[tried++]; const c=n.connect(${GATEWAY_PORT},h,()=>{c.end();process.exit(0)}); c.on('error',tryNext); }
        tryNext();
      "`.replace(/\n\s+/g, ' '),
      10,
    );
    if (portOk) { healthy = true; break; }
    log(`  poll ${i + 1}/30 — not yet`);
  }

  if (!healthy) {
    // Read gateway logs for diagnosis
    const { out: gwLog } = await toolboxExec(
      toolboxProxyUrl, sandbox.id,
      'export PATH="$HOME/.local/bin:$PATH" && tail -30 /tmp/openclaw-gateway.log 2>/dev/null || echo "(no log)"',
      10,
    );
    fail(`Gateway did not start within 60s\n  Gateway log:\n${gwLog}`);
    await cleanup(); process.exit(1);
  }
  ok('Gateway is listening!');

  // ── Step 13: HTTP smoke test via preview URL ───────────────────────────────
  step('Smoke testing gateway via preview URL');
  try {
    // Send the gateway token — OpenClaw returns 400 for unauthenticated requests
    const smokeRes = await fetch(gatewayUrl, {
      headers: { Authorization: `Bearer ${tokenOut.trim()}` },
      signal: AbortSignal.timeout(15000),
    });
    ok(`GET / → HTTP ${smokeRes.status} (with auth token)`);
  } catch (e) {
    warn(`Preview URL smoke test failed (gateway still works internally): ${e instanceof Error ? e.message : e}`);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  const totalTime = elapsed(Date.now() - startTime);
  console.log(`\n${BOLD}${GREEN}✅  All steps passed in ${totalTime}${RESET}`);
  console.log(`   Sandbox ID (Daytona): ${sandbox.id}`);
  console.log(`   Gateway URL:          ${gatewayUrl}`);
  console.log(`   Token (first 20):     ${tokenOut.trim().slice(0, 20)}...`);

  await cleanup();
  process.exit(0);
}

run().catch(async (e) => {
  fail(`Unhandled error: ${e instanceof Error ? e.message : e}`);
  await cleanup();
  process.exit(1);
});
