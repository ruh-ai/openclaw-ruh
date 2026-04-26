/**
 * Low-level Docker spawn helpers.
 * Isolated into their own module so tests can mock them via mock.module().
 *
 * @kb: 003-sandbox-lifecycle 002-backend-overview
 */

const SIMPLE_SHELL_TOKEN = /^[A-Za-z0-9_./:-]+$/;

export function getContainerName(sandboxId: string): string {
  return `openclaw-${sandboxId}`;
}

export interface ManagedSandboxContainer {
  sandbox_id: string;
  container_name: string;
  state: string;
  running: boolean;
  status: string;
}

export function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

export function joinShellArgs(args: Array<string | number>): string {
  return args
    .map((value) => {
      const stringValue = String(value);
      return SIMPLE_SHELL_TOKEN.test(stringValue) ? stringValue : shellQuote(stringValue);
    })
    .join(' ');
}

export function normalizePathSegment(value: string): string {
  const parts = String(value)
    .trim()
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..');

  const normalized = parts
    .join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');

  if (!normalized) {
    throw new Error('Path segment is required');
  }

  return normalized;
}

/**
 * Read Docker port mappings for a container and return key port numbers.
 * Returns null if the container is not running or has no port mappings.
 */
export function readContainerPorts(sandboxId: string): { gatewayPort: number; vncPort?: number } | null {
  const containerName = getContainerName(sandboxId);
  try {
    const proc = Bun.spawnSync(['docker', 'port', containerName]);
    const stdout = proc.stdout?.toString().trim() ?? '';
    if (proc.exitCode !== 0 || !stdout) return null;

    let gatewayPort = 0;
    let vncPort = 0;
    for (const line of stdout.split('\n')) {
      const match = line.match(/^(\d+)\/tcp\s+->\s+.*:(\d+)/);
      if (!match) continue;
      const containerPort = parseInt(match[1], 10);
      const hostPort = parseInt(match[2], 10);
      if (containerPort === 18789 && hostPort > 0) gatewayPort = hostPort;
      if (containerPort === 6080 && hostPort > 0) vncPort = hostPort;
    }
    if (gatewayPort === 0) return null;
    return { gatewayPort, ...(vncPort > 0 ? { vncPort } : {}) };
  } catch {
    return null;
  }
}

export function buildHomeFileWriteCommand(relativePath: string, content: string): string {
  const trimmedPath = String(relativePath).trim().replace(/^\/+/, '');
  if (!trimmedPath || trimmedPath.includes('..') || /[^A-Za-z0-9._/-]/.test(trimmedPath)) {
    throw new Error('Relative path must contain only safe characters');
  }

  const absolutePath = `$HOME/${trimmedPath}`;
  const parentDir = absolutePath.slice(0, absolutePath.lastIndexOf('/'));
  return `mkdir -p ${parentDir} && printf %s ${shellQuote(content)} > ${absolutePath}`;
}

export function buildConfigureAgentCronAddCommand(job: {
  name: string;
  schedule: string;
  message: string;
}): string {
  return `${joinShellArgs([
    'openclaw',
    'cron',
    'add',
    '--name',
    job.name,
    '--cron',
    job.schedule,
    '--message',
    job.message,
  ])} 2>&1`;
}

export function buildCronDeleteCommand(jobId: string): string {
  return `${joinShellArgs(['openclaw', 'cron', 'rm', jobId])} 2>&1`;
}

export function buildCronRunCommand(jobId: string): string {
  return `${joinShellArgs(['openclaw', 'cron', 'run', jobId])} 2>&1`;
}

async function readStreamText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return '';
  return new Response(stream).text();
}

async function withFallbackTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function runDockerProcess(args: string[], timeoutMs: number): Promise<[number, string]> {
  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdoutPromise = readStreamText(proc.stdout);
  const stderrPromise = readStreamText(proc.stderr);
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const status = await Promise.race([
    proc.exited.then(() => 'exited' as const).catch(() => 'exited' as const),
    new Promise<'timed-out'>((resolve) => {
      timeout = setTimeout(() => resolve('timed-out'), timeoutMs);
    }),
  ]);
  if (timeout) clearTimeout(timeout);

  if (status === 'timed-out') {
    try { proc.kill?.('SIGTERM'); } catch { /* ignore */ }
    const exitedAfterTerm = await withFallbackTimeout(
      proc.exited.then(() => true).catch(() => true),
      250,
      false,
    );
    if (!exitedAfterTerm) {
      try { proc.kill?.('SIGKILL'); } catch { /* ignore */ }
    }
    const [stdout, stderr] = await Promise.all([
      withFallbackTimeout(stdoutPromise, 250, ''),
      withFallbackTimeout(stderrPromise, 250, ''),
    ]);
    const output = (stdout + stderr).trim();
    const timeoutMessage = `Command timed out after ${timeoutMs}ms`;
    return [124, output ? `${output}\n${timeoutMessage}` : timeoutMessage];
  }

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return [proc.exitCode ?? 1, (stdout + stderr).trim()];
}

export async function dockerSpawn(args: string[], timeoutMs = 60_000): Promise<[number, string]> {
  return runDockerProcess(['docker', ...args], timeoutMs);
}

export async function dockerExec(
  containerName: string,
  cmd: string,
  timeoutMs = 60_000,
): Promise<[boolean, string]> {
  const [exitCode, output] = await runDockerProcess(
    ['docker', 'exec', containerName, 'bash', '-c', cmd],
    timeoutMs,
  );
  return [exitCode === 0, output];
}

export async function dockerContainerRunning(
  containerName: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const [exitCode, output] = await dockerSpawn(
    ['inspect', '-f', '{{.State.Running}}', containerName],
    timeoutMs,
  );
  return exitCode === 0 && output.trim() === 'true';
}

export function parseManagedSandboxContainerList(output: string): ManagedSandboxContainer[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [container_name = '', state = '', ...statusParts] = line.split('\t');
      const status = statusParts.join('\t').trim();
      const sandbox_id = container_name.startsWith('openclaw-')
        ? container_name.slice('openclaw-'.length)
        : container_name;
      return {
        sandbox_id,
        container_name,
        state,
        running: state === 'running',
        status,
      };
    })
    .filter((entry) => entry.container_name.startsWith('openclaw-'));
}

export async function listManagedSandboxContainers(
  timeoutMs = 10_000,
): Promise<ManagedSandboxContainer[]> {
  const [exitCode, output] = await dockerSpawn(
    ['ps', '-a', '--format', '{{.Names}}\t{{.State}}\t{{.Status}}'],
    timeoutMs,
  );
  if (exitCode !== 0) {
    return [];
  }
  return parseManagedSandboxContainerList(output);
}
