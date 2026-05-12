import { describe, expect, test } from "bun:test";

import { generateScaffoldFiles } from "./scaffold-templates";
import type { ArchitecturePlan } from "./types";

describe("generateScaffoldFiles — dashboardPrototype", () => {
  test("production dashboard pages do NOT embed prototype-spec metadata (workflows, actions, artifacts, approval gate)", () => {
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

    // The prototype-spec content — workflow names, planned-action labels,
    // generated-artifact names, pipeline step lists, revision prompts,
    // approval-checklist items — is PROCESS METADATA. It documents what
    // the agent should do, not what the operator should see. Production
    // dashboard pages must render only live UI primitives (PageHeader +
    // MetricCard / DataTable / charts fed by useApi).
    expect(page?.content).not.toContain("Project Review");
    expect(page?.content).not.toContain("prototypeActionEndpoints");
    expect(page?.content).not.toContain("runPrototypeAction");
    expect(page?.content).not.toContain("Create estimate");
    expect(page?.content).not.toContain("Estimate build pipeline");
    expect(page?.content).not.toContain("Source evidence map");
    expect(page?.content).not.toContain("Blocked projects cannot be approved");
    expect(page?.content).not.toContain("function WorkflowCard");
    expect(page?.content).not.toContain("function PipelineStepper");
    expect(page?.content).not.toContain("function ArtifactReviewCard");
    expect(page?.content).not.toContain("Does this match ECC project review?");
    expect(page?.content).not.toContain("Prototype reviewed");
    // Page still renders the live primitives
    expect(page?.content).toContain('PageHeader title="Estimate Projects"');
    expect(page?.content).toContain("DataTable");

    const route = generateScaffoldFiles(plan, "Estimator")
      .find((file) => file.path === "backend/routes/estimator.ts");
    expect(route?.content).toContain("createInitialState");
    expect(route?.content).toContain("router.post('/projects/reset-demo'");
    expect(route?.content).toContain("router.post('/pipeline/run-step'");
    expect(route?.content).not.toContain("placeholder: true");
  });
});
