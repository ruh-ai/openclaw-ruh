/**
 * Channel manager: reads and writes Telegram/Slack channel config on a running
 * Daytona sandbox via the OpenClaw CLI.
 */

import { Daytona } from '@daytonaio/sdk';
import type { DaytonaConfig } from '@daytonaio/sdk';
import type { Sandbox } from '@daytonaio/sdk';

const DAYTONA_API_URL = 'https://app.daytona.io/api';
const GATEWAY_PORT = 18789;
const CONFIG_PATH = '/root/.openclaw/openclaw.json';

// ── Sandbox helpers ────────────────────────────────────────────────────────────

async function getSandbox(apiKey: string, sandboxId: string): Promise<Sandbox> {
  const config: DaytonaConfig = { apiKey, apiUrl: DAYTONA_API_URL };
  return new Daytona(config).get(sandboxId);
}

async function execCmd(
  sandbox: Sandbox,
  cmd: string,
  timeout = 30,
): Promise<[boolean, string]> {
  const res = await sandbox.process.executeCommand(cmd, undefined, undefined, timeout);
  return [res.exitCode === 0, (res.result ?? '').trim()];
}

async function readOpenclawConfig(sandbox: Sandbox): Promise<Record<string, unknown>> {
  const [ok, out] = await execCmd(
    sandbox,
    `node -e "process.stdout.write(require('fs').readFileSync('${CONFIG_PATH}','utf8'))"`,
  );
  if (!ok || !out) return {};
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function setCfg(
  sandbox: Sandbox,
  dottedKey: string,
  value: unknown,
): Promise<[boolean, string]> {
  if (typeof value === 'boolean') {
    return execCmd(sandbox, `openclaw config set ${dottedKey} ${value ? 'true' : 'false'}`);
  }
  const safe = String(value).replace(/'/g, "'\\''");
  return execCmd(sandbox, `openclaw config set ${dottedKey} '${safe}'`);
}

async function restartGateway(sandbox: Sandbox): Promise<void> {
  await execCmd(sandbox, 'openclaw gateway stop 2>/dev/null || true', 15);
  await Bun.sleep(2000);
  await execCmd(
    sandbox,
    `nohup openclaw gateway run --bind lan --port ${GATEWAY_PORT} > /tmp/openclaw-gateway.log 2>&1 &`,
    10,
  );
}

function mask(v: string): string {
  if (!v) return '';
  if (v.length <= 8) return '***';
  return v.slice(0, 4) + '***' + v.slice(-4);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getChannelsConfig(
  apiKey: string,
  sandboxId: string,
): Promise<Record<string, unknown>> {
  const sb = await getSandbox(apiKey, sandboxId);
  const config = await readOpenclawConfig(sb);
  const channels = (config['channels'] ?? {}) as Record<string, Record<string, unknown>>;

  const tg = channels['telegram'] ?? {};
  const sl = channels['slack'] ?? {};

  return {
    telegram: {
      enabled: Boolean(tg['enabled'] ?? false),
      botToken: mask(String(tg['botToken'] ?? '')),
      dmPolicy: tg['dmPolicy'] ?? 'pairing',
    },
    slack: {
      enabled: Boolean(sl['enabled'] ?? false),
      mode: sl['mode'] ?? 'socket',
      appToken: mask(String(sl['appToken'] ?? '')),
      botToken: mask(String(sl['botToken'] ?? '')),
      signingSecret: mask(String(sl['signingSecret'] ?? '')),
      dmPolicy: sl['dmPolicy'] ?? 'pairing',
    },
  };
}

export async function setTelegramConfig(
  apiKey: string,
  sandboxId: string,
  cfg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sb = await getSandbox(apiKey, sandboxId);
  const logs: string[] = [];

  if ('enabled' in cfg) {
    const [ok] = await setCfg(sb, 'channels.telegram.enabled', cfg['enabled']);
    logs.push(`${ok ? '✓' : '✗'} enabled=${cfg['enabled']}`);
  }
  if (cfg['botToken']) {
    const [ok] = await setCfg(sb, 'channels.telegram.botToken', cfg['botToken']);
    logs.push(`${ok ? '✓' : '✗'} botToken=***`);
  }
  if (cfg['dmPolicy']) {
    const [ok] = await setCfg(sb, 'channels.telegram.dmPolicy', cfg['dmPolicy']);
    logs.push(`${ok ? '✓' : '✗'} dmPolicy=${cfg['dmPolicy']}`);
  }

  await restartGateway(sb);
  logs.push('✓ Gateway restarted');
  return { ok: true, logs };
}

export async function setSlackConfig(
  apiKey: string,
  sandboxId: string,
  cfg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sb = await getSandbox(apiKey, sandboxId);
  const logs: string[] = [];

  if ('enabled' in cfg) {
    const [ok] = await setCfg(sb, 'channels.slack.enabled', cfg['enabled']);
    logs.push(`${ok ? '✓' : '✗'} enabled=${cfg['enabled']}`);
  }
  if (cfg['mode']) {
    const [ok] = await setCfg(sb, 'channels.slack.mode', cfg['mode']);
    logs.push(`${ok ? '✓' : '✗'} mode=${cfg['mode']}`);
  }
  if (cfg['appToken']) {
    const [ok] = await setCfg(sb, 'channels.slack.appToken', cfg['appToken']);
    logs.push(`${ok ? '✓' : '✗'} appToken=***`);
  }
  if (cfg['botToken']) {
    const [ok] = await setCfg(sb, 'channels.slack.botToken', cfg['botToken']);
    logs.push(`${ok ? '✓' : '✗'} botToken=***`);
  }
  if (cfg['signingSecret']) {
    const [ok] = await setCfg(sb, 'channels.slack.signingSecret', cfg['signingSecret']);
    logs.push(`${ok ? '✓' : '✗'} signingSecret=***`);
  }
  if (cfg['dmPolicy']) {
    const [ok] = await setCfg(sb, 'channels.slack.dmPolicy', cfg['dmPolicy']);
    logs.push(`${ok ? '✓' : '✗'} dmPolicy=${cfg['dmPolicy']}`);
  }

  await restartGateway(sb);
  logs.push('✓ Gateway restarted');
  return { ok: true, logs };
}

export async function probeChannelStatus(
  apiKey: string,
  sandboxId: string,
  channel: string,
): Promise<Record<string, unknown>> {
  const sb = await getSandbox(apiKey, sandboxId);
  const [ok, output] = await execCmd(sb, 'openclaw channels status --probe 2>&1', 45);
  return { ok, channel, output };
}

// ── Pairing ────────────────────────────────────────────────────────────────────

export async function listPairingRequests(
  apiKey: string,
  sandboxId: string,
  channel: string,
): Promise<Record<string, unknown>> {
  const sb = await getSandbox(apiKey, sandboxId);
  const [ok, output] = await execCmd(sb, `openclaw pairing list ${channel} 2>&1`, 30);
  const codes = [...output.matchAll(/\b([A-Z0-9]{8})\b/g)].map((m) => m[1]);
  return { ok, channel, output, codes };
}

export async function approvePairing(
  apiKey: string,
  sandboxId: string,
  channel: string,
  code: string,
): Promise<Record<string, unknown>> {
  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleanCode) return { ok: false, output: 'Invalid pairing code' };

  const sb = await getSandbox(apiKey, sandboxId);
  const [ok, output] = await execCmd(
    sb,
    `openclaw pairing approve ${channel} ${cleanCode} 2>&1`,
    30,
  );
  return { ok, channel, code: cleanCode, output };
}
