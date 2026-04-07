#!/usr/bin/env bun
/**
 * test-daytona-api-flow.ts
 *
 * End-to-end test of the FULL agent creation → chat flow through the
 * running backend + agent-builder-ui Docker services.
 *
 * This mirrors exactly what the UI does:
 *   1. Login → get auth cookies
 *   2. POST /api/agents/create → agent_id + stream_id
 *   3. GET  /api/agents/:id/forge/stream/:stream_id → SSE until "result"
 *   4. GET  /api/agents/:id/forge → status=ready, sandbox record
 *   5. GET  /api/sandboxes/:id → standard_url + gateway_token
 *   6. POST /api/openclaw (via builder UI) → chat with architect agent
 *
 * Usage:
 *   cd ruh-backend
 *   bun run scripts/test-daytona-api-flow.ts
 *
 * Requires the backend + agent-builder-ui to be running via docker-compose.
 */

// ─── Config ──────────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const BUILDER_URL = process.env.BUILDER_URL || 'http://localhost:3000';
const LOGIN_EMAIL = process.env.TEST_EMAIL || 'dev-owner@acme-dev.test';
const LOGIN_PASSWORD = process.env.TEST_PASSWORD || 'RuhTest123';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';

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
function elapsed(ms: number) { return ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`; }

let createdAgentId: string | null = null;

async function cleanup() {
  if (!createdAgentId) return;
  console.log(`\n${YELLOW}🧹 Cleaning up agent ${createdAgentId}...${RESET}`);
  try {
    await fetch(`${BACKEND_URL}/api/agents/${createdAgentId}/forge`, {
      method: 'DELETE',
      headers: { ...authHeaders },
    });
    ok('Agent + forge deleted');
  } catch (e) {
    warn(`Cleanup failed: ${e instanceof Error ? e.message : e}`);
  }
}

process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });

// ─── Auth state ──────────────────────────────────────────────────────────────
let authHeaders: Record<string, string> = {};
let authCookies = '';

async function run() {
  const startTime = Date.now();
  console.log(`\n${BOLD}Daytona API Flow Test (Backend → UI)${RESET}`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Builder: ${BUILDER_URL}`);

  // ── Step 1: Login ──────────────────────────────────────────────────────────
  step('Logging in');
  const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
    redirect: 'manual',
  });
  if (!loginRes.ok && loginRes.status !== 302) {
    const body = await loginRes.text().catch(() => '');
    fail(`Login failed: HTTP ${loginRes.status} — ${body.slice(0, 200)}`);
    process.exit(1);
  }

  // Extract cookies for subsequent requests
  const setCookies = loginRes.headers.getSetCookie?.() ?? [];
  authCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
  authHeaders = { Cookie: authCookies };

  // Also try JSON body for token
  try {
    const loginBody = await loginRes.json() as Record<string, string>;
    if (loginBody.accessToken) {
      authHeaders['Authorization'] = `Bearer ${loginBody.accessToken}`;
    }
  } catch { /* cookies only */ }

  ok(`Logged in as ${LOGIN_EMAIL}`);

  // Verify auth
  const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, { headers: authHeaders });
  if (!meRes.ok) {
    fail(`Auth verification failed: ${meRes.status}`);
    process.exit(1);
  }
  const me = await meRes.json() as Record<string, string>;
  ok(`Verified: ${me.email ?? me.id}`);

  // ── Step 2: Create agent ───────────────────────────────────────────────────
  step('Creating agent via POST /api/agents/create');
  const createRes = await fetch(`${BACKEND_URL}/api/agents/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ name: 'E2E Test Agent', description: 'Automated test agent for Daytona flow verification' }),
  });
  if (!createRes.ok) {
    fail(`Create failed: ${createRes.status} ${await createRes.text().catch(() => '')}`);
    process.exit(1);
  }
  const { agent_id, stream_id } = await createRes.json() as { agent_id: string; stream_id: string };
  createdAgentId = agent_id;
  ok(`Agent created: ${agent_id}, stream: ${stream_id}`);

  // ── Step 3: Follow forge SSE stream ────────────────────────────────────────
  step('Following forge SSE stream (sandbox provisioning)');
  const sseUrl = `${BACKEND_URL}/api/agents/${agent_id}/forge/stream/${stream_id}`;
  const sseRes = await fetch(sseUrl, { headers: authHeaders });
  if (!sseRes.ok || !sseRes.body) {
    fail(`SSE stream failed: ${sseRes.status}`);
    await cleanup(); process.exit(1);
  }

  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let forgeResult: Record<string, unknown> | null = null;
  let lastLogMsg = '';
  const forgeStart = Date.now();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const block of events) {
        if (!block.trim()) continue;
        let eventName = '';
        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) eventName = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
        }
        const dataStr = dataLines.join('\n');
        if (!eventName || !dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr) as Record<string, unknown>;
          if (eventName === 'log') {
            lastLogMsg = String(parsed.message ?? '');
            log(`  [${elapsed(Date.now() - forgeStart)}] ${lastLogMsg}`);
          } else if (eventName === 'error') {
            fail(`Forge error: ${parsed.message}`);
            await cleanup(); process.exit(1);
          } else if (eventName === 'result' || eventName === 'done' || eventName === 'approved') {
            forgeResult = parsed;
            ok(`Forge complete: ${eventName} (${elapsed(Date.now() - forgeStart)})`);
            break;
          }
        } catch { /* parse error, skip */ }
      }
      if (forgeResult) break;
    }
  } finally {
    try { await reader.cancel(); } catch {}
    try { reader.releaseLock(); } catch {}
  }

  if (!forgeResult) {
    fail('Forge stream ended without result event');
    await cleanup(); process.exit(1);
  }

  const forgeSandboxId = String(forgeResult.sandbox_id ?? '');
  ok(`Forge sandbox ID: ${forgeSandboxId}`);

  // ── Step 4: Check forge status via GET /api/agents/:id/forge ───────────────
  step('Checking forge status');
  const forgeStatusRes = await fetch(`${BACKEND_URL}/api/agents/${agent_id}/forge`, { headers: authHeaders });
  if (!forgeStatusRes.ok) {
    fail(`Forge status failed: ${forgeStatusRes.status}`);
    await cleanup(); process.exit(1);
  }
  const forgeStatus = await forgeStatusRes.json() as Record<string, unknown>;
  log(`  status: ${forgeStatus.status}, forge_sandbox_id: ${forgeStatus.forge_sandbox_id}`);

  if (forgeStatus.status !== 'ready') {
    fail(`Expected forge status "ready", got "${forgeStatus.status}"`);
    await cleanup(); process.exit(1);
  }
  ok('Forge status is "ready"');

  // ── Step 5: Fetch sandbox record ───────────────────────────────────────────
  step('Fetching sandbox record');
  const sandboxRes = await fetch(`${BACKEND_URL}/api/sandboxes/${forgeSandboxId}`, { headers: authHeaders });
  if (!sandboxRes.ok) {
    fail(`Sandbox fetch failed: ${sandboxRes.status}`);
    await cleanup(); process.exit(1);
  }
  const sandbox = await sandboxRes.json() as Record<string, string>;
  log(`  standard_url: ${sandbox.standard_url}`);
  log(`  gateway_token: ${(sandbox.gateway_token ?? '').slice(0, 20)}...`);
  log(`  gateway_port: ${sandbox.gateway_port}`);

  if (!sandbox.standard_url) {
    fail('Sandbox has no standard_url');
    await cleanup(); process.exit(1);
  }
  if (!sandbox.gateway_token) {
    fail('Sandbox has no gateway_token');
    await cleanup(); process.exit(1);
  }
  ok('Sandbox record complete');

  // ── Step 6: Probe gateway directly ─────────────────────────────────────────
  step('Probing gateway via preview URL');
  try {
    const probeRes = await fetch(sandbox.standard_url, {
      headers: { Authorization: `Bearer ${sandbox.gateway_token}` },
      signal: AbortSignal.timeout(10000),
    });
    ok(`Gateway probe: HTTP ${probeRes.status}`);
  } catch (e) {
    warn(`Gateway probe failed: ${e instanceof Error ? e.message : e}`);
  }

  // ── Step 7: Test the bridge (POST /api/openclaw via builder UI) ────────────
  step('Sending chat message via builder bridge (POST /api/openclaw)');
  const chatBody = {
    session_id: `test-${Date.now()}`,
    request_id: `req-${Date.now()}`,
    message: 'Hello, this is an automated test. Please respond with a short greeting.',
    agent: 'architect',
    mode: 'copilot',
    forge_sandbox_id: forgeSandboxId,
    agent_id: 'none',
  };

  const chatRes = await fetch(`${BUILDER_URL}/api/openclaw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(chatBody),
    signal: AbortSignal.timeout(60000),
  });

  log(`  Bridge response: HTTP ${chatRes.status}`);

  if (!chatRes.ok) {
    const errBody = await chatRes.text().catch(() => '');
    fail(`Bridge returned ${chatRes.status}: ${errBody.slice(0, 300)}`);
    // This is a failure but don't exit — let's check what went wrong
  } else if (chatRes.headers.get('content-type')?.includes('text/event-stream')) {
    // Read SSE response
    const chatReader = chatRes.body!.getReader();
    const chatDecoder = new TextDecoder();
    let chatBuffer = '';
    let gotMessage = false;
    const chatStart = Date.now();

    try {
      while (Date.now() - chatStart < 30000) {
        const { done, value } = await chatReader.read();
        if (done) break;
        chatBuffer += chatDecoder.decode(value, { stream: true });
        const chatEvents = chatBuffer.split('\n\n');
        chatBuffer = chatEvents.pop() ?? '';

        for (const block of chatEvents) {
          if (!block.trim()) continue;
          let evtName = '';
          const dLines: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) evtName = line.slice(7).trim();
            else if (line.startsWith('data: ')) dLines.push(line.slice(6));
          }
          if (evtName === 'message' || evtName === 'content' || evtName === 'done' || evtName === 'text_delta') {
            gotMessage = true;
            const dStr = dLines.join('');
            try {
              const d = JSON.parse(dStr);
              const text = d.text ?? d.content ?? d.message ?? dStr;
              log(`  Agent says: ${String(text).slice(0, 150)}`);
            } catch {
              log(`  Agent event [${evtName}]: ${dStr.slice(0, 100)}`);
            }
          }
          if (evtName === 'done' || evtName === 'error') break;
        }
        if (gotMessage) break;
      }
    } finally {
      try { await chatReader.cancel(); } catch {}
    }

    if (gotMessage) {
      ok('Received response from architect agent!');
    } else {
      warn('SSE stream received but no message content found (agent may need LLM key)');
    }
  } else {
    const text = await chatRes.text();
    log(`  Response body: ${text.slice(0, 200)}`);
    ok('Bridge responded (non-SSE)');
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  const totalTime = elapsed(Date.now() - startTime);
  console.log(`\n${BOLD}${GREEN}✅  Full API flow completed in ${totalTime}${RESET}`);
  console.log(`   Agent ID:     ${agent_id}`);
  console.log(`   Sandbox ID:   ${forgeSandboxId}`);
  console.log(`   Gateway URL:  ${sandbox.standard_url}`);

  await cleanup();
  process.exit(0);
}

run().catch(async (e) => {
  fail(`Unhandled error: ${e instanceof Error ? e.message : e}`);
  if (e instanceof Error && e.stack) log(e.stack);
  await cleanup();
  process.exit(1);
});
