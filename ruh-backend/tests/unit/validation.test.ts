import { describe, expect, test } from 'bun:test';

import {
  validateAgentConfigPatchBody,
  validateAgentCreateBody,
  validateAgentMetadataPatchBody,
  validateAgentSandboxAttachBody,
} from '../../src/validation';

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
    })).toEqual({
      skillGraph: { nodes: [] },
      workflow: null,
      agentRules: ['be concise'],
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
    })).toThrow('status must be one of: active, draft');

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
    })).toEqual({
      name: 'Agent Name',
      avatar: '🤖',
      description: 'keeps context tidy',
      skills: ['web-search'],
      triggerLabel: 'cron',
      status: 'active',
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
