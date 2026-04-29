import { describe, expect, test } from "bun:test";
import { buildDashboardPrototypeViewModel } from "./dashboard-prototype";
import type { ArchitecturePlan } from "./types";

const basePlan: ArchitecturePlan = {
  skills: [{ id: "review-project", name: "Review Project", description: "Review estimates.", dependencies: [], envVars: [] }],
  workflow: { steps: [{ skillId: "review-project", parallel: false }] },
  integrations: [],
  triggers: [],
  channels: [],
  envVars: [],
  subAgents: [
    {
      id: "takeoff",
      name: "Takeoff Specialist",
      description: "Owns quantity extraction and takeoff checks.",
      type: "specialist",
      skills: ["review-project"],
      trigger: "takeoff",
      autonomy: "requires_approval",
    },
  ],
  missionControl: null,
  dataSchema: null,
  apiEndpoints: [],
  dashboardPages: [
    {
      path: "/projects",
      title: "Projects",
      description: "Prioritize active estimates.",
      components: [
        { type: "metric-cards", title: "Queue Metrics", dataSource: "/api/projects/summary" },
        { type: "data-table", title: "Estimate Queue", dataSource: "/api/projects" },
      ],
    },
  ],
  dashboardPrototype: {
    summary: "ECC estimator workspace",
    primaryUsers: ["Estimator"],
    workflows: [
      {
        id: "triage",
        name: "Project Triage",
        steps: ["Open queue", "Review blockers"],
        requiredActions: ["Filter queue", "Open project"],
        successCriteria: ["Blocked work is visible"],
      },
    ],
    pages: [
      {
        path: "/projects",
        title: "Projects",
        purpose: "Prioritize active estimates.",
        supportsWorkflows: ["triage"],
        requiredActions: ["Open project"],
        acceptanceCriteria: ["Shows blocker count"],
      },
    ],
    revisionPrompts: ["Does this match ECC triage?"],
    approvalChecklist: ["Each page maps to a workflow"],
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
      {
        id: "approve-artifact",
        label: "Approve artifact",
        type: "approve",
        target: "artifact",
      },
    ],
    pipeline: {
      name: "Estimate build pipeline",
      triggerActionId: "run-estimate-pipeline",
      steps: [
        { id: "intake", name: "Document intake", producesArtifacts: ["source-evidence-map"] },
        { id: "takeoff", name: "Quantity takeoff", owner: "takeoff" },
        { id: "approval", name: "Approval package", requiresApproval: true },
      ],
      completionCriteria: ["Approval package is ready"],
      failureStates: ["Missing evidence"],
    },
    artifacts: [
      {
        id: "source-evidence-map",
        name: "Source evidence map",
        type: "evidence",
        producedByStepId: "intake",
        reviewActions: ["approve_artifact", "request_revision"],
        acceptanceCriteria: ["Every quantity links to source evidence"],
      },
    ],
    emptyState: "Create an estimate package to test the workflow.",
  },
};

describe("buildDashboardPrototypeViewModel", () => {
  test("maps planned pages to workflows, actions, components, and sub-agent ownership", () => {
    const model = buildDashboardPrototypeViewModel(basePlan);

    expect(model.ready).toBe(true);
    expect(model.pages[0]).toMatchObject({
      path: "/projects",
      title: "Projects",
      purpose: "Prioritize active estimates.",
      actions: ["Open project"],
      acceptanceCriteria: ["Shows blocker count"],
      components: ["metric-cards", "data-table"],
    });
    expect(model.pages[0]?.workflows.map((workflow) => workflow.name)).toEqual(["Project Triage"]);
    expect(model.primaryActions.map((action) => action.id)).toEqual([
      "create-estimate",
      "run-estimate-pipeline",
    ]);
    expect(model.pipeline?.name).toBe("Estimate build pipeline");
    expect(model.pipeline?.steps.map((step) => step.id)).toEqual(["intake", "takeoff", "approval"]);
    expect(model.artifacts[0]).toMatchObject({
      id: "source-evidence-map",
      reviewActions: ["approve_artifact", "request_revision"],
    });
    expect(model.emptyState).toBe("Create an estimate package to test the workflow.");
    expect(model.subAgents[0]).toMatchObject({
      name: "Takeoff Specialist",
      skills: ["review-project"],
      autonomy: "requires approval",
    });
  });

  test("blocks dashboard plans that do not include a prototype spec", () => {
    const model = buildDashboardPrototypeViewModel({
      ...basePlan,
      dashboardPrototype: undefined,
    });

    expect(model.ready).toBe(false);
    expect(model.blocker).toContain("dashboardPrototype");
  });

  test("derives a simulated pipeline and default artifacts for legacy prototype specs", () => {
    const model = buildDashboardPrototypeViewModel({
      ...basePlan,
      dashboardPrototype: {
        ...basePlan.dashboardPrototype!,
        actions: undefined,
        pipeline: undefined,
        artifacts: undefined,
      },
    });

    expect(model.actions.map((action) => action.label)).toContain("Open Project");
    expect(model.pipeline?.steps.map((step) => step.name)).toEqual(["Open queue", "Review blockers"]);
    expect(model.artifacts.map((artifact) => artifact.id)).toEqual(["work-summary", "approval-package"]);
  });
});
