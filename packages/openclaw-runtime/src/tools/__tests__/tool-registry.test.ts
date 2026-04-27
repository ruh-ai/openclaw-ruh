import { describe, expect, test, beforeEach } from "bun:test";
import { z } from "zod";
import { ToolRegistry } from "../tool-registry";
import { BaseTool } from "../tool-interface";
import type { OpenClawTool, ToolContext, ToolResult } from "../tool-interface";

class FakeTool extends BaseTool<{ name?: string }, { greeting: string }> {
  readonly name: string = "hello";
  readonly description: string = "Returns a greeting.";
  readonly version: string = "0.1.0";
  readonly specVersion: string = "1.0.0-rc.1";
  readonly inputSchema = z.object({ name: z.string().optional() });

  async call(input: { name?: string }, _ctx: ToolContext): Promise<ToolResult<{ greeting: string }>> {
    return { success: true, output: { greeting: `Hi ${input.name ?? "there"}` } };
  }

  override isReadOnly() {
    return true;
  }

  override isConcurrencySafe() {
    return true;
  }
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test("register adds a tool", () => {
    registry.register(new FakeTool());
    expect(registry.size).toBe(1);
    expect(registry.has("hello")).toBe(true);
    expect(registry.get("hello")?.name).toBe("hello");
  });

  test("register throws on duplicate name", () => {
    registry.register(new FakeTool());
    expect(() => registry.register(new FakeTool())).toThrow(/already registered/);
  });

  test("get returns undefined for unknown tool", () => {
    expect(registry.get("nope")).toBeUndefined();
  });

  test("list returns all registered tools", () => {
    registry.register(new FakeTool());
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.name).toBe("hello");
  });

  test("listForStage filters by availableStages", () => {
    class StageBoundTool extends FakeTool {
      override readonly name: string = "stage-only";
      override readonly availableStages = ["validated", "tested"] as const;
    }
    registry.register(new FakeTool());
    registry.register(new StageBoundTool());

    expect(registry.listForStage("drafted").map((t) => t.name)).toEqual(["hello"]);
    expect(registry.listForStage("tested").map((t) => t.name).sort()).toEqual([
      "hello",
      "stage-only",
    ]);
  });

  test("listForMode filters by availableModes", () => {
    class ModeBoundTool extends FakeTool {
      override readonly name: string = "agent-only";
      override readonly availableModes = ["agent"] as const;
    }
    registry.register(new FakeTool());
    registry.register(new ModeBoundTool());

    expect(registry.listForMode("build").map((t) => t.name)).toEqual(["hello"]);
    expect(registry.listForMode("agent").map((t) => t.name).sort()).toEqual([
      "agent-only",
      "hello",
    ]);
  });

  test("listForStageAndMode is an intersection", () => {
    class BoundedTool extends FakeTool {
      override readonly name: string = "bounded";
      override readonly availableStages = ["tested"] as const;
      override readonly availableModes = ["agent"] as const;
    }
    registry.register(new BoundedTool());

    expect(registry.listForStageAndMode("tested", "agent").map((t) => t.name)).toEqual(["bounded"]);
    expect(registry.listForStageAndMode("drafted", "agent")).toHaveLength(0);
    expect(registry.listForStageAndMode("tested", "build")).toHaveLength(0);
  });
});
