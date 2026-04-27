import { describe, expect, test } from "bun:test";
import {
  FailurePolicySchema,
  FanOutSpecSchema,
  HandoffContextSchema,
  MatchClauseSchema,
  MergePolicyRuleSchema,
  OrchestratorHandoffSchema,
  OrchestratorRefSchema,
  OrchestratorResultSchema,
  RoutingRuleSchema,
  RoutingRulesSchema,
} from "../schemas";

describe("OrchestratorRefSchema", () => {
  test("accepts a valid ref", () => {
    expect(
      OrchestratorRefSchema.safeParse({
        agent_id: "orchestrator",
        skills: ["route-user-input", "merge-specialist-results"],
      }).success,
    ).toBe(true);
  });

  test("rejects empty skills array", () => {
    expect(
      OrchestratorRefSchema.safeParse({
        agent_id: "orchestrator",
        skills: [],
      }).success,
    ).toBe(false);
  });

  test("rejects non-kebab agent_id", () => {
    expect(
      OrchestratorRefSchema.safeParse({
        agent_id: "Orchestrator",
        skills: ["route"],
      }).success,
    ).toBe(false);
  });

  test("rejects extra fields", () => {
    expect(
      OrchestratorRefSchema.safeParse({
        agent_id: "x",
        skills: ["y"],
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe("MatchClauseSchema", () => {
  test("empty clause is valid (matches anything)", () => {
    expect(MatchClauseSchema.safeParse({}).success).toBe(true);
  });

  test("accepts every well-known field", () => {
    expect(
      MatchClauseSchema.safeParse({
        stage: "intake",
        message_kind: "rfp_received",
        input_has: ["photos"],
        regions: ["aurora"],
        agent_status: { "intake-specialist": "completed" },
        decision_count: { "<": 100 },
        custom: "matchers/foo.ts",
      }).success,
    ).toBe(true);
  });

  test("rejects bad agent_status enum", () => {
    expect(
      MatchClauseSchema.safeParse({
        agent_status: { "x": "queued" },
      }).success,
    ).toBe(false);
  });

  test("rejects non-kebab region", () => {
    expect(
      MatchClauseSchema.safeParse({ regions: ["NotKebab"] }).success,
    ).toBe(false);
  });

  test("decision_count comparators must come from the comparison enum", () => {
    expect(
      MatchClauseSchema.safeParse({
        decision_count: { "===": 1 },
      }).success,
    ).toBe(false);
  });

  test("additional pipeline-defined fields pass through (additionalProperties:true)", () => {
    expect(
      MatchClauseSchema.safeParse({ stage: "x", customField: 42 }).success,
    ).toBe(true);
  });

  test("custom-matcher fields are PRESERVED on parse (regression — round-1 stripped them)", () => {
    const r = MatchClauseSchema.parse({
      custom: "matchers/tenant.ts",
      tenant_tier: "gold",
      region_class: "metro",
    });
    expect((r as Record<string, unknown>).tenant_tier).toBe("gold");
    expect((r as Record<string, unknown>).region_class).toBe("metro");
  });

  test("nested custom field shapes (objects, arrays) survive parse", () => {
    const r = MatchClauseSchema.parse({
      custom: "matchers/x.ts",
      meta: { weight: 0.7, tags: ["a", "b"] },
    });
    const meta = (r as { meta?: { weight: number; tags: string[] } }).meta;
    expect(meta?.weight).toBe(0.7);
    expect(meta?.tags).toEqual(["a", "b"]);
  });
});

describe("FanOutSpecSchema", () => {
  test("max_parallelism within 1..32 accepted", () => {
    expect(
      FanOutSpecSchema.safeParse({
        specialist: "vision-manifest",
        split_input: "chunk_photos",
        max_parallelism: 4,
      }).success,
    ).toBe(true);
  });

  test("max_parallelism > 32 rejected", () => {
    expect(
      FanOutSpecSchema.safeParse({
        specialist: "x",
        split_input: "y",
        max_parallelism: 64,
      }).success,
    ).toBe(false);
  });

  test("max_parallelism omitted is fine", () => {
    expect(
      FanOutSpecSchema.safeParse({
        specialist: "x",
        split_input: "y",
      }).success,
    ).toBe(true);
  });
});

describe("RoutingRuleSchema — exactly one of specialist|specialists|fan_out", () => {
  const baseMatch = { match: { stage: "x" } };

  test("specialist accepted alone", () => {
    expect(
      RoutingRuleSchema.safeParse({ ...baseMatch, specialist: "intake" }).success,
    ).toBe(true);
  });

  test("specialists accepted alone", () => {
    expect(
      RoutingRuleSchema.safeParse({
        ...baseMatch,
        specialists: ["intake", "takeoff"],
      }).success,
    ).toBe(true);
  });

  test("fan_out accepted alone", () => {
    expect(
      RoutingRuleSchema.safeParse({
        ...baseMatch,
        fan_out: { specialist: "vision", split_input: "chunk_photos" },
      }).success,
    ).toBe(true);
  });

  test("none of the three rejected", () => {
    expect(RoutingRuleSchema.safeParse(baseMatch).success).toBe(false);
  });

  test("two of the three rejected (specialist + specialists)", () => {
    expect(
      RoutingRuleSchema.safeParse({
        ...baseMatch,
        specialist: "intake",
        specialists: ["takeoff"],
      }).success,
    ).toBe(false);
  });

  test("specialist + fan_out rejected", () => {
    expect(
      RoutingRuleSchema.safeParse({
        ...baseMatch,
        specialist: "intake",
        fan_out: { specialist: "vision", split_input: "chunk_photos" },
      }).success,
    ).toBe(false);
  });

  test("priority + then accepted alongside specialist", () => {
    expect(
      RoutingRuleSchema.safeParse({
        ...baseMatch,
        specialist: "intake",
        priority: 10,
        then: "takeoff",
      }).success,
    ).toBe(true);
  });

  test("rejects extra rule-level fields", () => {
    expect(
      RoutingRuleSchema.safeParse({
        ...baseMatch,
        specialist: "intake",
        weight: 5,
      }).success,
    ).toBe(false);
  });
});

describe("RoutingRulesSchema", () => {
  test("valid rules + fallback", () => {
    expect(
      RoutingRulesSchema.safeParse({
        rules: [{ match: { stage: "x" }, specialist: "y" }],
        fallback: "orchestrator-clarify",
      }).success,
    ).toBe(true);
  });

  test("fallback required", () => {
    expect(
      RoutingRulesSchema.safeParse({
        rules: [],
      }).success,
    ).toBe(false);
  });

  test("fan_out_default_max_parallelism within 1..32", () => {
    expect(
      RoutingRulesSchema.safeParse({
        rules: [],
        fallback: "x",
        fan_out_default_max_parallelism: 8,
      }).success,
    ).toBe(true);
    expect(
      RoutingRulesSchema.safeParse({
        rules: [],
        fallback: "x",
        fan_out_default_max_parallelism: 0,
      }).success,
    ).toBe(false);
  });
});

describe("FailurePolicySchema", () => {
  test("accepts every documented policy", () => {
    for (const p of [
      "abort",
      "skip",
      "retry-then-escalate",
      "retry-then-skip",
      "manual-review",
    ]) {
      expect(FailurePolicySchema.safeParse(p).success).toBe(true);
    }
  });

  test("rejects unknown policy", () => {
    expect(FailurePolicySchema.safeParse("ignore").success).toBe(false);
  });
});

describe("MergePolicyRuleSchema", () => {
  test("valid rule", () => {
    expect(
      MergePolicyRuleSchema.safeParse({
        path_glob: "deliverables/**",
        resolution: "last-write-wins",
      }).success,
    ).toBe(true);
  });

  test("unknown resolution rejected", () => {
    expect(
      MergePolicyRuleSchema.safeParse({
        path_glob: "**",
        resolution: "best-effort",
      }).success,
    ).toBe(false);
  });

  test("empty path_glob rejected", () => {
    expect(
      MergePolicyRuleSchema.safeParse({
        path_glob: "",
        resolution: "error",
      }).success,
    ).toBe(false);
  });
});

describe("HandoffContextSchema + OrchestratorHandoffSchema + OrchestratorResultSchema", () => {
  test("HandoffContext requires workspace_scope", () => {
    expect(
      HandoffContextSchema.safeParse({ user_message: "hi" }).success,
    ).toBe(false);
    expect(
      HandoffContextSchema.safeParse({ workspace_scope: "deliverables/" })
        .success,
    ).toBe(true);
  });

  test("HandoffContext rejects absolute workspace_scope (regression)", () => {
    expect(
      HandoffContextSchema.safeParse({ workspace_scope: "/" }).success,
    ).toBe(false);
    expect(
      HandoffContextSchema.safeParse({ workspace_scope: "/etc" }).success,
    ).toBe(false);
  });

  test("HandoffContext rejects Windows-absolute workspace_scope", () => {
    expect(
      HandoffContextSchema.safeParse({ workspace_scope: "C:\\evil" }).success,
    ).toBe(false);
  });

  test("HandoffContext rejects scheme-prefixed workspace_scope", () => {
    expect(
      HandoffContextSchema.safeParse({ workspace_scope: "file:///etc" }).success,
    ).toBe(false);
  });

  test("HandoffContext rejects workspace_scope that normalizes to empty (regression — `.`, `./`, `x/..`)", () => {
    expect(
      HandoffContextSchema.safeParse({ workspace_scope: "." }).success,
    ).toBe(false);
    expect(
      HandoffContextSchema.safeParse({ workspace_scope: "./" }).success,
    ).toBe(false);
    expect(
      HandoffContextSchema.safeParse({ workspace_scope: "./." }).success,
    ).toBe(false);
    expect(
      HandoffContextSchema.safeParse({ workspace_scope: "x/.." }).success,
    ).toBe(false);
  });

  test("OrchestratorHandoff requires ULID parent_decision_id", () => {
    expect(
      OrchestratorHandoffSchema.safeParse({
        to_specialist: "intake",
        context: { workspace_scope: "deliverables/" },
        parent_session_id: "ses-1",
        parent_decision_id: "not-a-ulid",
      }).success,
    ).toBe(false);
    expect(
      OrchestratorHandoffSchema.safeParse({
        to_specialist: "intake",
        context: { workspace_scope: "deliverables/" },
        parent_session_id: "ses-1",
        parent_decision_id: "01ABCDEFGHJKMNPQRSTVWXYZ00",
      }).success,
    ).toBe(true);
  });

  test("OrchestratorResult.output_summary capped at 200 chars", () => {
    expect(
      OrchestratorResultSchema.safeParse({
        specialist: "intake",
        success: true,
        files_written: ["a.md"],
        decision_log_entries: 1,
        output_summary: "x".repeat(201),
      }).success,
    ).toBe(false);
  });

  test("OrchestratorResult.decision_log_entries non-negative", () => {
    expect(
      OrchestratorResultSchema.safeParse({
        specialist: "intake",
        success: true,
        files_written: [],
        decision_log_entries: -1,
        output_summary: "ok",
      }).success,
    ).toBe(false);
  });
});
