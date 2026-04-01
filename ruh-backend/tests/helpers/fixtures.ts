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
    vnc_port: null,
    ssh_command: `daytona ssh ${SANDBOX_ID}`,
    created_at: new Date().toISOString(),
    approved: false,
    shared_codex_enabled: false,
    shared_codex_model: null,
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

export const AGENT_ID = 'test-agent-abc123';
export const FORGE_SANDBOX_ID = 'forge-sandbox-xyz789';

export function makeAgentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    name: 'Test Agent',
    avatar: '🤖',
    description: 'A test agent',
    skills: ['exec'],
    trigger_label: 'Manual trigger',
    status: 'draft',
    sandbox_ids: [],
    forge_sandbox_id: null,
    skill_graph: null,
    workflow: null,
    agent_rules: [],
    tool_connections: [],
    triggers: [],
    improvements: [],
    workspace_memory: {
      instructions: '',
      continuity_summary: '',
      pinned_paths: [],
      updated_at: null,
    },
    agent_credentials: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
