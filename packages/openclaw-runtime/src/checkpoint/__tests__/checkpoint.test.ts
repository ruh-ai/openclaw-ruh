import { describe, expect, test } from "bun:test";
import { DecisionLog, InMemoryDecisionStore } from "../../decision-log";
import {
  CheckpointNotFoundError,
  CheckpointStore,
  isSpecVersionCompatible,
} from "../checkpoint";
import { InMemoryCheckpointStore } from "../in-memory-store";
import type { CheckpointInput } from "../types";

const SPEC = "1.0.0-rc.1";
const SHA = `sha256:${"a".repeat(64)}`;

const minimalInput: CheckpointInput = {
  reason: "scheduled_interval",
  dev_stage: "running",
  copilot_state: {},
  build_manifest: [],
  conversation_summary: "",
  conversation_tokens_estimate: 0,
  files_written: [],
  files_pending: [],
  workspace_checksum: SHA,
  sub_agents: [],
};

function build(now = 1_700_000_000_000) {
  const store = new InMemoryCheckpointStore();
  const decisionStore = new InMemoryDecisionStore();
  const decisionLog = new DecisionLog({
    pipeline_id: "pipe-1",
    agent_id: "agent-1",
    session_id: "ses-1",
    spec_version: SPEC,
    store: decisionStore,
  });
  let _now = now;
  const checkpoint = new CheckpointStore({
    pipelineId: "pipe-1",
    agentId: "agent-1",
    sessionId: "ses-1",
    specVersion: SPEC,
    store,
    now: () => _now,
    random: () => 0,
    decisionLog,
  });
  return { checkpoint, store, decisionStore, setNow: (t: number) => (_now = t) };
}

describe("CheckpointStore.create", () => {
  test("fills id, identity, created_at, expires_at", async () => {
    const { checkpoint } = build();
    const c = await checkpoint.create(minimalInput);
    expect(c.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(c.pipeline_id).toBe("pipe-1");
    expect(c.agent_id).toBe("agent-1");
    expect(c.session_id).toBe("ses-1");
    expect(c.spec_version).toBe(SPEC);
    expect(c.created_at).toBe(new Date(1_700_000_000_000).toISOString());
    // Default 4h TTL
    expect(c.expires_at).toBe(new Date(1_700_000_000_000 + 4 * 60 * 60 * 1000).toISOString());
  });

  test("custom ttl_ms is honoured (clamped to <=7d)", async () => {
    const { checkpoint } = build();
    const c = await checkpoint.create({ ...minimalInput, ttl_ms: 60_000 });
    expect(c.expires_at).toBe(new Date(1_700_000_000_000 + 60_000).toISOString());
  });

  test("ttl_ms above 7d clamps to 7d", async () => {
    const { checkpoint } = build();
    const c = await checkpoint.create({
      ...minimalInput,
      ttl_ms: 30 * 24 * 60 * 60 * 1000, // 30d
    });
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(c.expires_at).toBe(new Date(1_700_000_000_000 + sevenDays).toISOString());
  });

  test("emits checkpoint_created decision", async () => {
    const { checkpoint, decisionStore } = build();
    const c = await checkpoint.create(minimalInput);
    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const created = r.entries.find((e) => e.type === "checkpoint_created");
    expect(created).toBeDefined();
    expect((created?.metadata as { checkpoint_id: string }).checkpoint_id).toBe(c.id);
    expect((created?.metadata as { reason: string }).reason).toBe("scheduled_interval");
  });

  test("validates the resulting checkpoint shape (rejects bad workspace_checksum)", async () => {
    const { checkpoint } = build();
    await expect(
      checkpoint.create({ ...minimalInput, workspace_checksum: "md5:abc" }),
    ).rejects.toThrow();
  });
});

describe("CheckpointStore.latest / .query / .retire", () => {
  test("latest returns the newest unretired", async () => {
    const { checkpoint, setNow } = build(1_700_000_000_000);
    const a = await checkpoint.create(minimalInput);
    setNow(1_700_000_010_000);
    const b = await checkpoint.create(minimalInput);
    expect((await checkpoint.latest())?.id).toBe(b.id);
    void a;
  });

  test("retire excludes from latest()", async () => {
    const { checkpoint, setNow } = build(1_700_000_000_000);
    const a = await checkpoint.create(minimalInput);
    setNow(1_700_000_010_000);
    const b = await checkpoint.create(minimalInput);
    await checkpoint.retire(b.id);
    expect((await checkpoint.latest())?.id).toBe(a.id);
  });

  test("retire on missing id throws CheckpointNotFoundError", async () => {
    const { checkpoint } = build();
    await expect(checkpoint.retire("ghost")).rejects.toBeInstanceOf(
      CheckpointNotFoundError,
    );
  });

  test("query defaults pipeline_id to the store's scope", async () => {
    const { checkpoint } = build();
    await checkpoint.create(minimalInput);
    const r = await checkpoint.query({});
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((c) => c.pipeline_id === "pipe-1")).toBe(true);
  });
});

describe("CheckpointStore.resumeFrom — happy path", () => {
  test("matching checksum + unexpired + same spec resumes", async () => {
    const { checkpoint, decisionStore, setNow } = build(1_700_000_000_000);
    const c = await checkpoint.create(minimalInput);
    setNow(1_700_000_000_000 + 60_000);

    const outcome = await checkpoint.resumeFrom({
      checkpoint_id: c.id,
      current_workspace_checksum: SHA,
      current_spec_version: SPEC,
    });
    expect(outcome.outcome).toBe("resume");
    if (outcome.outcome === "resume") {
      expect(outcome.checkpoint.id).toBe(c.id);
    }

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    expect(r.entries.some((e) => e.type === "checkpoint_resumed")).toBe(true);
  });
});

describe("CheckpointStore.resumeFrom — drift paths emit checkpoint_drift_detected", () => {
  test("not_found", async () => {
    const { checkpoint, decisionStore } = build();
    const outcome = await checkpoint.resumeFrom({
      checkpoint_id: "01XXXXXXXXXXXXXXXXXXXXXXXX",
      current_workspace_checksum: SHA,
      current_spec_version: SPEC,
    });
    expect(outcome.outcome).toBe("reject");
    if (outcome.outcome === "reject") expect(outcome.reason).toBe("not_found");

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const drift = r.entries.find((e) => e.type === "checkpoint_drift_detected");
    expect((drift?.metadata as { reason: string }).reason).toBe("not_found");
  });

  test("retired", async () => {
    const { checkpoint } = build();
    const c = await checkpoint.create(minimalInput);
    await checkpoint.retire(c.id);
    const outcome = await checkpoint.resumeFrom({
      checkpoint_id: c.id,
      current_workspace_checksum: SHA,
      current_spec_version: SPEC,
    });
    expect(outcome.outcome).toBe("reject");
    if (outcome.outcome === "reject") expect(outcome.reason).toBe("retired");
  });

  test("expired (now >= expires_at)", async () => {
    const { checkpoint, setNow } = build(1_700_000_000_000);
    const c = await checkpoint.create({ ...minimalInput, ttl_ms: 60_000 });
    setNow(1_700_000_000_000 + 120_000); // past expiry

    const outcome = await checkpoint.resumeFrom({
      checkpoint_id: c.id,
      current_workspace_checksum: SHA,
      current_spec_version: SPEC,
    });
    expect(outcome.outcome).toBe("reject");
    if (outcome.outcome === "reject") expect(outcome.reason).toBe("expired");
  });

  test("workspace_drift", async () => {
    const { checkpoint } = build();
    const c = await checkpoint.create(minimalInput);
    const outcome = await checkpoint.resumeFrom({
      checkpoint_id: c.id,
      current_workspace_checksum: `sha256:${"b".repeat(64)}`,
      current_spec_version: SPEC,
    });
    expect(outcome.outcome).toBe("reject");
    if (outcome.outcome === "reject") {
      expect(outcome.reason).toBe("workspace_drift");
      expect(outcome.details?.checkpoint_checksum).toBe(SHA);
    }
  });

  test("spec_version_drift across major version", async () => {
    const { checkpoint } = build();
    const c = await checkpoint.create(minimalInput);
    const outcome = await checkpoint.resumeFrom({
      checkpoint_id: c.id,
      current_workspace_checksum: SHA,
      current_spec_version: "2.0.0",
    });
    expect(outcome.outcome).toBe("reject");
    if (outcome.outcome === "reject") expect(outcome.reason).toBe("spec_version_drift");
  });
});

describe("isSpecVersionCompatible", () => {
  test("same major.minor (any patch / prerelease) compatible", () => {
    expect(isSpecVersionCompatible("1.0.0", "1.0.5")).toBe(true);
    expect(isSpecVersionCompatible("1.0.0-rc.1", "1.0.0")).toBe(true);
    expect(isSpecVersionCompatible("1.0.0", "1.0.0-rc.2")).toBe(true);
  });

  test("different minor incompatible (per spec — minor adds optional fields, but checkpoint contracts pin minor)", () => {
    expect(isSpecVersionCompatible("1.0.0", "1.1.0")).toBe(false);
  });

  test("different major incompatible", () => {
    expect(isSpecVersionCompatible("1.0.0", "2.0.0")).toBe(false);
  });

  test("malformed versions return false rather than throw", () => {
    expect(isSpecVersionCompatible("v1", "1.0.0")).toBe(false);
    expect(isSpecVersionCompatible("1.0.0", "v2")).toBe(false);
  });
});

describe("CheckpointStore — works without decisionLog", () => {
  test("create + resumeFrom succeed without a decisionLog", async () => {
    const store = new InMemoryCheckpointStore();
    const checkpoint = new CheckpointStore({
      pipelineId: "p",
      agentId: "a",
      sessionId: "s",
      specVersion: SPEC,
      store,
      now: () => 1_700_000_000_000,
    });
    const c = await checkpoint.create(minimalInput);
    const outcome = await checkpoint.resumeFrom({
      checkpoint_id: c.id,
      current_workspace_checksum: SHA,
      current_spec_version: SPEC,
    });
    expect(outcome.outcome).toBe("resume");
  });
});
