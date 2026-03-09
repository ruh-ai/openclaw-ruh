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

export interface CommandOutput {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string[]) => Promise<CommandOutput>;

export function buildCodexCommand(options: Omit<CodexExecOptions, "timeoutMs">): string[] {
  return [
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
    options.prompt,
  ];
}

export async function executeCodex(
  options: CodexExecOptions,
  runner: CommandRunner = defaultRunner,
): Promise<CodexOutcome> {
  try {
    const output = await withTimeout(
      runner(buildCodexCommand(options)),
      options.timeoutMs,
      `Codex execution timed out after ${options.timeoutMs}ms`,
    );

    return parseCodexOutcome(output.stdout);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "retryable_failure",
      summary: message,
      verification: [],
    };
  }
}

export function parseCodexOutcome(raw: string): CodexOutcome {
  try {
    const parsed = JSON.parse(raw) as Partial<CodexOutcome>;
    if (
      parsed.status !== "completed" &&
      parsed.status !== "blocked" &&
      parsed.status !== "retryable_failure" &&
      parsed.status !== "noop"
    ) {
      throw new Error("Missing valid status");
    }

    return {
      status: parsed.status,
      summary: parsed.summary ?? "",
      verification: parsed.verification ?? [],
      commitSha: parsed.commitSha,
      prUrl: parsed.prUrl,
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
