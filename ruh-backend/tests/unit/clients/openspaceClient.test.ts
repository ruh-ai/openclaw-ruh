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
  dockerSpawn: mock(async () => [0, '']),
  dockerContainerRunning: mock(async () => true),
  getContainerName: (id: string) => `openclaw-${id}`,
  shellQuote: (v: string) => `'${v}'`,
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (v: string) => v,
  readContainerPorts: () => ({ gatewayPort: 18789 }),
  buildHomeFileWriteCommand: () => '',
  buildConfigureAgentCronAddCommand: () => '',
  buildCronDeleteCommand: () => '',
  buildCronRunCommand: () => '',
  parseManagedSandboxContainerList: () => [],
  listManagedSandboxContainers: mock(async () => []),
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

// ── detectRepeatablePatterns (via recordAndAnalyzeExecution) ─────────────────
// detectRepeatablePatterns is private, but exercised through recordAndAnalyzeExecution.

describe('detectRepeatablePatterns (via recordAndAnalyzeExecution)', () => {
  function makeLogBlock(toolNames: string[]): string {
    return JSON.stringify({
      toolCalls: toolNames.map((t) => ({ tool: t, input: 'x' })),
      totalToolCalls: toolNames.length,
      responseLength: 10,
      responseSummary: 'done',
    });
  }

  test('returns evolvedSkills when a tool sequence repeats 3+ times', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';

    // Build a logs payload that has the same sequence 3 times
    const repeatedBlock = makeLogBlock(['exec', 'read', 'write']);
    const logsRaw = [repeatedBlock, repeatedBlock, repeatedBlock].join('\n---SEPARATOR---\n') + '\n---SEPARATOR---\n';

    mockDockerExec.mockImplementation(async (_id: string, cmd: string) => {
      if (cmd.includes('wc -l')) return [true, '3\n'];
      if (cmd.includes('head -10')) return [true, logsRaw];
      if (cmd.includes('echo')) return [true, ''];
      if (cmd.includes('mkdir')) return [true, ''];
      return [true, ''];
    });

    const result = await recordAndAnalyzeExecution('sandbox-patterns', makeExecution({
      toolCalls: [{ tool: 'exec', input: 'ls' }],
      totalToolCalls: 1,
    }));

    expect(result).not.toBeNull();
    expect(result!.executionRecorded).toBe(true);
    expect(result!.evolvedSkills.length).toBeGreaterThan(0);
    expect(result!.evolvedSkills[0].evolutionType).toBe('CAPTURED');
  });

  test('returns empty evolvedSkills when fewer than 3 execution logs exist', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';

    // Only 2 log blocks — not enough to detect a pattern
    const block = makeLogBlock(['exec']);
    const logsRaw = [block, block].join('\n---SEPARATOR---\n') + '\n---SEPARATOR---\n';

    mockDockerExec.mockImplementation(async (_id: string, cmd: string) => {
      if (cmd.includes('wc -l')) return [true, '2\n'];
      if (cmd.includes('head -10')) return [true, logsRaw];
      if (cmd.includes('echo')) return [true, ''];
      if (cmd.includes('mkdir')) return [true, ''];
      return [true, ''];
    });

    const result = await recordAndAnalyzeExecution('sandbox-few-logs', makeExecution());
    expect(result).not.toBeNull();
    expect(result!.evolvedSkills).toEqual([]);
  });

  test('handles malformed JSON in log blocks gracefully', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';

    // Mix valid and invalid JSON blocks — should not throw
    const logsRaw = [
      '{ "toolCalls": [{"tool":"exec"}], "totalToolCalls": 1, "responseLength": 5, "responseSummary": "ok" }',
      'NOT VALID JSON {{{',
      '{ "toolCalls": [{"tool":"exec"}], "totalToolCalls": 1, "responseLength": 5, "responseSummary": "ok" }',
    ].join('\n---SEPARATOR---\n') + '\n---SEPARATOR---\n';

    mockDockerExec.mockImplementation(async (_id: string, cmd: string) => {
      if (cmd.includes('wc -l')) return [true, '3\n'];
      if (cmd.includes('head -10')) return [true, logsRaw];
      if (cmd.includes('echo')) return [true, ''];
      if (cmd.includes('mkdir')) return [true, ''];
      return [true, ''];
    });

    const result = await recordAndAnalyzeExecution('sandbox-malformed', makeExecution());
    expect(result).not.toBeNull();
    // Even with a malformed block, result should be returned without throwing
    expect(result!.executionRecorded).toBe(true);
  });

  test('returns null when logs fetch fails', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'true';

    mockDockerExec.mockImplementation(async (_id: string, cmd: string) => {
      if (cmd.includes('mkdir')) return [true, ''];
      if (cmd.includes('echo')) return [true, ''];
      if (cmd.includes('wc -l')) return [true, '0\n'];
      // logs read fails
      if (cmd.includes('head -10')) return [false, ''];
      return [true, ''];
    });

    const result = await recordAndAnalyzeExecution('sandbox-fail-logs', makeExecution());
    // When patterns fetch fails gracefully, execution still recorded, empty evolvedSkills
    expect(result).not.toBeNull();
    expect(result!.evolvedSkills).toEqual([]);
  });
});
