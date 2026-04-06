import { afterEach, describe, expect, it } from "bun:test";
import {
  getAgentRunnerHealth,
  resetSelectedAgentRunner,
  resolveAgentRunner,
  setSelectedAgentRunner,
} from "./agentRunner";

afterEach(() => {
  resetSelectedAgentRunner();
});

describe("agent runner selection", () => {
  it("prefers an explicit Claude runner path when Claude is selected", () => {
    const resolution = resolveAgentRunner("claude", {
      env: { CLAUDE_CLI_PATH: "/custom/claude" },
      which: () => null,
      exists: (candidate) => candidate === "/custom/claude",
      homedir: () => "/Users/tester",
      readFile: () => null,
    });

    expect(resolution.kind).toBe("claude");
    expect(resolution.available).toBe(true);
    expect(resolution.path).toBe("/custom/claude");
    expect(resolution.source).toBe("env");
  });

  it("falls back to the user-local Codex binary when PATH lookup fails", () => {
    const resolution = resolveAgentRunner("codex", {
      env: {},
      which: () => null,
      exists: (candidate) =>
        candidate === "/Users/tester/.npm-global/bin/codex" ||
        candidate === "/Users/tester/.codex/config.toml",
      homedir: () => "/Users/tester",
      readFile: (candidate) =>
        candidate === "/Users/tester/.codex/config.toml"
          ? `model = "gpt-5.4"

[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]`
          : null,
    });

    expect(resolution.kind).toBe("codex");
    expect(resolution.available).toBe(true);
    expect(resolution.path).toBe("/Users/tester/.npm-global/bin/codex");
    expect(resolution.source).toBe("fallback");
  });

  it("marks Codex unavailable when its config includes MCP servers without a command", () => {
    const resolution = resolveAgentRunner("codex", {
      env: {},
      which: (command) => (command === "codex" ? "/usr/local/bin/codex" : null),
      exists: (candidate) =>
        candidate === "/usr/local/bin/codex" || candidate === "/Users/tester/.codex/config.toml",
      homedir: () => "/Users/tester",
      readFile: (candidate) =>
        candidate === "/Users/tester/.codex/config.toml"
          ? `[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"

[mcp_servers.linear]
url = "https://mcp.linear.app/mcp"`
          : null,
    });

    expect(resolution.kind).toBe("codex");
    expect(resolution.available).toBe(false);
    expect(resolution.error).toContain("missing a command");
    expect(resolution.error).toContain("figma");
    expect(resolution.error).toContain("linear");
  });

  it("prefers a Hermes-specific Codex home when validating Codex readiness", () => {
    const resolution = resolveAgentRunner("codex", {
      env: { HERMES_CODEX_HOME: "/Users/tester/.hermes-codex-home" },
      which: (command) => (command === "codex" ? "/usr/local/bin/codex" : null),
      exists: (candidate) =>
        candidate === "/usr/local/bin/codex" ||
        candidate === "/Users/tester/.hermes-codex-home/.codex/config.toml",
      homedir: () => "/Users/tester",
      readFile: (candidate) =>
        candidate === "/Users/tester/.hermes-codex-home/.codex/config.toml"
          ? `model = "gpt-5.4"

[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]`
          : null,
    });

    expect(resolution.kind).toBe("codex");
    expect(resolution.available).toBe(true);
    expect(resolution.path).toBe("/usr/local/bin/codex");
  });

  it("uses the runtime override ahead of the environment default", () => {
    setSelectedAgentRunner("codex");

    const health = getAgentRunnerHealth({
      env: { HERMES_AGENT_RUNNER: "claude" },
      which: (command) => `/usr/local/bin/${command}`,
      exists: (candidate) =>
        candidate === "/usr/local/bin/claude" ||
        candidate === "/usr/local/bin/codex" ||
        candidate === "/Users/tester/.codex/config.toml",
      homedir: () => "/Users/tester",
      readFile: (candidate) =>
        candidate === "/Users/tester/.codex/config.toml"
          ? `[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]`
          : null,
    });

    expect(health.selected).toBe("codex");
    expect(health.selectedSource).toBe("runtime");
    expect(health.available).toBe(true);
    expect(health.options.map((option) => option.kind)).toEqual(["claude", "codex"]);
  });
});
