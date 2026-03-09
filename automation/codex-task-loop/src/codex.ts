import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CodexOutcomeStatus = "completed" | "blocked" | "retryable_failure" | "noop";

export interface CodexOutcome {
  status: CodexOutcomeStatus;
  summary: string;
  verification: string[];
  commitSha?: string;
  prUrl?: string;
}

export interface CodexExecOptions {
  model: string;
  cwd: string;
  prompt: string;
  timeoutMs: number;
}

interface BuildCodexCommandOptions {
  model: string;
  cwd: string;
  prompt: string;
  outputLastMessagePath?: string;
}

export interface CommandOutput {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string[]) => Promise<CommandOutput>;

export function buildCodexCommand(options: BuildCodexCommandOptions): string[] {
  const command = [
    "codex",
    "exec",
    "-c",
    "mcp_servers={}",
    "-c",
    'model_reasoning_effort="high"',
    "--model",
    options.model,
    "--cd",
    options.cwd,
    "--dangerously-bypass-approvals-and-sandbox",
  ];

  if (options.outputLastMessagePath) {
    command.push("--output-last-message", options.outputLastMessagePath);
  }

  command.push(options.prompt);
  return command;
}

export async function executeCodex(
  options: CodexExecOptions,
  runner: CommandRunner = defaultRunner,
): Promise<CodexOutcome> {
  const outputDir = await mkdtemp(join(tmpdir(), "codex-task-loop-"));
  const outputLastMessagePath = join(outputDir, "last-message.txt");
  try {
    const output = await withTimeout(
      runner(buildCodexCommand({ ...options, outputLastMessagePath })),
      options.timeoutMs,
      `Codex execution timed out after ${options.timeoutMs}ms`,
    );

    return parseCodexOutcome(await readCodexFinalMessage(outputLastMessagePath, output.stdout));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "retryable_failure",
      summary: message,
      verification: [],
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

export function parseCodexOutcome(raw: string): CodexOutcome {
  try {
    const parsed = JSON.parse(raw) as {
      status?: unknown;
      summary?: unknown;
      verification?: unknown;
      commitSha?: unknown;
      prUrl?: unknown;
    };
    const rawStatus = typeof parsed.status === "string" ? parsed.status : undefined;
    const normalizedStatus = rawStatus === "success" ? "completed" : rawStatus;
    if (
      normalizedStatus !== "completed" &&
      normalizedStatus !== "blocked" &&
      normalizedStatus !== "retryable_failure" &&
      normalizedStatus !== "noop"
    ) {
      throw new Error("Missing valid status");
    }

    return {
      status: normalizedStatus,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      verification: Array.isArray(parsed.verification)
        ? parsed.verification.filter((value): value is string => typeof value === "string")
        : [],
      commitSha: typeof parsed.commitSha === "string" ? parsed.commitSha : undefined,
      prUrl: typeof parsed.prUrl === "string" ? parsed.prUrl : undefined,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "retryable_failure",
      summary: `Failed to parse Codex output: ${message}`,
      verification: [],
    };
  }
}

async function defaultRunner(command: string[]): Promise<CommandOutput> {
  const [file, ...args] = command;
  return execFileAsync(file, args);
}

async function readCodexFinalMessage(outputPath: string, fallback: string): Promise<string> {
  try {
    const value = await readFile(outputPath, "utf8");
    return value.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
