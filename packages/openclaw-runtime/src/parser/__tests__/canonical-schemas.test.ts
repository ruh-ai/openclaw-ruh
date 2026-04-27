import { describe, expect, test } from "bun:test";
import {
  RevealSchema,
  ThinkStepSchema,
  ThinkResearchFindingSchema,
  ThinkDocumentReadySchema,
  PlanSkillSchema,
  PlanWorkflowSchema,
  CANONICAL_BINDINGS,
  registerCanonicalBindings,
} from "../canonical-schemas";
import { MarkerSchemaRegistry, parseAllMarkers } from "../structured-output-parser";

describe("RevealSchema", () => {
  test("accepts a valid reveal", () => {
    const valid = {
      name: "Estella",
      title: "ECC Estimator",
      opening: "Hello — let's start with...",
      what_i_heard: ["You need an estimate for a multifamily exterior."],
      what_i_will_own: ["Takeoff", "Pricing", "RFQ packets"],
      what_i_wont_do: ["Sign-off", "Final approval"],
      first_move: "Read the photos.",
      clarifying_question: "Which region is this property in?",
    };
    expect(RevealSchema.safeParse(valid).success).toBe(true);
  });

  test("rejects empty required fields", () => {
    expect(RevealSchema.safeParse({ name: "", title: "x", opening: "y" }).success).toBe(false);
  });

  test("rejects unknown fields (strict)", () => {
    const valid = {
      name: "X",
      title: "Y",
      opening: "Z",
      what_i_heard: [],
      what_i_will_own: [],
      what_i_wont_do: [],
      first_move: "M",
      clarifying_question: "Q",
      sneaky_extra_field: "nope",
    };
    expect(RevealSchema.safeParse(valid).success).toBe(false);
  });
});

describe("ThinkStepSchema", () => {
  test("accepts started/complete", () => {
    expect(ThinkStepSchema.safeParse({ step: "planning", status: "started" }).success).toBe(true);
    expect(ThinkStepSchema.safeParse({ step: "planning", status: "complete" }).success).toBe(true);
  });

  test("rejects other status values", () => {
    expect(ThinkStepSchema.safeParse({ step: "x", status: "in_progress" }).success).toBe(false);
  });
});

describe("ThinkResearchFindingSchema", () => {
  test("accepts with optional source", () => {
    expect(
      ThinkResearchFindingSchema.safeParse({
        title: "T",
        summary: "S",
        source: "https://example.com",
      }).success,
    ).toBe(true);
    expect(ThinkResearchFindingSchema.safeParse({ title: "T", summary: "S" }).success).toBe(true);
  });
});

describe("ThinkDocumentReadySchema", () => {
  test("accepts a valid doc", () => {
    expect(
      ThinkDocumentReadySchema.safeParse({ docType: "PRD", path: "docs/prd.md" }).success,
    ).toBe(true);
  });
});

describe("PlanSkillSchema", () => {
  test("accepts kebab-case id, applies defaults for description and dependencies", () => {
    const result = PlanSkillSchema.safeParse({ id: "intake-specialist", name: "Intake" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("");
      expect(result.data.dependencies).toEqual([]);
    }
  });

  test("rejects non-kebab-case id", () => {
    expect(PlanSkillSchema.safeParse({ id: "IntakeSpecialist", name: "X" }).success).toBe(false);
  });

  test("rejects bad envVars (must be SCREAMING_SNAKE)", () => {
    expect(
      PlanSkillSchema.safeParse({
        id: "x",
        name: "X",
        envVars: ["lowerCase"],
      }).success,
    ).toBe(false);
  });

  test("accepts valid envVars", () => {
    expect(
      PlanSkillSchema.safeParse({
        id: "x",
        name: "X",
        envVars: ["API_KEY", "DATABASE_URL"],
      }).success,
    ).toBe(true);
  });
});

describe("PlanWorkflowSchema", () => {
  test("accepts a workflow of valid steps", () => {
    const result = PlanWorkflowSchema.safeParse({
      steps: [
        { skillId: "intake" },
        { skillId: "takeoff", parallel: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects non-kebab-case skillId", () => {
    expect(
      PlanWorkflowSchema.safeParse({ steps: [{ skillId: "BadName" }] }).success,
    ).toBe(false);
  });
});

describe("CANONICAL_BINDINGS + registerCanonicalBindings", () => {
  test("contains all six canonical markers", () => {
    const names = CANONICAL_BINDINGS.map((b) => b.markerName);
    expect(names).toEqual([
      "reveal",
      "think_step",
      "think_research_finding",
      "think_document_ready",
      "plan_skill",
      "plan_workflow",
    ]);
  });

  test("registerCanonicalBindings binds every canonical schema to a registry", () => {
    const registry = new MarkerSchemaRegistry();
    registerCanonicalBindings(registry);
    expect(registry.has("reveal")).toBe(true);
    expect(registry.has("think_step")).toBe(true);
    expect(registry.has("plan_skill")).toBe(true);
    expect(registry.list()).toHaveLength(6);
  });

  test("end-to-end: parse a stream with canonical markers", () => {
    const registry = new MarkerSchemaRegistry();
    registerCanonicalBindings(registry);

    const text =
      '<think_step step="planning" status="started"/> ' +
      '<plan_skill id="intake" name="Intake" description="Parse RFP"/> ' +
      '<think_step step="planning" status="complete"/>';

    const { events, diagnostics } = parseAllMarkers(text, { registry });
    expect(events).toHaveLength(3);
    expect(diagnostics).toHaveLength(0);

    expect(events[0]?.name).toBe("think_step");
    expect(events[1]?.name).toBe("plan_skill");
    expect((events[1]?.value as { id: string }).id).toBe("intake");
  });
});
