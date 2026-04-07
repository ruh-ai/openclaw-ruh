/**
 * Shared mock for src/docker — used by route tests that need to mock Docker operations.
 *
 * Same pattern as mockDb.ts: bun's mock.module() is process-global, so only the
 * first call for a resolved path wins. This helper is the ONE place that mocks
 * docker.ts. Test files import the mocks from here and configure per-test behavior
 * via mockImplementation/mockResolvedValue.
 */

import { mock } from 'bun:test';

export const dockerExecMock = mock(async (_containerName: string, _cmd: string, _timeout?: number) =>
  [true, ''] as [boolean, string],
);

export const dockerSpawnMock = mock(async (_args: string[], _timeout?: number) =>
  [0, ''] as [number, string],
);

export const dockerContainerRunningMock = mock(async (_name: string) => true);

export const listManagedSandboxContainersMock = mock(async () => [] as Array<{
  sandbox_id: string;
  container_name: string;
  state: string;
  running: boolean;
  status: string;
}>);

export const buildHomeFileWriteCommandMock = mock(
  (path: string, content: string) => `WRITE ${path}\n${content}`,
);

mock.module('../../src/docker', () => ({
  getContainerName: (id: string) => `openclaw-${id}`,
  dockerExec: dockerExecMock,
  dockerSpawn: dockerSpawnMock,
  dockerContainerRunning: dockerContainerRunningMock,
  listManagedSandboxContainers: listManagedSandboxContainersMock,
  buildConfigureAgentCronAddCommand: mock((job: { name: string; schedule: string; message: string }) =>
    `cron add --name ${job.name} --cron ${job.schedule} --message ${job.message}`,
  ),
  buildCronDeleteCommand: mock((jobId: string) => `cron delete ${jobId}`),
  buildCronRunCommand: mock((jobId: string) => `cron run ${jobId}`),
  buildHomeFileWriteCommand: buildHomeFileWriteCommandMock,
  shellQuote: (v: string) => `'${v}'`,
  joinShellArgs: (args: Array<string | number>) => args.map(String).join(' '),
  normalizePathSegment: (v: string) => v,
  parseManagedSandboxContainerList: mock(() => []),
}));
