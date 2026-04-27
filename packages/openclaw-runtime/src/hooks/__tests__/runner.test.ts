import { describe, expect, test } from "bun:test";
import { DecisionLog, InMemoryDecisionStore } from "../../decision-log";
import { HookRegistry } from "../registry";
import { HookRunner } from "../runner";
import { VETO } from "../types";

const SPEC = "1.0.0-rc.1";

function build() {
  const registry = new HookRegistry();
  const decisionStore = new InMemoryDecisionStore();
  const decisionLog = new DecisionLog({
    pipeline_id: "pipe-1",
    agent_id: "agent-1",
    session_id: "ses-1",
    spec_version: SPEC,
    store: decisionStore,
  });
  const runner = new HookRunner({
    pipelineId: "pipe-1",
    agentId: "agent-1",
    sessionId: "ses-1",
    registry,
    decisionLog,
  });
  return { registry, runner, decisionStore };
}

describe("HookRunner.fire — happy path", () => {
  test("with no handlers: zeros across the board, no decision emitted", async () => {
    const { runner, decisionStore } = build();
    const r = await runner.fire("session_start", { foo: "bar" });
    expect(r.handler_count).toBe(0);
    expect(r.succeeded).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.failures).toEqual([]);
    expect(r.dispatched_async).toBe(0);
    const log = await decisionStore.query({ pipeline_id: "pipe-1" });
    expect(log.entries.filter((e) => e.type === "hook_fired")).toHaveLength(0);
  });

  test("invokes a sync handler with payload + ctx", async () => {
    const { registry, runner } = build();
    const seen: Array<{ payload: unknown; ctxAgent?: string }> = [];
    registry.register({
      name: "session_start",
      handler: (payload, ctx) => {
        seen.push({ payload, ctxAgent: ctx.agent_id });
      },
    });
    await runner.fire("session_start", { hello: "world" });
    expect(seen).toEqual([{ payload: { hello: "world" }, ctxAgent: "agent-1" }]);
  });

  test("emits hook_fired with handler_count + succeeded counts when handlers exist", async () => {
    const { registry, runner, decisionStore } = build();
    registry.register({ name: "session_start", handler: () => {} });
    registry.register({ name: "session_start", handler: () => {} });
    await runner.fire("session_start", {});
    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const fired = r.entries.find((e) => e.type === "hook_fired");
    expect(fired).toBeDefined();
    const md = fired?.metadata as {
      handler_count: number;
      succeeded: number;
      failed: number;
    };
    expect(md.handler_count).toBe(2);
    expect(md.succeeded).toBe(2);
    expect(md.failed).toBe(0);
  });
});

describe("HookRunner.fire — sync handler errors", () => {
  test("error in sync handler is caught + emits hook_failed; runner still returns aggregate", async () => {
    const { registry, runner, decisionStore } = build();
    registry.register({
      name: "session_start",
      label: "ok-handler",
      handler: () => {},
    });
    registry.register({
      name: "session_start",
      label: "bad-handler",
      handler: () => {
        throw new Error("kaboom");
      },
    });
    const r = await runner.fire("session_start", {});
    expect(r.handler_count).toBe(2);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]?.error).toContain("kaboom");
    expect(r.failures[0]?.label).toBe("bad-handler");

    const log = await decisionStore.query({ pipeline_id: "pipe-1" });
    expect(log.entries.some((e) => e.type === "hook_failed")).toBe(true);
  });

  test("subsequent handlers still fire when an earlier one throws", async () => {
    const { registry, runner } = build();
    let lateRan = false;
    registry.register({
      name: "session_start",
      handler: () => {
        throw new Error("early");
      },
    });
    registry.register({
      name: "session_start",
      handler: () => {
        lateRan = true;
      },
    });
    await runner.fire("session_start", {});
    expect(lateRan).toBe(true);
  });
});

describe("HookRunner.fire — VETO", () => {
  test("VETO from a veto-able hook is recorded in the result", async () => {
    const { registry, runner } = build();
    registry.register({
      name: "pre_tool_execution",
      handler: () => VETO({ reason: "banned command" }),
    });
    const r = await runner.fire("pre_tool_execution", { tool_name: "x" });
    expect(r.veto?.reason).toBe("banned command");
  });

  test("first VETO wins; remaining handlers still run", async () => {
    const { registry, runner } = build();
    let secondRan = false;
    registry.register({
      name: "pre_tool_execution",
      handler: () => VETO({ reason: "first" }),
    });
    registry.register({
      name: "pre_tool_execution",
      handler: () => {
        secondRan = true;
        return VETO({ reason: "second-ignored" });
      },
    });
    const r = await runner.fire("pre_tool_execution", {});
    expect(r.veto?.reason).toBe("first");
    expect(secondRan).toBe(true);
  });

  test("VETO from a non-veto hook is ignored + emits a warning hook_failed", async () => {
    const { registry, runner, decisionStore } = build();
    registry.register({
      name: "post_tool_execution",
      handler: () => VETO({ reason: "wrong hook" }),
    });
    const r = await runner.fire("post_tool_execution", {});
    expect(r.veto).toBeUndefined();
    // succeeded count is unchanged — VETO from non-veto isn't a failure path,
    // but a warning hook_failed is still emitted to the decision log.
    expect(r.succeeded).toBe(1);
    const log = await decisionStore.query({ pipeline_id: "pipe-1" });
    const warn = log.entries.find(
      (e) =>
        e.type === "hook_failed" &&
        (e.metadata as { error: string }).error === "veto_returned_from_non_veto_hook",
    );
    expect(warn).toBeDefined();
  });
});

describe("HookRunner.fire — fire-and-forget", () => {
  test("FaF handler is dispatched but not awaited", async () => {
    const { registry, runner } = build();
    let resolveLater!: () => void;
    const promise = new Promise<void>((r) => {
      resolveLater = r;
    });
    registry.register({
      name: "session_start",
      fire_mode: "fire_and_forget",
      handler: async () => {
        await promise; // would block forever if awaited
      },
    });
    const r = await runner.fire("session_start", {});
    expect(r.dispatched_async).toBe(1);
    expect(r.succeeded).toBe(1);
    resolveLater();
  });

  test("FaF handler that rejects emits hook_failed asynchronously", async () => {
    const { registry, runner, decisionStore } = build();
    registry.register({
      name: "session_start",
      fire_mode: "fire_and_forget",
      handler: async () => {
        throw new Error("async-fail");
      },
    });
    const r = await runner.fire("session_start", {});
    expect(r.dispatched_async).toBe(1);
    // Wait a microtask so the rejection propagates.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const log = await decisionStore.query({ pipeline_id: "pipe-1" });
    const failed = log.entries.find(
      (e) =>
        e.type === "hook_failed" &&
        (e.metadata as { error: string }).error === "async-fail",
    );
    expect(failed).toBeDefined();
  });
});

describe("HookRunner.fire — capability-bound decisionLog", () => {
  test("HookContext receives decisionLog only when decision_log_emit cap declared", async () => {
    const { registry, runner } = build();
    let withCap: boolean | undefined;
    let withoutCap: boolean | undefined;
    registry.register({
      name: "session_start",
      label: "cap",
      capabilities: [{ kind: "decision_log_emit" }],
      handler: (_p, ctx) => {
        withCap = ctx.decisionLog !== undefined;
      },
    });
    registry.register({
      name: "session_start",
      label: "no-cap",
      capabilities: [],
      handler: (_p, ctx) => {
        withoutCap = ctx.decisionLog !== undefined;
      },
    });
    await runner.fire("session_start", {});
    expect(withCap).toBe(true);
    expect(withoutCap).toBe(false);
  });
});

describe("HookRunner.fire — without decisionLog", () => {
  test("runner works without a decisionLog (no emissions, no errors)", async () => {
    const registry = new HookRegistry();
    const runner = new HookRunner({
      pipelineId: "pipe-1",
      registry,
    });
    let ran = false;
    registry.register({
      name: "session_start",
      handler: () => {
        ran = true;
      },
    });
    const r = await runner.fire("session_start", {});
    expect(ran).toBe(true);
    expect(r.handler_count).toBe(1);
    expect(r.succeeded).toBe(1);
  });
});

describe("HookRunner.fire — scope priority on fire", () => {
  test("runtime handlers fire before pipeline before session", async () => {
    const { registry, runner } = build();
    const order: string[] = [];
    registry.register({
      name: "session_start",
      scope: "session",
      handler: () => {
        order.push("session");
      },
    });
    registry.register({
      name: "session_start",
      scope: "pipeline",
      handler: () => {
        order.push("pipeline");
      },
    });
    registry.register({
      name: "session_start",
      scope: "runtime",
      handler: () => {
        order.push("runtime");
      },
    });
    await runner.fire("session_start", {});
    expect(order).toEqual(["runtime", "pipeline", "session"]);
  });
});
