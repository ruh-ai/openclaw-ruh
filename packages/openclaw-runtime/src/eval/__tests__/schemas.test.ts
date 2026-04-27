import { describe, expect, test } from "bun:test";
import {
  ConvergenceLoopConfigSchema,
  EvalJudgeSchema,
  EvalLoopStateSchema,
  EvalRubricSchema,
  EvalSuiteSchema,
  EvalTaskExpectedSchema,
  EvalTaskInputSchema,
  EvalTaskSchema,
  EvalTaskSourceSchema,
  ReflectorOutputSchema,
  SkillMutationSchema,
} from "../schemas";

describe("EvalTaskSourceSchema (oneOf)", () => {
  test("synthetic", () => {
    expect(
      EvalTaskSourceSchema.safeParse({ kind: "synthetic", author: "scott" })
        .success,
    ).toBe(true);
  });
  test("historical", () => {
    expect(
      EvalTaskSourceSchema.safeParse({
        kind: "historical",
        pipeline_id: "ecc",
        original_session_id: "ses-x",
      }).success,
    ).toBe(true);
  });
  test("customer-curated", () => {
    expect(
      EvalTaskSourceSchema.safeParse({
        kind: "customer-curated",
        customer: "ECC",
        reference: "rowena-set-1",
      }).success,
    ).toBe(true);
  });
  test("rejects unknown kind", () => {
    expect(
      EvalTaskSourceSchema.safeParse({ kind: "imported", author: "x" })
        .success,
    ).toBe(false);
  });
});

describe("EvalTaskInputSchema — at least one of user_message/files/initial_state", () => {
  test("user_message alone OK", () => {
    expect(EvalTaskInputSchema.safeParse({ user_message: "go" }).success).toBe(
      true,
    );
  });
  test("files alone OK", () => {
    expect(
      EvalTaskInputSchema.safeParse({
        files: [{ path: "x.md", content_ref: "fixtures/x.md" }],
      }).success,
    ).toBe(true);
  });
  test("initial_state alone OK", () => {
    expect(
      EvalTaskInputSchema.safeParse({ initial_state: { x: 1 } }).success,
    ).toBe(true);
  });
  test("empty input rejected", () => {
    expect(EvalTaskInputSchema.safeParse({}).success).toBe(false);
  });
  test("empty files array rejected when only field", () => {
    expect(EvalTaskInputSchema.safeParse({ files: [] }).success).toBe(false);
  });
});

describe("EvalTaskExpectedSchema — at least one measurable expectation", () => {
  test("output_summary alone OK", () => {
    expect(
      EvalTaskExpectedSchema.safeParse({ output_summary: "ok" }).success,
    ).toBe(true);
  });
  test("must_call_tools alone OK", () => {
    expect(
      EvalTaskExpectedSchema.safeParse({
        must_call_tools: ["workspace-write"],
      }).success,
    ).toBe(true);
  });
  test("empty rejected", () => {
    expect(EvalTaskExpectedSchema.safeParse({}).success).toBe(false);
  });
  test("must_call_tools enforces kebab-case", () => {
    expect(
      EvalTaskExpectedSchema.safeParse({
        must_call_tools: ["BadCase"],
      }).success,
    ).toBe(false);
  });
});

describe("EvalRubricSchema", () => {
  test("dimensions ≥1 required", () => {
    expect(
      EvalRubricSchema.safeParse({
        dimensions: [],
        pass_threshold: 5,
      }).success,
    ).toBe(false);
  });
  test("valid rubric passes", () => {
    expect(
      EvalRubricSchema.safeParse({
        dimensions: [
          {
            name: "completeness",
            description: "covers all buckets",
            scale: { min: 0, max: 10 },
            tolerance_percent: 5,
          },
        ],
        pass_threshold: 8,
      }).success,
    ).toBe(true);
  });
  test("tolerance_percent in 0..100", () => {
    expect(
      EvalRubricSchema.safeParse({
        dimensions: [
          {
            name: "x",
            description: "y",
            scale: { min: 0, max: 1 },
            tolerance_percent: 150,
          },
        ],
        pass_threshold: 0,
      }).success,
    ).toBe(false);
  });
});

describe("EvalJudgeSchema (lazy union)", () => {
  test("exact judge", () => {
    expect(EvalJudgeSchema.safeParse({ kind: "exact" }).success).toBe(true);
  });
  test("composite with sub_judges", () => {
    expect(
      EvalJudgeSchema.safeParse({
        kind: "composite",
        weights: { quantities: 0.5, narrative: 0.5 },
        sub_judges: [{ kind: "structural" }, { kind: "exact" }],
      }).success,
    ).toBe(true);
  });
  test("nested composite supported", () => {
    expect(
      EvalJudgeSchema.safeParse({
        kind: "composite",
        sub_judges: [
          { kind: "composite", sub_judges: [{ kind: "exact" }] },
          { kind: "structural" },
        ],
      }).success,
    ).toBe(true);
  });
  test("rejects unknown kind", () => {
    expect(EvalJudgeSchema.safeParse({ kind: "made-up" }).success).toBe(false);
  });
  test("weights must be 0..1", () => {
    expect(
      EvalJudgeSchema.safeParse({
        kind: "composite",
        weights: { x: 1.5 },
        sub_judges: [{ kind: "exact" }],
      }).success,
    ).toBe(false);
  });
});

describe("EvalTaskSchema", () => {
  const validTask = {
    id: "estimate-aurora-1",
    spec_version: "1.0.0-rc.1",
    name: "Aurora estimate",
    description: "Routine residential estimate, Aurora CO Q2 2026",
    source: { kind: "customer-curated" as const, customer: "ECC", reference: "ar-1" },
    input: { user_message: "Estimate this" },
    expected: { output_summary: "ok" },
    judge: { kind: "exact" as const },
    acceptance_threshold: 0.75,
  };

  test("valid task passes", () => {
    expect(EvalTaskSchema.safeParse(validTask).success).toBe(true);
  });
  test("acceptance_threshold in 0..1", () => {
    expect(
      EvalTaskSchema.safeParse({ ...validTask, acceptance_threshold: 1.5 })
        .success,
    ).toBe(false);
  });
  test("non-kebab id rejected", () => {
    expect(EvalTaskSchema.safeParse({ ...validTask, id: "BadCase" }).success).toBe(
      false,
    );
  });
  test("confidence in 0..1 when present", () => {
    expect(
      EvalTaskSchema.safeParse({ ...validTask, confidence: -0.1 }).success,
    ).toBe(false);
  });
});

describe("EvalSuiteSchema — tasks ≥1", () => {
  test("empty tasks rejected", () => {
    expect(
      EvalSuiteSchema.safeParse({
        spec_version: "1.0.0",
        pipeline_id: "ecc",
        name: "x",
        description: "x",
        tasks: [],
        judge_model: "claude-opus-4-7",
        pass_rate_threshold: 0.75,
      }).success,
    ).toBe(false);
  });
});

describe("ConvergenceLoopConfigSchema", () => {
  test("valid config passes", () => {
    expect(
      ConvergenceLoopConfigSchema.safeParse({
        max_iterations: 5,
        max_consecutive_degradations: 2,
        reload_pause_ms: 2000,
        pass_rate_threshold: 0.75,
        budget: { max_llm_calls: 5000, max_cost_usd: 1000 },
      }).success,
    ).toBe(true);
  });
  test("max_iterations capped at 50", () => {
    expect(
      ConvergenceLoopConfigSchema.safeParse({
        max_iterations: 100,
        max_consecutive_degradations: 2,
        reload_pause_ms: 0,
        pass_rate_threshold: 0.5,
        budget: { max_llm_calls: 1, max_cost_usd: 1 },
      }).success,
    ).toBe(false);
  });
  test("budget.max_llm_calls ≥1", () => {
    expect(
      ConvergenceLoopConfigSchema.safeParse({
        max_iterations: 1,
        max_consecutive_degradations: 1,
        reload_pause_ms: 0,
        pass_rate_threshold: 1,
        budget: { max_llm_calls: 0, max_cost_usd: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("SkillMutationSchema + ReflectorOutputSchema", () => {
  test("valid mutation passes", () => {
    expect(
      SkillMutationSchema.safeParse({
        skill_id: "intake",
        iteration: 2,
        rewrite_kind: "section_replace",
        target_section: "## Why this matters",
        new_content: "...",
      }).success,
    ).toBe(true);
  });
  test("iteration ≥1", () => {
    expect(
      SkillMutationSchema.safeParse({
        skill_id: "intake",
        iteration: 0,
        rewrite_kind: "section_append",
        new_content: "x",
      }).success,
    ).toBe(false);
  });
  test("ReflectorOutput.confidence in 0..1", () => {
    expect(
      ReflectorOutputSchema.safeParse({
        rewrites: [],
        reasoning: "no patterns",
        confidence: 1.5,
      }).success,
    ).toBe(false);
  });
});

describe("EvalLoopStateSchema", () => {
  test("running state w/o stop_reason OK", () => {
    expect(
      EvalLoopStateSchema.safeParse({
        iteration: 2,
        max_iterations: 5,
        scores: [{ iteration: 1, pass_rate: 0.4, avg_score: 4 }],
        mutations: [],
        status: "running",
      }).success,
    ).toBe(true);
  });
  test("completed with all_passed stop_reason OK", () => {
    expect(
      EvalLoopStateSchema.safeParse({
        iteration: 3,
        max_iterations: 5,
        scores: [
          { iteration: 1, pass_rate: 0.4, avg_score: 4 },
          { iteration: 2, pass_rate: 0.7, avg_score: 7 },
          { iteration: 3, pass_rate: 1, avg_score: 9 },
        ],
        mutations: [],
        status: "completed",
        stop_reason: "all_passed",
      }).success,
    ).toBe(true);
  });
});
