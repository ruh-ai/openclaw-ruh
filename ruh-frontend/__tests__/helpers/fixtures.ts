import type { SandboxRecord } from '@/components/SandboxSidebar';

export const SANDBOX_ID = 'sb-test-001';
export const CONV_ID = 'conv-test-001';

export function makeSandbox(overrides: Partial<SandboxRecord> = {}): SandboxRecord {
  return {
    sandbox_id: SANDBOX_ID,
    sandbox_name: 'openclaw-gateway',
    sandbox_state: 'started',
    dashboard_url: 'https://preview.daytona.io/sb-test-001',
    preview_token: 'prev-tok-abc',
    gateway_token: 'gw-tok-xyz',
    gateway_port: 18789,
    ssh_command: `daytona ssh ${SANDBOX_ID}`,
    created_at: new Date('2025-01-15T10:00:00Z').toISOString(),
    approved: true,
    ...overrides,
  };
}

export function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    sandbox_id: SANDBOX_ID,
    name: 'New Conversation',
    model: 'openclaw-default',
    openclaw_session_key: `agent:main:${CONV_ID}`,
    created_at: new Date('2025-01-15T10:05:00Z').toISOString(),
    updated_at: new Date('2025-01-15T10:05:00Z').toISOString(),
    message_count: 0,
    ...overrides,
  };
}

export function makeCronJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cron-job-001',
    name: 'Daily Report',
    enabled: true,
    schedule: { kind: 'cron', expr: '0 9 * * *', tz: 'UTC' },
    sessionTarget: 'main',
    payload: { kind: 'agentTurn', message: 'Generate daily report' },
    deleteAfterRun: false,
    state: { lastRunAtMs: Date.now() - 86400000, nextRunAtMs: Date.now() + 3600000, status: 'ok' },
    ...overrides,
  };
}

export function makeChannelsConfig(overrides: Record<string, unknown> = {}) {
  return {
    telegram: {
      enabled: false,
      botToken: '',
      dmPolicy: 'pairing',
    },
    slack: {
      enabled: false,
      mode: 'socket',
      appToken: '',
      botToken: '',
      signingSecret: '',
      dmPolicy: 'pairing',
    },
    ...overrides,
  };
}

export const MOCK_CHAT_RESPONSE = {
  id: 'chatcmpl-test-001',
  object: 'chat.completion',
  created: 1700000000,
  model: 'openclaw-default',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Hello! How can I help you?' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
};
