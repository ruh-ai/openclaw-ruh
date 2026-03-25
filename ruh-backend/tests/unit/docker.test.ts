import { afterEach, describe, expect, mock, test } from 'bun:test';

import { dockerContainerRunning, joinShellArgs, normalizePathSegment, shellQuote } from '../../src/docker';

const originalSpawn = Bun.spawn;

function streamFromText(text: string) {
  return new Response(text).body as ReadableStream<Uint8Array>;
}

afterEach(() => {
  Bun.spawn = originalSpawn;
});

describe('shellQuote', () => {
  test('preserves shell metacharacters as literal data', () => {
    expect(shellQuote(`a'; rm -rf /; echo '`)).toBe(`'a'"'"'; rm -rf /; echo '"'"''`);
    expect(shellQuote('$(touch /tmp/pwned) && echo ok')).toBe(`'$(touch /tmp/pwned) && echo ok'`);
    expect(shellQuote('line one\nline two')).toBe(`'line one
line two'`);
  });
});

describe('joinShellArgs', () => {
  test('joins literal args without exposing shell syntax', () => {
    expect(joinShellArgs(['openclaw', 'cron', 'rm', '$(rm -rf /)'])).toBe(
      `openclaw cron rm '$(rm -rf /)'`,
    );
  });
});

describe('normalizePathSegment', () => {
  test('rewrites traversal and separator-heavy skill ids into one safe segment', () => {
    expect(normalizePathSegment('../skills/../../evil name')).toBe('skills-evil-name');
  });

  test('rejects empty normalized segments', () => {
    expect(() => normalizePathSegment('////')).toThrow('Path segment is required');
  });
});

describe('dockerContainerRunning', () => {
  test('returns true when docker inspect reports a running container', async () => {
    Bun.spawn = mock(() => ({
      stdout: streamFromText('true\n'),
      stderr: streamFromText(''),
      exited: Promise.resolve(0),
      exitCode: 0,
    })) as typeof Bun.spawn;

    await expect(dockerContainerRunning('openclaw-sb-1')).resolves.toBe(true);
  });

  test('returns false when docker inspect fails or reports a stopped container', async () => {
    Bun.spawn = mock(() => ({
      stdout: streamFromText('false\n'),
      stderr: streamFromText('Error: No such container'),
      exited: Promise.resolve(1),
      exitCode: 1,
    })) as typeof Bun.spawn;

    await expect(dockerContainerRunning('openclaw-sb-1')).resolves.toBe(false);
  });
});
