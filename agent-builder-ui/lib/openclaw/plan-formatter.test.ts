/**
 * plan-formatter tests — focuses on the new Path B Slice 1 / 4 fields:
 * subAgents (already in code path, expanded coverage here) and
 * memoryAuthority (introduced in B4).
 *
 * Other fields (skills, workflow, integrations, etc.) are exercised via
 * downstream tests in pipeline-manifest-builder and event-consumer-map.
 */

import { describe, expect, test } from "bun:test";
import { normalizePlan, renderPlanSummary } from "./plan-formatter";

describe("normalizePlan — subAgents (B2 marker target)", () => {
  test("accepts the architect's structured emission", () => {
    const raw = {
      subAgents: [
        {
          id: "intake",
          name: "Intake",
          description: "Parse RFP into structured requirements",
          type: "specialist",
          skills: ["parse-rfp"],
          trigger: "intake",
          autonomy: "fully_autonomous",
        },
        {
          id: "takeoff",
          name: "Takeoff",
          description: "Compute material quantities",
          type: "specialist",
          skills: ["compute-takeoff"],
          trigger: "takeoff",
          autonomy: "requires_approval",
        },
      ],
    };
    const plan = normalizePlan(raw);
    expect(plan.subAgents).toHaveLength(2);
    expect(plan.subAgents[0]?.id).toBe("intake");
    expect(plan.subAgents[0]?.skills).toEqual(["parse-rfp"]);
    expect(plan.subAgents[1]?.trigger).toBe("takeoff");
  });

  test("accepts string-shorthand sub-agents and synthesizes ids", () => {
    const plan = normalizePlan({
      subAgents: ["Intake Specialist", "Takeoff Specialist"],
    });
    expect(plan.subAgents).toHaveLength(2);
    expect(plan.subAgents[0]?.id).toBe("intake-specialist");
    expect(plan.subAgents[1]?.id).toBe("takeoff-specialist");
  });

  test("missing subAgents field → empty array", () => {
    const plan = normalizePlan({});
    expect(plan.subAgents).toEqual([]);
  });

  test("preserves architect-emitted type (specialist/monitor/orchestrator) — regression for P2 review finding", () => {
    const plan = normalizePlan({
      subAgents: [
        { id: "intake", name: "Intake", type: "specialist", skills: [], trigger: "", autonomy: "fully_autonomous" },
        { id: "watchdog", name: "Watchdog", type: "monitor", skills: [], trigger: "", autonomy: "report_only" },
        { id: "sub-orch", name: "Sub Orch", type: "orchestrator", skills: [], trigger: "", autonomy: "requires_approval" },
        { id: "default", name: "Default", skills: [], trigger: "" }, // type omitted → fallback
      ],
    });
    expect(plan.subAgents.map((a) => a.type)).toEqual([
      "specialist",
      "monitor",
      "orchestrator",
      "worker",
    ]);
  });

  test("preserves architect-emitted autonomy (fully_autonomous/report_only) — regression for P2 review finding", () => {
    const plan = normalizePlan({
      subAgents: [
        { id: "auto", name: "Auto", skills: [], trigger: "", autonomy: "fully_autonomous" },
        { id: "report", name: "Report", skills: [], trigger: "", autonomy: "report_only" },
        { id: "approve", name: "Approve", skills: [], trigger: "", autonomy: "requires_approval" },
        { id: "default", name: "Default", skills: [], trigger: "" }, // autonomy omitted → fallback
      ],
    });
    expect(plan.subAgents.map((a) => a.autonomy)).toEqual([
      "fully_autonomous",
      "report_only",
      "requires_approval",
      "requires_approval",
    ]);
  });

  test("invalid type/autonomy values fall back to safe defaults", () => {
    const plan = normalizePlan({
      subAgents: [
        { id: "bad", name: "Bad", skills: [], trigger: "", type: "boss", autonomy: "yolo" },
      ],
    });
    expect(plan.subAgents[0]?.type).toBe("worker");
    expect(plan.subAgents[0]?.autonomy).toBe("requires_approval");
  });
});

describe("normalizePlan — memoryAuthority (B4 marker target)", () => {
  test("accepts a multi-tier authority emission and returns rows in order", () => {
    const plan = normalizePlan({
      memoryAuthority: [
        { tier: 1, lane: "estimating", writers: ["darrow@ecc.com"] },
        { tier: 1, lane: "business", writers: ["matt@ecc.com"] },
        { tier: 2, lane: "estimating", writers: ["scott@ecc.com"] },
        { tier: 3, lane: "estimating", writers: ["regional-1@ecc.com", "regional-2@ecc.com"] },
      ],
    });
    expect(plan.memoryAuthority).toEqual([
      { tier: 1, lane: "estimating", writers: ["darrow@ecc.com"] },
      { tier: 1, lane: "business", writers: ["matt@ecc.com"] },
      { tier: 2, lane: "estimating", writers: ["scott@ecc.com"] },
      { tier: 3, lane: "estimating", writers: ["regional-1@ecc.com", "regional-2@ecc.com"] },
    ]);
  });

  test("missing memoryAuthority → undefined (manifest builder falls back)", () => {
    const plan = normalizePlan({});
    expect(plan.memoryAuthority).toBeUndefined();
  });

  test("empty memoryAuthority array → undefined (treated as 'not emitted')", () => {
    const plan = normalizePlan({ memoryAuthority: [] });
    expect(plan.memoryAuthority).toBeUndefined();
  });

  test("rows with missing tier are dropped (not invented)", () => {
    const plan = normalizePlan({
      memoryAuthority: [
        { tier: 1, lane: "estimating", writers: ["darrow@ecc.com"] },
        { lane: "business", writers: ["matt@ecc.com"] }, // no tier — drop
        { tier: 4, lane: "estimating", writers: ["x@ecc.com"] }, // out-of-range tier — drop
        { tier: 1, lane: "ops", writers: [] }, // no writers — drop
        { tier: 1, lane: "", writers: ["y@ecc.com"] }, // no lane — drop
      ],
    });
    expect(plan.memoryAuthority).toHaveLength(1);
    expect(plan.memoryAuthority?.[0]?.lane).toBe("estimating");
  });

  test("non-string writers are filtered out at the row level", () => {
    const plan = normalizePlan({
      memoryAuthority: [
        { tier: 1, lane: "estimating", writers: ["darrow@ecc.com", 42, null, "scott@ecc.com"] },
      ],
    });
    expect(plan.memoryAuthority?.[0]?.writers).toEqual([
      "darrow@ecc.com",
      "scott@ecc.com",
    ]);
  });

  test("all rows invalid → undefined (no empty array leaks through)", () => {
    const plan = normalizePlan({
      memoryAuthority: [
        { tier: "high", lane: "estimating", writers: ["x@ecc.com"] },
        { tier: 1, writers: ["x@ecc.com"] },
      ],
    });
    expect(plan.memoryAuthority).toBeUndefined();
  });

  // ── Lane format coercion (P1 review fix) ─────────────────────────────
  test("snake_case lane is coerced to kebab-case (regression for P1 — substrate rejects snake_case)", () => {
    const plan = normalizePlan({
      memoryAuthority: [
        { tier: 1, lane: "customer_success", writers: ["cs@example.com"] },
        { tier: 1, lane: "field_ops", writers: ["ops@example.com"] },
      ],
    });
    expect(plan.memoryAuthority?.map((r) => r.lane)).toEqual([
      "customer-success",
      "field-ops",
    ]);
  });

  test("uppercase + camelCase + mixed-case lane all coerced to kebab-case", () => {
    const plan = normalizePlan({
      memoryAuthority: [
        { tier: 1, lane: "CustomerSuccess", writers: ["cs@example.com"] },
      ],
    });
    // toLowerCase happens but no underscore split → "customersuccess"
    expect(plan.memoryAuthority?.[0]?.lane).toBe("customersuccess");
  });

  test("trailing/leading hyphens and double hyphens coerced", () => {
    const plan = normalizePlan({
      memoryAuthority: [
        { tier: 1, lane: "-customer__success-", writers: ["cs@example.com"] },
      ],
    });
    expect(plan.memoryAuthority?.[0]?.lane).toBe("customer-success");
  });

  test("lanes that cannot be coerced to kebab-case are dropped", () => {
    const plan = normalizePlan({
      memoryAuthority: [
        // Spaces in middle, leading digit — neither passes KEBAB_CASE
        { tier: 1, lane: "customer success team", writers: ["a@b.com"] },
        { tier: 1, lane: "1st-priority", writers: ["a@b.com"] },
        // Valid one to confirm filter selectivity
        { tier: 1, lane: "valid_lane", writers: ["a@b.com"] },
      ],
    });
    expect(plan.memoryAuthority).toEqual([
      { tier: 1, lane: "valid-lane", writers: ["a@b.com"] },
    ]);
  });

  test("kebab-case lane is preserved as-is", () => {
    const plan = normalizePlan({
      memoryAuthority: [
        { tier: 1, lane: "estimating", writers: ["d@ecc.com"] },
        { tier: 1, lane: "customer-success", writers: ["cs@ecc.com"] },
      ],
    });
    expect(plan.memoryAuthority?.map((r) => r.lane)).toEqual([
      "estimating",
      "customer-success",
    ]);
  });
});

describe("normalizePlan — dashboardPrototype (Plan dashboard gate)", () => {
  test("accepts a prototype spec that ties dashboard pages to user workflows", () => {
    const plan = normalizePlan({
      dashboardPages: [
        { path: "/projects", title: "Estimate Projects" },
        { path: "/projects/:projectId/pricing", title: "Pricing" },
      ],
      dashboardPrototype: {
        summary: "ECC estimator workspace for intake through lead approval.",
        primaryUsers: ["Estimator", "Lead estimator"],
        workflows: [
          {
            id: "pricing-review",
            name: "Pricing Review",
            steps: ["Confirm takeoff", "Map cost codes", "Review margin"],
            requiredActions: ["edit_quantity", "override_markup", "approve_pricing"],
            successCriteria: ["Blocked pricing cannot be approved"],
          },
        ],
        pages: [
          {
            path: "/projects/:projectId/pricing",
            title: "Pricing",
            purpose: "Review estimate line items and margin before lead approval.",
            supportsWorkflows: ["pricing-review"],
            requiredActions: ["override_markup"],
            acceptanceCriteria: ["Shows subtotal, markup, contingency, and total"],
          },
        ],
        actions: [
          {
            id: "create-estimate",
            label: "Create estimate",
            type: "create",
            target: "work_item",
            primary: true,
          },
          {
            id: "run-estimate-pipeline",
            label: "Run estimate pipeline",
            type: "run_pipeline",
            target: "pipeline",
            primary: true,
          },
        ],
        pipeline: {
          name: "Estimate build pipeline",
          triggerActionId: "run-estimate-pipeline",
          steps: [
            {
              id: "document-intake",
              name: "Document intake",
              description: "Collect plans, specs, and workbook inputs.",
              producesArtifacts: ["source-evidence-map"],
            },
            {
              id: "pricing-review",
              name: "Pricing review",
              owner: "Lead estimator",
              requiresApproval: true,
            },
          ],
          completionCriteria: ["Approval package is ready for lead estimator"],
          failureStates: ["Missing source evidence", "Workbook warnings"],
        },
        artifacts: [
          {
            id: "source-evidence-map",
            name: "Source evidence map",
            type: "evidence",
            producedByStepId: "document-intake",
            reviewActions: ["approve_artifact", "request_revision"],
            acceptanceCriteria: ["Every quantity links to source evidence"],
          },
        ],
        emptyState: "Create an estimate package to start pipeline validation.",
        revisionPrompts: [
          "Does this match how ECC reviews pricing?",
          "Which fields need estimator override controls?",
        ],
        approvalChecklist: ["Each page has at least one workflow and action"],
      },
    });

    expect(plan.dashboardPrototype?.summary).toBe("ECC estimator workspace for intake through lead approval.");
    expect(plan.dashboardPrototype?.workflows[0]?.requiredActions).toContain("approve_pricing");
    expect(plan.dashboardPrototype?.pages[0]?.supportsWorkflows).toEqual(["pricing-review"]);
    expect(plan.dashboardPrototype?.actions?.map((action) => action.id)).toEqual([
      "create-estimate",
      "run-estimate-pipeline",
    ]);
    expect(plan.dashboardPrototype?.pipeline?.steps.map((step) => step.id)).toEqual([
      "document-intake",
      "pricing-review",
    ]);
    expect(plan.dashboardPrototype?.artifacts?.[0]).toMatchObject({
      id: "source-evidence-map",
      reviewActions: ["approve_artifact", "request_revision"],
    });
    expect(plan.dashboardPrototype?.emptyState).toBe("Create an estimate package to start pipeline validation.");
    expect(plan.dashboardPrototype?.approvalChecklist).toContain("Each page has at least one workflow and action");

    const summary = renderPlanSummary(plan);
    expect(summary).toContain("### Prototype Actions");
    expect(summary).toContain("Create estimate");
    expect(summary).toContain("### Pipeline: Estimate build pipeline");
    expect(summary).toContain("### Generated Artifacts");
    expect(summary).toContain("Source evidence map");
  });

  test("missing dashboardPrototype remains undefined for non-dashboard agents", () => {
    const plan = normalizePlan({});
    expect(plan.dashboardPrototype).toBeUndefined();
  });
});

describe("renderPlanSummary — fleet visibility", () => {
  test("renders planned sub-agents with owned skills, trigger, and autonomy", () => {
    const summary = renderPlanSummary({
      skills: [
        { id: "parse-rfp", name: "Parse RFP", description: "Parse estimate packages.", dependencies: [], envVars: [] },
      ],
      workflow: { steps: [{ skillId: "parse-rfp", parallel: false }] },
      integrations: [],
      triggers: [],
      channels: [],
      envVars: [],
      subAgents: [
        {
          id: "intake",
          name: "Intake Specialist",
          description: "Turns bid package inputs into structured estimating requirements.",
          type: "specialist",
          skills: ["parse-rfp"],
          trigger: "intake",
          autonomy: "requires_approval",
        },
      ],
      missionControl: null,
      dataSchema: null,
      apiEndpoints: [],
      dashboardPages: [],
    });

    expect(summary).toContain("## Sub-Agents");
    expect(summary).toContain("Intake Specialist");
    expect(summary).toContain("parse-rfp");
    expect(summary).toContain("requires approval");
  });
});
