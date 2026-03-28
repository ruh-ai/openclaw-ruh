/**
 * Low-level Docker spawn helpers.
 * Isolated into their own module so tests can mock them via mock.module().
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

export async function dockerSpawn(args: string[], _timeoutMs = 60_000): Promise<[number, string]> {
  const proc = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return [proc.exitCode ?? 1, (stdout + stderr).trim()];
}

export async function dockerExec(
  containerName: string,
  cmd: string,
  _timeoutMs = 60_000,
): Promise<[boolean, string]> {
  const proc = Bun.spawn(['docker', 'exec', containerName, 'bash', '-c', cmd], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return [proc.exitCode === 0, (stdout + stderr).trim()];
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
