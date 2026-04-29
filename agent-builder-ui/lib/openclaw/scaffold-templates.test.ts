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
    expect(page?.content).toContain("onClick={() => runPrototypeAction(action)}");
    expect(page?.content).toContain("Create estimate");
    expect(page?.content).toContain("Estimate build pipeline");
    expect(page?.content).toContain("Source evidence map");
    expect(page?.content).toContain("resolve_blocker");
    expect(page?.content).toContain("Blocked projects cannot be approved");
    expect(page?.content).toContain("Does this match ECC project review?");

    const route = generateScaffoldFiles(plan, "Estimator")
      .find((file) => file.path === "backend/routes/estimator.ts");
    expect(route?.content).toContain("createInitialState");
    expect(route?.content).toContain("router.post('/projects/reset-demo'");
    expect(route?.content).toContain("router.post('/pipeline/run-step'");
    expect(route?.content).not.toContain("placeholder: true");
  });
});
