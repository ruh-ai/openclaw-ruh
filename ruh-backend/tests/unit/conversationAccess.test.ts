import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockGetSandbox = mock(async () => ({
  sandbox_id: 'sb-001',
  sandbox_name: 'test',
  sandbox_state: 'running',
  dashboard_url: null,
  signed_url: null,
  standard_url: null,
  preview_token: null,
  gateway_token: null,
  gateway_port: 18789,
  ssh_command: '',
  created_at: '2026-03-25T00:00:00.000Z',
  approved: true,
  shared_codex_enabled: false,
  shared_codex_model: null,
}));

const mockGetConversationForSandbox = mock(async () => ({
  id: 'conv-001',
  sandbox_id: 'sb-001',
  name: 'Test conversation',
  model: 'openclaw-default',
  openclaw_session_key: 'agent:main:conv-001',
  created_at: '2026-03-25T00:00:00.000Z',
  updated_at: '2026-03-25T00:00:00.000Z',
  message_count: 0,
}));

mock.module('../../src/store', () => ({
  getSandbox: mockGetSandbox,
}));

mock.module('../../src/conversationStore', () => ({
  getConversationForSandbox: mockGetConversationForSandbox,
}));

import { getSandboxConversationRecord } from '../../src/conversationAccess';

beforeEach(() => {
  mockGetSandbox.mockReset();
  mockGetConversationForSandbox.mockReset();
  mockGetSandbox.mockImplementation(async () => ({
    sandbox_id: 'sb-001',
    sandbox_name: 'test',
    sandbox_state: 'running',
    dashboard_url: null,
    signed_url: null,
    standard_url: null,
    preview_token: null,
    gateway_token: null,
    gateway_port: 18789,
    ssh_command: '',
    created_at: '2026-03-25T00:00:00.000Z',
    approved: true,
    shared_codex_enabled: false,
    shared_codex_model: null,
  }));
  mockGetConversationForSandbox.mockImplementation(async () => ({
    id: 'conv-001',
    sandbox_id: 'sb-001',
    name: 'Test conversation',
    model: 'openclaw-default',
    openclaw_session_key: 'agent:main:conv-001',
    created_at: '2026-03-25T00:00:00.000Z',
    updated_at: '2026-03-25T00:00:00.000Z',
    message_count: 0,
  }));
});

describe('getSandboxConversationRecord', () => {
  test('returns the conversation when the sandbox exists and owns it', async () => {
    const result = await getSandboxConversationRecord('sb-001', 'conv-001');
    expect(result.id).toBe('conv-001');
    expect(mockGetConversationForSandbox).toHaveBeenCalledWith('conv-001', 'sb-001');
  });

  test('returns 404 when the sandbox record is missing', async () => {
    mockGetSandbox.mockImplementation(async () => null);

    await expect(getSandboxConversationRecord('sb-001', 'conv-001')).rejects.toMatchObject({
      status: 404,
      message: 'Sandbox not found',
    });
  });

  test('returns 404 when the sandbox-scoped conversation lookup returns no record', async () => {
    mockGetConversationForSandbox.mockImplementation(async () => null);

    await expect(getSandboxConversationRecord('sb-001', 'conv-001')).rejects.toMatchObject({
      status: 404,
      message: 'Conversation not found',
    });
  });
});
