import { describe, expect, test } from 'bun:test';

import {
  getPersistedAssistantMessageFromResponse,
  getPersistedUserMessage,
  StreamingChatPersistenceCollector,
} from '../../src/chatPersistence';

describe('chatPersistence', () => {
  test('extracts the latest user message for persistence', () => {
    expect(getPersistedUserMessage([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'latest' },
    ])).toEqual({
      role: 'user',
      content: 'latest',
    });
  });

  test('extracts the first assistant choice from a non-streaming chat response', () => {
    expect(getPersistedAssistantMessageFromResponse({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello there!',
          },
        },
      ],
    })).toEqual({
      role: 'assistant',
      content: 'Hello there!',
    });
  });

  test('collects streamed assistant deltas and browser workspace state until [DONE]', () => {
    let tick = 1_700_000_000_000;
    const collector = new StreamingChatPersistenceCollector(() => tick++);

    collector.consumeLine('data: {"choices":[{"delta":{"content":"Hello"}}]}');
    collector.consumeLine('data: {"choices":[{"delta":{"content":" there"}}]}');
    collector.consumeLine('data: {"browser":{"type":"preview","url":"https://preview.example.com","label":"Preview"}}');
    collector.consumeLine('data: {"browser_event":{"type":"takeover_requested","reason":"Login required","action_label":"Resume after login"}}');
    collector.consumeLine('data: [DONE]');

    expect(collector.hasCompleted()).toBe(true);
    expect(collector.buildAssistantMessage()).toEqual({
      role: 'assistant',
      content: 'Hello there',
      workspace_state: {
        version: 1,
        browser: {
          items: [
            {
              id: 0,
              kind: 'preview',
              label: 'Preview',
              url: 'https://preview.example.com',
              detail: undefined,
              timestamp: 1_700_000_000_000,
            },
          ],
          previewUrl: 'https://preview.example.com',
          takeover: {
            status: 'requested',
            reason: 'Login required',
            actionLabel: 'Resume after login',
            updatedAt: 1_700_000_000_001,
          },
        },
      },
    });
  });

  test('does not finalize a streamed message before the terminal done marker', () => {
    const collector = new StreamingChatPersistenceCollector();
    collector.consumeLine('data: {"choices":[{"delta":{"content":"Partial"}}]}');

    expect(collector.hasCompleted()).toBe(false);
    expect(collector.buildAssistantMessage()).toBeNull();
  });

  test('collects streamed task-plan and terminal replay state until [DONE]', () => {
    let tick = 1_700_000_100_000;
    const collector = new StreamingChatPersistenceCollector(() => tick++);

    collector.consumeLine('event: tool_start');
    collector.consumeLine('data: {"tool":"bash","input":"ls -la"}');
    collector.consumeLine('data: {"choices":[{"delta":{"content":"<plan>\\n- [x] Inspect account\\n- [ ] Draft report\\n</plan>"}}]}');
    collector.consumeLine('event: tool_end');
    collector.consumeLine('data: {"tool":"bash"}');
    collector.consumeLine('data: [DONE]');

    expect(collector.buildAssistantMessage()).toEqual({
      role: 'assistant',
      content: '<plan>\n- [x] Inspect account\n- [ ] Draft report\n</plan>',
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
              startedAt: 1_700_000_100_000,
              elapsedMs: 1,
            },
          ],
        },
      },
    });
  });
});
