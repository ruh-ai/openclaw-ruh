import { describe, expect, test } from "bun:test";
import { deriveCreationPhase } from "../CreationProgressCard";

describe("deriveCreationPhase", () => {
  test("returns 'purpose' for empty state", () => {
    expect(deriveCreationPhase({})).toBe("purpose");
  });

  test("returns 'purpose' when only name is set", () => {
    expect(deriveCreationPhase({ name: "Test Agent" })).toBe("purpose");
  });

  test("returns 'personality' when description is set", () => {
    expect(
      deriveCreationPhase({ name: "Test", description: "Manages ads" }),
    ).toBe("personality");
  });

  test("returns 'skills' when agentRules are present", () => {
    expect(
      deriveCreationPhase({
        name: "Test",
        description: "Manages ads",
        agentRules: ["Always be helpful"],
      }),
    ).toBe("skills");
  });

  test("returns 'tools' when skillGraph is populated", () => {
    expect(
      deriveCreationPhase({
        name: "Test",
        skillGraph: [{ id: "s1" }],
      }),
    ).toBe("tools");
  });

  test("returns 'triggers' when skills and rules are both present", () => {
    expect(
      deriveCreationPhase({
        name: "Test",
        skillGraph: [{ id: "s1" }],
        agentRules: ["Be concise"],
      }),
    ).toBe("triggers");
  });

  test("returns 'ready' when triggers are populated", () => {
    expect(
      deriveCreationPhase({
        name: "Test",
        triggers: [{ id: "t1" }],
      }),
    ).toBe("ready");
  });

  test("handles null/undefined values gracefully", () => {
    expect(
      deriveCreationPhase({
        name: null,
        description: null,
        skillGraph: null,
        agentRules: [],
        triggers: [],
      }),
    ).toBe("purpose");
  });
});
