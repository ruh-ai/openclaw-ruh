import type { SandboxRecord } from '../../src/store';
import type { ConversationRecord } from '../../src/conversationStore';

export const SANDBOX_ID = 'test-sandbox-abc123';
export const CONV_ID = 'test-conv-def456';

export function makeSandboxRecord(overrides: Partial<SandboxRecord> = {}): SandboxRecord {
  return {
    sandbox_id: SANDBOX_ID,
    sandbox_name: 'openclaw-gateway',
    sandbox_state: 'started',
    dashboard_url: 'https://preview.daytona.io/test',
    signed_url: null,
    standard_url: 'https://preview.daytona.io/test',
    preview_token: null,
    gateway_token: 'gw-tok-xyz',
    gateway_port: 18789,
    ssh_command: `daytona ssh ${SANDBOX_ID}`,
    created_at: new Date().toISOString(),
    approved: false,
    ...overrides,
  };
}

export function makeConversationRecord(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: CONV_ID,
    sandbox_id: SANDBOX_ID,
    name: 'Test Conversation',
    model: 'openclaw-default',
    openclaw_session_key: `agent:main:${CONV_ID}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    message_count: 0,
    ...overrides,
  };
}

export const MOCK_CHAT_RESPONSE = {
  id: 'chatcmpl-test123',
  object: 'chat.completion',
  created: Math.floor(Date.now() / 1000),
  model: 'openclaw-default',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Hello!' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};
