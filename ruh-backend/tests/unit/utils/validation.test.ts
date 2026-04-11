import { describe, expect, test } from 'bun:test';

import {
  validateUuid,
  validateAgentConfigPatchBody,
  validateAgentCreateBody,
  validateAgentMetadataPatchBody,
  validateAgentSandboxAttachBody,
  validateAgentWorkspaceMemoryPatchBody,
  validateConversationMessagesAppendBody,
  validateCustomerAgentConfigPatchBody,
  expectStrictObject,
  readRequiredString,
  readOptionalString,
  readOptionalEnum,
  readOptionalStringArray,
  readOptionalUnknown,
} from '../../../src/validation';

describe('validateUuid', () => {
  test('accepts valid UUID v4', () => {
    expect(validateUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'id')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  test('accepts uppercase UUID', () => {
    expect(validateUuid('A1B2C3D4-E5F6-7890-ABCD-EF1234567890', 'id')).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
  });

  test('rejects non-string values', () => {
    expect(() => validateUuid(123, 'id')).toThrow('id must be a valid UUID');
    expect(() => validateUuid(null, 'id')).toThrow('id must be a valid UUID');
    expect(() => validateUuid(undefined, 'id')).toThrow('id must be a valid UUID');
  });

  test('rejects path traversal strings', () => {
    expect(() => validateUuid('../../etc/passwd', 'conversation_id')).toThrow('conversation_id must be a valid UUID');
  });

  test('rejects empty string', () => {
    expect(() => validateUuid('', 'id')).toThrow('id must be a valid UUID');
  });

  test('rejects malformed UUIDs', () => {
    expect(() => validateUuid('not-a-uuid', 'id')).toThrow('id must be a valid UUID');
    expect(() => validateUuid('a1b2c3d4-e5f6-7890-abcd', 'id')).toThrow('id must be a valid UUID');
  });
});

describe('validateConversationMessagesAppendBody workspace task replay', () => {
  test('accepts bounded task-plan and terminal replay state', () => {
    expect(validateConversationMessagesAppendBody({
      messages: [
        {
          role: 'assistant',
          content: 'Done',
          workspace_state: {
            version: 1,
            task: {
              plan: {
                items: [
                  { id: 1, label: 'Inspect account', status: 'done' },
                  { id: 2, label: 'Draft report', status: 'active' },
                ],
                currentTaskIndex: 1,
                totalTasks: 2,
              },
              steps: [
                {
                  id: 0,
                  kind: 'tool',
                  label: 'bash',
                  detail: 'ls -la',
                  toolName: 'bash',
                  status: 'done',
                  startedAt: 1_711_111_111_000,
                  elapsedMs: 250,
                },
              ],
            },
          },
        },
      ],
    })).toEqual({
      messages: [
        {
          role: 'assistant',
          content: 'Done',
          workspace_state: {
            version: 1,
            task: {
              plan: {
                items: [
                  { id: 1, label: 'Inspect account', status: 'done' },
                  { id: 2, label: 'Draft report', status: 'active' },
                ],
                currentTaskIndex: 1,
                totalTasks: 2,
              },
              steps: [
                {
                  id: 0,
                  kind: 'tool',
                  label: 'bash',
                  detail: 'ls -la',
                  toolName: 'bash',
                  status: 'done',
                  startedAt: 1_711_111_111_000,
                  elapsedMs: 250,
                },
              ],
            },
          },
        },
      ],
    });
  });

  test('rejects malformed persisted task replay payloads', () => {
    expect(() => validateConversationMessagesAppendBody({
      messages: [
        {
          role: 'assistant',
          content: 'Done',
          workspace_state: {
            version: 1,
            task: {
              steps: [
                {
                  id: 0,
                  kind: 'shell',
                  label: 'bad kind',
                  status: 'done',
                  startedAt: 1,
                },
              ],
            },
          },
        },
      ],
    })).toThrow('kind must be one of: thinking, tool, writing');
  });
});

describe('validateAgentCreateBody', () => {
  test('rejects a non-object body before route code can read fields', () => {
    expect(() => validateAgentCreateBody(null)).toThrow('body must be an object');
    expect(() => validateAgentCreateBody([])).toThrow('body must be an object');
  });

  test('requires a non-empty name', () => {
    expect(() => validateAgentCreateBody({ description: 'missing name' })).toThrow('name is required');
    expect(() => validateAgentCreateBody({ name: '   ' })).toThrow('name is required');
  });

  test('rejects unknown top-level keys', () => {
    expect(() => validateAgentCreateBody({
      name: 'Test Agent',
      unexpected: true,
    })).toThrow('Unknown field: unexpected');
  });

  test('rejects invalid enum values', () => {
    expect(() => validateAgentCreateBody({
      name: 'Test Agent',
      status: 'paused',
    })).toThrow('status must be one of: active, draft');
  });

  test('rejects malformed or oversized skills arrays', () => {
    expect(() => validateAgentCreateBody({
      name: 'Test Agent',
      skills: ['valid', 42],
    })).toThrow('skills[1] must be a string');

    expect(() => validateAgentCreateBody({
      name: 'Test Agent',
      skills: Array.from({ length: 101 }, (_, index) => `skill-${index}`),
    })).toThrow('skills must contain at most 100 items');
  });

  test('rejects malformed or oversized agentRules entries', () => {
    expect(() => validateAgentCreateBody({
      name: 'Test Agent',
      agentRules: ['valid rule', 42],
    })).toThrow('agentRules[1] must be a string');

    expect(() => validateAgentCreateBody({
      name: 'Test Agent',
      agentRules: ['x'.repeat(4001)],
    })).toThrow('agentRules[0] must be at most 4000 characters');
  });

  test('normalizes accepted payloads', () => {
    expect(validateAgentCreateBody({
      name: '  Test Agent  ',
      description: '  agent description  ',
      skills: ['  web-search  '],
      triggerLabel: '  launch  ',
      status: 'active',
      agentRules: ['  be concise  '],
      runtimeInputs: [
        {
          key: 'GOOGLE_ADS_CUSTOMER_ID',
          label: 'Customer ID',
          description: 'Google Ads customer ID for the target account.',
          required: true,
          source: 'architect_requirement',
          value: '123-456-7890',
        },
      ],
      toolConnections: [
        {
          toolId: 'google-ads',
          name: 'Google Ads',
          description: 'Manage campaigns',
          status: 'configured',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['Connected account: Acme Ads'],
        },
      ],
      triggers: [
        {
          id: 'cron-schedule',
          title: 'Cron Schedule',
          kind: 'schedule',
          status: 'supported',
          description: 'Runs every weekday at 9 AM.',
          schedule: '0 9 * * 1-5',
        },
      ],
      channels: [
        {
          kind: 'slack',
          status: 'planned',
          label: 'Slack',
          description: 'Configure the workspace bot after deploy.',
        },
      ],
      discoveryDocuments: {
        prd: {
          title: 'Product Requirements Document',
          sections: [
            {
              heading: 'Goal',
              content: 'Build a Google Ads optimization copilot.',
            },
          ],
        },
        trd: {
          title: 'Technical Requirements Document',
          sections: [
            {
              heading: 'Integrations',
              content: 'Use the Google Ads MCP connector.',
            },
          ],
        },
      },
    })).toEqual({
      name: 'Test Agent',
      avatar: undefined,
      description: 'agent description',
      skills: ['web-search'],
      triggerLabel: 'launch',
      status: 'active',
      skillGraph: undefined,
      workflow: undefined,
      agentRules: ['be concise'],
      runtimeInputs: [
        {
          key: 'GOOGLE_ADS_CUSTOMER_ID',
          label: 'Customer ID',
          description: 'Google Ads customer ID for the target account.',
          required: true,
          source: 'architect_requirement',
          value: '123-456-7890',
        },
      ],
      toolConnections: [
        {
          toolId: 'google-ads',
          name: 'Google Ads',
          description: 'Manage campaigns',
          status: 'configured',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['Connected account: Acme Ads'],
        },
      ],
      triggers: [
        {
          id: 'cron-schedule',
          title: 'Cron Schedule',
          kind: 'schedule',
          status: 'supported',
          description: 'Runs every weekday at 9 AM.',
          schedule: '0 9 * * 1-5',
        },
      ],
      channels: [
        {
          kind: 'slack',
          status: 'planned',
          label: 'Slack',
          description: 'Configure the workspace bot after deploy.',
        },
      ],
      discoveryDocuments: {
        prd: {
          title: 'Product Requirements Document',
          sections: [
            {
              heading: 'Goal',
              content: 'Build a Google Ads optimization copilot.',
            },
          ],
        },
        trd: {
          title: 'Technical Requirements Document',
          sections: [
            {
              heading: 'Integrations',
              content: 'Use the Google Ads MCP connector.',
            },
          ],
        },
      },
      improvements: undefined,
      forge_sandbox_id: undefined,
    });
  });

  test('preserves workflow and skillGraph payloads for downstream persistence', () => {
    const skillGraph = [{ id: 'node-1', type: 'skill' }];
    const workflow = { steps: [{ id: 'step-1', skillId: 'node-1' }] };

    expect(validateAgentCreateBody({
      name: 'Config Agent',
      skillGraph,
      workflow,
    })).toEqual({
      name: 'Config Agent',
      avatar: undefined,
      description: undefined,
      skills: undefined,
      triggerLabel: undefined,
      status: undefined,
      skillGraph,
      workflow,
      agentRules: undefined,
      toolConnections: undefined,
      triggers: undefined,
    });
  });
});

describe('validateAgentConfigPatchBody', () => {
  test('rejects unknown top-level keys', () => {
    expect(() => validateAgentConfigPatchBody({
      skillGraph: [],
      unexpected: true,
    })).toThrow('Unknown field: unexpected');
  });

  test('requires at least one supported field', () => {
    expect(() => validateAgentConfigPatchBody({})).toThrow('At least one config field is required');
  });

  test('rejects non-array agentRules', () => {
    expect(() => validateAgentConfigPatchBody({
      agentRules: 'be concise',
    })).toThrow('agentRules must be an array');
  });

  test('normalizes accepted payloads and preserves nullable config objects', () => {
    expect(validateAgentConfigPatchBody({
      skillGraph: { nodes: [] },
      workflow: null,
      agentRules: ['  be concise  '],
      toolConnections: [
        {
          toolId: 'google-ads',
          name: 'Google Ads',
          description: 'Manage campaigns',
          status: 'missing_secret',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['Account selected; credentials still required'],
        },
      ],
      runtimeInputs: [
        {
          key: 'GOOGLE_ADS_CUSTOMER_ID',
          label: 'Customer ID',
          description: 'Google Ads customer ID for the target account.',
          required: true,
          source: 'architect_requirement',
          value: '123-456-7890',
        },
      ],
      triggers: [
        {
          id: 'cron-schedule',
          title: 'Cron Schedule',
          kind: 'schedule',
          status: 'supported',
          description: 'Runs every weekday at 9 AM.',
          schedule: '0 9 * * 1-5',
        },
      ],
      channels: [
        {
          kind: 'telegram',
          status: 'planned',
          label: 'Telegram',
          description: 'Connect the bot token after deploy.',
        },
      ],
      discoveryDocuments: {
        prd: {
          title: 'PRD',
          sections: [
            {
              heading: 'Audience',
              content: 'Media buyers',
            },
          ],
        },
        trd: {
          title: 'TRD',
          sections: [
            {
              heading: 'Runtime',
              content: 'Persist the approved requirements context.',
            },
          ],
        },
      },
    })).toEqual({
      skillGraph: { nodes: [] },
      workflow: null,
      agentRules: ['be concise'],
      runtimeInputs: [
        {
          key: 'GOOGLE_ADS_CUSTOMER_ID',
          label: 'Customer ID',
          description: 'Google Ads customer ID for the target account.',
          required: true,
          source: 'architect_requirement',
          value: '123-456-7890',
        },
      ],
      toolConnections: [
        {
          toolId: 'google-ads',
          name: 'Google Ads',
          description: 'Manage campaigns',
          status: 'missing_secret',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['Account selected; credentials still required'],
        },
      ],
      triggers: [
        {
          id: 'cron-schedule',
          title: 'Cron Schedule',
          kind: 'schedule',
          status: 'supported',
          description: 'Runs every weekday at 9 AM.',
          schedule: '0 9 * * 1-5',
        },
      ],
      channels: [
        {
          kind: 'telegram',
          status: 'planned',
          label: 'Telegram',
          description: 'Connect the bot token after deploy.',
        },
      ],
      discoveryDocuments: {
        prd: {
          title: 'PRD',
          sections: [
            {
              heading: 'Audience',
              content: 'Media buyers',
            },
          ],
        },
        trd: {
          title: 'TRD',
          sections: [
            {
              heading: 'Runtime',
              content: 'Persist the approved requirements context.',
            },
          ],
        },
      },
      improvements: undefined,
    });
  });

  test('rejects malformed discovery document payloads', () => {
    expect(() => validateAgentCreateBody({
      name: 'Test Agent',
      discoveryDocuments: {
        prd: {
          title: 'PRD',
          sections: [
            {
              heading: 'Goal',
              content: 42,
            },
          ],
        },
        trd: {
          title: 'TRD',
          sections: [],
        },
      },
    })).toThrow('content is required');
  });

  test('accepts api and cli connector types for researched manual integrations', () => {
    expect(validateAgentConfigPatchBody({
      toolConnections: [
        {
          toolId: 'figma',
          name: 'Figma',
          description: 'Design comments and file inspection',
          status: 'unsupported',
          authKind: 'none',
          connectorType: 'api',
          configSummary: ['Manual API wrapper recommended'],
        },
        {
          toolId: 'docker',
          name: 'Docker',
          description: 'Local image and container management',
          status: 'unsupported',
          authKind: 'none',
          connectorType: 'cli',
          configSummary: ['CLI integration recommended'],
        },
      ],
    })).toEqual({
      skillGraph: undefined,
      workflow: undefined,
      agentRules: undefined,
      toolConnections: [
        {
          toolId: 'figma',
          name: 'Figma',
          description: 'Design comments and file inspection',
          status: 'unsupported',
          authKind: 'none',
          connectorType: 'api',
          configSummary: ['Manual API wrapper recommended'],
        },
        {
          toolId: 'docker',
          name: 'Docker',
          description: 'Local image and container management',
          status: 'unsupported',
          authKind: 'none',
          connectorType: 'cli',
          configSummary: ['CLI integration recommended'],
        },
      ],
      triggers: undefined,
    });
  });
});

describe('validateAgentMetadataPatchBody', () => {
  test('rejects unknown top-level keys', () => {
    expect(() => validateAgentMetadataPatchBody({
      name: 'Agent',
      unexpected: true,
    })).toThrow('Unknown field: unexpected');
  });

  test('requires at least one supported field', () => {
    expect(() => validateAgentMetadataPatchBody({})).toThrow('At least one metadata field is required');
  });

  test('requires a non-empty trimmed name when name is provided', () => {
    expect(() => validateAgentMetadataPatchBody({
      name: '   ',
    })).toThrow('name is required');
  });

  test('rejects invalid enum values and malformed skills arrays', () => {
    expect(() => validateAgentMetadataPatchBody({
      status: 'paused',
    })).toThrow('status must be one of: active, draft, forging');

    expect(() => validateAgentMetadataPatchBody({
      skills: ['valid', 42],
    })).toThrow('skills[1] must be a string');
  });

  test('normalizes accepted metadata patches', () => {
    expect(validateAgentMetadataPatchBody({
      name: '  Agent Name  ',
      avatar: '  🤖  ',
      description: '  keeps context tidy  ',
      skills: ['  web-search  '],
      triggerLabel: '  cron  ',
      status: 'active',
      channels: [
        {
          kind: 'discord',
          status: 'unsupported',
          label: 'Discord',
          description: 'Manual setup still required.',
        },
      ],
    })).toEqual({
      name: 'Agent Name',
      avatar: '🤖',
      description: 'keeps context tidy',
      skills: ['web-search'],
      triggerLabel: 'cron',
      status: 'active',
      channels: [
        {
          kind: 'discord',
          status: 'unsupported',
          label: 'Discord',
          description: 'Manual setup still required.',
        },
      ],
      forge_sandbox_id: undefined,
    });
  });

  test('accepts forging status for forge-backed draft autosave', () => {
    expect(validateAgentMetadataPatchBody({
      status: 'forging',
    })).toEqual({
      name: undefined,
      avatar: undefined,
      description: undefined,
      skills: undefined,
      triggerLabel: undefined,
      status: 'forging',
      channels: undefined,
      forge_sandbox_id: undefined,
    });
  });

  test('allows empty optional strings so clients can clear metadata fields', () => {
    expect(validateAgentMetadataPatchBody({
      description: '   ',
      avatar: '',
    })).toEqual({
      name: undefined,
      avatar: '',
      description: '',
      skills: undefined,
      triggerLabel: undefined,
      status: undefined,
    });
  });
});

describe('validateAgentSandboxAttachBody', () => {
  test('rejects unknown top-level keys', () => {
    expect(() => validateAgentSandboxAttachBody({
      sandbox_id: 'sandbox-1',
      unexpected: true,
    })).toThrow('Unknown field: unexpected');
  });

  test('requires a non-empty sandbox_id', () => {
    expect(() => validateAgentSandboxAttachBody({})).toThrow('sandbox_id is required');
    expect(() => validateAgentSandboxAttachBody({ sandbox_id: '   ' })).toThrow('sandbox_id is required');
  });

  test('rejects oversized sandbox_id values', () => {
    expect(() => validateAgentSandboxAttachBody({
      sandbox_id: 'x'.repeat(201),
    })).toThrow('sandbox_id must be at most 200 characters');
  });

  test('normalizes accepted payloads', () => {
    expect(validateAgentSandboxAttachBody({
      sandbox_id: '  sandbox-1  ',
    })).toEqual({
      sandbox_id: 'sandbox-1',
    });
  });
});

describe('validateAgentWorkspaceMemoryPatchBody', () => {
  test('rejects unknown top-level keys', () => {
    expect(() => validateAgentWorkspaceMemoryPatchBody({
      instructions: 'Keep summaries tight',
      unexpected: true,
    })).toThrow('Unknown field: unexpected');
  });

  test('requires at least one supported field', () => {
    expect(() => validateAgentWorkspaceMemoryPatchBody({})).toThrow('At least one workspace memory field is required');
  });

  test('rejects unsafe pinned paths', () => {
    expect(() => validateAgentWorkspaceMemoryPatchBody({
      pinnedPaths: ['../secrets.txt'],
    })).toThrow('pinnedPaths[0] must be a safe relative workspace path');

    expect(() => validateAgentWorkspaceMemoryPatchBody({
      pinnedPaths: ['/root/.openclaw/workspace/secret.txt'],
    })).toThrow('pinnedPaths[0] must be a safe relative workspace path');
  });

  test('normalizes accepted workspace memory payloads', () => {
    expect(validateAgentWorkspaceMemoryPatchBody({
      instructions: '  Always summarize decisions first.  ',
      continuitySummary: '  Waiting on launch sign-off.  ',
      pinnedPaths: [' plans/launch.md ', 'reports/q1-summary.md'],
    })).toEqual({
      instructions: 'Always summarize decisions first.',
      continuitySummary: 'Waiting on launch sign-off.',
      pinnedPaths: ['plans/launch.md', 'reports/q1-summary.md'],
    });
  });
});

describe('validateConversationMessagesAppendBody', () => {
  test('rejects non-object payloads and unknown top-level keys', () => {
    expect(() => validateConversationMessagesAppendBody(null)).toThrow('body must be an object');
    expect(() => validateConversationMessagesAppendBody({
      messages: [],
      unexpected: true,
    })).toThrow('Unknown field: unexpected');
  });

  test('requires a bounded messages array', () => {
    expect(() => validateConversationMessagesAppendBody({})).toThrow('messages is required');
    expect(() => validateConversationMessagesAppendBody({ messages: 'nope' })).toThrow('messages must be an array');
    expect(() => validateConversationMessagesAppendBody({
      messages: Array.from({ length: 101 }, () => ({ role: 'assistant', content: 'hi' })),
    })).toThrow('messages must contain at most 100 items');
  });

  test('rejects malformed workspace_state payloads', () => {
    expect(() => validateConversationMessagesAppendBody({
      messages: [
        {
          role: 'assistant',
          content: '  Hi  ',
          workspace_state: {
            version: 1,
            browser: {
              items: 'not-an-array',
            },
          },
        },
      ],
    })).toThrow('messages[0].workspace_state.browser.items must be an array');

    expect(() => validateConversationMessagesAppendBody({
      messages: [
        {
          role: 'assistant',
          workspace_state: {
            version: 1,
          },
        },
      ],
    })).toThrow('messages[0].workspace_state must include at least one supported workspace surface');
  });

  test('rejects empty or oversized browser workspace_state payloads', () => {
    expect(() => validateConversationMessagesAppendBody({
      messages: [
        {
          role: 'assistant',
          workspace_state: {
            version: 1,
            browser: {},
          },
        },
      ],
    })).toThrow('messages[0].workspace_state.browser must include items, previewUrl, or takeover');

    expect(() => validateConversationMessagesAppendBody({
      messages: [
        {
          role: 'assistant',
          workspace_state: {
            version: 1,
            browser: {
              items: Array.from({ length: 101 }, (_, index) => ({
                id: index,
                kind: 'navigation',
                label: `step-${index}`,
                timestamp: index,
              })),
            },
          },
        },
      ],
    })).toThrow('messages[0].workspace_state.browser.items must contain at most 100 items');

    expect(() => validateConversationMessagesAppendBody({
      messages: [
        {
          role: 'assistant',
          workspace_state: {
            version: 1,
            browser: {
              items: Array.from({ length: 100 }, (_, index) => ({
                id: index,
                kind: 'preview',
                label: `preview-${index}`,
                detail: 'x'.repeat(400),
                timestamp: index,
              })),
            },
          },
        },
      ],
    })).toThrow('messages[0].workspace_state must be at most 32768 bytes when serialized');
  });

  test('normalizes accepted workspace_state payloads', () => {
    expect(validateConversationMessagesAppendBody({
      messages: [
        {
          role: 'assistant',
          content: '  Hi  ',
          workspace_state: {
            version: 1,
            browser: {
              items: [
                {
                  id: 0,
                  kind: 'preview',
                  label: '  Preview  ',
                  url: 'https://example.com',
                  timestamp: 1711111111000,
                },
              ],
              previewUrl: 'https://example.com',
              takeover: {
                status: 'requested',
                reason: '  Login needed  ',
                actionLabel: '  Resume agent run  ',
                updatedAt: 1711111112000,
              },
            },
          },
        },
      ],
    })).toEqual({
      messages: [
        {
          role: 'assistant',
          content: '  Hi  ',
          workspace_state: {
            version: 1,
            browser: {
              items: [
                {
                  id: 0,
                  kind: 'preview',
                  label: 'Preview',
                  url: 'https://example.com',
                  detail: undefined,
                  timestamp: 1711111111000,
                },
              ],
              previewUrl: 'https://example.com',
              takeover: {
                status: 'requested',
                reason: 'Login needed',
                actionLabel: 'Resume agent run',
                updatedAt: 1711111112000,
              },
            },
          },
        },
      ],
    });
  });
});

describe('agent improvement validation', () => {
  test('accepts metadata-only improvements on create and config patch payloads', () => {
    const improvements = [
      {
        id: 'connect-google-ads',
        kind: 'tool_connection',
        status: 'accepted',
        scope: 'builder',
        title: 'Connect Google Ads before deploy',
        summary: 'Attach a Google Ads connection so the optimizer can read live account data.',
        rationale: 'The generated Google Ads skills depend on account data that is not available yet.',
        targetId: 'google-ads',
      },
    ];

    expect(validateAgentCreateBody({
      name: 'Google Ads Agent',
      improvements,
    }).improvements).toEqual(improvements);

    expect(validateAgentConfigPatchBody({
      improvements,
    }).improvements).toEqual(improvements);
  });

  test('rejects unknown improvement keys so transcript text cannot be persisted', () => {
    expect(() => validateAgentConfigPatchBody({
      improvements: [
        {
          id: 'connect-google-ads',
          kind: 'tool_connection',
          status: 'accepted',
          scope: 'builder',
          title: 'Connect Google Ads before deploy',
          summary: 'Attach a Google Ads connection so the optimizer can read live account data.',
          rationale: 'The generated Google Ads skills depend on account data that is not available yet.',
          rawTranscript: 'secret prompt text',
        },
      ],
    })).toThrow('Unknown field: rawTranscript');
  });
});

// ── validateCustomerAgentConfigPatchBody ─────────────────────────────────────

describe('validateCustomerAgentConfigPatchBody', () => {
  test('rejects non-object body', () => {
    expect(() => validateCustomerAgentConfigPatchBody(null)).toThrow('body must be an object');
    expect(() => validateCustomerAgentConfigPatchBody('string')).toThrow('body must be an object');
  });

  test('rejects unknown top-level keys', () => {
    expect(() => validateCustomerAgentConfigPatchBody({
      name: 'Agent',
      unknownKey: true,
    })).toThrow('Unknown field: unknownKey');
  });

  test('requires at least one supported field', () => {
    expect(() => validateCustomerAgentConfigPatchBody({})).toThrow('At least one config field is required');
  });

  test('requires non-empty name when provided', () => {
    expect(() => validateCustomerAgentConfigPatchBody({
      name: '   ',
    })).toThrow('name is required');
  });

  test('rejects non-array runtimeInputValues', () => {
    expect(() => validateCustomerAgentConfigPatchBody({
      runtimeInputValues: 'not-array',
    })).toThrow('runtimeInputValues must be an array');
  });

  test('rejects runtimeInputValues item missing key', () => {
    expect(() => validateCustomerAgentConfigPatchBody({
      runtimeInputValues: [{ value: 'x' }],
    })).toThrow('key is required');
  });

  test('normalizes accepted payloads', () => {
    const result = validateCustomerAgentConfigPatchBody({
      name: '  My Agent  ',
      description: '  helps with ads  ',
      agentRules: ['  be concise  '],
      runtimeInputValues: [
        { key: 'CUSTOMER_ID', value: '123-456' },
      ],
    });

    expect(result.name).toBe('My Agent');
    expect(result.description).toBe('helps with ads');
    expect(result.agentRules).toEqual(['be concise']);
    expect(result.runtimeInputValues).toEqual([{ key: 'CUSTOMER_ID', value: '123-456' }]);
  });

  test('accepts description-only patch', () => {
    const result = validateCustomerAgentConfigPatchBody({ description: 'Updated description' });
    expect(result.description).toBe('Updated description');
    expect(result.name).toBeUndefined();
  });
});

// ── expectStrictObject ───────────────────────────────────────────────────────

describe('expectStrictObject', () => {
  test('rejects arrays and primitives', () => {
    expect(() => expectStrictObject([], { allowedKeys: [] })).toThrow('body must be an object');
    expect(() => expectStrictObject(42, { allowedKeys: [] })).toThrow('body must be an object');
    expect(() => expectStrictObject(null, { allowedKeys: [] })).toThrow('body must be an object');
  });

  test('accepts object with all allowed keys', () => {
    const obj = { a: 1, b: 2 };
    expect(expectStrictObject(obj, { allowedKeys: ['a', 'b'] })).toBe(obj);
  });

  test('uses fieldName in error messages', () => {
    expect(() => expectStrictObject('x', {
      fieldName: 'myField',
      allowedKeys: [],
    })).toThrow('myField must be an object');
  });
});

// ── readRequiredString ───────────────────────────────────────────────────────

describe('readRequiredString', () => {
  test('throws when value is not a string', () => {
    expect(() => readRequiredString({ x: 42 }, 'x')).toThrow('x is required');
    expect(() => readRequiredString({ x: null }, 'x')).toThrow('x is required');
  });

  test('throws when string exceeds maxLength', () => {
    expect(() => readRequiredString({ x: 'x'.repeat(11) }, 'x', { maxLength: 10 })).toThrow(
      'x must be at most 10 characters',
    );
  });

  test('returns trimmed value by default', () => {
    expect(readRequiredString({ x: '  hello  ' }, 'x')).toBe('hello');
  });

  test('preserves whitespace when trim is false', () => {
    expect(readRequiredString({ x: '  hello  ' }, 'x', { trim: false })).toBe('  hello  ');
  });
});

// ── readOptionalString ───────────────────────────────────────────────────────

describe('readOptionalString', () => {
  test('returns undefined when field is absent', () => {
    expect(readOptionalString({}, 'missing')).toBeUndefined();
  });

  test('throws when field is present but not a string', () => {
    expect(() => readOptionalString({ x: 123 }, 'x')).toThrow('x must be a string');
  });

  test('throws when string exceeds maxLength', () => {
    expect(() => readOptionalString({ x: 'x'.repeat(6) }, 'x', { maxLength: 5 })).toThrow(
      'x must be at most 5 characters',
    );
  });

  test('returns empty string for empty value without throwing', () => {
    expect(readOptionalString({ x: '' }, 'x')).toBe('');
  });
});

// ── readOptionalEnum ─────────────────────────────────────────────────────────

describe('readOptionalEnum', () => {
  test('returns undefined when field absent', () => {
    expect(readOptionalEnum({}, 'status', ['a', 'b'] as const)).toBeUndefined();
  });

  test('throws when field is not a string', () => {
    expect(() => readOptionalEnum({ status: 42 }, 'status', ['a', 'b'] as const)).toThrow(
      'status must be one of: a, b',
    );
  });

  test('throws when value not in allowed list', () => {
    expect(() => readOptionalEnum({ status: 'c' }, 'status', ['a', 'b'] as const)).toThrow(
      'status must be one of: a, b',
    );
  });

  test('returns the matching enum value', () => {
    expect(readOptionalEnum({ status: 'b' }, 'status', ['a', 'b'] as const)).toBe('b');
  });
});

// ── readOptionalStringArray ──────────────────────────────────────────────────

describe('readOptionalStringArray', () => {
  test('returns undefined when field absent', () => {
    expect(readOptionalStringArray({}, 'tags')).toBeUndefined();
  });

  test('throws when field is not an array', () => {
    expect(() => readOptionalStringArray({ tags: 'nope' }, 'tags')).toThrow('tags must be an array');
  });

  test('throws when array exceeds maxItems', () => {
    expect(() => readOptionalStringArray(
      { tags: ['a', 'b', 'c'] },
      'tags',
      { maxItems: 2 },
    )).toThrow('tags must contain at most 2 items');
  });

  test('throws when item exceeds itemMaxLength', () => {
    expect(() => readOptionalStringArray(
      { tags: ['ok', 'x'.repeat(11)] },
      'tags',
      { itemMaxLength: 10 },
    )).toThrow('tags[1] must be at most 10 characters');
  });

  test('returns trimmed array items', () => {
    expect(readOptionalStringArray({ tags: ['  a  ', '  b  '] }, 'tags')).toEqual(['a', 'b']);
  });
});

// ── readOptionalUnknown ──────────────────────────────────────────────────────

describe('readOptionalUnknown', () => {
  test('returns undefined when field is not in input', () => {
    expect(readOptionalUnknown({}, 'data')).toBeUndefined();
  });

  test('returns the value as-is when field is present', () => {
    const obj = { nested: true };
    expect(readOptionalUnknown({ data: obj }, 'data')).toBe(obj);
    expect(readOptionalUnknown({ x: null }, 'x')).toBeNull();
  });
});

// ── validateAgentConfigPatchBody: triggers and runtimeInputs edge cases ──────

describe('validateAgentConfigPatchBody: triggers edge cases', () => {
  test('rejects non-array triggers', () => {
    expect(() => validateAgentConfigPatchBody({ triggers: 'not-array' })).toThrow(
      'triggers must be an array',
    );
  });

  test('rejects trigger missing required kind field', () => {
    expect(() => validateAgentConfigPatchBody({
      triggers: [{
        id: 'trig-1',
        title: 'My Trigger',
        // kind omitted
        status: 'supported',
        description: 'Does something.',
      }],
    })).toThrow('kind is required');
  });

  test('rejects trigger with invalid status', () => {
    expect(() => validateAgentConfigPatchBody({
      triggers: [{
        id: 'trig-1',
        title: 'My Trigger',
        kind: 'manual',
        status: 'broken', // invalid
        description: 'Does something.',
      }],
    })).toThrow('status must be one of: supported, unsupported');
  });

  test('accepts webhook trigger with optional fields', () => {
    const result = validateAgentConfigPatchBody({
      triggers: [{
        id: 'wh-1',
        title: 'Webhook',
        kind: 'webhook',
        status: 'supported',
        description: 'Triggered by external event.',
        webhookPublicId: 'pub-abc',
        webhookSecretLastFour: 'xyzw',
        webhookSecretIssuedAt: '2026-01-01T00:00:00Z',
        webhookLastDeliveryAt: '2026-04-01T00:00:00Z',
        webhookLastDeliveryStatus: 'delivered',
      }],
    });

    expect(result.triggers![0].kind).toBe('webhook');
    expect(result.triggers![0].webhookPublicId).toBe('pub-abc');
    expect(result.triggers![0].webhookLastDeliveryStatus).toBe('delivered');
  });
});

describe('validateAgentConfigPatchBody: runtimeInputs edge cases', () => {
  test('rejects non-array runtimeInputs', () => {
    expect(() => validateAgentConfigPatchBody({ runtimeInputs: 'not-array' })).toThrow(
      'runtimeInputs must be an array',
    );
  });

  test('rejects runtimeInput with non-boolean required field', () => {
    expect(() => validateAgentConfigPatchBody({
      runtimeInputs: [{
        key: 'API_KEY',
        label: 'API Key',
        description: 'Auth key',
        required: 'yes', // should be boolean
        source: 'architect_requirement',
      }],
    })).toThrow('required must be a boolean');
  });

  test('accepts runtimeInput with enriched metadata fields', () => {
    const result = validateAgentConfigPatchBody({
      runtimeInputs: [{
        key: 'CUSTOMER_ID',
        label: 'Customer ID',
        description: 'Google Ads customer ID.',
        required: true,
        source: 'architect_requirement',
        value: '123-456',
        inputType: 'text',
        defaultValue: '',
        example: '123-456-7890',
        options: ['opt-a', 'opt-b'],
        group: 'credentials',
        populationStrategy: 'user_required',
      }],
    });

    const ri = result.runtimeInputs![0];
    expect(ri.key).toBe('CUSTOMER_ID');
    expect(ri.inputType).toBe('text');
    expect(ri.options).toEqual(['opt-a', 'opt-b']);
    expect(ri.populationStrategy).toBe('user_required');
  });
});

// ── validateAgentConfigPatchBody: creationSession size limit ─────────────────

describe('validateAgentConfigPatchBody: creationSession', () => {
  test('rejects creationSession exceeding 512 KB', () => {
    expect(() => validateAgentConfigPatchBody({
      creationSession: { data: 'x'.repeat(513_000) },
    })).toThrow('creationSession exceeds 512 KB size limit');
  });

  test('accepts valid creationSession object', () => {
    const result = validateAgentConfigPatchBody({
      creationSession: { stage: 'architect', turn: 3 },
    });
    expect(result.creationSession).toEqual({ stage: 'architect', turn: 3 });
  });
});
