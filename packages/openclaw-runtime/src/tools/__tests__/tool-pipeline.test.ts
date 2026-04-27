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
  readonly name: string = "ctx-mirror";
  readonly description: string = "Reflects ctx.mode.";
  readonly version: string = "0.1.0";
  readonly specVersion: string = "1.0.0-rc.1";
  readonly inputSchema = z.object({});

  // Read-only so the new BaseTool default permission policy doesn't gate this
  // mirror — it just observes ctx and emits, never mutates state.
  override isReadOnly() {
    return true;
  }

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

  test("execution_error includes errorCategory + retryable from classifier (Phase 1b)", async () => {
    class RateLimitedTool extends HelloTool {
      override readonly name: string = "rate-limited-tool";
      override async call(): Promise<ToolResult<{ greeting: string }>> {
        throw new Error("rate limit exceeded by upstream");
      }
    }
    registry.register(new RateLimitedTool());
    const result = await executeTool(registry, "rate-limited-tool", {}, baseCtx);
    expect(result.status).toBe("execution_error");
    if (result.status !== "execution_error") return;
    expect(result.errorCategory).toBe("rate_limit");
    expect(result.retryable).toBe(true);
    expect(result.userMessage).toContain("Rate limited");
  });

  test("execution_error classifies unknown errors as tool_execution_failure", async () => {
    class WeirdTool extends HelloTool {
      override readonly name: string = "weird-tool";
      override async call(): Promise<ToolResult<{ greeting: string }>> {
        throw new Error("strange unexpected condition");
      }
    }
    registry.register(new WeirdTool());
    const result = await executeTool(registry, "weird-tool", {}, baseCtx);
    expect(result.status).toBe("execution_error");
    if (result.status !== "execution_error") return;
    expect(result.errorCategory).toBe("tool_execution_failure");
    expect(result.userMessage).toContain("weird-tool");
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

describe("BaseTool default permissions (H1)", () => {
  test("read-only tool is allowed by default", async () => {
    class ReadTool extends BaseTool<unknown, unknown> {
      readonly name = "read";
      readonly description = "ro";
      readonly version = "0.1.0";
      readonly specVersion = "1.0.0-rc.1";
      readonly inputSchema = z.object({});
      override isReadOnly() {
        return true;
      }
      async call(): Promise<ToolResult<unknown>> {
        return { success: true, output: {} };
      }
    }
    const tool = new ReadTool();
    expect(tool.checkPermissions({}, baseCtx).allowed).toBe(true);
  });

  test("destructive tool requires approval in any mode", async () => {
    class DestructiveTool extends BaseTool<unknown, unknown> {
      readonly name = "del";
      readonly description = "destroy";
      readonly version = "0.1.0";
      readonly specVersion = "1.0.0-rc.1";
      readonly inputSchema = z.object({});
      override isDestructive() {
        return true;
      }
      async call(): Promise<ToolResult<unknown>> {
        return { success: true, output: {} };
      }
    }
    const tool = new DestructiveTool();
    const decision = tool.checkPermissions({}, { ...baseCtx, mode: "agent" });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.requiresApproval).toBe(true);
    }
  });

  test("write-capable (non-destructive) is gated in build/test/ship modes", async () => {
    class WriteTool extends BaseTool<unknown, unknown> {
      readonly name = "write";
      readonly description = "writes";
      readonly version = "0.1.0";
      readonly specVersion = "1.0.0-rc.1";
      readonly inputSchema = z.object({});
      async call(): Promise<ToolResult<unknown>> {
        return { success: true, output: {} };
      }
    }
    const tool = new WriteTool();
    expect(tool.checkPermissions({}, { ...baseCtx, mode: "build" }).allowed).toBe(false);
    expect(tool.checkPermissions({}, { ...baseCtx, mode: "test" }).allowed).toBe(false);
    expect(tool.checkPermissions({}, { ...baseCtx, mode: "ship" }).allowed).toBe(false);
    expect(tool.checkPermissions({}, { ...baseCtx, mode: "agent" }).allowed).toBe(true);
    expect(tool.checkPermissions({}, { ...baseCtx, mode: "copilot" }).allowed).toBe(true);
  });
});

describe("tool_failed status (H2)", () => {
  class FailingTool extends BaseTool<unknown, { reason: string }> {
    readonly name = "fail";
    readonly description = "always fails";
    readonly version = "0.1.0";
    readonly specVersion = "1.0.0-rc.1";
    readonly inputSchema = z.object({});
    override isReadOnly() {
      return true;
    }
    async call(): Promise<ToolResult<{ reason: string }>> {
      return { success: false, output: { reason: "intentional" }, error: "structured failure" };
    }
  }

  test("tool returning success:false yields tool_failed status, not success", async () => {
    const registry = new ToolRegistry();
    registry.register(new FailingTool());
    const result = await executeTool(registry, "fail", {}, baseCtx);
    expect(result.status).toBe("tool_failed");
    if (result.status === "tool_failed") {
      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe("structured failure");
      expect(result.events.some((e) => e.name === TOOL_EXECUTION_END)).toBe(true);
    }
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

  test("queue order preserved: sequential mutator before concurrent batch propagates ctx (H3)", async () => {
    // mutator (sequential) flips mode → "build"; then a concurrent ctx-mirror
    // run should see mode === "build", not the original.
    class ConcurrentMirror extends CtxMirror {
      override readonly name: string = "concurrent-mirror";
      override isReadOnly() {
        return true;
      }
      override isConcurrencySafe() {
        return true;
      }
    }
    registry.register(new ConcurrentMirror());

    const results = await executeTools(
      registry,
      [
        { toolName: "mutator", input: {} },
        { toolName: "concurrent-mirror", input: {} },
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

  test("concurrent tools that return contextModifier have it stripped + warning emitted (H4)", async () => {
    class BadConcurrentMutator extends BaseTool<unknown, { ok: true }> {
      readonly name = "bad-concurrent-mutator";
      readonly description = "concurrency-safe but returns modifier";
      readonly version = "0.1.0";
      readonly specVersion = "1.0.0-rc.1";
      readonly inputSchema = z.object({});
      override isReadOnly() {
        return true;
      }
      override isConcurrencySafe() {
        return true;
      }
      async call(): Promise<ToolResult<{ ok: true }>> {
        return {
          success: true,
          output: { ok: true },
          contextModifier: { mode: "build" },
        };
      }
    }
    registry.register(new BadConcurrentMutator());

    const results = await executeTools(
      registry,
      [
        { toolName: "bad-concurrent-mutator", input: {} },
        { toolName: "ctx-mirror", input: {} },
      ],
      baseCtx,
    );

    expect(results).toHaveLength(2);
    // Concurrent tool's contextModifier was stripped — the next sequential
    // tool sees the ORIGINAL mode (agent), not the modifier's "build".
    const mirror = results[1];
    expect(mirror?.status).toBe("success");
    if (mirror?.status === "success") {
      expect((mirror.result.output as { mode: string }).mode).toBe("agent");
    }
    // The concurrent tool's result should now have NO contextModifier
    const concurrent = results[0];
    expect(concurrent?.status).toBe("success");
    if (concurrent?.status === "success") {
      expect(concurrent.result.contextModifier).toBeUndefined();
      expect(
        concurrent.result.events?.some(
          (e) => e.name === "CONCURRENT_CONTEXT_MODIFIER_STRIPPED",
        ),
      ).toBe(true);
    }
  });
});
