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
});
