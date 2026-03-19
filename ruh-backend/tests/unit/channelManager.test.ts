/**
 * Unit tests for src/channelManager.ts — mocks @daytonaio/sdk and Bun.sleep.
 */

import { describe, expect, test, mock, beforeEach, spyOn } from 'bun:test';
import { makeMockSandbox, makeMockDaytona } from '../helpers/mockDaytona';

// ── Mock Daytona SDK ──────────────────────────────────────────────────────────

const mockSb = makeMockSandbox('ch-sb-001');

mock.module('@daytonaio/sdk', () => ({
  Daytona: mock(() => makeMockDaytona(mockSb)),
}));

// Mock Bun.sleep to a no-op so tests run fast
spyOn(Bun, 'sleep').mockImplementation(async () => {});

import * as channelManager from '../../src/channelManager';

// ─────────────────────────────────────────────────────────────────────────────

const API_KEY = 'test-api-key';
const SANDBOX_ID = 'ch-sb-001';

beforeEach(() => {
  mockSb.process.calls.length = 0;
  // Reset the mock queue
  (mockSb.process as { queue?: unknown[] }).queue = [];
  mockSb.process.defaultResult = { exitCode: 0, result: '' };
});

describe('channelManager.getChannelsConfig', () => {
  test('returns empty channel config when config file missing', async () => {
    // executeCommand returns exitCode=1 simulating file not found
    mockSb.process.defaultResult = { exitCode: 1, result: '' };
    const result = await channelManager.getChannelsConfig(API_KEY, SANDBOX_ID);
    expect(result).toHaveProperty('telegram');
    expect(result).toHaveProperty('slack');
    expect((result['telegram'] as Record<string, unknown>)['enabled']).toBe(false);
    expect((result['slack'] as Record<string, unknown>)['enabled']).toBe(false);
  });

  test('returns masked tokens from config', async () => {
    const config = JSON.stringify({
      channels: {
        telegram: { enabled: true, botToken: '1234567890:longtoken', dmPolicy: 'pairing' },
        slack: { enabled: false, appToken: 'xapp-token12345', botToken: 'xoxb-bot', signingSecret: 'abc123secret' },
      },
    });
    mockSb.process.defaultResult = { exitCode: 0, result: config };

    const result = await channelManager.getChannelsConfig(API_KEY, SANDBOX_ID);
    const tg = result['telegram'] as Record<string, unknown>;
    expect(tg['enabled']).toBe(true);
    // Token should be masked (first 4 + *** + last 4)
    expect(String(tg['botToken'])).toContain('***');
    expect(String(tg['botToken'])).not.toBe('1234567890:longtoken');
  });
});

describe('channelManager.probeChannelStatus', () => {
  test('returns ok=true when command succeeds', async () => {
    mockSb.process.defaultResult = { exitCode: 0, result: 'status: connected' };
    const result = await channelManager.probeChannelStatus(API_KEY, SANDBOX_ID, 'telegram');
    expect(result['ok']).toBe(true);
    expect(result['channel']).toBe('telegram');
    expect(result['output']).toContain('connected');
  });

  test('returns ok=false when command fails', async () => {
    mockSb.process.defaultResult = { exitCode: 1, result: 'error: not connected' };
    const result = await channelManager.probeChannelStatus(API_KEY, SANDBOX_ID, 'slack');
    expect(result['ok']).toBe(false);
  });
});

describe('channelManager.listPairingRequests', () => {
  test('extracts 8-character alphanumeric codes from output', async () => {
    mockSb.process.defaultResult = {
      exitCode: 0,
      result: 'Pending requests:\n  Code: ABC12345\n  Code: XYZ98765',
    };
    const result = await channelManager.listPairingRequests(API_KEY, SANDBOX_ID, 'telegram');
    expect(result['ok']).toBe(true);
    const codes = result['codes'] as string[];
    expect(codes).toContain('ABC12345');
    expect(codes).toContain('XYZ98765');
  });

  test('returns empty codes when no matches', async () => {
    mockSb.process.defaultResult = { exitCode: 0, result: 'No pending requests' };
    const result = await channelManager.listPairingRequests(API_KEY, SANDBOX_ID, 'telegram');
    expect((result['codes'] as string[]).length).toBe(0);
  });
});

describe('channelManager.approvePairing', () => {
  test('returns ok=false for empty code', async () => {
    const result = await channelManager.approvePairing(API_KEY, SANDBOX_ID, 'telegram', '');
    expect(result['ok']).toBe(false);
    expect(result['output']).toContain('Invalid pairing code');
  });

  test('sanitizes code to uppercase alphanumeric', async () => {
    mockSb.process.defaultResult = { exitCode: 0, result: 'Approved ABC12345' };
    await channelManager.approvePairing(API_KEY, SANDBOX_ID, 'telegram', 'abc-12345');
    const lastCmd = mockSb.process.calls[mockSb.process.calls.length - 1];
    expect(lastCmd).toContain('ABC12345');
  });

  test('returns ok=true when command succeeds', async () => {
    mockSb.process.defaultResult = { exitCode: 0, result: 'Approved' };
    const result = await channelManager.approvePairing(API_KEY, SANDBOX_ID, 'telegram', 'ABC12345');
    expect(result['ok']).toBe(true);
  });
});

describe('channelManager.setTelegramConfig', () => {
  test('calls setCfg for each provided field', async () => {
    mockSb.process.defaultResult = { exitCode: 0, result: '' };
    const result = await channelManager.setTelegramConfig(API_KEY, SANDBOX_ID, {
      enabled: true,
      botToken: 'my-bot-token',
      dmPolicy: 'open',
    });
    expect(result['ok']).toBe(true);
    const cmds = mockSb.process.calls.join(' ');
    expect(cmds).toContain('channels.telegram.enabled');
    expect(cmds).toContain('channels.telegram.botToken');
    expect(cmds).toContain('channels.telegram.dmPolicy');
  });

  test('restarts gateway after config update', async () => {
    mockSb.process.defaultResult = { exitCode: 0, result: '' };
    await channelManager.setTelegramConfig(API_KEY, SANDBOX_ID, { enabled: false });
    const cmds = mockSb.process.calls;
    expect(cmds.some((c) => c.includes('gateway stop') || c.includes('gateway run'))).toBe(true);
  });
});
