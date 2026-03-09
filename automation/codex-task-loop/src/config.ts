export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoopConfig {
  logLevel: LogLevel;
  repoPath: string;
  stateDir: string;
  dryRun: boolean;
  linearApiKey?: string;
}

const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LoopConfig {
  const logLevel = (env.CODEX_TASK_LOOP_LOG_LEVEL ?? "info") as LogLevel;
  if (!LOG_LEVELS.has(logLevel)) {
    throw new Error(`Invalid CODEX_TASK_LOOP_LOG_LEVEL: ${logLevel}`);
  }

  return {
    logLevel,
    repoPath: env.CODEX_TASK_LOOP_REPO_PATH ?? process.cwd(),
    stateDir: env.CODEX_TASK_LOOP_STATE_DIR ?? ".codex-task-loop",
    dryRun: parseBoolean(env.CODEX_TASK_LOOP_DRY_RUN),
    linearApiKey: env.LINEAR_API_KEY,
  };
}
