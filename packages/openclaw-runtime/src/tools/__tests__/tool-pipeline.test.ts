import { describe, expect, test, beforeEach } from "bun:test";
import { z } from "zod";
import { ToolRegistry } from "../tool-registry";
import { BaseTool } from "../tool-interface";
import type { ToolContext, ToolResult, PermissionDecision } from "../tool-interface";
import { executeTool, executeTools, TOOL_EXECUTION_START, TOOL_EXECUTION_END } from "../tool-pipeline";
import { DecisionLog, InMemoryDecisionStore } from "../../decision-log";
import { HookRegistry, HookRunner, VETO } from "../../hooks";

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
      return { success: false, output: { reason: "intentional" }, error: "rate limit hit" };
    }
  }

  test("tool returning success:false yields tool_failed status, not success", async () => {
    const registry = new ToolRegistry();
    registry.register(new FailingTool());
    const result = await executeTool(registry, "fail", {}, baseCtx);
    expect(result.status).toBe("tool_failed");
    if (result.status === "tool_failed") {
      expect(result.result.success).toBe(false);
      expect(result.events.some((e) => e.name === TOOL_EXECUTION_END)).toBe(true);
    }
  });

  test("tool_failed result is classified — errorCategory + retryable + userMessage on PipelineResult (Phase 1b H1)", async () => {
    const registry = new ToolRegistry();
    registry.register(new FailingTool());
    const result = await executeTool(registry, "fail", {}, baseCtx);
    expect(result.status).toBe("tool_failed");
    if (result.status === "tool_failed") {
      expect(result.errorCategory).toBe("rate_limit");
      expect(result.retryable).toBe(true);
      expect(result.userMessage).toContain("Rate limited");
    }
  });

  test("tool_failed event payload uses userMessage, not raw error (Phase 1b H2)", async () => {
    class LeakyTool extends BaseTool<unknown, { ok: false }> {
      readonly name = "leaky";
      readonly description = "leaks secrets in error";
      readonly version = "0.1.0";
      readonly specVersion = "1.0.0-rc.1";
      readonly inputSchema = z.object({});
      override isReadOnly() {
        return true;
      }
      async call(): Promise<ToolResult<{ ok: false }>> {
        return {
          success: false,
          output: { ok: false },
          error: "rate limit exceeded — token sk_live_secret_abc123",
        };
      }
    }
    const registry = new ToolRegistry();
    registry.register(new LeakyTool());
    const result = await executeTool(registry, "leaky", {}, baseCtx);
    expect(result.status).toBe("tool_failed");
    if (result.status !== "tool_failed") return;

    const endEvent = result.events.find((e) => e.name === TOOL_EXECUTION_END);
    expect(endEvent).toBeDefined();
    // Event MUST NOT carry the raw error string with the secret
    const eventValue = endEvent?.value as Record<string, unknown> | undefined;
    expect(JSON.stringify(eventValue)).not.toContain("sk_live_secret_abc123");
    // Event SHOULD carry userMessage (sanitized)
    expect(eventValue?.userMessage).toBeDefined();
  });

  test("execution_error event uses userMessage, not originalMessage (H2)", async () => {
    class ThrowingLeaky extends BaseTool<unknown, unknown> {
      readonly name = "throwing-leaky";
      readonly description = "throws with secrets";
      readonly version = "0.1.0";
      readonly specVersion = "1.0.0-rc.1";
      readonly inputSchema = z.object({});
      override isReadOnly() {
        return true;
      }
      async call(): Promise<ToolResult<unknown>> {
        throw new Error("rate limit exceeded — token sk_live_my_secret_456");
      }
    }
    const registry = new ToolRegistry();
    registry.register(new ThrowingLeaky());
    const result = await executeTool(registry, "throwing-leaky", {}, baseCtx);
    expect(result.status).toBe("execution_error");
    if (result.status !== "execution_error") return;

    const endEvent = result.events.find((e) => e.name === TOOL_EXECUTION_END);
    expect(endEvent).toBeDefined();
    const eventValue = endEvent?.value as Record<string, unknown> | undefined;
    expect(JSON.stringify(eventValue)).not.toContain("sk_live_my_secret_456");
    expect(eventValue?.userMessage).toBeDefined();
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
      // Warning is in the inner result.events (for downstream tool consumers)
      expect(
        concurrent.result.events?.some(
          (e) => e.name === "CONCURRENT_CONTEXT_MODIFIER_STRIPPED",
        ),
      ).toBe(true);
      // AND in the top-level PipelineResult.events (for AG-UI / decision log)
      expect(
        concurrent.events.some(
          (e) => e.name === "CONCURRENT_CONTEXT_MODIFIER_STRIPPED",
        ),
      ).toBe(true);
    }
  });
});

describe("decision-log emission (Phase 1d)", () => {
  function ctxWithLog(): {
    ctx: ToolContext;
    store: InMemoryDecisionStore;
    log: DecisionLog;
  } {
    const store = new InMemoryDecisionStore();
    const log = new DecisionLog({
      pipeline_id: "pipe-1",
      agent_id: "agent-1",
      session_id: "ses-1",
      spec_version: "1.0.0-rc.1",
      store,
    });
    return { ctx: { ...baseCtx, decisionLog: log }, store, log };
  }

  test("happy path emits tool_execution_start + tool_execution_end with chained parent_id", async () => {
    const registry = new ToolRegistry();
    registry.register(new HelloTool());
    const { ctx, store } = ctxWithLog();

    await executeTool(registry, "hello", { name: "Ada" }, ctx);

    const r = await store.query({ pipeline_id: "pipe-1" });
    const types = r.entries.map((e) => e.type);
    expect(types).toContain("tool_execution_start");
    expect(types).toContain("tool_execution_end");

    const start = r.entries.find((e) => e.type === "tool_execution_start");
    const end = r.entries.find((e) => e.type === "tool_execution_end");
    expect(end?.parent_id).toBe(start?.id);
    expect((end?.metadata as { success: boolean }).success).toBe(true);
  });

  test("execution_error emits error_classified + tool_execution_end with chained parent_id", async () => {
    const registry = new ToolRegistry();
    registry.register(new ThrowingTool());
    const { ctx, store } = ctxWithLog();

    await executeTool(registry, "boom", { name: "Ada" }, ctx);

    const r = await store.query({ pipeline_id: "pipe-1" });
    const types = r.entries.map((e) => e.type);
    expect(types).toContain("tool_execution_start");
    expect(types).toContain("error_classified");
    expect(types).toContain("tool_execution_end");

    const start = r.entries.find((e) => e.type === "tool_execution_start");
    const errorClassified = r.entries.find((e) => e.type === "error_classified");
    const end = r.entries.find((e) => e.type === "tool_execution_end");
    expect(errorClassified?.parent_id).toBe(start?.id);
    expect(end?.parent_id).toBe(start?.id);
    expect((end?.metadata as { success: boolean }).success).toBe(false);
  });

  test("redaction strips secret from error_classified.original_message_redacted", async () => {
    class LeakyThrower extends HelloTool {
      override readonly name: string = "leaky-throw";
      override async call(): Promise<ToolResult<{ greeting: string }>> {
        throw new Error("rate limit — Bearer abcdefghij1234567890");
      }
    }
    const registry = new ToolRegistry();
    registry.register(new LeakyThrower());
    const { ctx, store } = ctxWithLog();

    await executeTool(registry, "leaky-throw", {}, ctx);

    const r = await store.query({ pipeline_id: "pipe-1" });
    const errorClassified = r.entries.find((e) => e.type === "error_classified");
    const original = (errorClassified?.metadata as {
      original_message_redacted: string;
    }).original_message_redacted;
    expect(original).not.toContain("abcdefghij1234567890");
    expect(original).toContain("Bearer <REDACTED:credential>");
  });

  test("tool_failed (success:false) emits tool_execution_end with success:false", async () => {
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
        return { success: false, output: { reason: "x" }, error: "rate limit hit" };
      }
    }
    const registry = new ToolRegistry();
    registry.register(new FailingTool());
    const { ctx, store } = ctxWithLog();

    await executeTool(registry, "fail", {}, ctx);

    const r = await store.query({ pipeline_id: "pipe-1" });
    const types = r.entries.map((e) => e.type);
    // Spec 014/005 regression: tool_failed must also emit error_classified
    // before tool_execution_end so the audit log captures classification.
    expect(types).toContain("tool_execution_start");
    expect(types).toContain("error_classified");
    expect(types).toContain("tool_execution_end");

    const errorClassified = r.entries.find((e) => e.type === "error_classified");
    const end = r.entries.find((e) => e.type === "tool_execution_end");
    expect(end).toBeDefined();
    expect((end?.metadata as { success: boolean }).success).toBe(false);
    expect((end?.metadata as { error_category: string }).error_category).toBe(
      "rate_limit",
    );
    expect((errorClassified?.metadata as { category: string }).category).toBe(
      "rate_limit",
    );
    expect(
      (errorClassified?.metadata as { retryable: boolean }).retryable,
    ).toBe(true);
  });

  test("permission_denied (no approval callback) emits permission_denied", async () => {
    const registry = new ToolRegistry();
    registry.register(new ApprovalTool());
    const { ctx, store } = ctxWithLog();

    await executeTool(registry, "needs-approval", {}, ctx);

    const r = await store.query({ pipeline_id: "pipe-1" });
    const types = r.entries.map((e) => e.type);
    expect(types).toContain("permission_denied");
    // No tool_execution_start / _end when denied at the gate
    expect(types).not.toContain("tool_execution_start");
    expect(types).not.toContain("tool_execution_end");
  });

  test("permission approved emits permission_approved + start + end", async () => {
    const registry = new ToolRegistry();
    registry.register(new ApprovalTool());
    const { ctx, store } = ctxWithLog();

    await executeTool(registry, "needs-approval", {}, ctx, {
      onApprovalRequired: async () => true,
    });

    const r = await store.query({ pipeline_id: "pipe-1" });
    const types = r.entries.map((e) => e.type);
    expect(types).toContain("permission_approved");
    expect(types).toContain("tool_execution_start");
    expect(types).toContain("tool_execution_end");
  });

  test("output validation failure emits output_validation_failed + tool_execution_end", async () => {
    const registry = new ToolRegistry();
    registry.register(new BadOutputTool());
    const { ctx, store } = ctxWithLog();

    await executeTool(registry, "bad-output", {}, ctx);

    const r = await store.query({ pipeline_id: "pipe-1" });
    const types = r.entries.map((e) => e.type);
    expect(types).toContain("tool_execution_start");
    expect(types).toContain("output_validation_failed");
    expect(types).toContain("tool_execution_end");

    const start = r.entries.find((e) => e.type === "tool_execution_start");
    const validation = r.entries.find((e) => e.type === "output_validation_failed");
    const end = r.entries.find((e) => e.type === "tool_execution_end");
    expect(validation?.parent_id).toBe(start?.id);
    expect(end?.parent_id).toBe(start?.id);
    expect((end?.metadata as { success: boolean }).success).toBe(false);
  });

  test("permission denied via approval callback emits permission_denied with requires_approval:false", async () => {
    const registry = new ToolRegistry();
    registry.register(new ApprovalTool());
    const { ctx, store } = ctxWithLog();

    await executeTool(registry, "needs-approval", {}, ctx, {
      onApprovalRequired: async () => false,
    });

    const r = await store.query({ pipeline_id: "pipe-1" });
    const denied = r.entries.find((e) => e.type === "permission_denied");
    expect(denied).toBeDefined();
    expect(
      (denied?.metadata as { requires_approval: boolean }).requires_approval,
    ).toBe(false);
  });

  test("absent decisionLog: existing pipeline behavior unchanged (no emissions, no errors)", async () => {
    // baseCtx has no decisionLog
    const registry = new ToolRegistry();
    registry.register(new HelloTool());
    const result = await executeTool(registry, "hello", { name: "Ada" }, baseCtx);
    expect(result.status).toBe("success");
  });
});

describe("executeTool — hook integration (Phase 1h regression)", () => {
  function ctxWithHooks(): {
    ctx: ToolContext;
    decisionStore: InMemoryDecisionStore;
    registry: HookRegistry;
  } {
    const decisionStore = new InMemoryDecisionStore();
    const decisionLog = new DecisionLog({
      pipeline_id: "pipe-1",
      agent_id: "agent-1",
      session_id: "ses-1",
      spec_version: "1.0.0-rc.1",
      store: decisionStore,
    });
    const registry = new HookRegistry();
    const hooks = new HookRunner({
      pipelineId: "pipe-1",
      agentId: "agent-1",
      sessionId: "ses-1",
      registry,
      decisionLog,
    });
    return {
      ctx: { ...baseCtx, decisionLog, hooks },
      decisionStore,
      registry,
    };
  }

  test("happy path fires pre_tool_execution + post_tool_execution", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new HelloTool());
    const { ctx, registry: hookRegistry } = ctxWithHooks();

    const order: string[] = [];
    hookRegistry.register({
      name: "pre_tool_execution",
      handler: () => void order.push("pre"),
    });
    hookRegistry.register({
      name: "post_tool_execution",
      handler: (payload) => {
        const p = payload as {
          success: boolean;
          latency_ms: number;
          tool_name: string;
        };
        order.push(`post:${p.tool_name}:${p.success}`);
        expect(p.latency_ms).toBeGreaterThanOrEqual(0);
      },
    });

    const result = await executeTool(toolRegistry, "hello", { name: "Ada" }, ctx);
    expect(result.status).toBe("success");
    expect(order).toEqual(["pre", "post:hello:true"]);
  });

  test("VETO from pre_tool_execution aborts as permission_denied (Phase 1h §veto)", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new HelloTool());
    const { ctx, decisionStore, registry: hookRegistry } = ctxWithHooks();

    hookRegistry.register({
      name: "pre_tool_execution",
      handler: () => VETO({ reason: "banned by policy" }),
    });

    const result = await executeTool(toolRegistry, "hello", { name: "Ada" }, ctx);
    expect(result.status).toBe("permission_denied");
    if (result.status === "permission_denied") {
      expect(result.reason).toBe("banned by policy");
      expect(result.requiresApproval).toBe(false);
    }

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const denied = r.entries.find(
      (e) =>
        e.type === "permission_denied" &&
        (e.metadata as { vetoed_by_hook?: string }).vetoed_by_hook ===
          "pre_tool_execution",
    );
    expect(denied).toBeDefined();
  });

  test("VETO short-circuits: tool.call is NOT invoked", async () => {
    let called = false;
    class TouchSensor extends HelloTool {
      override readonly name: string = "touch-sensor";
      override async call(): Promise<ToolResult<{ greeting: string }>> {
        called = true;
        return { success: true, output: { greeting: "" } };
      }
    }
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new TouchSensor());
    const { ctx, registry: hookRegistry } = ctxWithHooks();

    hookRegistry.register({
      name: "pre_tool_execution",
      handler: () => VETO({ reason: "no" }),
    });

    await executeTool(toolRegistry, "touch-sensor", {}, ctx);
    expect(called).toBe(false);
  });

  test("tool_approval_required fires before the local approval callback", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new ApprovalTool());
    const { ctx, registry: hookRegistry } = ctxWithHooks();

    const order: string[] = [];
    hookRegistry.register({
      name: "tool_approval_required",
      handler: () => void order.push("hook"),
    });

    await executeTool(toolRegistry, "needs-approval", {}, ctx, {
      onApprovalRequired: async () => {
        order.push("callback");
        return true;
      },
    });

    expect(order).toEqual(["hook", "callback"]);
  });

  test("VETO from tool_approval_required denies without invoking the callback", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new ApprovalTool());
    const { ctx, decisionStore, registry: hookRegistry } = ctxWithHooks();

    let callbackRan = false;
    hookRegistry.register({
      name: "tool_approval_required",
      handler: () => VETO({ reason: "external policy denied" }),
    });

    const result = await executeTool(toolRegistry, "needs-approval", {}, ctx, {
      onApprovalRequired: async () => {
        callbackRan = true;
        return true;
      },
    });

    expect(result.status).toBe("permission_denied");
    expect(callbackRan).toBe(false);

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const denied = r.entries.find(
      (e) =>
        e.type === "permission_denied" &&
        (e.metadata as { vetoed_by_hook?: string }).vetoed_by_hook ===
          "tool_approval_required",
    );
    expect(denied).toBeDefined();
  });

  test("post_tool_execution still fires on the execution_error path", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new ThrowingTool());
    const { ctx, registry: hookRegistry } = ctxWithHooks();

    let postPayload:
      | { tool_name: string; success: boolean; error_category?: string }
      | undefined;
    hookRegistry.register({
      name: "post_tool_execution",
      handler: (p) => {
        postPayload = p as {
          tool_name: string;
          success: boolean;
          error_category?: string;
        };
      },
    });

    await executeTool(toolRegistry, "boom", {}, ctx);
    expect(postPayload).toBeDefined();
    expect(postPayload?.success).toBe(false);
    expect(postPayload?.tool_name).toBe("boom");
  });

  test("post_tool_execution fires on the tool_failed (success:false) path", async () => {
    class StructuredFail extends HelloTool {
      override readonly name: string = "struct-fail";
      override async call(): Promise<ToolResult<{ greeting: string }>> {
        return {
          success: false,
          output: { greeting: "" },
          error: "rate limit hit",
        };
      }
    }
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new StructuredFail());
    const { ctx, registry: hookRegistry } = ctxWithHooks();

    let fired = false;
    hookRegistry.register({
      name: "post_tool_execution",
      handler: () => {
        fired = true;
      },
    });

    await executeTool(toolRegistry, "struct-fail", {}, ctx);
    expect(fired).toBe(true);
  });

  test("absent ctx.hooks: pipeline behaviour unchanged (no errors, no extra emissions)", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new HelloTool());
    const result = await executeTool(toolRegistry, "hello", { name: "Ada" }, baseCtx);
    expect(result.status).toBe("success");
  });
});
