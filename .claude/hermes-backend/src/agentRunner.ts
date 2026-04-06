import fs from "fs";
import os from "os";
import path from "path";

export const SUPPORTED_AGENT_RUNNERS = ["claude", "codex"] as const;

export type AgentRunnerKind = (typeof SUPPORTED_AGENT_RUNNERS)[number];
export type AgentRunnerSource = "env" | "path" | "fallback" | "missing";
export type AgentRunnerSelectionSource = "runtime" | "env" | "default";

export interface AgentRunnerResolution {
  kind: AgentRunnerKind;
  available: boolean;
  path: string;
  source: AgentRunnerSource;
  error?: string;
}

export interface AgentRunnerHealth {
  selected: AgentRunnerKind;
  selectedSource: AgentRunnerSelectionSource;
  available: boolean;
  path: string;
  source: AgentRunnerSource;
  error: string | null;
  options: AgentRunnerResolution[];
}

interface ResolveAgentRunnerOptions {
  env?: NodeJS.ProcessEnv;
  which?: (command: string) => string | null | undefined;
  exists?: (candidate: string) => boolean;
  homedir?: () => string;
  readFile?: (candidate: string) => string | null;
}

let selectedAgentRunnerOverride: AgentRunnerKind | null = null;

function isExecutableFile(candidate: string): boolean {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function readTextFile(candidate: string): string | null {
  try {
    return fs.existsSync(candidate) ? fs.readFileSync(candidate, "utf-8") : null;
  } catch {
    return null;
  }
}

function normalizeAgentRunnerKind(value: string | undefined | null): AgentRunnerKind | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return SUPPORTED_AGENT_RUNNERS.includes(normalized as AgentRunnerKind)
    ? (normalized as AgentRunnerKind)
    : null;
}

function resolvePathCandidate(
  candidate: string,
  exists: (candidate: string) => boolean,
  which: (command: string) => string | null | undefined,
): string | null {
  if (!candidate) {
    return null;
  }

  if (candidate.includes(path.sep)) {
    return exists(candidate) ? candidate : null;
  }

  return which(candidate) ?? null;
}

function getConfiguredSelection(env: NodeJS.ProcessEnv): {
  kind: AgentRunnerKind;
  source: AgentRunnerSelectionSource;
} {
  if (selectedAgentRunnerOverride) {
    return {
      kind: selectedAgentRunnerOverride,
      source: "runtime",
    };
  }

  const fromEnv = normalizeAgentRunnerKind(env.HERMES_AGENT_RUNNER);
  if (fromEnv) {
    return {
      kind: fromEnv,
      source: "env",
    };
  }

  return {
    kind: "claude",
    source: "default",
  };
}

function getConfiguredPath(kind: AgentRunnerKind, env: NodeJS.ProcessEnv): string | undefined {
  return kind === "claude" ? env.CLAUDE_CLI_PATH?.trim() : env.CODEX_CLI_PATH?.trim();
}

function getFallbackCandidates(kind: AgentRunnerKind, homedir: () => string): string[] {
  if (kind === "claude") {
    return [
      path.join(homedir(), ".local", "bin", "claude"),
      path.join(homedir(), ".npm-global", "bin", "claude"),
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
      "/usr/bin/claude",
    ];
  }

  return [
    path.join(homedir(), ".npm-global", "bin", "codex"),
    path.join(homedir(), ".local", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "/usr/bin/codex",
  ];
}

function getMissingRunnerError(kind: AgentRunnerKind): string {
  if (kind === "claude") {
    return "Unable to resolve Claude Code CLI. Set CLAUDE_CLI_PATH or install claude in a standard location.";
  }

  return "Unable to resolve Codex CLI. Set CODEX_CLI_PATH or install codex in a standard location.";
}

function getCodexHomeDir(env: NodeJS.ProcessEnv, homedir: () => string): string {
  const configured = env.HERMES_CODEX_HOME?.trim();
  if (configured) {
    return configured;
  }

  return homedir();
}

function getCodexConfigError(
  env: NodeJS.ProcessEnv,
  homedir: () => string,
  readFile: (candidate: string) => string | null,
): string | null {
  if (env.HERMES_SKIP_CODEX_CONFIG_VALIDATION === "true") {
    return null;
  }

  const configPath = env.CODEX_CONFIG_PATH?.trim() || path.join(getCodexHomeDir(env, homedir), ".codex", "config.toml");
  const configText = readFile(configPath);
  if (!configText) {
    return null;
  }

  try {
    const parsed = Bun.TOML.parse(configText) as Record<string, unknown>;
    const mcpServers = parsed.mcp_servers;
    if (!mcpServers || typeof mcpServers !== "object") {
      return null;
    }

    const invalidServers = Object.entries(mcpServers as Record<string, unknown>)
      .filter(([, server]) => {
        if (!server || typeof server !== "object") {
          return true;
        }

        const command = (server as Record<string, unknown>).command;
        return typeof command !== "string" || command.trim().length === 0;
      })
      .map(([name]) => name)
      .sort();

    if (invalidServers.length > 0) {
      return `Codex config is not executable in this environment because these MCP servers are missing a command: ${invalidServers.join(", ")}.`;
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Codex config could not be parsed: ${message}`;
  }
}

export function isAgentRunnerKind(value: string | undefined | null): value is AgentRunnerKind {
  return normalizeAgentRunnerKind(value) !== null;
}

export function setSelectedAgentRunner(kind: AgentRunnerKind | null): void {
  selectedAgentRunnerOverride = kind;
}

export function resetSelectedAgentRunner(): void {
  selectedAgentRunnerOverride = null;
}

export function getSelectedAgentRunner(options: ResolveAgentRunnerOptions = {}): {
  kind: AgentRunnerKind;
  source: AgentRunnerSelectionSource;
} {
  const env = options.env ?? process.env;
  return getConfiguredSelection(env);
}

export function resolveAgentRunner(
  kind: AgentRunnerKind,
  options: ResolveAgentRunnerOptions = {},
): AgentRunnerResolution {
  const env = options.env ?? process.env;
  const which = options.which ?? ((command: string) => Bun.which(command) ?? null);
  const exists = options.exists ?? isExecutableFile;
  const homedir = options.homedir ?? os.homedir;
  const readFile = options.readFile ?? readTextFile;

  const configured = getConfiguredPath(kind, env);
  if (configured) {
    const resolved = resolvePathCandidate(configured, exists, which);
    if (resolved) {
      const configError = kind === "codex" ? getCodexConfigError(env, homedir, readFile) : null;
      return {
        kind,
        available: !configError,
        path: resolved,
        source: "env",
        error: configError ?? undefined,
      };
    }

    return {
      kind,
      available: false,
      path: configured,
      source: "env",
      error: `Configured ${kind === "claude" ? "CLAUDE_CLI_PATH" : "CODEX_CLI_PATH"} does not exist or is not executable: ${configured}`,
    };
  }

  const onPath = which(kind);
  if (onPath) {
    const configError = kind === "codex" ? getCodexConfigError(env, homedir, readFile) : null;
    return {
      kind,
      available: !configError,
      path: onPath,
      source: "path",
      error: configError ?? undefined,
    };
  }

  for (const candidate of getFallbackCandidates(kind, homedir)) {
    if (exists(candidate)) {
      const configError = kind === "codex" ? getCodexConfigError(env, homedir, readFile) : null;
      return {
        kind,
        available: !configError,
        path: candidate,
        source: "fallback",
        error: configError ?? undefined,
      };
    }
  }

  return {
    kind,
    available: false,
    path: kind,
    source: "missing",
    error: getMissingRunnerError(kind),
  };
}

export function getAgentRunnerHealth(options: ResolveAgentRunnerOptions = {}): AgentRunnerHealth {
  const selection = getSelectedAgentRunner(options);
  const runnerOptions = SUPPORTED_AGENT_RUNNERS.map((kind) => resolveAgentRunner(kind, options));
  const selected = runnerOptions.find((option) => option.kind === selection.kind) ?? runnerOptions[0];

  return {
    selected: selection.kind,
    selectedSource: selection.source,
    available: selected.available,
    path: selected.path,
    source: selected.source,
    error: selected.error ?? null,
    options: runnerOptions,
  };
}
