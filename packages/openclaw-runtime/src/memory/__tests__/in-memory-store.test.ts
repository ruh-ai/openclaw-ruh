import { describe, expect, test } from "bun:test";
import { InMemoryMemoryStore } from "../in-memory-store";
import type { MemoryEntry, MemoryStatus, MemoryType } from "../types";

function mkEntry(over: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: over.id ?? "loxon-masonry",
    type: (over.type ?? "feedback") as MemoryType,
    title: over.title ?? "LOXON masonry",
    description: over.description ?? "Use LOXON family",
    tier: over.tier ?? 2,
    lane: over.lane ?? "estimating",
    source_identity: over.source_identity ?? "scott@ecc.com",
    source_channel: over.source_channel ?? "email",
    status: (over.status ?? "flagged") as MemoryStatus,
    created_at: over.created_at ?? "2026-04-27T00:00:00.000Z",
    updated_at: over.updated_at ?? "2026-04-27T00:00:00.000Z",
    spec_version: over.spec_version ?? "1.0.0-rc.1",
  };
}

describe("InMemoryMemoryStore — put/get/has", () => {
  test("put then get returns the same entry", async () => {
    const s = new InMemoryMemoryStore();
    const e = mkEntry();
    await s.put(e);
    expect(await s.get("loxon-masonry")).toEqual(e);
  });

  test("get returns undefined for unknown id", async () => {
    const s = new InMemoryMemoryStore();
    expect(await s.get("nope")).toBeUndefined();
  });

  test("has reflects existence", async () => {
    const s = new InMemoryMemoryStore();
    await s.put(mkEntry({ id: "x" }));
    expect(await s.has("x")).toBe(true);
    expect(await s.has("y")).toBe(false);
  });

  test("put twice on same id throws", async () => {
    const s = new InMemoryMemoryStore();
    await s.put(mkEntry({ id: "dup" }));
    await expect(s.put(mkEntry({ id: "dup" }))).rejects.toThrow(/already exists/);
  });
});

describe("InMemoryMemoryStore — update", () => {
  test("update replaces the existing entry", async () => {
    const s = new InMemoryMemoryStore();
    await s.put(mkEntry({ id: "x", status: "flagged" }));
    await s.update(mkEntry({ id: "x", status: "confirmed" }));
    const got = await s.get("x");
    expect(got?.status).toBe("confirmed");
  });

  test("update on missing id throws", async () => {
    const s = new InMemoryMemoryStore();
    await expect(s.update(mkEntry({ id: "ghost" }))).rejects.toThrow(/does not exist/);
  });
});

describe("InMemoryMemoryStore — list filters", () => {
  test("filters by type", async () => {
    const s = new InMemoryMemoryStore();
    await s.put(mkEntry({ id: "a", type: "feedback" }));
    await s.put(mkEntry({ id: "b", type: "project" }));
    const r = await s.list({ types: ["feedback"] });
    expect(r.map((e) => e.id)).toEqual(["a"]);
  });

  test("filters by lane", async () => {
    const s = new InMemoryMemoryStore();
    await s.put(mkEntry({ id: "a", lane: "estimating" }));
    await s.put(mkEntry({ id: "b", lane: "operations" }));
    const r = await s.list({ lanes: ["operations"] });
    expect(r.map((e) => e.id)).toEqual(["b"]);
  });

  test("filters by status (raw — facade enforces visibility)", async () => {
    const s = new InMemoryMemoryStore();
    await s.put(mkEntry({ id: "a", status: "confirmed" }));
    await s.put(mkEntry({ id: "b", status: "flagged" }));
    const r = await s.list({ statuses: ["confirmed"] });
    expect(r.map((e) => e.id)).toEqual(["a"]);
  });

  test("returns all when filter is empty", async () => {
    const s = new InMemoryMemoryStore();
    await s.put(mkEntry({ id: "a" }));
    await s.put(mkEntry({ id: "b" }));
    expect((await s.list({})).length).toBe(2);
  });

  test("results sorted by created_at then id", async () => {
    const s = new InMemoryMemoryStore();
    await s.put(mkEntry({ id: "later", created_at: "2026-04-27T01:00:00.000Z" }));
    await s.put(mkEntry({ id: "earlier", created_at: "2026-04-27T00:00:00.000Z" }));
    const r = await s.list({});
    expect(r.map((e) => e.id)).toEqual(["earlier", "later"]);
  });
});
