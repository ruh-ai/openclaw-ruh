import { describe, expect, test, mock, beforeEach } from 'bun:test';

const mockDockerExec = mock<(container: string, cmd: string, timeout?: number) => Promise<[boolean, string]>>();
mock.module('../../src/docker', () => ({
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

const { runAgentSetup } = await import('../../src/agentSetup');

beforeEach(() => { mockDockerExec.mockReset(); });

const log = () => {};

describe('runAgentSetup — condition checking', () => {
  test('skips setup step when file condition is not met (regression: condition always passing)', async () => {
    // This is the exact scenario that caused the bug: setup.json has a migrate step
    // with condition "file:db/migrations", but db/ directory doesn't exist.
    // Before the fix, checkCondition always returned true because the shell command
    // `test -e ... && echo YES || echo NO` always exits 0, and the code checked
    // the exit code instead of the output.
    const manifest = JSON.stringify({
      schemaVersion: 1,
      install: 'npm install',
      setup: [
        {
          name: 'migrate',
          command: 'npm run db:migrate',
          condition: 'file:db/migrations',
        },
      ],
      services: [],
    });

    const calls: string[] = [];
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      calls.push(cmd);
      // Reading setup.json
      if (cmd.includes('setup.json')) return [true, manifest];
      // Condition check: file doesn't exist → output is "NO"
      if (cmd.includes('test -e') && cmd.includes('db/migrations')) return [true, 'NO'];
      // npm install succeeds
      if (cmd.includes('npm install')) return [true, 'ok'];
      // migrate command — should NOT be called
      if (cmd.includes('db:migrate')) return [false, 'ERR_MODULE_NOT_FOUND'];
      return [true, ''];
    });

    const result = await runAgentSetup('sandbox-1', log);

    // The migrate step should have been skipped
    const migrateStep = result.setup.find((s) => s.name === 'migrate');
    expect(migrateStep).toBeDefined();
    expect(migrateStep!.skipped).toBe(true);
    expect(migrateStep!.ok).toBe(true);

    // Verify the migrate command was never executed
    const migrateCalls = calls.filter((c) => c.includes('db:migrate'));
    expect(migrateCalls).toHaveLength(0);
  });

  test('runs setup step when file condition IS met', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      setup: [
        {
          name: 'migrate',
          command: 'npm run db:migrate',
          condition: 'file:db/migrations',
        },
      ],
      services: [],
    });

    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('setup.json')) return [true, manifest];
      // Condition check: file exists → output is "YES"
      if (cmd.includes('test -e') && cmd.includes('db/migrations')) return [true, 'YES'];
      // migrate command succeeds
      if (cmd.includes('db:migrate')) return [true, 'Migrations complete'];
      return [true, ''];
    });

    const result = await runAgentSetup('sandbox-1', log);

    const migrateStep = result.setup.find((s) => s.name === 'migrate');
    expect(migrateStep).toBeDefined();
    expect(migrateStep!.skipped).toBeUndefined();
    expect(migrateStep!.ok).toBe(true);
    expect(mockDockerExec.mock.calls.some(([, cmd]) =>
      cmd.includes('set -a; . $HOME/.openclaw/.env') && cmd.includes('npm run db:migrate'),
    )).toBe(true);
  });

  test('runs setup step with no condition (unconditional)', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      setup: [
        {
          name: 'build',
          command: 'npm run build',
        },
      ],
      services: [],
    });

    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('setup.json')) return [true, manifest];
      if (cmd.includes('npm run build')) return [true, 'Build complete'];
      return [true, ''];
    });

    const result = await runAgentSetup('sandbox-1', log);

    const buildStep = result.setup.find((s) => s.name === 'build');
    expect(buildStep).toBeDefined();
    expect(buildStep!.ok).toBe(true);
    expect(buildStep!.skipped).toBeUndefined();
  });

  test('cleans invalid npm omit config before installing dependencies', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      install: 'NODE_ENV=development npm install --include=dev',
      services: [],
    });

    const calls: string[] = [];
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      calls.push(cmd);
      if (cmd.includes('setup.json')) return [true, manifest];
      if (cmd.includes('npm install')) return [true, 'installed'];
      return [true, ''];
    });

    const result = await runAgentSetup('sandbox-1', log);

    expect(result.install?.ok).toBe(true);
    const installCommand = calls.find((cmd) => cmd.includes('npm install'));
    expect(installCommand).toContain('sed -i "/^omit[[:space:]]*=[[:space:]]*$/d" .npmrc');
    expect(installCommand).toContain('npm config delete omit --location=project');
    expect(installCommand).toContain('NODE_ENV=development npm install --include=dev');
  });
});

describe('runAgentSetup — local Postgres bootstrap', () => {
  test('writes a passworded DATABASE_URL for pg SCRAM authentication', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      requires: { postgres: true },
      services: [],
    });

    const calls: string[] = [];
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      calls.push(cmd);
      if (cmd.includes('setup.json')) return [true, manifest];
      if (cmd.includes('which pg_isready')) return [true, 'NO'];
      if (cmd.includes('apt-get install')) return [true, 'installed'];
      if (cmd.includes('pg_ctlcluster')) return [true, 'started'];
      if (cmd === 'pg_isready') return [true, 'accepting connections'];
      return [true, ''];
    });

    const result = await runAgentSetup('sandbox-1', log);

    expect(result.infrastructure[0]?.ok).toBe(true);
    const startCommand = calls.find((cmd) => cmd.includes('pg_ctlcluster'));
    expect(startCommand).toContain("ALTER USER root WITH PASSWORD 'root'");
    expect(startCommand).toContain('DATABASE_URL=postgresql://root:root@localhost:5432/agent');
  });

  test('refreshes DATABASE_URL when PostgreSQL is already running', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      requires: { postgres: true },
      services: [],
    });

    const calls: string[] = [];
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      calls.push(cmd);
      if (cmd.includes('setup.json')) return [true, manifest];
      if (cmd.includes('which pg_isready')) return [true, 'YES'];
      if (cmd.includes('pg_isready 2>/dev/null && echo YES')) return [true, 'YES'];
      if (cmd.includes('pg_isready >/dev/null')) return [true, 'configured'];
      if (cmd === 'pg_isready') return [true, 'accepting connections'];
      return [true, ''];
    });

    const result = await runAgentSetup('sandbox-1', log);

    expect(result.infrastructure[0]?.ok).toBe(true);
    expect(calls.some((cmd) => cmd.includes('apt-get install'))).toBe(false);
    const configureCommand = calls.find((cmd) => cmd.includes('ALTER USER root'));
    expect(configureCommand).toContain("ALTER USER root WITH PASSWORD 'root'");
    expect(configureCommand).toContain('DATABASE_URL=postgresql://root:root@localhost:5432/agent');
  });
});

describe('runAgentSetup — service startup', () => {
  test('does not try to nohup an optional shared-port service with an empty command', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      services: [
        {
          name: 'dashboard',
          command: '',
          port: 3100,
          healthCheck: '/health',
          optional: true,
        },
      ],
    });

    const calls: string[] = [];
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      calls.push(cmd);
      if (cmd.includes('setup.json')) return [true, manifest];
      if (cmd.includes('curl -sf http://localhost:3100/health')) return [true, 'OK'];
      return [true, ''];
    });

    const result = await runAgentSetup('sandbox-1', log);

    expect(result.ok).toBe(true);
    expect(result.services).toEqual([
      {
        name: 'dashboard',
        started: true,
        port: 3100,
        healthy: true,
        optional: true,
        error: undefined,
      },
    ]);
    expect(calls.some((cmd) => cmd.includes('nohup'))).toBe(false);
    expect(calls.some((cmd) => cmd.includes('fuser -k 3100/tcp'))).toBe(false);
  });

  test('starts real services with detached stdio before polling health', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      services: [
        {
          name: 'backend',
          command: 'env PORT=3100 npx tsx backend/index.ts',
          port: 3100,
          healthCheck: '/health',
        },
      ],
    });

    const calls: string[] = [];
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      calls.push(cmd);
      if (cmd.includes('setup.json')) return [true, manifest];
      if (cmd.includes('nohup')) return [true, ''];
      if (cmd.includes('curl -sf http://localhost:3100/health')) return [true, 'OK'];
      return [true, ''];
    });

    const result = await runAgentSetup('sandbox-1', log);

    expect(result.ok).toBe(true);
    expect(result.services[0]?.healthy).toBe(true);
    const startCommand = calls.find((cmd) => cmd.includes('nohup'));
    expect(startCommand).toContain('nohup sh -c');
    expect(startCommand).toContain('< /dev/null');
  });
});
