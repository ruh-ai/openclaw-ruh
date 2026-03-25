/**
 * Channel manager: reads and writes Telegram/Slack channel config on a running
 * Docker sandbox container via the OpenClaw CLI.
 */

import { dockerExec, getContainerName } from './sandboxManager';

const GATEWAY_PORT = 18789;
const CONFIG_PATH = '/root/.openclaw/openclaw.json';

// ── Container helpers ──────────────────────────────────────────────────────────

async function execCmd(
  sandboxId: string,
  cmd: string,
  timeoutSec = 30,
): Promise<[boolean, string]> {
  return dockerExec(getContainerName(sandboxId), cmd, timeoutSec * 1000);
}

async function readOpenclawConfig(sandboxId: string): Promise<Record<string, unknown>> {
  const [ok, out] = await execCmd(
    sandboxId,
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
  sandboxId: string,
  dottedKey: string,
  value: unknown,
): Promise<[boolean, string]> {
  if (typeof value === 'boolean') {
    return execCmd(sandboxId, `openclaw config set ${dottedKey} ${value ? 'true' : 'false'}`);
  }
  const safe = String(value).replace(/'/g, "'\\''");
  return execCmd(sandboxId, `openclaw config set ${dottedKey} '${safe}'`);
}

async function restartGateway(sandboxId: string): Promise<void> {
  await execCmd(sandboxId, 'openclaw gateway stop 2>/dev/null || true', 15);
  await Bun.sleep(2000);
  await execCmd(
    sandboxId,
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
  sandboxId: string,
): Promise<Record<string, unknown>> {
  const config = await readOpenclawConfig(sandboxId);
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
  sandboxId: string,
  cfg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const logs: string[] = [];

  if ('enabled' in cfg) {
    const [ok] = await setCfg(sandboxId, 'channels.telegram.enabled', cfg['enabled']);
    logs.push(`${ok ? '✓' : '✗'} enabled=${cfg['enabled']}`);
  }
  if (cfg['botToken']) {
    const [ok] = await setCfg(sandboxId, 'channels.telegram.botToken', cfg['botToken']);
    logs.push(`${ok ? '✓' : '✗'} botToken=***`);
  }
  if (cfg['dmPolicy']) {
    const [ok] = await setCfg(sandboxId, 'channels.telegram.dmPolicy', cfg['dmPolicy']);
    logs.push(`${ok ? '✓' : '✗'} dmPolicy=${cfg['dmPolicy']}`);
  }

  await restartGateway(sandboxId);
  logs.push('✓ Gateway restarted');
  return { ok: true, logs };
}

export async function setSlackConfig(
  sandboxId: string,
  cfg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const logs: string[] = [];

  if ('enabled' in cfg) {
    const [ok] = await setCfg(sandboxId, 'channels.slack.enabled', cfg['enabled']);
    logs.push(`${ok ? '✓' : '✗'} enabled=${cfg['enabled']}`);
  }
  if (cfg['mode']) {
    const [ok] = await setCfg(sandboxId, 'channels.slack.mode', cfg['mode']);
    logs.push(`${ok ? '✓' : '✗'} mode=${cfg['mode']}`);
  }
  if (cfg['appToken']) {
    const [ok] = await setCfg(sandboxId, 'channels.slack.appToken', cfg['appToken']);
    logs.push(`${ok ? '✓' : '✗'} appToken=***`);
  }
  if (cfg['botToken']) {
    const [ok] = await setCfg(sandboxId, 'channels.slack.botToken', cfg['botToken']);
    logs.push(`${ok ? '✓' : '✗'} botToken=***`);
  }
  if (cfg['signingSecret']) {
    const [ok] = await setCfg(sandboxId, 'channels.slack.signingSecret', cfg['signingSecret']);
    logs.push(`${ok ? '✓' : '✗'} signingSecret=***`);
  }
  if (cfg['dmPolicy']) {
    const [ok] = await setCfg(sandboxId, 'channels.slack.dmPolicy', cfg['dmPolicy']);
    logs.push(`${ok ? '✓' : '✗'} dmPolicy=${cfg['dmPolicy']}`);
  }

  await restartGateway(sandboxId);
  logs.push('✓ Gateway restarted');
  return { ok: true, logs };
}

export async function probeChannelStatus(
  sandboxId: string,
  channel: string,
): Promise<Record<string, unknown>> {
  const [ok, output] = await execCmd(sandboxId, 'openclaw channels status --probe 2>&1', 45);
  return { ok, channel, output };
}

// ── Pairing ────────────────────────────────────────────────────────────────────

export async function listPairingRequests(
  sandboxId: string,
  channel: string,
): Promise<Record<string, unknown>> {
  const [ok, output] = await execCmd(sandboxId, `openclaw pairing list ${channel} 2>&1`, 30);
  const codes = [...output.matchAll(/\b([A-Z0-9]{8})\b/g)].map((m) => m[1]);
  return { ok, channel, output, codes };
}

export async function approvePairing(
  sandboxId: string,
  channel: string,
  code: string,
): Promise<Record<string, unknown>> {
  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleanCode) return { ok: false, output: 'Invalid pairing code' };

  const [ok, output] = await execCmd(
    sandboxId,
    `openclaw pairing approve ${channel} ${cleanCode} 2>&1`,
    30,
  );
  return { ok, channel, code: cleanCode, output };
}
