import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, type Subprocess } from 'bun';
import { getConfig } from '../config';
import { getAgentRunnerHealth } from '../agentRunner';
import { execution as log } from '../logger';

export interface SubprocessResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  killed: boolean;
}

const activeProcesses = new Map<string, Subprocess>();

export function buildClaudeRunnerCommand(opts: {
  runnerPath: string;
  agentPath: string;
  prompt: string;
  dangerouslySkipPermissions?: boolean;
}): string[] {
  const command = [
    opts.runnerPath,
    '--agent',
    opts.agentPath,
    '-p',
    opts.prompt,
    '--output-format',
    'json',
  ];

  if (opts.dangerouslySkipPermissions) {
    command.push('--dangerously-skip-permissions');
  }

  return command;
}

export function buildCodexRunnerPrompt(opts: {
  agentPath: string;
  agentDefinition: string;
  taskPrompt: string;
}): string {
  return `You are running inside Hermes as a specialist agent. Treat the following agent contract as authoritative instructions for this task.

## Agent Contract Source
${opts.agentPath}

\`\`\`md
${opts.agentDefinition.trim()}
\`\`\`

## Task
${opts.taskPrompt}`;
}

export function buildCodexRunnerCommand(opts: {
  runnerPath: string;
  projectRoot: string;
  outputPath: string;
  dangerouslySkipPermissions?: boolean;
}): string[] {
  const command = [
    opts.runnerPath,
    'exec',
    '--cd',
    opts.projectRoot,
    '--color',
    'never',
    '--output-last-message',
    opts.outputPath,
  ];

  if (opts.dangerouslySkipPermissions) {
    command.push('--dangerously-bypass-approvals-and-sandbox');
  } else {
    command.push('--full-auto');
  }

  command.push('-');
  return command;
}

export function buildRunnerEnvironment(opts: {
  jobId: string;
  runner: 'claude' | 'codex';
  baseEnv?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...(opts.baseEnv ?? process.env),
    HERMES_TASK_ID: opts.jobId,
    HERMES_MODE: 'worker',
    HERMES_AGENT_RUNNER: opts.runner,
  };

  if (opts.runner === 'codex' && env.HERMES_CODEX_HOME?.trim()) {
    env.HOME = env.HERMES_CODEX_HOME.trim();
  }

  return env;
}

export async function spawnAgentProcess(opts: {
  jobId: string;
  agentPath: string;
  prompt: string;
  timeout: number;
  dangerouslySkipPermissions?: boolean;
}): Promise<SubprocessResult> {
  const config = getConfig();
  const runner = getAgentRunnerHealth();
  const startTime = Date.now();

  if (!runner.available) {
    return {
      success: false,
      stdout: '',
      stderr: runner.error || `Selected runner ${runner.selected} is unavailable`,
      exitCode: null,
      durationMs: 0,
      killed: false,
    };
  }

  const tempDir = runner.selected === 'codex'
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-codex-'))
    : null;
  const outputPath = tempDir ? path.join(tempDir, 'last-message.txt') : null;

  let stdin: Blob | undefined;
  let cmd: string[];

  if (runner.selected === 'claude') {
    cmd = buildClaudeRunnerCommand({
      runnerPath: runner.path,
      agentPath: opts.agentPath,
      prompt: opts.prompt,
      dangerouslySkipPermissions: opts.dangerouslySkipPermissions,
    });
  } else {
    let agentDefinition: string;
    try {
      agentDefinition = fs.readFileSync(opts.agentPath, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        stdout: '',
        stderr: `Agent file could not be read for Codex runner: ${message}`,
        exitCode: null,
        durationMs: Date.now() - startTime,
        killed: false,
      };
    }

    cmd = buildCodexRunnerCommand({
      runnerPath: runner.path,
      projectRoot: config.projectRoot,
      outputPath: outputPath!,
      dangerouslySkipPermissions: opts.dangerouslySkipPermissions,
    });
    stdin = new Blob([
      buildCodexRunnerPrompt({
        agentPath: opts.agentPath,
        agentDefinition,
        taskPrompt: opts.prompt,
      }),
    ]);
  }

  const proc = spawn({
    cmd,
    stdin: stdin ?? 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: config.projectRoot,
    env: buildRunnerEnvironment({
      jobId: opts.jobId,
      runner: runner.selected,
    }),
  });

  activeProcesses.set(opts.jobId, proc);

  let killed = false;
  const timeoutId = setTimeout(() => {
    killed = true;
    proc.kill('SIGTERM');
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
    }, 5000);
  }, opts.timeout);

  try {
    const exitCode = await proc.exited;
    clearTimeout(timeoutId);

    const rawStdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const stdout = outputPath && fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, 'utf-8')
      : rawStdout;

    return {
      success: exitCode === 0 && !killed,
      stdout,
      stderr,
      exitCode,
      durationMs: Date.now() - startTime,
      killed,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: null,
      durationMs: Date.now() - startTime,
      killed,
    };
  } finally {
    activeProcesses.delete(opts.jobId);
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
    }
  }
}

export async function killAllSubprocesses(): Promise<void> {
  for (const [jobId, proc] of activeProcesses) {
    log.info({ jobId }, 'Killing subprocess');
    try {
      proc.kill('SIGTERM');
    } catch { /* already dead */ }
  }

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
