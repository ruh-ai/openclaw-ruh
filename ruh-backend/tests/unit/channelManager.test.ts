/**
 * Unit tests for src/channelManager.ts — mocks dockerExec from sandboxManager.
 *
 * channelManager.ts has no LLM/SDK dependency; it calls dockerExec from
 * sandboxManager to run CLI commands inside a container. We mock that module
 * so no real Docker is needed.
 */

import { describe, expect, test, mock, beforeEach, spyOn } from 'bun:test';

// ── Mock sandboxManager ───────────────────────────────────────────────────────

type DockerResult = [boolean, string];

/** All dockerExec calls made during a test: [containerName, cmd] */
const dockerExecCalls: Array<[string, string]> = [];
/** Per-test queue — consumed FIFO before falling back to defaultDockerResult. */
const dockerExecQueue: DockerResult[] = [];
/** Fallback result used when the queue is empty. */
let defaultDockerResult: DockerResult = [true, ''];

mock.module('../../src/sandboxManager', () => ({
  dockerExec: async (containerName: string, cmd: string): Promise<DockerResult> => {
    dockerExecCalls.push([containerName, cmd]);
    return dockerExecQueue.shift() ?? ([...defaultDockerResult] as DockerResult);
  },
  getContainerName: (id: string) => `openclaw-${id}`,
}));

// Skip real sleep inside restartGateway
spyOn(Bun, 'sleep').mockImplementation(async () => {});

import * as channelManager from '../../src/channelManager';

// ─────────────────────────────────────────────────────────────────────────────

const SANDBOX_ID = 'ch-sb-001';
const EXPECTED_CONTAINER = `openclaw-${SANDBOX_ID}`;

beforeEach(() => {
  dockerExecCalls.length = 0;
  dockerExecQueue.length = 0;
  defaultDockerResult = [true, ''];
});

// ── getChannelsConfig ─────────────────────────────────────────────────────────

describe('channelManager.getChannelsConfig', () => {
  test('returns empty channel config when config file missing', async () => {
    defaultDockerResult = [false, ''];
    const result = await channelManager.getChannelsConfig(SANDBOX_ID);
    expect(result).toHaveProperty('telegram');
    expect(result).toHaveProperty('slack');
    expect((result['telegram'] as Record<string, unknown>)['enabled']).toBe(false);
    expect((result['slack'] as Record<string, unknown>)['enabled']).toBe(false);
  });

  test('returns empty config on invalid JSON', async () => {
    defaultDockerResult = [true, 'not-json'];
    const result = await channelManager.getChannelsConfig(SANDBOX_ID);
    expect((result['telegram'] as Record<string, unknown>)['enabled']).toBe(false);
  });

  test('returns masked tokens from config', async () => {
    const config = JSON.stringify({
      channels: {
        telegram: { enabled: true, botToken: '1234567890:longtoken', dmPolicy: 'pairing' },
        slack: {
          enabled: false,
          appToken: 'xapp-token12345',
          botToken: 'xoxb-bot99999',
          signingSecret: 'abc123secret',
        },
      },
    });
    defaultDockerResult = [true, config];

    const result = await channelManager.getChannelsConfig(SANDBOX_ID);
    const tg = result['telegram'] as Record<string, unknown>;
    const sl = result['slack'] as Record<string, unknown>;

    expect(tg['enabled']).toBe(true);
    expect(String(tg['botToken'])).toContain('***');
    expect(String(tg['botToken'])).not.toBe('1234567890:longtoken');

    expect(sl['enabled']).toBe(false);
    expect(String(sl['appToken'])).toContain('***');
    expect(String(sl['botToken'])).toContain('***');
    expect(String(sl['signingSecret'])).toContain('***');
  });

  test('runs command against correct container', async () => {
    await channelManager.getChannelsConfig(SANDBOX_ID);
    expect(dockerExecCalls[0][0]).toBe(EXPECTED_CONTAINER);
  });

  test('telegram dmPolicy defaults to pairing when missing', async () => {
    const config = JSON.stringify({ channels: { telegram: { enabled: true } } });
    defaultDockerResult = [true, config];
    const result = await channelManager.getChannelsConfig(SANDBOX_ID);
    expect((result['telegram'] as Record<string, unknown>)['dmPolicy']).toBe('pairing');
  });
});

// ── probeChannelStatus ────────────────────────────────────────────────────────

describe('channelManager.probeChannelStatus', () => {
  test('returns ok=true when command succeeds', async () => {
    defaultDockerResult = [true, 'status: connected'];
    const result = await channelManager.probeChannelStatus(SANDBOX_ID, 'telegram');
    expect(result['ok']).toBe(true);
    expect(result['channel']).toBe('telegram');
    expect(result['output']).toContain('connected');
  });

  test('returns ok=false when command fails', async () => {
    defaultDockerResult = [false, 'error: not connected'];
    const result = await channelManager.probeChannelStatus(SANDBOX_ID, 'slack');
    expect(result['ok']).toBe(false);
    expect(result['channel']).toBe('slack');
  });

  test('passes channel to output', async () => {
    defaultDockerResult = [true, 'some output'];
    const result = await channelManager.probeChannelStatus(SANDBOX_ID, 'telegram');
    expect(result['output']).toContain('some output');
  });
});

// ── listPairingRequests ───────────────────────────────────────────────────────

describe('channelManager.listPairingRequests', () => {
  test('extracts 8-character alphanumeric codes from output', async () => {
    defaultDockerResult = [
      true,
      'Pending requests:\n  Code: ABC12345\n  Code: XYZ98765',
    ];
    const result = await channelManager.listPairingRequests(SANDBOX_ID, 'telegram');
    expect(result['ok']).toBe(true);
    const codes = result['codes'] as string[];
    expect(codes).toContain('ABC12345');
    expect(codes).toContain('XYZ98765');
  });

  test('returns empty codes array when no matches', async () => {
    defaultDockerResult = [true, 'No pending requests'];
    const result = await channelManager.listPairingRequests(SANDBOX_ID, 'telegram');
    expect((result['codes'] as string[]).length).toBe(0);
  });

  test('does not match codes shorter than 8 chars', async () => {
    defaultDockerResult = [true, 'Code: ABCDE12 other: AB12'];
    const result = await channelManager.listPairingRequests(SANDBOX_ID, 'telegram');
    expect((result['codes'] as string[]).length).toBe(0);
  });

  test('passes channel through to result', async () => {
    defaultDockerResult = [true, ''];
    const result = await channelManager.listPairingRequests(SANDBOX_ID, 'slack');
    expect(result['channel']).toBe('slack');
  });
});

// ── approvePairing ────────────────────────────────────────────────────────────

describe('channelManager.approvePairing', () => {
  test('returns ok=false for empty code without calling docker', async () => {
    const result = await channelManager.approvePairing(SANDBOX_ID, 'telegram', '');
    expect(result['ok']).toBe(false);
    expect(result['output']).toContain('Invalid pairing code');
    expect(dockerExecCalls.length).toBe(0);
  });

  test('returns ok=false for code with only special chars', async () => {
    const result = await channelManager.approvePairing(SANDBOX_ID, 'telegram', '---!!!');
    expect(result['ok']).toBe(false);
  });

  test('sanitizes code to uppercase alphanumeric', async () => {
    defaultDockerResult = [true, 'Approved ABC12345'];
    await channelManager.approvePairing(SANDBOX_ID, 'telegram', 'abc-12345');
    const lastCmd = dockerExecCalls[dockerExecCalls.length - 1][1];
    expect(lastCmd).toContain('ABC12345');
  });

  test('returns ok=true when command succeeds', async () => {
    defaultDockerResult = [true, 'Approved'];
    const result = await channelManager.approvePairing(SANDBOX_ID, 'telegram', 'ABC12345');
    expect(result['ok']).toBe(true);
    expect(result['code']).toBe('ABC12345');
  });

  test('returns ok=false when docker command fails', async () => {
    defaultDockerResult = [false, 'error: invalid code'];
    const result = await channelManager.approvePairing(SANDBOX_ID, 'telegram', 'ABC12345');
    expect(result['ok']).toBe(false);
  });
});

// ── setTelegramConfig ─────────────────────────────────────────────────────────

describe('channelManager.setTelegramConfig', () => {
  test('calls setCfg for each provided field', async () => {
    const result = await channelManager.setTelegramConfig(SANDBOX_ID, {
      enabled: true,
      botToken: 'my-bot-token',
      dmPolicy: 'open',
    });
    expect(result['ok']).toBe(true);
    const allCmds = dockerExecCalls.map(([, cmd]) => cmd).join('\n');
    expect(allCmds).toContain('channels.telegram.enabled');
    expect(allCmds).toContain('channels.telegram.botToken');
    expect(allCmds).toContain('channels.telegram.dmPolicy');
  });

  test('restarts gateway after config update', async () => {
    await channelManager.setTelegramConfig(SANDBOX_ID, { enabled: false });
    const allCmds = dockerExecCalls.map(([, cmd]) => cmd).join('\n');
    expect(allCmds).toMatch(/gateway stop|gateway run/);
  });

  test('skips fields not present in cfg', async () => {
    await channelManager.setTelegramConfig(SANDBOX_ID, { botToken: 'tok' });
    const allCmds = dockerExecCalls.map(([, cmd]) => cmd).join('\n');
    expect(allCmds).not.toContain('channels.telegram.enabled');
    expect(allCmds).toContain('channels.telegram.botToken');
  });

  test('runs against correct container', async () => {
    await channelManager.setTelegramConfig(SANDBOX_ID, { enabled: true });
    expect(dockerExecCalls.every(([c]) => c === EXPECTED_CONTAINER)).toBe(true);
  });

  test('shell-escapes single quotes in token values before docker exec', async () => {
    await channelManager.setTelegramConfig(SANDBOX_ID, {
      botToken: "tg-token-with-'quote",
    });

    const tokenCmd = dockerExecCalls.find(([, cmd]) =>
      cmd.includes('channels.telegram.botToken'),
    )?.[1];

    expect(tokenCmd).toBeDefined();
    expect(tokenCmd).toContain("channels.telegram.botToken 'tg-token-with-'\\''quote'");
  });
});

// ── setSlackConfig ────────────────────────────────────────────────────────────

describe('channelManager.setSlackConfig', () => {
  test('calls setCfg for all provided slack fields', async () => {
    const result = await channelManager.setSlackConfig(SANDBOX_ID, {
      enabled: true,
      mode: 'socket',
      appToken: 'xapp-tok',
      botToken: 'xoxb-tok',
      signingSecret: 'sec',
      dmPolicy: 'pairing',
    });
    expect(result['ok']).toBe(true);
    const allCmds = dockerExecCalls.map(([, cmd]) => cmd).join('\n');
    expect(allCmds).toContain('channels.slack.enabled');
    expect(allCmds).toContain('channels.slack.mode');
    expect(allCmds).toContain('channels.slack.appToken');
    expect(allCmds).toContain('channels.slack.botToken');
    expect(allCmds).toContain('channels.slack.signingSecret');
    expect(allCmds).toContain('channels.slack.dmPolicy');
  });

  test('restarts gateway after slack config update', async () => {
    await channelManager.setSlackConfig(SANDBOX_ID, { mode: 'socket' });
    const allCmds = dockerExecCalls.map(([, cmd]) => cmd).join('\n');
    expect(allCmds).toMatch(/gateway stop|gateway run/);
  });
});
