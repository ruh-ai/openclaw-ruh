import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { InMemoryDecisionStore } from "../in-memory-store";
import {
  DecisionLog,
  DecisionMetadataValidationError,
  ulid,
  type DecisionLogOptions,
} from "../log";
import type { DecisionStoreAdapter } from "../types";

const SPEC = "1.0.0-rc.1";
const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function mkLog(extra: Partial<DecisionLogOptions> = {}): {
  log: DecisionLog;
  store: InMemoryDecisionStore;
} {
  const store = new InMemoryDecisionStore();
  const log = new DecisionLog({
    pipeline_id: "pipe-1",
    agent_id: "agent-1",
    session_id: "ses-1",
    spec_version: SPEC,
    store,
    ...extra,
  });
  return { log, store };
}

describe("ulid", () => {
  test("returns a 26-char string", () => {
    const id = ulid();
    expect(id).toHaveLength(26);
  });

  test("uses only Crockford Base32 characters (no I L O U)", () => {
    const id = ulid();
    expect(id).toMatch(CROCKFORD);
  });

  test("deterministic with mocked now and random", () => {
    const a = ulid(0, () => 0);
    const b = ulid(0, () => 0);
    expect(a).toBe(b);
  });

  test("time prefix is sortable — earlier timestamp => smaller id", () => {
    const earlier = ulid(1_000, () => 0);
    const later = ulid(2_000_000_000, () => 0);
    expect(earlier < later).toBe(true);
  });

  test("two calls at different times with same random produce different ids", () => {
    const a = ulid(1, () => 0);
    const b = ulid(2, () => 0);
    expect(a).not.toBe(b);
  });
});

describe("DecisionLog.emit — populates fields", () => {
  test("fills id, pipeline/agent/session ids, timestamp, spec_version", async () => {
    const { log } = mkLog({ now: () => 1_700_000_000_000, random: () => 0 });
    const d = await log.emit({
      type: "session_start",
      description: "open",
      metadata: { trigger_id: "t1", mode: "agent", dev_stage: "running" },
    });
    expect(d.id).toMatch(CROCKFORD);
    expect(d.pipeline_id).toBe("pipe-1");
    expect(d.agent_id).toBe("agent-1");
    expect(d.session_id).toBe("ses-1");
    expect(d.spec_version).toBe(SPEC);
    expect(d.type).toBe("session_start");
    expect(d.description).toBe("open");
    expect(d.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
  });

  test("persists to the store", async () => {
    const { log, store } = mkLog();
    await log.emit({ type: "turn_start", description: "t1" });
    await log.emit({ type: "turn_end", description: "t2" });
    expect(store.size()).toBe(2);
  });

  test("missing metadata defaults to empty object", async () => {
    const { log } = mkLog();
    const d = await log.emit({ type: "turn_start", description: "x" });
    expect(d.metadata).toEqual({});
  });
});

describe("DecisionLog.emit — redaction at write time", () => {
  test("string in metadata is redacted before persistence", async () => {
    const { log, store } = mkLog();
    await log.emit({
      type: "tool_execution_end",
      description: "x",
      metadata: { command: "openclaw login --token sk_live_abc123def456ghi789" },
    });
    const r = await store.query({ pipeline_id: "pipe-1" });
    const stored = r.entries[0];
    const cmd = (stored?.metadata as { command: string }).command;
    expect(cmd).not.toContain("sk_live_abc123def456ghi789");
    expect(cmd).toContain("<REDACTED:credential>");
  });

  test("nested metadata strings are redacted recursively", async () => {
    const { log, store } = mkLog();
    await log.emit({
      type: "error_classified",
      description: "x",
      metadata: {
        original: {
          message: "Authorization: Bearer abcdefghij1234567890",
        },
      },
    });
    const r = await store.query({ pipeline_id: "pipe-1" });
    const original = (r.entries[0]?.metadata as { original: { message: string } })
      .original;
    expect(original.message).toContain("Bearer <REDACTED:credential>");
  });

  test("description is redacted too", async () => {
    const { log, store } = mkLog();
    await log.emit({
      type: "error_classified",
      description: "leaked Bearer abcdefghij1234567890 in description",
    });
    const r = await store.query({ pipeline_id: "pipe-1" });
    expect(r.entries[0]?.description).toContain("Bearer <REDACTED:credential>");
  });

  test("custom redaction rules apply alongside defaults", async () => {
    const { log, store } = mkLog({
      redaction: {
        extraRules: [
          {
            pattern: /COMPANY-\w+/g,
            replacement: "<REDACTED:custom>",
            description: "test",
          },
        ],
      },
    });
    await log.emit({
      type: "custom",
      description: "x",
      metadata: { tag: "COMPANY-INTERNAL" },
    });
    const r = await store.query({ pipeline_id: "pipe-1" });
    expect((r.entries[0]?.metadata as { tag: string }).tag).toContain(
      "<REDACTED:custom>",
    );
  });
});

describe("DecisionLog.emit — metadata schema validation", () => {
  const ToolExecutionEndMetadata = z
    .object({
      tool_name: z.string(),
      execution_id: z.string(),
      success: z.boolean(),
    })
    .strict();

  test("valid metadata passes when bound", async () => {
    const { log, store } = mkLog({
      metadataSchemas: [
        {
          type: "tool_execution_end",
          schemaName: "ToolExecutionEndMetadata",
          schema: ToolExecutionEndMetadata,
        },
      ],
    });
    await log.emit({
      type: "tool_execution_end",
      description: "ok",
      metadata: { tool_name: "hello", execution_id: "x", success: true },
    });
    expect(store.size()).toBe(1);
  });

  test("invalid metadata throws DecisionMetadataValidationError", async () => {
    const { log } = mkLog({
      metadataSchemas: [
        {
          type: "tool_execution_end",
          schemaName: "ToolExecutionEndMetadata",
          schema: ToolExecutionEndMetadata,
        },
      ],
    });
    await expect(
      log.emit({
        type: "tool_execution_end",
        description: "bad",
        metadata: { tool_name: "hello" }, // missing execution_id + success
      }),
    ).rejects.toBeInstanceOf(DecisionMetadataValidationError);
  });

  test("validation error includes type, schema name, and field paths", async () => {
    const { log } = mkLog({
      metadataSchemas: [
        {
          type: "tool_execution_end",
          schemaName: "ToolExecutionEndMetadata",
          schema: ToolExecutionEndMetadata,
        },
      ],
    });
    let caught: DecisionMetadataValidationError | undefined;
    try {
      await log.emit({
        type: "tool_execution_end",
        description: "bad",
        metadata: { tool_name: "hello" },
      });
    } catch (e) {
      caught = e as DecisionMetadataValidationError;
    }
    expect(caught).toBeDefined();
    expect(caught?.type).toBe("tool_execution_end");
    expect(caught?.schemaName).toBe("ToolExecutionEndMetadata");
    expect(caught?.message).toContain("tool_execution_end");
    expect(caught?.message).toContain("ToolExecutionEndMetadata");
  });

  test("types without a binding accept any metadata", async () => {
    const { log, store } = mkLog({
      metadataSchemas: [
        {
          type: "tool_execution_end",
          schemaName: "ToolExecutionEndMetadata",
          schema: ToolExecutionEndMetadata,
        },
      ],
    });
    await log.emit({
      type: "memory_read",
      description: "ok",
      metadata: { entry_id: "e1", whatever: 42 },
    });
    expect(store.size()).toBe(1);
  });
});

describe("DecisionLog — parent_id stack", () => {
  test("emit attributes parent_id from the stack top", async () => {
    const { log } = mkLog();
    log.pushParent("parent-1");
    const d = await log.emit({ type: "memory_read", description: "x" });
    expect(d.parent_id).toBe("parent-1");
    log.popParent();
  });

  test("explicit parent_id on input overrides the stack", async () => {
    const { log } = mkLog();
    log.pushParent("from-stack");
    const d = await log.emit({
      type: "memory_read",
      description: "x",
      parent_id: "from-input",
    });
    expect(d.parent_id).toBe("from-input");
    log.popParent();
  });

  test("popParent returns and removes the top", async () => {
    const { log } = mkLog();
    log.pushParent("a");
    log.pushParent("b");
    expect(log.popParent()).toBe("b");
    const d = await log.emit({ type: "memory_read", description: "x" });
    expect(d.parent_id).toBe("a");
    log.popParent();
  });

  test("withParent pushes and pops automatically (success)", async () => {
    const { log } = mkLog();
    let inner: string | undefined;
    await log.withParent("p", async () => {
      const d = await log.emit({ type: "memory_read", description: "x" });
      inner = d.parent_id;
    });
    expect(inner).toBe("p");
    // After withParent — stack is empty, no parent_id
    const after = await log.emit({ type: "memory_read", description: "x" });
    expect(after.parent_id).toBeUndefined();
  });

  test("withParent pops the stack even when callback throws", async () => {
    const { log } = mkLog();
    await expect(
      log.withParent("p", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const after = await log.emit({ type: "memory_read", description: "x" });
    expect(after.parent_id).toBeUndefined();
  });

  test("no parent_id emitted when stack empty and no input override", async () => {
    const { log } = mkLog();
    const d = await log.emit({ type: "session_start", description: "x" });
    expect(d.parent_id).toBeUndefined();
  });
});

describe("DecisionLog.metric", () => {
  test("fills pipeline/agent/session ids and timestamp", async () => {
    const { log, store } = mkLog({ now: () => 1_700_000_000_000 });
    const m = await log.metric({ name: "tool.latency", value: 42, unit: "ms" });
    expect(m.pipeline_id).toBe("pipe-1");
    expect(m.agent_id).toBe("agent-1");
    expect(m.session_id).toBe("ses-1");
    expect(m.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
    expect(store.metrics()).toHaveLength(1);
  });

  test("forwards labels", async () => {
    const { log, store } = mkLog();
    await log.metric({
      name: "tool.latency",
      value: 1,
      unit: "ms",
      labels: { tool_name: "hello" },
    });
    expect(store.metrics()[0]?.labels).toEqual({ tool_name: "hello" });
  });

  test("omits labels key when not provided", async () => {
    const { log, store } = mkLog();
    await log.metric({ name: "x", value: 1, unit: "ms" });
    const stored = store.metrics()[0];
    expect(stored).toBeDefined();
    expect("labels" in (stored as object)).toBe(false);
  });
});

describe("DecisionLog.query", () => {
  test("scopes to this log's pipeline_id by default", async () => {
    const { log, store } = mkLog();
    // Inject a foreign-pipeline decision directly into the store
    await store.write({
      id: "01OTHER",
      pipeline_id: "other-pipe",
      agent_id: "x",
      session_id: "x",
      type: "turn_start",
      timestamp: "2026-04-27T00:00:00.000Z",
      description: "x",
      metadata: {},
      spec_version: SPEC,
    });
    await log.emit({ type: "turn_start", description: "mine" });

    const r = await log.query({});
    expect(r.entries.every((e) => e.pipeline_id === "pipe-1")).toBe(true);
  });

  test("explicit pipeline_id overrides the default scope", async () => {
    const { log, store } = mkLog();
    await store.write({
      id: "01OTHER",
      pipeline_id: "other-pipe",
      agent_id: "x",
      session_id: "x",
      type: "turn_start",
      timestamp: "2026-04-27T00:00:00.000Z",
      description: "x",
      metadata: {},
      spec_version: SPEC,
    });
    const r = await log.query({ pipeline_id: "other-pipe" });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]?.pipeline_id).toBe("other-pipe");
  });

  test("forwards types/since/until/parent_id/limit/cursor to store", async () => {
    const captured: Array<unknown> = [];
    const recordingStore: DecisionStoreAdapter = {
      async write() {},
      async writeMetric() {},
      async query(q) {
        captured.push(q);
        return { entries: [], total_count: 0 };
      },
    };
    const log = new DecisionLog({
      pipeline_id: "pipe-1",
      agent_id: "agent-1",
      session_id: "ses-1",
      spec_version: SPEC,
      store: recordingStore,
    });
    await log.query({
      types: ["turn_start"],
      since: "2026-01-01T00:00:00.000Z",
      until: "2026-12-31T00:00:00.000Z",
      parent_id: "p1",
      limit: 5,
      cursor: "cur",
    });
    expect(captured[0]).toEqual({
      pipeline_id: "pipe-1",
      types: ["turn_start"],
      since: "2026-01-01T00:00:00.000Z",
      until: "2026-12-31T00:00:00.000Z",
      parent_id: "p1",
      limit: 5,
      cursor: "cur",
    });
  });
});
