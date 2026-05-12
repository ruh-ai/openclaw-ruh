import { describe, expect, test } from "bun:test";

import { generateScaffoldFiles } from "./scaffold-templates";
import type { ArchitecturePlan } from "./types";

describe("generateScaffoldFiles — dashboardPrototype", () => {
  test("renders prototype workflows and required actions into generated dashboard pages", () => {
    const plan: ArchitecturePlan = {
      skills: [],
      workflow: { steps: [] },
      integrations: [],
      triggers: [],
      channels: [],
      envVars: [],
      subAgents: [],
      missionControl: null,
      dataSchema: null,
      apiEndpoints: [
        { method: "GET", path: "/api/estimator/projects", description: "List projects" },
        { method: "POST", path: "/api/estimator/projects/reset-demo", description: "Create estimate" },
        { method: "POST", path: "/api/estimator/pipeline/run-step", description: "Run estimate pipeline" },
      ],
      dashboardPages: [
        {
          path: "/estimator/projects",
          title: "Estimate Projects",
          components: [
            { type: "data-table", title: "Projects", dataSource: "/api/estimator/projects" },
          ],
        },
      ],
      dashboardPrototype: {
        summary: "ECC estimator workspace",
        primaryUsers: ["Estimator"],
        workflows: [
          {
            id: "project-review",
            name: "Project Review",
            steps: ["Open estimate", "Resolve blockers", "Approve package"],
            requiredActions: ["resolve_blocker", "approve_package"],
            successCriteria: ["Blocked projects cannot be approved"],
          },
        ],
        pages: [
          {
            path: "/estimator/projects",
            title: "Estimate Projects",
            purpose: "Select active estimates and review blockers.",
            supportsWorkflows: ["project-review"],
            requiredActions: ["open_estimate"],
            acceptanceCriteria: ["Shows blocker count"],
          },
        ],
        actions: [
          { id: "create-estimate", label: "Create estimate", type: "create", target: "work_item", primary: true },
          { id: "run-estimate-pipeline", label: "Run estimate pipeline", type: "run_pipeline", target: "pipeline", primary: true },
        ],
        pipeline: {
          name: "Estimate build pipeline",
          triggerActionId: "run-estimate-pipeline",
          steps: [
            { id: "document-intake", name: "Document intake", producesArtifacts: ["source-evidence-map"] },
            { id: "approval-package", name: "Approval package", requiresApproval: true },
          ],
          completionCriteria: ["Approval package is ready"],
          failureStates: ["Missing source evidence"],
        },
        artifacts: [
          {
            id: "source-evidence-map",
            name: "Source evidence map",
            type: "evidence",
            reviewActions: ["approve_artifact", "request_revision"],
            acceptanceCriteria: ["Every quantity links to source evidence"],
          },
        ],
        revisionPrompts: ["Does this match ECC project review?"],
        approvalChecklist: ["Prototype reviewed"],
      },
    };

    const page = generateScaffoldFiles(plan, "Estimator")
      .find((file) => file.path === "dashboard/pages/estimate-projects.tsx");

    expect(page?.content).toContain("Project Review");
    expect(page?.content).toContain("prototypeActionEndpoints");
    expect(page?.content).toContain("runPrototypeAction(action.id, action.label)");
    expect(page?.content).toContain("Create estimate");
    expect(page?.content).toContain("Estimate build pipeline");
    expect(page?.content).toContain("Source evidence map");
    expect(page?.content).toContain("resolve_blocker");
    expect(page?.content).toContain("Blocked projects cannot be approved");
    // Visual fidelity: workflows render via WorkflowCard with arrow-flow steps
    expect(page?.content).toContain("function WorkflowCard");
    expect(page?.content).toContain("workflow.steps.join(' → ')");
    // Pipeline renders as a horizontal stepper, not a numbered <ol>
    expect(page?.content).toContain("function PipelineStepper");
    // Artifacts render via ArtifactReviewCard with reviewAction buttons
    expect(page?.content).toContain("function ArtifactReviewCard");
    // Review artifacts (revisionPrompts, approvalChecklist) gate Plan→Build in
    // the builder UI; they must NOT appear in the runtime scaffold.
    expect(page?.content).not.toContain("Does this match ECC project review?");
    expect(page?.content).not.toContain("Prototype reviewed");
    expect(page?.content).not.toContain("prototypeRevisionPrompts");
    expect(page?.content).not.toContain("prototypeApprovalChecklist");

    const route = generateScaffoldFiles(plan, "Estimator")
      .find((file) => file.path === "backend/routes/estimator.ts");
    expect(route?.content).toContain("createInitialState");
    expect(route?.content).toContain("router.post('/projects/reset-demo'");
    expect(route?.content).toContain("router.post('/pipeline/run-step'");
    expect(route?.content).not.toContain("placeholder: true");
  });
});
