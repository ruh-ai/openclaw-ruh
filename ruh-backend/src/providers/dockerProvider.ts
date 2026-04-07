/**
 * Docker sandbox provider — creates and manages local Docker containers.
 * Extracts infrastructure logic from sandboxManager.ts into the SandboxProvider interface.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  dockerSpawn,
  dockerExec,
  dockerContainerRunning,
  listManagedSandboxContainers,
  getContainerName,
} from '../docker';
import type {
  SandboxProvider,
  InfraCreateOpts,
  InfrastructureResult,
  ManagedSandboxInfo,
} from './types';
import type { SandboxEvent } from '../sandboxManager';

const GATEWAY_PORT = 18789;
const VNC_WS_PORT = 6080;
const PREVIEW_PORTS = [3000, 3001, 3002, 4173, 5173, 5174, 8000, 8080];

const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'ruh-sandbox:latest';
const LEGACY_IMAGE = 'node:22-bookworm';

export class DockerProvider implements SandboxProvider {
  async *createInfrastructure(
    opts: InfraCreateOpts,
  ): AsyncGenerator<SandboxEvent | ['infra_ready', InfrastructureResult]> {
    const sandboxId = uuidv4();
    const containerName = getContainerName(sandboxId);

    // Resolve sandbox image — prefer pre-built ruh-sandbox, fall back to legacy
    let sandboxImage = SANDBOX_IMAGE;
    let usingPrebuiltImage = false;
    const [prebuiltInspectCode] = await dockerSpawn(['image', 'inspect', SANDBOX_IMAGE], 10_000);
    if (prebuiltInspectCode === 0) {
      usingPrebuiltImage = true;
      yield ['log', `Using pre-built sandbox image: ${SANDBOX_IMAGE}`];
    } else {
      sandboxImage = LEGACY_IMAGE;
      yield ['log', `Pre-built image not found, falling back to ${LEGACY_IMAGE}...`];
      const [legacyInspectCode] = await dockerSpawn(['image', 'inspect', LEGACY_IMAGE], 10_000);
      if (legacyInspectCode !== 0) {
        yield ['log', `Pulling ${LEGACY_IMAGE} image...`];
        const [pullCode, pullOut] = await dockerSpawn(['pull', LEGACY_IMAGE], 180_000);
        if (pullCode !== 0) {
          yield ['error', `Failed to pull ${LEGACY_IMAGE} image: ${pullOut}`];
          return;
        }
      }
    }

    yield ['log', `Creating container '${containerName}'...`];
    const [createCode, createOut] = await dockerSpawn(
      [
        'run', '-d',
        '--name', containerName,
        '--memory', '2g',
        '--cpus', '2',
        '--restart', 'unless-stopped',
        '-p', `${GATEWAY_PORT}`,
        '-p', `${VNC_WS_PORT}`,
        ...PREVIEW_PORTS.flatMap((p) => ['-p', `${p}`]),
        ...opts.envArgs,
        sandboxImage,
        'tail', '-f', '/dev/null',
      ],
      30_000,
    );

    if (createCode !== 0) {
      yield ['error', `Failed to create container: ${createOut}`];
      return;
    }
    yield ['log', `Container started: ${containerName}`];

    // Resolve host ports Docker assigned
    await Bun.sleep(500);
    const [portCode, portOut] = await dockerSpawn(
      ['port', containerName, `${GATEWAY_PORT}/tcp`],
      10_000,
    );
    if (portCode !== 0 || !portOut) {
      yield ['error', `Failed to get port mapping: ${portOut}`];
      await dockerSpawn(['rm', '-f', containerName]);
      return;
    }

    const hostPort = portOut.trim().split(':').pop() ?? '';
    if (!hostPort || isNaN(parseInt(hostPort))) {
      yield ['error', `Could not parse host port from: ${portOut}`];
      await dockerSpawn(['rm', '-f', containerName]);
      return;
    }

    const gatewayUrl = `http://localhost:${hostPort}`;
    yield ['log', `Gateway will be accessible at ${gatewayUrl}`];

    // Resolve VNC websockify host port
    const [vncPortCode, vncPortOut] = await dockerSpawn(
      ['port', containerName, `${VNC_WS_PORT}/tcp`],
      10_000,
    );
    let vncHostPort: number | null = null;
    if (vncPortCode === 0 && vncPortOut) {
      const parsed = parseInt(vncPortOut.trim().split(':').pop() ?? '', 10);
      if (!isNaN(parsed)) {
        vncHostPort = parsed;
        yield ['log', `VNC websockify will be accessible on host port ${vncHostPort}`];
      }
    }

    // Resolve agent dashboard host port (8080 inside container)
    const [dashPortCode, dashPortOut] = await dockerSpawn(
      ['port', containerName, '8080/tcp'],
      10_000,
    );
    let dashboardHostPort: number | null = null;
    if (dashPortCode === 0 && dashPortOut) {
      const parsed = parseInt(dashPortOut.trim().split(':').pop() ?? '', 10);
      if (!isNaN(parsed)) dashboardHostPort = parsed;
    }

    yield ['infra_ready', {
      sandboxId,
      gatewayUrl,
      gatewayHostPort: hostPort,
      vncHostPort,
      dashboardHostPort,
      dashboardUrl: null,
      previewToken: null,
      sshCommand: `docker exec -it ${containerName} bash`,
      usingPrebuiltImage,
    }];
  }

  async exec(sandboxId: string, cmd: string, timeoutMs = 300_000): Promise<[boolean, string]> {
    return dockerExec(getContainerName(sandboxId), cmd, timeoutMs);
  }

  async isRunning(sandboxId: string): Promise<boolean> {
    return dockerContainerRunning(getContainerName(sandboxId)).catch(() => false);
  }

  async stopAndRemove(sandboxId: string): Promise<void> {
    await dockerSpawn(['rm', '-f', getContainerName(sandboxId)], 15_000);
  }

  async listManaged(): Promise<ManagedSandboxInfo[]> {
    return listManagedSandboxContainers();
  }
}
