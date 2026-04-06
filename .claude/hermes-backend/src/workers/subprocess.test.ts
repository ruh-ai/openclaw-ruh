import { describe, expect, it } from "bun:test";
import {
  buildRunnerEnvironment,
  buildClaudeRunnerCommand,
  buildCodexRunnerCommand,
  buildCodexRunnerPrompt,
} from "./subprocess";

describe("runner subprocess helpers", () => {
  it("builds the Claude CLI command with the existing agent contract", () => {
    const command = buildClaudeRunnerCommand({
      runnerPath: "/usr/local/bin/claude",
      agentPath: "/repo/.claude/agents/backend.md",
      prompt: "Fix the queue route",
      dangerouslySkipPermissions: true,
    });

    expect(command).toEqual([
      "/usr/local/bin/claude",
      "--agent",
      "/repo/.claude/agents/backend.md",
      "-p",
      "Fix the queue route",
      "--output-format",
      "json",
      "--dangerously-skip-permissions",
    ]);
  });

  it("wraps the target agent file into the Codex prompt", () => {
    const prompt = buildCodexRunnerPrompt({
      agentPath: "/repo/.claude/agents/frontend.md",
      agentDefinition: "---\nname: frontend\n---\nFollow Next.js patterns.",
      taskPrompt: "Make the dashboard clearer",
    });

    expect(prompt).toContain("/repo/.claude/agents/frontend.md");
    expect(prompt).toContain("Follow Next.js patterns.");
    expect(prompt).toContain("Make the dashboard clearer");
    expect(prompt).toContain("agent contract");
  });

  it("builds the Codex exec command around the working directory and output capture", () => {
    const command = buildCodexRunnerCommand({
      runnerPath: "/usr/local/bin/codex",
      projectRoot: "/repo",
      outputPath: "/tmp/hermes-last-message.txt",
      dangerouslySkipPermissions: true,
    });

    expect(command).toEqual([
      "/usr/local/bin/codex",
      "exec",
      "--cd",
      "/repo",
      "--color",
      "never",
      "--output-last-message",
      "/tmp/hermes-last-message.txt",
      "--dangerously-bypass-approvals-and-sandbox",
      "-",
    ]);
  });

  it("uses a Hermes-specific Codex home when preparing the Codex subprocess environment", () => {
    const env = buildRunnerEnvironment({
      jobId: "job-123",
      runner: "codex",
      baseEnv: { PATH: "/usr/bin", HERMES_CODEX_HOME: "/Users/tester/.hermes-codex-home" },
    });

    expect(env.HERMES_TASK_ID).toBe("job-123");
    expect(env.HERMES_MODE).toBe("worker");
    expect(env.HERMES_AGENT_RUNNER).toBe("codex");
    expect(env.HOME).toBe("/Users/tester/.hermes-codex-home");
  });
});
