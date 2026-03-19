/**
 * Sandbox manager: creates and manages Daytona sandboxes pre-configured for OpenClaw.
 * Yields progress events as [eventType, data] tuples for SSE streaming.
 */

import { Daytona } from '@daytonaio/sdk';
import type { DaytonaConfig, CreateSandboxParams } from '@daytonaio/sdk';

const DAYTONA_API_URL = 'https://app.daytona.io/api';
const GATEWAY_PORT = 18789;
const SANDBOX_CPU = 2;
const SANDBOX_MEMORY = 2;
const SANDBOX_DISK = 10;

export interface SandboxCreationOptions {
  daytonaApiKey: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
  telegramBotToken?: string;
  discordBotToken?: string;
  sandboxName?: string;
}

export type SandboxEvent =
  | ['log', string]
  | ['result', Record<string, unknown>]
  | ['approved', Record<string, unknown>]
  | ['error', string];

export async function* createOpenclawSandbox(
  opts: SandboxCreationOptions,
): AsyncGenerator<SandboxEvent> {
  const {
    daytonaApiKey,
    anthropicApiKey = '',
    openaiApiKey = '',
    openrouterApiKey = '',
    geminiApiKey = '',
    telegramBotToken = '',
    discordBotToken = '',
    sandboxName = 'openclaw-gateway',
  } = opts;

  const config: DaytonaConfig = { apiKey: daytonaApiKey, apiUrl: DAYTONA_API_URL };
  const daytona = new Daytona(config);

  // Collect env vars to forward into the sandbox
  const envVars: Record<string, string> = {};
  const keyMap: Record<string, string> = {
    ANTHROPIC_API_KEY: anthropicApiKey,
    OPENAI_API_KEY: openaiApiKey,
    OPENROUTER_API_KEY: openrouterApiKey,
    GEMINI_API_KEY: geminiApiKey,
    TELEGRAM_BOT_TOKEN: telegramBotToken,
    DISCORD_BOT_TOKEN: discordBotToken,
  };
  for (const [key, val] of Object.entries(keyMap)) {
    if (val) {
      envVars[key] = val;
      yield ['log', `Forwarding ${key} into sandbox`];
    }
  }

  yield ['log', `Creating sandbox '${sandboxName}' with ${SANDBOX_CPU} vCPU, ${SANDBOX_MEMORY}GB RAM, ${SANDBOX_DISK}GB disk ...`];

  const params: CreateSandboxParams = {
    image: 'node:22-bookworm',
    resources: { cpu: SANDBOX_CPU, memory: SANDBOX_MEMORY, disk: SANDBOX_DISK },
    envVars,
    labels: { app: 'openclaw', component: 'gateway' },
    autoStopInterval: 0,
  };

  const sandbox = await daytona.create(params);

  yield ['log', `Sandbox created: ${sandbox.id} (state: ${sandbox.instance.state})`];

  async function run(cmd: string, timeout = 300): Promise<[boolean, string]> {
    const result = await sandbox.process.executeCommand(cmd, undefined, undefined, timeout);
    return [result.exitCode === 0, (result.result ?? '').trim()];
  }

  // Install OpenClaw
  yield ['log', 'Installing OpenClaw (npm install -g openclaw@latest) ...'];
  let [ok, out] = await run('npm install -g openclaw@latest', 600);
  if (!ok) {
    yield ['log', 'npm install failed, retrying with --unsafe-perm ...'];
    [ok, out] = await run('npm install -g --unsafe-perm openclaw@latest', 600);
    if (!ok) {
      yield ['error', `OpenClaw installation failed: ${out}`];
      return;
    }
  }

  const [verOk, ver] = await run('openclaw --version');
  if (!verOk) {
    yield ['error', 'openclaw binary not found after install'];
    return;
  }
  yield ['log', `OpenClaw installed: ${ver}`];

  // Build onboard command
  let onboardCmd =
    'openclaw onboard --non-interactive --secret-input-mode plaintext --accept-risk --skip-health';

  if (openrouterApiKey) {
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
    onboardCmd += ' --auth-choice skip';
    yield ['log', 'LLM provider: skipped (no API key provided)'];
  }

  yield ['log', 'Running OpenClaw onboarding (non-interactive) ...'];
  const [onboardOk, onboardOut] = await run(onboardCmd, 120);
  if (!onboardOk) {
    yield ['error', `Onboarding failed: ${onboardOut}`];
    return;
  }
  yield ['log', 'Onboarding completed!'];

  // Generate preview URL (SDK returns a plain string URL)
  yield ['log', 'Generating preview URL ...'];
  let dashboardUrl: string | null = null;
  try {
    dashboardUrl = sandbox.getPreviewLink(GATEWAY_PORT);
    yield ['log', `Preview URL: ${dashboardUrl}`];
  } catch (e) {
    yield ['log', `Preview URL failed: ${e}`];
  }

  // Patch config for remote access
  yield ['log', 'Patching gateway config for remote access ...'];
  await run('openclaw config set gateway.bind lan');

  if (dashboardUrl) {
    const parts = dashboardUrl.split('/');
    const origin = `${parts[0]}//${parts[2]}`;
    await run(`openclaw config set gateway.controlUi.allowedOrigins '["${origin}"]'`);
  }

  await run(`openclaw config set gateway.trustedProxies '["127.0.0.1", "172.20.0.0/16"]'`);
  await run('openclaw config set gateway.controlUi.allowInsecureAuth true');
  await run('openclaw config set gateway.http.endpoints.chatCompletions.enabled true');

  // Read gateway token
  let gatewayToken: string | null = null;
  const tokenResult = await sandbox.process.executeCommand(
    `node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/root/.openclaw/openclaw.json','utf8')).gateway.auth.token)"`,
  );
  if (tokenResult.exitCode === 0 && (tokenResult.result ?? '').trim()) {
    gatewayToken = tokenResult.result.trim();
    yield ['log', 'Gateway token retrieved'];
  }

  // Write env file
  if (Object.keys(envVars).length > 0) {
    yield ['log', "Writing env vars to ~/.openclaw/.env ..."];
    const envLines = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
    const escaped = envLines.join('\\n');
    await run(
      `node -e "require('fs').writeFileSync(require('os').homedir()+'/.openclaw/.env', '${escaped}\\n')"`,
    );
  }

  // Start gateway
  yield ['log', 'Starting OpenClaw gateway ...'];
  await run('openclaw gateway stop 2>/dev/null || true');
  await run(
    `nohup openclaw gateway run --bind lan --port ${GATEWAY_PORT} > /tmp/openclaw-gateway.log 2>&1 &`,
  );

  yield ['log', 'Waiting for gateway to start ...'];
  let healthy = false;
  for (let i = 0; i < 20; i++) {
    await Bun.sleep(3000);
    const check = await sandbox.process.executeCommand(
      `node -e "const n=require('net');const c=n.connect(${GATEWAY_PORT},'127.0.0.1',()=>{c.end();process.exit(0)});c.on('error',()=>process.exit(1))"`,
    );
    if (check.exitCode === 0) {
      healthy = true;
      break;
    }
  }

  if (!healthy) {
    yield ['log', 'WARNING: Gateway did not start within 60s — check logs via SSH'];
    const [, logOut] = await run('tail -20 /tmp/openclaw-gateway.log');
    if (logOut) yield ['log', `Gateway logs:\n${logOut}`];
  } else {
    yield ['log', 'Gateway is listening!'];
  }

  const resultData: Record<string, unknown> = {
    sandbox_id: sandbox.id,
    sandbox_state: String(sandbox.instance.state),
    dashboard_url: dashboardUrl,
    signed_url: null,
    standard_url: dashboardUrl,
    preview_token: null,
    gateway_token: gatewayToken,
    gateway_port: GATEWAY_PORT,
    ssh_command: `daytona ssh ${sandbox.id}`,
  };
  yield ['result', resultData];

  // ── Auto-approve device pairing ────────────────────────────────────────────
  yield ['log', 'Waiting for device pairing request (open the dashboard and connect)...'];

  const APPROVAL_POLL_INTERVAL = 3000;
  const APPROVAL_TIMEOUT = 300_000;
  const approvedLines = new Set<string>();
  const deadline = Date.now() + APPROVAL_TIMEOUT;

  while (Date.now() < deadline) {
    const check = await sandbox.process.executeCommand('openclaw devices approve --latest 2>&1');
    const output = (check.result ?? '').trim();

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

    await Bun.sleep(APPROVAL_POLL_INTERVAL);
  }

  if (approvedLines.size === 0) {
    yield ['log', "Approval timeout reached — run 'openclaw devices approve --latest' manually inside the sandbox"];
  }
}
