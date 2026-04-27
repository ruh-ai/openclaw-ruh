import { describe, expect, test } from "bun:test";
import {
  MergeResultSchema,
  SubAgentConfigSchema,
  SubAgentResultSchema,
  SubAgentSchema,
  SubAgentStatusSchema,
} from "../schemas";

const SHA = `sha256:${"a".repeat(64)}`;
void SHA;

describe("SubAgentStatusSchema", () => {
  test("accepts every documented status", () => {
    for (const s of [
      "pending",
      "running",
      "completed",
      "failed",
      "stopped",
      "skipped",
    ]) {
      expect(SubAgentStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  test("rejects unknown status", () => {
    expect(SubAgentStatusSchema.safeParse("queued").success).toBe(false);
  });
});

describe("SubAgentConfigSchema", () => {
  test("valid config passes", () => {
    expect(
      SubAgentConfigSchema.safeParse({
        specialist: "intake",
        parent_session_id: "ses-1",
        parent_decision_id: "01ABCDEFGHJKMNPQRSTVWXYZ00",
        workspace_scope: "deliverables/intake/",
        context: { workspace_scope: "deliverables/intake/" },
      }).success,
    ).toBe(true);
  });

  test("non-ULID parent_decision_id rejected", () => {
    expect(
      SubAgentConfigSchema.safeParse({
        specialist: "intake",
        parent_session_id: "ses-1",
        parent_decision_id: "not-ulid",
        workspace_scope: "x/",
        context: { workspace_scope: "x/" },
      }).success,
    ).toBe(false);
  });

  test("context missing workspace_scope rejected", () => {
    expect(
      SubAgentConfigSchema.safeParse({
        specialist: "intake",
        parent_session_id: "ses-1",
        parent_decision_id: "01ABCDEFGHJKMNPQRSTVWXYZ00",
        workspace_scope: "x/",
        context: {},
      }).success,
    ).toBe(false);
  });
});

describe("SubAgentSchema", () => {
  const baseSubAgent = {
    id: "01ABCDEFGHJKMNPQRSTVWXYZ00",
    specialist: "intake-specialist",
    agent_uri: "openclaw://ecc-estimator/agents/intake-specialist@0.1.0",
    session_id: "ses-sub-1",
    sandbox_id: "sb-1",
    workspace_scope: "deliverables/intake/",
    status: "pending" as const,
    created_at: "2026-04-27T00:00:00.000Z",
    parent_session_id: "ses-parent",
    parent_decision_id: "01ZZZZZZZZZZZZZZZZZZZZZZZZ",
  };

  test("valid sub-agent passes", () => {
    expect(SubAgentSchema.safeParse(baseSubAgent).success).toBe(true);
  });

  test("rejects malformed agent_uri", () => {
    expect(
      SubAgentSchema.safeParse({
        ...baseSubAgent,
        agent_uri: "not-a-uri",
      }).success,
    ).toBe(false);
  });

  test("rejects agent_uri with non-kebab pipeline id", () => {
    expect(
      SubAgentSchema.safeParse({
        ...baseSubAgent,
        agent_uri: "openclaw://ECC/agents/intake@0.1.0",
      }).success,
    ).toBe(false);
  });

  test("rejects extra field", () => {
    expect(
      SubAgentSchema.safeParse({
        ...baseSubAgent,
        priority: 1,
      }).success,
    ).toBe(false);
  });
});

describe("SubAgentResultSchema", () => {
  test("valid result passes", () => {
    expect(
      SubAgentResultSchema.safeParse({
        success: true,
        files_written: ["a.md"],
        output_summary: "ok",
        emitted_events: [],
        decision_count: 5,
      }).success,
    ).toBe(true);
  });

  test("output_summary capped at 500 chars", () => {
    expect(
      SubAgentResultSchema.safeParse({
        success: true,
        files_written: [],
        output_summary: "x".repeat(501),
        emitted_events: [],
        decision_count: 0,
      }).success,
    ).toBe(false);
  });

  test("decision_count must be >=0 integer", () => {
    expect(
      SubAgentResultSchema.safeParse({
        success: false,
        files_written: [],
        output_summary: "x",
        emitted_events: [],
        decision_count: -1,
      }).success,
    ).toBe(false);
  });

  test("partial_completion only allows the two declared fields", () => {
    expect(
      SubAgentResultSchema.safeParse({
        success: false,
        files_written: [],
        output_summary: "x",
        emitted_events: [],
        decision_count: 0,
        partial_completion: {
          completed_steps: ["intake"],
          pending_steps: ["takeoff", "pricing"],
          extra: "no",
        },
      }).success,
    ).toBe(false);
  });
});

describe("MergeResultSchema", () => {
  const baseMerge = {
    success: true,
    total_files: 2,
    conflicts: [],
    agent_results: [
      {
        specialist: "intake",
        success: true,
        files_written: 1,
        output_summary: "done",
      },
    ],
    partial_completion: false,
  };

  test("valid merge result passes", () => {
    expect(MergeResultSchema.safeParse(baseMerge).success).toBe(true);
  });

  test("conflict requires >=2 agents", () => {
    expect(
      MergeResultSchema.safeParse({
        ...baseMerge,
        conflicts: [
          {
            path: "a.md",
            agents: ["only-one"],
            resolution: "last-write-wins",
          },
        ],
      }).success,
    ).toBe(false);
  });

  test("failed_required must be kebab-case array", () => {
    expect(
      MergeResultSchema.safeParse({
        ...baseMerge,
        failed_required: ["BadCase"],
      }).success,
    ).toBe(false);
  });
});
