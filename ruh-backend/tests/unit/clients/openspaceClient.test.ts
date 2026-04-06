/**
 * Unit tests for src/openspaceClient.ts — mocks docker only;
 * controls openspaceMcpEnabled via process.env to avoid polluting the
 * shared config module mock across test files.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ── Mock docker only (not config — use env var instead) ──────────────────────

const mockDockerExec = mock(async (_id: string, _cmd: string) => [true, ''] as [boolean, string]);

mock.module('../../../src/docker', () => ({
  dockerExec: mockDockerExec,
}));

import { isEnabled, recordAndAnalyzeExecution, listSkills } from '../../../src/openspaceClient';

// ─────────────────────────────────────────────────────────────────────────────

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    toolCalls: [{ tool: 'exec', input: 'ls' }],
    totalToolCalls: 1,
    responseContent: 'Done.',
    ...overrides,
  } as any;
}

let savedOpenspaceEnabled: string | undefined;

beforeEach(() => {
  savedOpenspaceEnabled = process.env.OPENSPACE_MCP_ENABLED;
  process.env.OPENSPACE_MCP_ENABLED = 'false';
  mockDockerExec.mockReset();
  mockDockerExec.mockImplementation(async () => [true, '']);
});

afterEach(() => {
  if (savedOpenspaceEnabled === undefined) {
    delete process.env.OPENSPACE_MCP_ENABLED;
  } else {
    process.env.OPENSPACE_MCP_ENABLED = savedOpenspaceEnabled;
  }
});

// ── isEnabled ────────────────────────────────────────────────────────────────

describe('isEnabled', () => {
  test('returns false when disabled', () => {
    expect(isEnabled()).toBe(false);
  });

  test('returns true when enabled', () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';
    expect(isEnabled()).toBe(true);
  });
});

// ── recordAndAnalyzeExecution ────────────────────────────────────────────────

describe('recordAndAnalyzeExecution', () => {
  test('returns null when disabled', async () => {
    const result = await recordAndAnalyzeExecution('sandbox-1', makeExecution());
    expect(result).toBeNull();
  });

  test('returns null when totalToolCalls is 0', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';
    const result = await recordAndAnalyzeExecution('sandbox-1', makeExecution({ totalToolCalls: 0 }));
    expect(result).toBeNull();
  });

  test('writes execution log and returns result', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';
    mockDockerExec.mockImplementation(async (_id: string, cmd: string) => {
      if (cmd.includes('wc -l')) return [true, '2\n'];
      return [true, ''];
    });

    const result = await recordAndAnalyzeExecution('sandbox-1', makeExecution());
    expect(result).not.toBeNull();
    expect(result!.executionRecorded).toBe(true);
    expect(result!.toolCallCount).toBe(1);
  });

  test('returns null when dockerExec write fails', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';
    mockDockerExec.mockImplementation(async (_id: string, cmd: string) => {
      if (cmd.includes('mkdir')) return [true, ''];
      if (cmd.includes('echo')) return [false, 'error'];
      return [true, '0\n'];
    });

    const result = await recordAndAnalyzeExecution('sandbox-1', makeExecution());
    expect(result).toBeNull();
  });

  test('handles dockerExec failure gracefully', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';
    mockDockerExec.mockImplementation(async () => { throw new Error('Docker failed'); });

    const result = await recordAndAnalyzeExecution('sandbox-1', makeExecution());
    expect(result).toBeNull();
  });
});

// ── listSkills ───────────────────────────────────────────────────────────────

describe('listSkills', () => {
  test('returns empty when disabled', async () => {
    const skills = await listSkills('sandbox-1');
    expect(skills).toEqual([]);
  });

  test('parses dockerExec output into skill names', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';
    mockDockerExec.mockImplementation(async () => [true, 'analyze\nreport\nbrowse\n']);

    const skills = await listSkills('sandbox-1');
    expect(skills).toEqual(['analyze', 'report', 'browse']);
  });

  test('returns empty on dockerExec failure', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';
    mockDockerExec.mockImplementation(async () => [false, '']);

    const skills = await listSkills('sandbox-1');
    expect(skills).toEqual([]);
  });

  test('handles error gracefully', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';
    mockDockerExec.mockImplementation(async () => { throw new Error('boom'); });

    const skills = await listSkills('sandbox-1');
    expect(skills).toEqual([]);
  });
});
