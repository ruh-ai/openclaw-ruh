import { describe, expect, test } from "bun:test";
import { BuilderAgent, THINK_SYSTEM_INSTRUCTION } from "./builder-agent";

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
});
