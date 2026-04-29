import { describe, expect, test } from "bun:test";
import {
  BuilderAgent,
  PLAN_SYSTEM_INSTRUCTION,
  REFINE_SYSTEM_INSTRUCTION,
  THINK_SYSTEM_INSTRUCTION,
  composeContextualUserMessage,
  selectBuilderSystemInstruction,
} from "./builder-agent";

describe("BuilderAgent", () => {
  test("exports BuilderAgent class", () => {
    expect(BuilderAgent).toBeDefined();
    expect(typeof BuilderAgent).toBe("function");
  });

  test("exports THINK_SYSTEM_INSTRUCTION as a non-empty string", () => {
    expect(typeof THINK_SYSTEM_INSTRUCTION).toBe("string");
    expect(THINK_SYSTEM_INSTRUCTION.length).toBeGreaterThan(0);
  });

  test("constructor creates an instance with run method", () => {
    const agent = new BuilderAgent({
      sandboxId: "sb-test",
      sessionKey: "session-key-123",
    });
    expect(agent).toBeDefined();
    expect(typeof agent.run).toBe("function");
  });

  // ── Checkpoint protocol — regression guard ──────────────────────────────
  // The architect must pause and ask the user at specific checkpoints.
  // Removing any of these markers regresses agent quality.

  test("THINK prompt mandates Checkpoint 0 (scope questions before research)", () => {
    expect(THINK_SYSTEM_INSTRUCTION).toContain("CHECKPOINT 0");
    expect(THINK_SYSTEM_INSTRUCTION).toMatch(/ask 3.?.?5 .*questions?/i);
  });

  test("THINK prompt mandates Checkpoint 1 (pre-PRD sanity check)", () => {
    expect(THINK_SYSTEM_INSTRUCTION).toContain("CHECKPOINT 1");
  });

  test("THINK prompt mandates Checkpoint 2 (pre-TRD stack check)", () => {
    expect(THINK_SYSTEM_INSTRUCTION).toContain("CHECKPOINT 2");
  });

  test("THINK prompt instructs the architect to emit <ask_user> markers", () => {
    expect(THINK_SYSTEM_INSTRUCTION).toContain("<ask_user");
  });

  test("PLAN prompt mandates Checkpoint P0 (skill boundary check)", () => {
    expect(PLAN_SYSTEM_INSTRUCTION).toContain("CHECKPOINT P0");
    expect(PLAN_SYSTEM_INSTRUCTION).toContain("<ask_user");
  });

  test("PLAN prompt reads discovery docs from main workspace and mirrors plan output", () => {
    expect(PLAN_SYSTEM_INSTRUCTION).toContain("cat ~/.openclaw/workspace/.openclaw/discovery/PRD.md");
    expect(PLAN_SYSTEM_INSTRUCTION).toContain("cat ~/.openclaw/workspace/.openclaw/discovery/TRD.md");
    expect(PLAN_SYSTEM_INSTRUCTION).not.toContain("cat ~/.openclaw/workspace-copilot/.openclaw/discovery/PRD.md");
    expect(PLAN_SYSTEM_INSTRUCTION).toContain(
      "cp ~/.openclaw/workspace-copilot/.openclaw/plan/architecture.json ~/.openclaw/workspace/.openclaw/plan/architecture.json",
    );
  });

  test("REFINE prompt routes [target: ...] prefixed messages to artifact edits", () => {
    expect(REFINE_SYSTEM_INSTRUCTION).toContain("[target:");
    expect(REFINE_SYSTEM_INSTRUCTION).toContain("PRD.md");
    expect(REFINE_SYSTEM_INSTRUCTION).toContain("TRD.md");
    expect(REFINE_SYSTEM_INSTRUCTION).toContain("architecture.json");
  });

  test("composes targeted PRD revision messages with artifact and stage context", () => {
    const message = composeContextualUserMessage({
      message: "Make the PRD narrower.",
      chatMode: "revise",
      artifactTarget: { kind: "prd", path: ".openclaw/discovery/PRD.md" },
      devStage: "think",
    });

    expect(message).toContain("[target: PRD]");
    expect(message).toContain("[mode: revise]");
    expect(message).toContain("[stage: think]");
    expect(message).toContain("Make the PRD narrower.");
  });

  test("composes targeted architecture plan revision messages with filename context", () => {
    const message = composeContextualUserMessage({
      message: "Remove external APIs.",
      chatMode: "revise",
      artifactTarget: { kind: "plan", path: ".openclaw/plan/architecture.json" },
      devStage: "plan",
    });

    expect(message).toContain("[target: architecture.json]");
    expect(message).toContain("[mode: revise]");
    expect(message).toContain("[stage: plan]");
  });

  test("uses REFINE instruction when revise mode targets an artifact during Think", () => {
    expect(
      selectBuilderSystemInstruction({
        devStage: "think",
        chatMode: "revise",
        artifactTarget: { kind: "prd", path: ".openclaw/discovery/PRD.md" },
        isFirstMessage: false,
      }),
    ).toBe(REFINE_SYSTEM_INSTRUCTION);
  });
});
