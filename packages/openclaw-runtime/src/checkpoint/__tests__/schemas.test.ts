import { describe, expect, test } from "bun:test";
import {
  BuildManifestTaskSchema,
  CheckpointReasonSchema,
  CheckpointSchema,
  EvalLoopProgressSchema,
  SubAgentSnapshotSchema,
  VerificationProgressSchema,
} from "../schemas";

const validCheckpoint = {
  id: "01ABCDEFGHJKMNPQRSTVWXYZ00",
  spec_version: "1.0.0-rc.1",
  pipeline_id: "pipe-1",
  agent_id: "agent-1",
  session_id: "ses-1",
  dev_stage: "running" as const,
  created_at: "2026-04-27T00:00:00.000Z",
  expires_at: "2026-04-27T04:00:00.000Z",
  copilot_state: { foo: "bar" },
  build_manifest: [
    { id: "task-1", specialist: "intake", status: "completed" as const },
  ],
  conversation_summary: "summary",
  conversation_tokens_estimate: 1234,
  files_written: ["a.md"],
  files_pending: [],
  workspace_checksum: `sha256:${"a".repeat(64)}`,
  sub_agents: [],
  reason: "scheduled_interval" as const,
};

describe("CheckpointReasonSchema", () => {
  test("accepts every documented reason", () => {
    const reasons = [
      "scheduled_interval",
      "rate_limit_imminent",
      "before_destructive_op",
      "sub_agent_handoff",
      "session_pause",
      "manual",
      "stage_transition",
    ];
    for (const r of reasons) {
      expect(CheckpointReasonSchema.safeParse(r).success).toBe(true);
    }
  });

  test("rejects unknown reason", () => {
    expect(CheckpointReasonSchema.safeParse("planned").success).toBe(false);
  });
});

describe("BuildManifestTaskSchema", () => {
  test("valid task passes", () => {
    expect(
      BuildManifestTaskSchema.safeParse({
        id: "t-1",
        specialist: "intake",
        status: "running",
        started_at: "2026-04-27T00:00:00Z",
      }).success,
    ).toBe(true);
  });

  test("rejects unknown status", () => {
    const r = BuildManifestTaskSchema.safeParse({
      id: "t-1",
      specialist: "intake",
      status: "queued",
    });
    expect(r.success).toBe(false);
  });

  test("rejects extra fields", () => {
    const r = BuildManifestTaskSchema.safeParse({
      id: "t-1",
      specialist: "intake",
      status: "completed",
      foo: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe("SubAgentSnapshotSchema", () => {
  test("valid sub-agent snapshot passes", () => {
    expect(
      SubAgentSnapshotSchema.safeParse({
        id: "s-1",
        specialist: "intake",
        status: "completed",
        workspace_scope: "agents/intake/",
      }).success,
    ).toBe(true);
  });
});

describe("VerificationProgressSchema + EvalLoopProgressSchema", () => {
  test("verification iteration must be >=1", () => {
    expect(
      VerificationProgressSchema.safeParse({
        checks_passed: ["a"],
        checks_failed: ["b"],
        iteration: 0,
      }).success,
    ).toBe(false);
  });

  test("eval-loop pass_rate must be 0..1", () => {
    expect(
      EvalLoopProgressSchema.safeParse({
        iteration: 1,
        pass_rate: 1.2,
        avg_score: 0.8,
      }).success,
    ).toBe(false);
  });
});

describe("CheckpointSchema", () => {
  test("valid checkpoint passes", () => {
    expect(CheckpointSchema.safeParse(validCheckpoint).success).toBe(true);
  });

  test("rejects non-ULID id", () => {
    const r = CheckpointSchema.safeParse({ ...validCheckpoint, id: "abc" });
    expect(r.success).toBe(false);
  });

  test("rejects bad workspace_checksum format", () => {
    const r = CheckpointSchema.safeParse({
      ...validCheckpoint,
      workspace_checksum: "md5:abc",
    });
    expect(r.success).toBe(false);
  });

  test("rejects unknown reason", () => {
    const r = CheckpointSchema.safeParse({
      ...validCheckpoint,
      reason: "unknown",
    });
    expect(r.success).toBe(false);
  });

  test("rejects unknown dev_stage", () => {
    const r = CheckpointSchema.safeParse({
      ...validCheckpoint,
      dev_stage: "made-up",
    });
    expect(r.success).toBe(false);
  });

  test("active_skill_id must be kebab-case when present", () => {
    const r = CheckpointSchema.safeParse({
      ...validCheckpoint,
      active_skill_id: "BadSkill",
    });
    expect(r.success).toBe(false);
  });

  test("rejects extra fields (.strict())", () => {
    const r = CheckpointSchema.safeParse({ ...validCheckpoint, extra: 1 });
    expect(r.success).toBe(false);
  });

  test("conversation_tokens_estimate must be >=0 integer", () => {
    expect(
      CheckpointSchema.safeParse({
        ...validCheckpoint,
        conversation_tokens_estimate: -1,
      }).success,
    ).toBe(false);
  });
});
