import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ExecutionSummary } from '../../src/chatPersistence';

const dockerExecMock = mock(async (_sandboxId: string, _command: string) => [true, '']);

mock.module('../../src/docker', () => ({
  dockerExec: dockerExecMock,
}));

const originalOpenspaceEnabled = process.env.OPENSPACE_MCP_ENABLED;
const client = await import('../../src/openspaceClient');

function makeExecution(overrides: Partial<ExecutionSummary> = {}): ExecutionSummary {
  return {
    responseContent: 'Completed the Slack workflow successfully.',
    toolCalls: [
      { tool: 'slack.read', detail: 'read channel', elapsedMs: 120, status: 'ok' },
      { tool: 'slack.reply', detail: 'post reply', elapsedMs: 80, status: 'ok' },
    ],
    totalToolCalls: 2,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.OPENSPACE_MCP_ENABLED = 'true';
  dockerExecMock.mockReset();
  dockerExecMock.mockImplementation(async () => [true, '']);
});

describe('openspaceClient', () => {
  test('isEnabled reflects config state', () => {
    process.env.OPENSPACE_MCP_ENABLED = 'false';

    expect(client.isEnabled()).toBe(false);
  });

  test('recordAndAnalyzeExecution short-circuits when disabled or when there are no tool calls', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'false';

    expect(await client.recordAndAnalyzeExecution('sandbox-1', makeExecution())).toBeNull();
    expect(dockerExecMock).not.toHaveBeenCalled();

    process.env.OPENSPACE_MCP_ENABLED = 'true';

    expect(await client.recordAndAnalyzeExecution('sandbox-1', makeExecution({
      totalToolCalls: 0,
      toolCalls: [],
    }))).toBeNull();
    expect(dockerExecMock).not.toHaveBeenCalled();
  });

  test('returns null when it cannot write the execution log', async () => {
    dockerExecMock
      .mockImplementationOnce(async () => [true, ''])
      .mockImplementationOnce(async () => [false, '']);

    const result = await client.recordAndAnalyzeExecution('sandbox-1', makeExecution());

    expect(result).toBeNull();
    expect(dockerExecMock.mock.calls[1]?.[1]).toContain('/root/agent/.execution-logs/');
  });

  test('records executions and proposes a captured skill when a tool sequence repeats', async () => {
    const originalDateNow = Date.now;
    Date.now = () => 1_717_171_717_000;

    dockerExecMock
      .mockImplementationOnce(async () => [true, ''])
      .mockImplementationOnce(async () => [true, ''])
      .mockImplementationOnce(async () => [true, '5\n'])
      .mockImplementationOnce(async () => [true, '4\n'])
      .mockImplementationOnce(async () => [true, [
        JSON.stringify({ toolCalls: [{ tool: 'slack.read' }, { tool: 'slack.reply' }] }),
        JSON.stringify({ toolCalls: [{ tool: 'slack.read' }, { tool: 'slack.reply' }] }),
        JSON.stringify({ toolCalls: [{ tool: 'slack.read' }, { tool: 'slack.reply' }] }),
      ].join('\n---SEPARATOR---\n')]);

    const result = await client.recordAndAnalyzeExecution('sandbox-1', makeExecution({
      responseContent: 'x'.repeat(2_500),
    }));

    Date.now = originalDateNow;

    expect(result).toEqual(expect.objectContaining({
      executionRecorded: true,
      existingSkillCount: 5,
      toolCallCount: 2,
    }));
    expect(result?.evolvedSkills).toEqual([
      expect.objectContaining({
        evolutionType: 'CAPTURED',
        version: 1,
        name: 'slack.read workflow (2 steps)',
        skillId: 'captured-slackread-slackreply-1717171717000',
        skillDir: '/root/agent/skills/slackread-slackreply',
      }),
    ]);

    const writeCommand = String(dockerExecMock.mock.calls[1]?.[1]);
    expect(writeCommand).toContain('responseSummary');
    expect(writeCommand).toContain('xxxxxxxxxx');
  });

  test('returns null when docker operations throw unexpectedly', async () => {
    dockerExecMock.mockImplementationOnce(async () => {
      throw new Error('docker offline');
    });

    const result = await client.recordAndAnalyzeExecution('sandbox-1', makeExecution());

    expect(result).toBeNull();
  });

  test('listSkills returns parsed skill directories when available', async () => {
    dockerExecMock.mockImplementationOnce(async () => [true, 'alpha\nbeta\n\n']);
    const result = await client.listSkills('sandbox-1');

    expect(result).toEqual(['alpha', 'beta']);
  });

  test('listSkills returns an empty array when disabled or when the command fails', async () => {
    process.env.OPENSPACE_MCP_ENABLED = 'false';
    expect(await client.listSkills('sandbox-1')).toEqual([]);

    process.env.OPENSPACE_MCP_ENABLED = 'true';
    dockerExecMock.mockImplementationOnce(async () => [false, '']);

    expect(await client.listSkills('sandbox-1')).toEqual([]);
  });
});

afterAll(() => {
  if (originalOpenspaceEnabled === undefined) {
    delete process.env.OPENSPACE_MCP_ENABLED;
  } else {
    process.env.OPENSPACE_MCP_ENABLED = originalOpenspaceEnabled;
  }
});
