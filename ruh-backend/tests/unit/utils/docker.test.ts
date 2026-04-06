import { afterEach, describe, expect, mock, test } from 'bun:test';

const {
  buildConfigureAgentCronAddCommand,
  buildCronDeleteCommand,
  buildCronRunCommand,
  buildHomeFileWriteCommand,
  dockerContainerRunning,
  dockerExec,
  dockerSpawn,
  getContainerName,
  joinShellArgs,
  listManagedSandboxContainers,
  normalizePathSegment,
  parseManagedSandboxContainerList,
  shellQuote,
} = await import('../../../src/docker?unitDocker');

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

describe('getContainerName', () => {
  test('prefixes sandbox ids consistently', () => {
    expect(getContainerName('sb-123')).toBe('openclaw-sb-123');
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

describe('command builders', () => {
  test('buildHomeFileWriteCommand writes under $HOME with shell-escaped content', () => {
    expect(buildHomeFileWriteCommand('skills/test.md', "hello 'world'")).toBe(
      `mkdir -p $HOME/skills && printf %s 'hello '"'"'world'"'"'' > $HOME/skills/test.md`,
    );
  });

  test('buildHomeFileWriteCommand rejects unsafe relative paths', () => {
    expect(() => buildHomeFileWriteCommand('../skills/test.md', 'x')).toThrow(
      'Relative path must contain only safe characters',
    );
    expect(() => buildHomeFileWriteCommand('skills/test?.md', 'x')).toThrow(
      'Relative path must contain only safe characters',
    );
  });

  test('buildConfigureAgentCronAddCommand quotes user-controlled cron fields', () => {
    expect(buildConfigureAgentCronAddCommand({
      name: 'Nightly Report',
      schedule: '0 0 * * *',
      message: 'run report && notify',
    })).toBe(
      `openclaw cron add --name 'Nightly Report' --cron '0 0 * * *' --message 'run report && notify' 2>&1`,
    );
  });

  test('buildCronDeleteCommand and buildCronRunCommand append stderr redirection', () => {
    expect(buildCronDeleteCommand('job-123')).toBe('openclaw cron rm job-123 2>&1');
    expect(buildCronRunCommand('$(unsafe)')).toBe(`openclaw cron run '$(unsafe)' 2>&1`);
  });
});

describe('dockerSpawn', () => {
  test('returns the combined stdout/stderr payload with the exit code', async () => {
    Bun.spawn = mock((args: string[]) => {
      expect(args).toEqual(['docker', 'ps', '-a']);
      return {
        stdout: streamFromText('stdout line\n'),
        stderr: streamFromText('stderr line\n'),
        exited: Promise.resolve(0),
        exitCode: 0,
      };
    }) as typeof Bun.spawn;

    await expect(dockerSpawn(['ps', '-a'])).resolves.toEqual([0, 'stdout line\nstderr line']);
  });
});

describe('dockerExec', () => {
  test('returns success=true only for zero exit codes and shells through bash -c', async () => {
    Bun.spawn = mock((args: string[]) => {
      expect(args).toEqual(['docker', 'exec', 'openclaw-sb-1', 'bash', '-c', 'echo ok']);
      return {
        stdout: streamFromText('ok\n'),
        stderr: streamFromText(''),
        exited: Promise.resolve(0),
        exitCode: 0,
      };
    }) as typeof Bun.spawn;

    await expect(dockerExec('openclaw-sb-1', 'echo ok')).resolves.toEqual([true, 'ok']);
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

describe('parseManagedSandboxContainerList', () => {
  test('keeps only managed openclaw containers and normalizes sandbox ids', () => {
    const parsed = parseManagedSandboxContainerList([
      'openclaw-sb-1\trunning\tUp 5 minutes',
      'postgres\trunning\tUp 1 hour',
      'openclaw-sb-2\texited\tExited (0) 2 minutes ago',
    ].join('\n'));

    expect(parsed).toEqual([
      {
        sandbox_id: 'sb-1',
        container_name: 'openclaw-sb-1',
        state: 'running',
        running: true,
        status: 'Up 5 minutes',
      },
      {
        sandbox_id: 'sb-2',
        container_name: 'openclaw-sb-2',
        state: 'exited',
        running: false,
        status: 'Exited (0) 2 minutes ago',
      },
    ]);
  });
});

describe('listManagedSandboxContainers', () => {
  test('returns parsed managed containers when docker ps succeeds', async () => {
    Bun.spawn = mock(() => ({
      stdout: streamFromText([
        'openclaw-sb-1\trunning\tUp 5 minutes',
        'openclaw-sb-2\texited\tExited (0) 2 minutes ago',
      ].join('\n')),
      stderr: streamFromText(''),
      exited: Promise.resolve(0),
      exitCode: 0,
    })) as typeof Bun.spawn;

    await expect(listManagedSandboxContainers()).resolves.toEqual([
      {
        sandbox_id: 'sb-1',
        container_name: 'openclaw-sb-1',
        state: 'running',
        running: true,
        status: 'Up 5 minutes',
      },
      {
        sandbox_id: 'sb-2',
        container_name: 'openclaw-sb-2',
        state: 'exited',
        running: false,
        status: 'Exited (0) 2 minutes ago',
      },
    ]);
  });

  test('returns an empty array when docker ps fails', async () => {
    Bun.spawn = mock(() => ({
      stdout: streamFromText(''),
      stderr: streamFromText('daemon unavailable'),
      exited: Promise.resolve(1),
      exitCode: 1,
    })) as typeof Bun.spawn;

    await expect(listManagedSandboxContainers()).resolves.toEqual([]);
  });
});
