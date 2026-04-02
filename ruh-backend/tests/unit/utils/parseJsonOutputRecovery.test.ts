import { describe, expect, test } from 'bun:test';
import { parseJsonOutput } from '../../../src/utils';

describe('parseJsonOutput', () => {
  test('skips malformed earlier JSON-like blocks and parses a later valid payload', () => {
    const output = [
      'probe: starting status check',
      '{',
      '  "partial": true,',
      '  "note": "unterminated candidate"',
      'not valid json at all',
      '{"jobs":[{"id":"job-1","enabled":true}]}',
      'post-run log line',
    ].join('\n');

    expect(parseJsonOutput(output)).toEqual({
      jobs: [{ id: 'job-1', enabled: true }],
    });
  });
});
