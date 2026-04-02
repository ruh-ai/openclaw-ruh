import { describe, expect, test } from 'bun:test';

import {
  extractToolEventsFromTranscript,
  resolveSessionTranscriptFile,
} from '../../src/sessionToolTranscript';

describe('resolveSessionTranscriptFile', () => {
  test('returns the session file path for a session key', () => {
    const indexJson = JSON.stringify({
      'agent:main:conv-1': {
        sessionId: 'session-1',
        sessionFile: '/root/.openclaw/agents/main/sessions/session-1.jsonl',
      },
    });

    expect(resolveSessionTranscriptFile(indexJson, 'agent:main:conv-1')).toBe(
      '/root/.openclaw/agents/main/sessions/session-1.jsonl',
    );
  });

  test('returns null when the session key is missing', () => {
    expect(resolveSessionTranscriptFile('{}', 'agent:main:missing')).toBeNull();
  });
});

describe('extractToolEventsFromTranscript', () => {
  test('replays only the latest run tool events after the last user turn', () => {
    const transcript = [
      JSON.stringify({
        type: 'message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'old request' }],
        },
      }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'tool-old',
              name: 'exec',
              arguments: { command: 'pwd' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'tool-old',
          toolName: 'exec',
          content: [{ type: 'text', text: '/root/.openclaw/workspace' }],
        },
      }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'latest request' }],
        },
      }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'tool-new',
              name: 'exec',
              arguments: { command: 'ls -la' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'tool-new',
          toolName: 'exec',
          content: [{ type: 'text', text: 'file-a\nfile-b' }],
        },
      }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
        },
      }),
    ].join('\n');

    expect(extractToolEventsFromTranscript(transcript)).toEqual([
      {
        type: 'tool_start',
        tool: 'exec',
        name: 'exec',
        input: 'ls -la',
        toolCallId: 'tool-new',
      },
      {
        type: 'tool_end',
        tool: 'exec',
        name: 'exec',
        output: 'file-a\nfile-b',
        toolCallId: 'tool-new',
      },
    ]);
  });

  test('uses details output when the tool result has no text content', () => {
    const transcript = [
      JSON.stringify({
        type: 'message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'screenshot' }],
        },
      }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'tool-browser',
              name: 'browser_navigate',
              arguments: { url: 'https://ruh.ai' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'tool-browser',
          toolName: 'browser_navigate',
          details: { aggregated: 'navigated successfully' },
        },
      }),
    ].join('\n');

    expect(extractToolEventsFromTranscript(transcript)).toEqual([
      {
        type: 'tool_start',
        tool: 'browser_navigate',
        name: 'browser_navigate',
        input: 'https://ruh.ai',
        toolCallId: 'tool-browser',
      },
      {
        type: 'tool_end',
        tool: 'browser_navigate',
        name: 'browser_navigate',
        output: 'navigated successfully',
        toolCallId: 'tool-browser',
      },
    ]);
  });
});
