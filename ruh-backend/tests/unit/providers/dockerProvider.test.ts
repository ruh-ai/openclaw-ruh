/**
 * Unit tests for providers/dockerProvider.ts
 */

import { describe, expect, test, mock, beforeEach, spyOn } from 'bun:test';

type SpawnResult = [number, string];
type ExecResult = [boolean, string];

const spawnCalls: string[][] = [];
const execCalls: Array<[string, string]> = [];

mock.module('../../../src/docker', () => ({
  getContainerName: (id: string) => `openclaw-${id}`,

  dockerSpawn: async (args: string[]): Promise<SpawnResult> => {
    spawnCalls.push([...args]);
    const cmd = args.join(' ');
    if (cmd.startsWith('image inspect ruh-sandbox:latest')) return [0, '[]'];
    if (cmd.startsWith('image inspect node:22-bookworm')) return [0, '[]'];
    if (cmd.includes('port') && cmd.includes('18789')) return [0, '0.0.0.0:32769'];
    if (cmd.includes('port') && cmd.includes('6080')) return [0, '0.0.0.0:32770'];
    if (cmd.includes('port') && cmd.includes('8080')) return [0, '0.0.0.0:32771'];
    if (cmd.includes('inspect -f')) return [0, 'true'];
    return [0, ''];
  },

  dockerExec: async (containerName: string, cmd: string): Promise<ExecResult> => {
    execCalls.push([containerName, cmd]);
    return [true, ''];
  },

  dockerContainerRunning: async (): Promise<boolean> => true,

  listManagedSandboxContainers: async () => [
    { sandbox_id: 'sb-1', container_name: 'openclaw-sb-1', state: 'running', running: true, status: 'Up 10m' },
  ],
}));

spyOn(Bun, 'sleep').mockImplementation(async () => {});

import { DockerProvider } from '../../../src/providers/dockerProvider';

beforeEach(() => {
  spawnCalls.length = 0;
  execCalls.length = 0;
});

describe('DockerProvider', () => {
  const provider = new DockerProvider();

  describe('createInfrastructure', () => {
    test('yields log events and an infra_ready event on success', async () => {
      const events: Array<[string, unknown]> = [];
      for await (const event of provider.createInfrastructure({ envArgs: [], sandboxName: 'test' })) {
        events.push(event as [string, unknown]);
      }

      const logs = events.filter(([t]) => t === 'log');
      const infraReady = events.filter(([t]) => t === 'infra_ready');

      expect(logs.length).toBeGreaterThan(0);
      expect(infraReady.length).toBe(1);

      const infra = infraReady[0][1] as Record<string, unknown>;
      expect(typeof infra.sandboxId).toBe('string');
      expect(infra.gatewayUrl).toBe('http://localhost:32769');
      expect(infra.gatewayHostPort).toBe('32769');
      expect(infra.usingPrebuiltImage).toBe(true);
    });

    test('forwards env args to docker run', async () => {
      const events: Array<[string, unknown]> = [];
      for await (const event of provider.createInfrastructure({
        envArgs: ['-e', 'OPENAI_API_KEY=sk-test'],
        sandboxName: 'test',
      })) {
        events.push(event as [string, unknown]);
      }

      const runCmd = spawnCalls.find((args) => args[0] === 'run');
      expect(runCmd).toBeTruthy();
      expect(runCmd).toContain('-e');
      expect(runCmd).toContain('OPENAI_API_KEY=sk-test');
    });
  });

  describe('exec', () => {
    test('delegates to dockerExec with container name', async () => {
      const [ok, output] = await provider.exec('sb-1', 'echo hello');
      expect(ok).toBe(true);
      expect(execCalls.some(([name]) => name === 'openclaw-sb-1')).toBe(true);
    });
  });

  describe('isRunning', () => {
    test('returns true for running containers', async () => {
      const running = await provider.isRunning('sb-1');
      expect(running).toBe(true);
    });
  });

  describe('stopAndRemove', () => {
    test('calls docker rm -f', async () => {
      await provider.stopAndRemove('sb-1');
      expect(spawnCalls.some((args) => args.includes('rm') && args.includes('-f'))).toBe(true);
    });
  });

  describe('listManaged', () => {
    test('returns managed sandbox containers', async () => {
      const list = await provider.listManaged();
      expect(list.length).toBe(1);
      expect(list[0].sandbox_id).toBe('sb-1');
      expect(list[0].running).toBe(true);
    });
  });
});
