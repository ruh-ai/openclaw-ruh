import { spawn, type Subprocess } from 'bun';
import { getConfig } from '../config';

export interface SubprocessResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  killed: boolean;
}

// Track active subprocesses for graceful shutdown
const activeProcesses = new Map<string, Subprocess>();

/**
 * Spawn a Claude Code CLI agent as a subprocess.
 * Pipes the prompt via stdin, captures structured output from stdout.
 */
export async function spawnClaudeAgent(opts: {
  jobId: string;
  agentPath: string;
  prompt: string;
  timeout: number;        // ms
  dangerouslySkipPermissions?: boolean;
}): Promise<SubprocessResult> {
  const config = getConfig();
  const startTime = Date.now();

  const args = [
    config.claudeCliPath,
    '--agent', opts.agentPath,
    '-p', opts.prompt,
    '--output-format', 'json',
  ];

  if (opts.dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  const proc = spawn({
    cmd: args,
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: config.projectRoot,
    env: {
      ...process.env,
      HERMES_TASK_ID: opts.jobId,
      HERMES_MODE: 'worker',
    },
  });

  activeProcesses.set(opts.jobId, proc);

  let killed = false;
  const timeoutId = setTimeout(() => {
    killed = true;
    proc.kill('SIGTERM');
    // Force kill after 5s if still alive
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
    }, 5000);
  }, opts.timeout);

  try {
    const exitCode = await proc.exited;
    clearTimeout(timeoutId);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return {
      success: exitCode === 0 && !killed,
      stdout,
      stderr,
      exitCode,
      durationMs: Date.now() - startTime,
      killed,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      success: false,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: null,
      durationMs: Date.now() - startTime,
      killed,
    };
  } finally {
    activeProcesses.delete(opts.jobId);
  }
}

/**
 * Kill all active subprocesses. Used during graceful shutdown.
 */
export async function killAllSubprocesses(): Promise<void> {
  for (const [jobId, proc] of activeProcesses) {
    console.log(`[hermes] Killing subprocess for job ${jobId}`);
    try {
      proc.kill('SIGTERM');
    } catch { /* already dead */ }
  }

  // Wait up to 5s for graceful termination, then force kill
  if (activeProcesses.size > 0) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    for (const [, proc] of activeProcesses) {
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
    }
  }
  activeProcesses.clear();
}

export function activeSubprocessCount(): number {
  return activeProcesses.size;
}
