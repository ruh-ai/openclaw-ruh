import { describe, expect, test, beforeEach } from "bun:test";
import { z } from "zod";
import { ToolRegistry } from "../tool-registry";
import { BaseTool } from "../tool-interface";
import type { ToolContext, ToolResult, PermissionDecision } from "../tool-interface";
import { executeTool, executeTools, TOOL_EXECUTION_START, TOOL_EXECUTION_END } from "../tool-pipeline";

const baseCtx: ToolContext = {
  sandboxId: "sb-1",
  sessionId: "ses-1",
  agentId: "agent-1",
  pipelineId: "pipe-1",
  mode: "agent",
  devStage: "running",
};

class HelloTool extends BaseTool<{ name?: string }, { greeting: string }> {
  readonly name: string = "hello";
  readonly description: string = "Returns a greeting.";
  readonly version: string = "0.1.0";
  readonly specVersion: string = "1.0.0-rc.1";
  readonly inputSchema = z.object({ name: z.string().optional() });
  override readonly outputSchema = z.object({ greeting: z.string() });

  async call(input: { name?: string }): Promise<ToolResult<{ greeting: string }>> {
    return { success: true, output: { greeting: `Hi ${input.name ?? "there"}` } };
  }

  override isReadOnly() {
    return true;
  }
  override isConcurrencySafe() {
    return true;
  }
}

class ApprovalTool extends HelloTool {
  override readonly name: string = "needs-approval";

  override checkPermissions(): PermissionDecision {
    return { allowed: false, reason: "Test approval gate", requiresApproval: true };
  }
}

class ThrowingTool extends HelloTool {
  override readonly name: string = "boom";

  override async call(): Promise<ToolResult<{ greeting: string }>> {
    throw new Error("intentional explosion");
  }
}

class StageOnlyTool extends HelloTool {
  override readonly name: string = "stage-only";
  override readonly availableStages = ["tested"] as const;
}

class ModeOnlyTool extends HelloTool {
  override readonly name: string = "build-mode-only";
  override readonly availableModes = ["build"] as const;
}

class BadOutputTool extends BaseTool<{ name?: string }, { greeting: string }> {
  readonly name = "bad-output";
  readonly description = "Lies about output shape.";
  readonly version = "0.1.0";
  readonly specVersion = "1.0.0-rc.1";
  readonly inputSchema = z.object({ name: z.string().optional() });
  override readonly outputSchema = z.object({ greeting: z.string() });

  async call(): Promise<ToolResult<{ greeting: string }>> {
    // intentionally returns wrong shape — Zod should reject
    return { success: true, output: { not_greeting: 42 } as unknown as { greeting: string } };
  }
}

class SequentialMutator extends BaseTool<unknown, { ok: true }> {
  readonly name = "mutator";
  readonly description = "Mutates context for downstream calls.";
  readonly version = "0.1.0";
  readonly specVersion = "1.0.0-rc.1";
  readonly inputSchema = z.object({});

  async call(): Promise<ToolResult<{ ok: true }>> {
    return {
      success: true,
      output: { ok: true },
      contextModifier: { mode: "build" },
    };
  }
}

class CtxMirror extends BaseTool<unknown, { mode: string }> {
  readonly name = "ctx-mirror";
  readonly description = "Reflects ctx.mode.";
  readonly version = "0.1.0";
  readonly specVersion = "1.0.0-rc.1";
  readonly inputSchema = z.object({});

  async call(_input: unknown, ctx: ToolContext): Promise<ToolResult<{ mode: string }>> {
    return { success: true, output: { mode: ctx.mode } };
  }
}

describe("executeTool", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(new HelloTool());
  });

  test("happy path returns success with start+end events", async () => {
    const result = await executeTool(registry, "hello", { name: "Ada" }, baseCtx);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.result.output).toEqual({ greeting: "Hi Ada" });
    expect(result.events).toHaveLength(2);
    expect(result.events[0]?.name).toBe(TOOL_EXECUTION_START);
    expect(result.events[1]?.name).toBe(TOOL_EXECUTION_END);
  });

  test("not_found when tool isn't registered", async () => {
    const result = await executeTool(registry, "missing", {}, baseCtx);
    expect(result.status).toBe("not_found");
  });

  test("validation_error on bad input", async () => {
    const result = await executeTool(registry, "hello", { name: 42 }, baseCtx);
    expect(result.status).toBe("validation_error");
  });

  test("output_validation_error when tool returns wrong shape", async () => {
    registry.register(new BadOutputTool());
    const result = await executeTool(registry, "bad-output", {}, baseCtx);
    expect(result.status).toBe("output_validation_error");
    if (result.status !== "output_validation_error") return;
    // emit start AND end events even on output validation failure
    expect(result.events.some((e) => e.name === TOOL_EXECUTION_END)).toBe(true);
  });

  test("execution_error on thrown exception", async () => {
    registry.register(new ThrowingTool());
    const result = await executeTool(registry, "boom", { name: "Ada" }, baseCtx);
    expect(result.status).toBe("execution_error");
    if (result.status !== "execution_error") return;
    expect(result.error).toContain("intentional explosion");
    expect(result.events.some((e) => e.name === TOOL_EXECUTION_END)).toBe(true);
  });

  test("unavailable in wrong stage", async () => {
    registry.register(new StageOnlyTool());
    const result = await executeTool(registry, "stage-only", {}, { ...baseCtx, devStage: "drafted" });
    expect(result.status).toBe("unavailable");
  });

  test("unavailable in wrong mode", async () => {
    registry.register(new ModeOnlyTool());
    const result = await executeTool(registry, "build-mode-only", {}, { ...baseCtx, mode: "agent" });
    expect(result.status).toBe("unavailable");
  });

  test("permission_denied without approval callback", async () => {
    registry.register(new ApprovalTool());
    const result = await executeTool(registry, "needs-approval", {}, baseCtx);
    expect(result.status).toBe("permission_denied");
    if (result.status !== "permission_denied") return;
    expect(result.requiresApproval).toBe(true);
  });

  test("permission gate clears with onApprovalRequired returning true", async () => {
    registry.register(new ApprovalTool());
    const result = await executeTool(registry, "needs-approval", {}, baseCtx, {
      onApprovalRequired: async () => true,
    });
    expect(result.status).toBe("success");
  });

  test("permission gate denies with onApprovalRequired returning false", async () => {
    registry.register(new ApprovalTool());
    const result = await executeTool(registry, "needs-approval", {}, baseCtx, {
      onApprovalRequired: async () => false,
    });
    expect(result.status).toBe("permission_denied");
    if (result.status !== "permission_denied") return;
    expect(result.requiresApproval).toBe(false);
  });
});

describe("executeTools (multi-tool)", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(new HelloTool());
    registry.register(new SequentialMutator());
    registry.register(new CtxMirror());
  });

  test("sequential contextModifier propagates to subsequent calls", async () => {
    // mutator is NOT concurrency-safe by default; ctx-mirror is NOT either
    const results = await executeTools(
      registry,
      [
        { toolName: "mutator", input: {} },
        { toolName: "ctx-mirror", input: {} },
      ],
      baseCtx,
    );

    expect(results).toHaveLength(2);
    const mirror = results[1];
    expect(mirror?.status).toBe("success");
    if (mirror?.status === "success") {
      expect((mirror.result.output as { mode: string }).mode).toBe("build");
    }
  });

  test("concurrent tools (read-only) run in parallel", async () => {
    // hello is read-only + concurrency-safe; running two should both succeed
    const results = await executeTools(
      registry,
      [
        { toolName: "hello", input: { name: "A" } },
        { toolName: "hello", input: { name: "B" } },
      ],
      baseCtx,
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "success")).toBe(true);
  });
});
