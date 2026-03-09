import { join } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoopConfig {
  logLevel: LogLevel;
  repoPath: string;
  stateDir: string;
  dryRun: boolean;
  model: string;
  projectName: string;
  codexLabel: string;
  baseBranch: string;
  buildPlanPath: string;
  verificationCommands: string[];
  codexTimeoutMs: number;
  maxRetries: number;
  linearApiKey?: string;
}

const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }

  return parsed;
}

function parseVerificationCommands(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LoopConfig {
  const logLevel = (env.CODEX_TASK_LOOP_LOG_LEVEL ?? "info") as LogLevel;
  if (!LOG_LEVELS.has(logLevel)) {
    throw new Error(`Invalid CODEX_TASK_LOOP_LOG_LEVEL: ${logLevel}`);
  }

  const repoPath = env.CODEX_TASK_LOOP_REPO_PATH ?? process.cwd();

  return {
    logLevel,
    repoPath,
    stateDir: env.CODEX_TASK_LOOP_STATE_DIR ?? ".codex-task-loop",
    dryRun: parseBoolean(env.CODEX_TASK_LOOP_DRY_RUN),
    model: env.CODEX_TASK_LOOP_MODEL ?? "gpt-5.4",
    projectName: env.CODEX_TASK_LOOP_PROJECT ?? "openclaw-ruh",
    codexLabel: env.CODEX_TASK_LOOP_LABEL ?? "codex",
    baseBranch: env.CODEX_TASK_LOOP_BASE_BRANCH ?? "main",
    buildPlanPath: env.CODEX_TASK_LOOP_BUILD_PLAN_PATH ?? join(repoPath, "docs", "02 Operations", "Build Plan.md"),
    verificationCommands: parseVerificationCommands(env.CODEX_TASK_LOOP_VERIFICATION_COMMANDS),
    codexTimeoutMs: parseInteger(env.CODEX_TASK_LOOP_CODEX_TIMEOUT_MS, 20 * 60 * 1000),
    maxRetries: parseInteger(env.CODEX_TASK_LOOP_MAX_RETRIES, 2),
    linearApiKey: env.LINEAR_API_KEY,
  };
}
