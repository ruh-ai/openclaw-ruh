import { describe, expect, test } from "bun:test";
import { resolveCreatePageSandbox, requiresDedicatedForgeSandbox } from "../agent-sandbox-selection";

describe("agent sandbox selection", () => {
  test("does not require a forge sandbox before an agent is created", () => {
    expect(requiresDedicatedForgeSandbox(null, null)).toBe(false);
  });

  test("requires a dedicated forge sandbox once an agent exists", () => {
    expect(requiresDedicatedForgeSandbox({ id: "agent-1", forgeSandboxId: null }, null)).toBe(true);
  });

  test("requires a dedicated forge sandbox while a freshly created agent is hydrating", () => {
    expect(requiresDedicatedForgeSandbox(null, "agent-1")).toBe(true);
  });

  test("does not fall back to the shared architect sandbox for a created agent without a matching forge sandbox", () => {
    const selection = resolveCreatePageSandbox({
      createdAgentId: "agent-1",
      workingAgent: { id: "agent-1", forgeSandboxId: "sb-current" },
      forgeSandbox: { sandbox_id: "sb-old", sandbox_name: "old" },
      architectSandbox: { sandbox_id: "shared-architect", sandbox_name: "shared" },
    });

    expect(selection.effectiveSandbox).toBeNull();
    expect(selection.forgeSandboxPending).toBe(true);
  });

  test("uses the matching forge sandbox for the current agent", () => {
    const selection = resolveCreatePageSandbox({
      createdAgentId: "agent-1",
      workingAgent: { id: "agent-1", forgeSandboxId: "sb-current" },
      forgeSandbox: { sandbox_id: "sb-current", sandbox_name: "current" },
      architectSandbox: { sandbox_id: "shared-architect", sandbox_name: "shared" },
    });

    expect(selection.effectiveSandbox?.sandbox_id).toBe("sb-current");
    expect(selection.forgeSandboxPending).toBe(false);
  });
});
