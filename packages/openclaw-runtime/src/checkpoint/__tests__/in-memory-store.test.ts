import { describe, expect, test } from "bun:test";
import { InMemoryCheckpointStore } from "../in-memory-store";
import type { Checkpoint } from "../types";

const SHA = `sha256:${"a".repeat(64)}`;

function mkCheckpoint(over: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: over.id ?? "01ABCDEFGHJKMNPQRSTVWXYZ00",
    spec_version: over.spec_version ?? "1.0.0-rc.1",
    pipeline_id: over.pipeline_id ?? "pipe-1",
    agent_id: over.agent_id ?? "agent-1",
    session_id: over.session_id ?? "ses-1",
    dev_stage: over.dev_stage ?? "running",
    created_at: over.created_at ?? "2026-04-27T00:00:00.000Z",
    expires_at: over.expires_at ?? "2026-04-27T04:00:00.000Z",
    copilot_state: over.copilot_state ?? {},
    build_manifest: over.build_manifest ?? [],
    conversation_summary: over.conversation_summary ?? "",
    conversation_tokens_estimate: over.conversation_tokens_estimate ?? 0,
    files_written: over.files_written ?? [],
    files_pending: over.files_pending ?? [],
    workspace_checksum: over.workspace_checksum ?? SHA,
    sub_agents: over.sub_agents ?? [],
    reason: over.reason ?? "scheduled_interval",
  };
}

describe("InMemoryCheckpointStore — put/get", () => {
  test("put + get roundtrip", async () => {
    const s = new InMemoryCheckpointStore();
    const c = mkCheckpoint();
    await s.put(c);
    expect((await s.get(c.id))?.id).toBe(c.id);
  });

  test("duplicate put throws", async () => {
    const s = new InMemoryCheckpointStore();
    await s.put(mkCheckpoint({ id: "01AAAAAAAAAAAAAAAAAAAAAAAA" }));
    await expect(
      s.put(mkCheckpoint({ id: "01AAAAAAAAAAAAAAAAAAAAAAAA" })),
    ).rejects.toThrow(/already exists/);
  });
});

describe("InMemoryCheckpointStore — latest", () => {
  test("returns the newest unretired checkpoint for the (pipeline, agent, session)", async () => {
    const s = new InMemoryCheckpointStore();
    await s.put(
      mkCheckpoint({
        id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
        created_at: "2026-04-27T00:00:00.000Z",
      }),
    );
    await s.put(
      mkCheckpoint({
        id: "01BBBBBBBBBBBBBBBBBBBBBBBB",
        created_at: "2026-04-27T01:00:00.000Z",
      }),
    );
    const got = await s.latest({
      pipeline_id: "pipe-1",
      agent_id: "agent-1",
      session_id: "ses-1",
    });
    expect(got?.id).toBe("01BBBBBBBBBBBBBBBBBBBBBBBB");
  });

  test("excludes retired checkpoints", async () => {
    const s = new InMemoryCheckpointStore();
    await s.put(
      mkCheckpoint({
        id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
        created_at: "2026-04-27T01:00:00.000Z",
      }),
    );
    await s.put(
      mkCheckpoint({
        id: "01BBBBBBBBBBBBBBBBBBBBBBBB",
        created_at: "2026-04-27T00:00:00.000Z",
      }),
    );
    await s.retire("01AAAAAAAAAAAAAAAAAAAAAAAA", "2026-04-27T02:00:00.000Z");
    const got = await s.latest({
      pipeline_id: "pipe-1",
      agent_id: "agent-1",
      session_id: "ses-1",
    });
    expect(got?.id).toBe("01BBBBBBBBBBBBBBBBBBBBBBBB");
  });

  test("returns undefined when no matches", async () => {
    const s = new InMemoryCheckpointStore();
    expect(
      await s.latest({
        pipeline_id: "x",
        agent_id: "x",
        session_id: "x",
      }),
    ).toBeUndefined();
  });
});

describe("InMemoryCheckpointStore — query", () => {
  test("filters by pipeline_id and excludes retired by default", async () => {
    const s = new InMemoryCheckpointStore();
    await s.put(
      mkCheckpoint({ id: "01AAAAAAAAAAAAAAAAAAAAAAAA", pipeline_id: "p1" }),
    );
    await s.put(
      mkCheckpoint({ id: "01BBBBBBBBBBBBBBBBBBBBBBBB", pipeline_id: "p2" }),
    );
    await s.put(
      mkCheckpoint({ id: "01CCCCCCCCCCCCCCCCCCCCCCCC", pipeline_id: "p1" }),
    );
    await s.retire("01CCCCCCCCCCCCCCCCCCCCCCCC", "2026-04-27T02:00:00.000Z");

    const r = await s.query({ pipeline_id: "p1" });
    expect(r.map((c) => c.id)).toEqual(["01AAAAAAAAAAAAAAAAAAAAAAAA"]);
  });

  test("include_retired=true returns retired entries too", async () => {
    const s = new InMemoryCheckpointStore();
    await s.put(
      mkCheckpoint({
        id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
        created_at: "2026-04-27T00:00:00.000Z",
      }),
    );
    await s.retire("01AAAAAAAAAAAAAAAAAAAAAAAA", "2026-04-27T02:00:00.000Z");

    const r = await s.query({ pipeline_id: "pipe-1", include_retired: true });
    expect(r.map((c) => c.id)).toEqual(["01AAAAAAAAAAAAAAAAAAAAAAAA"]);
  });

  test("results sorted newest-first; limit applied", async () => {
    const s = new InMemoryCheckpointStore();
    await s.put(
      mkCheckpoint({
        id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
        created_at: "2026-04-27T00:00:00.000Z",
      }),
    );
    await s.put(
      mkCheckpoint({
        id: "01BBBBBBBBBBBBBBBBBBBBBBBB",
        created_at: "2026-04-27T01:00:00.000Z",
      }),
    );
    await s.put(
      mkCheckpoint({
        id: "01CCCCCCCCCCCCCCCCCCCCCCCC",
        created_at: "2026-04-27T02:00:00.000Z",
      }),
    );
    const r = await s.query({ pipeline_id: "pipe-1", limit: 2 });
    expect(r.map((c) => c.id)).toEqual([
      "01CCCCCCCCCCCCCCCCCCCCCCCC",
      "01BBBBBBBBBBBBBBBBBBBBBBBB",
    ]);
  });

  test("since/until filter on created_at", async () => {
    const s = new InMemoryCheckpointStore();
    await s.put(
      mkCheckpoint({
        id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
        created_at: "2026-04-27T00:00:00.000Z",
      }),
    );
    await s.put(
      mkCheckpoint({
        id: "01BBBBBBBBBBBBBBBBBBBBBBBB",
        created_at: "2026-04-27T01:00:00.000Z",
      }),
    );
    const r = await s.query({
      pipeline_id: "pipe-1",
      since: "2026-04-27T00:30:00.000Z",
      until: "2026-04-27T02:00:00.000Z",
    });
    expect(r.map((c) => c.id)).toEqual(["01BBBBBBBBBBBBBBBBBBBBBBBB"]);
  });
});

describe("InMemoryCheckpointStore — retire / isRetired", () => {
  test("retire marks the entry", async () => {
    const s = new InMemoryCheckpointStore();
    await s.put(mkCheckpoint());
    expect(await s.isRetired("01ABCDEFGHJKMNPQRSTVWXYZ00")).toBe(false);
    await s.retire("01ABCDEFGHJKMNPQRSTVWXYZ00", "2026-04-27T02:00:00.000Z");
    expect(await s.isRetired("01ABCDEFGHJKMNPQRSTVWXYZ00")).toBe(true);
  });

  test("retire on missing id throws", async () => {
    const s = new InMemoryCheckpointStore();
    await expect(s.retire("ghost", "x")).rejects.toThrow(/not found/);
  });

  test("isRetired returns false for unknown id", async () => {
    const s = new InMemoryCheckpointStore();
    expect(await s.isRetired("ghost")).toBe(false);
  });
});
