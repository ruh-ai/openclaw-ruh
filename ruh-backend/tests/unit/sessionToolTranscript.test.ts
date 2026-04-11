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

  test('returns empty array when transcript is empty', () => {
    expect(extractToolEventsFromTranscript('')).toEqual([]);
    expect(extractToolEventsFromTranscript('   \n  ')).toEqual([]);
  });

  test('skips malformed JSON lines without throwing', () => {
    const transcript = [
      'NOT VALID JSON {{{',
      JSON.stringify({
        type: 'message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
        },
      }),
      'ALSO NOT JSON',
      JSON.stringify({
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 't1', name: 'exec', arguments: { command: 'pwd' } }],
        },
      }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 't1',
          toolName: 'exec',
          content: [{ type: 'text', text: '/root' }],
        },
      }),
    ].join('\n');

    const events = extractToolEventsFromTranscript(transcript);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('tool_start');
    expect(events[1].type).toBe('tool_end');
  });

  test('ignores tool results with missing toolName', () => {
    const transcript = [
      JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'tc1',
          toolName: '',  // empty — should be skipped
          content: [{ type: 'text', text: 'result' }],
        },
      }),
    ].join('\n');

    expect(extractToolEventsFromTranscript(transcript)).toEqual([]);
  });

  test('uses JSON.stringify for arguments objects with no known key', () => {
    const transcript = [
      JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'assistant',
          content: [{
            type: 'toolCall',
            id: 't-obj',
            name: 'custom_tool',
            arguments: { alpha: 'x', beta: 'y' },
          }],
        },
      }),
    ].join('\n');

    const events = extractToolEventsFromTranscript(transcript);
    expect(events).toHaveLength(1);
    expect(events[0].input).toContain('alpha');
  });

  test('uses details.output key when present', () => {
    const transcript = [
      JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'td1',
          toolName: 'read_file',
          details: { output: 'file contents here' },
        },
      }),
    ].join('\n');

    const events = extractToolEventsFromTranscript(transcript);
    expect(events).toHaveLength(1);
    expect(events[0].output).toBe('file contents here');
  });

  test('uses details.result key as fallback', () => {
    const transcript = [
      JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'tr1',
          toolName: 'compute',
          details: { result: '42' },
        },
      }),
    ].join('\n');

    const events = extractToolEventsFromTranscript(transcript);
    expect(events).toHaveLength(1);
    expect(events[0].output).toBe('42');
  });

  test('uses details object as JSON when no known string key exists', () => {
    const transcript = [
      JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'td2',
          toolName: 'complex_tool',
          details: { nested: { value: 123 } },
        },
      }),
    ].join('\n');

    const events = extractToolEventsFromTranscript(transcript);
    expect(events).toHaveLength(1);
    expect(events[0].output).toContain('nested');
  });

  test('resolveSessionTranscriptFile returns null for invalid JSON', () => {
    expect(resolveSessionTranscriptFile('NOT JSON', 'agent:main:x')).toBeNull();
    expect(resolveSessionTranscriptFile('null', 'agent:main:x')).toBeNull();
    expect(resolveSessionTranscriptFile('"string"', 'agent:main:x')).toBeNull();
  });

  test('resolveSessionTranscriptFile returns null when sessionFile is missing', () => {
    const indexJson = JSON.stringify({ 'agent:main:s1': { sessionId: 's1' } });
    expect(resolveSessionTranscriptFile(indexJson, 'agent:main:s1')).toBeNull();
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
