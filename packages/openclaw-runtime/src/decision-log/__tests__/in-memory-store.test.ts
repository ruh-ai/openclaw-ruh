import { describe, expect, test } from "bun:test";
import { InMemoryDecisionStore } from "../in-memory-store";
import type { Decision, DecisionMetric } from "../types";

const SPEC = "1.0.0-rc.1";

function mkDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: overrides.id ?? "01ABCDEFGHJKMNPQRSTVWXYZ00",
    pipeline_id: overrides.pipeline_id ?? "pipe-1",
    agent_id: overrides.agent_id ?? "agent-1",
    session_id: overrides.session_id ?? "ses-1",
    type: overrides.type ?? "tool_execution_start",
    timestamp: overrides.timestamp ?? "2026-04-27T00:00:00.000Z",
    description: overrides.description ?? "test",
    metadata: overrides.metadata ?? {},
    spec_version: overrides.spec_version ?? SPEC,
    ...(overrides.parent_id !== undefined ? { parent_id: overrides.parent_id } : {}),
  };
}

describe("InMemoryDecisionStore — write + size", () => {
  test("write appends and size reflects count", async () => {
    const s = new InMemoryDecisionStore();
    expect(s.size()).toBe(0);
    await s.write(mkDecision({ id: "01AAA" }));
    await s.write(mkDecision({ id: "01BBB" }));
    expect(s.size()).toBe(2);
  });

  test("maxEntries evicts oldest first", async () => {
    const s = new InMemoryDecisionStore({ maxEntries: 2 });
    await s.write(mkDecision({ id: "01AAA" }));
    await s.write(mkDecision({ id: "01BBB" }));
    await s.write(mkDecision({ id: "01CCC" }));
    expect(s.size()).toBe(2);
    const result = await s.query({ pipeline_id: "pipe-1" });
    const ids = result.entries.map((e) => e.id);
    expect(ids).toEqual(["01BBB", "01CCC"]);
  });

  test("metric write does not affect decision size and vice versa", async () => {
    const s = new InMemoryDecisionStore();
    await s.write(mkDecision({ id: "01AAA" }));
    await s.writeMetric({
      pipeline_id: "pipe-1",
      agent_id: "agent-1",
      session_id: "ses-1",
      name: "x",
      value: 1,
      unit: "ms",
      timestamp: "2026-04-27T00:00:00.000Z",
    });
    expect(s.size()).toBe(1);
    expect(s.metrics()).toHaveLength(1);
  });

  test("metric maxEntries also evicts oldest", async () => {
    const s = new InMemoryDecisionStore({ maxEntries: 1 });
    const base: DecisionMetric = {
      pipeline_id: "p",
      agent_id: "a",
      session_id: "s",
      name: "n",
      value: 1,
      unit: "ms",
      timestamp: "2026-04-27T00:00:00.000Z",
    };
    await s.writeMetric({ ...base, value: 1 });
    await s.writeMetric({ ...base, value: 2 });
    expect(s.metrics()).toHaveLength(1);
    expect(s.metrics()[0]?.value).toBe(2);
  });
});

describe("InMemoryDecisionStore — query filters", () => {
  test("filters by pipeline_id (only matching pipeline returned)", async () => {
    const s = new InMemoryDecisionStore();
    await s.write(mkDecision({ id: "01A", pipeline_id: "pipe-1" }));
    await s.write(mkDecision({ id: "01B", pipeline_id: "pipe-2" }));

    const r = await s.query({ pipeline_id: "pipe-1" });
    expect(r.entries.map((e) => e.id)).toEqual(["01A"]);
    expect(r.total_count).toBe(1);
  });

  test("filters by agent_id", async () => {
    const s = new InMemoryDecisionStore();
    await s.write(mkDecision({ id: "01A", agent_id: "agent-1" }));
    await s.write(mkDecision({ id: "01B", agent_id: "agent-2" }));

    const r = await s.query({ pipeline_id: "pipe-1", agent_id: "agent-2" });
    expect(r.entries.map((e) => e.id)).toEqual(["01B"]);
  });

  test("filters by session_id", async () => {
    const s = new InMemoryDecisionStore();
    await s.write(mkDecision({ id: "01A", session_id: "ses-A" }));
    await s.write(mkDecision({ id: "01B", session_id: "ses-B" }));

    const r = await s.query({ pipeline_id: "pipe-1", session_id: "ses-A" });
    expect(r.entries.map((e) => e.id)).toEqual(["01A"]);
  });

  test("filters by types (subset)", async () => {
    const s = new InMemoryDecisionStore();
    await s.write(mkDecision({ id: "01A", type: "tool_execution_start" }));
    await s.write(mkDecision({ id: "01B", type: "tool_execution_end" }));
    await s.write(mkDecision({ id: "01C", type: "memory_read" }));

    const r = await s.query({
      pipeline_id: "pipe-1",
      types: ["tool_execution_start", "tool_execution_end"],
    });
    expect(r.entries.map((e) => e.id).sort()).toEqual(["01A", "01B"]);
  });

  test("filters by parent_id", async () => {
    const s = new InMemoryDecisionStore();
    await s.write(mkDecision({ id: "01A" }));
    await s.write(mkDecision({ id: "01B", parent_id: "01A" }));
    await s.write(mkDecision({ id: "01C", parent_id: "01A" }));
    await s.write(mkDecision({ id: "01D", parent_id: "01B" }));

    const r = await s.query({ pipeline_id: "pipe-1", parent_id: "01A" });
    expect(r.entries.map((e) => e.id).sort()).toEqual(["01B", "01C"]);
  });

  test("since is inclusive lower bound on timestamp", async () => {
    const s = new InMemoryDecisionStore();
    await s.write(mkDecision({ id: "01A", timestamp: "2026-04-27T00:00:00.000Z" }));
    await s.write(mkDecision({ id: "01B", timestamp: "2026-04-27T00:00:01.000Z" }));
    await s.write(mkDecision({ id: "01C", timestamp: "2026-04-27T00:00:02.000Z" }));

    const r = await s.query({
      pipeline_id: "pipe-1",
      since: "2026-04-27T00:00:01.000Z",
    });
    expect(r.entries.map((e) => e.id).sort()).toEqual(["01B", "01C"]);
  });

  test("until is exclusive upper bound on timestamp", async () => {
    const s = new InMemoryDecisionStore();
    await s.write(mkDecision({ id: "01A", timestamp: "2026-04-27T00:00:00.000Z" }));
    await s.write(mkDecision({ id: "01B", timestamp: "2026-04-27T00:00:01.000Z" }));
    await s.write(mkDecision({ id: "01C", timestamp: "2026-04-27T00:00:02.000Z" }));

    const r = await s.query({
      pipeline_id: "pipe-1",
      until: "2026-04-27T00:00:02.000Z",
    });
    expect(r.entries.map((e) => e.id).sort()).toEqual(["01A", "01B"]);
  });

  test("results sorted by id ascending (ULID = time-prefixed)", async () => {
    const s = new InMemoryDecisionStore();
    // Insert out of order
    await s.write(mkDecision({ id: "01C" }));
    await s.write(mkDecision({ id: "01A" }));
    await s.write(mkDecision({ id: "01B" }));

    const r = await s.query({ pipeline_id: "pipe-1" });
    expect(r.entries.map((e) => e.id)).toEqual(["01A", "01B", "01C"]);
  });
});

describe("InMemoryDecisionStore — pagination", () => {
  test("limit caps the page size and exposes next_cursor", async () => {
    const s = new InMemoryDecisionStore();
    for (let i = 0; i < 5; i++) {
      await s.write(mkDecision({ id: `01${String.fromCharCode(65 + i)}` }));
    }

    const r = await s.query({ pipeline_id: "pipe-1", limit: 2 });
    expect(r.entries.map((e) => e.id)).toEqual(["01A", "01B"]);
    expect(r.next_cursor).toBe("01B");
    expect(r.total_count).toBe(5);
  });

  test("cursor returns the next page", async () => {
    const s = new InMemoryDecisionStore();
    for (let i = 0; i < 5; i++) {
      await s.write(mkDecision({ id: `01${String.fromCharCode(65 + i)}` }));
    }

    const r1 = await s.query({ pipeline_id: "pipe-1", limit: 2 });
    const r2 = await s.query({
      pipeline_id: "pipe-1",
      limit: 2,
      cursor: r1.next_cursor,
    });
    expect(r2.entries.map((e) => e.id)).toEqual(["01C", "01D"]);
    expect(r2.next_cursor).toBe("01D");
  });

  test("last page has no next_cursor", async () => {
    const s = new InMemoryDecisionStore();
    for (let i = 0; i < 4; i++) {
      await s.write(mkDecision({ id: `01${String.fromCharCode(65 + i)}` }));
    }

    const r = await s.query({ pipeline_id: "pipe-1", limit: 2, cursor: "01B" });
    expect(r.entries.map((e) => e.id)).toEqual(["01C", "01D"]);
    expect(r.next_cursor).toBeUndefined();
  });

  test("default limit is 100", async () => {
    const s = new InMemoryDecisionStore();
    for (let i = 0; i < 150; i++) {
      const id = `01${i.toString(36).padStart(24, "0").toUpperCase()}`;
      await s.write(mkDecision({ id }));
    }
    const r = await s.query({ pipeline_id: "pipe-1" });
    expect(r.entries).toHaveLength(100);
    expect(r.total_count).toBe(150);
    expect(r.next_cursor).toBeDefined();
  });

  test("stale cursor (not found) restarts from start", async () => {
    const s = new InMemoryDecisionStore();
    await s.write(mkDecision({ id: "01A" }));
    await s.write(mkDecision({ id: "01B" }));

    const r = await s.query({
      pipeline_id: "pipe-1",
      cursor: "ZZ-not-in-store",
    });
    expect(r.entries.map((e) => e.id)).toEqual(["01A", "01B"]);
  });
});
