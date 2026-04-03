import { describe, expect, test } from 'bun:test';
import { parseJsonOutput } from '../../../src/utils';

describe('parseJsonOutput', () => {
  test('parses a multiline JSON array when trailing log noise follows the payload', () => {
    const output = [
      'probe: starting channel status check',
      '[',
      '  {',
      '    "channel": "telegram",',
      '    "ok": true',
      '  }',
      ']',
      'post-run log line',
    ].join('\n');

    expect(parseJsonOutput(output)).toEqual([
      {
        channel: 'telegram',
        ok: true,
      },
    ]);
  });
});
