import { describe, expect, test } from "bun:test";
import type { SavedAgent } from "@/hooks/use-agents-store";

import {
  buildReviewStateFromArchitecturePlan,
  buildCoPilotReviewData,
  buildCoPilotReviewAgentSnapshot,
  evaluateCoPilotDeployReadiness,
  countSkillAvailability,
  createCoPilotSeedFromAgent,
  getSelectedUnresolvedSkillIds,
  hasPurposeMetadata,
  resolveCoPilotToolResearchUseCase,
  resolveCoPilotCompletionKind,
  resolveReviewSkillNodes,
  resolveEvalReviewState,
  approveManualEvalTasks,
} from "./copilot-flow";
import type { ArchitecturePlan, EvalTask } from "./types";

describe("hasPurposeMetadata", () => {
  test("requires both name and description", () => {
    expect(hasPurposeMetadata("Agent", "Does useful work")).toBe(true);
    expect(hasPurposeMetadata("Agent", "")).toBe(false);
    expect(hasPurposeMetadata("", "Does useful work")).toBe(false);
  });
});

describe("resolveCoPilotToolResearchUseCase", () => {
  test("returns the trimmed description for embedded tool research", () => {
    expect(
      resolveCoPilotToolResearchUseCase("  Monitor Google Ads budget pacing and flag wasted spend.  "),
    ).toBe("Monitor Google Ads budget pacing and flag wasted spend.");
    expect(resolveCoPilotToolResearchUseCase("   ")).toBeUndefined();
  });
});

describe("getSelectedUnresolvedSkillIds", () => {
  test("returns only selected skills that still need a build", () => {
    expect(
      getSelectedUnresolvedSkillIds(
        ["native-skill", "missing-skill", "built-skill"],
        [
          { skillId: "native-skill", status: "native", reason: "" },
          { skillId: "missing-skill", status: "needs_build", reason: "" },
          { skillId: "built-skill", status: "custom_built", reason: "" },
        ],
      ),
    ).toEqual(["missing-skill"]);
  });
});

describe("countSkillAvailability", () => {
  test("counts each availability bucket", () => {
    expect(
      countSkillAvailability([
        { skillId: "a", status: "native", reason: "" },
        { skillId: "b", status: "registry_match", reason: "" },
        { skillId: "c", status: "needs_build", reason: "" },
        { skillId: "d", status: "custom_built", reason: "" },
        { skillId: "e", status: "needs_build", reason: "" },
      ]),
    ).toEqual({
      native: 1,
      registry_match: 1,
      needs_build: 2,
      custom_built: 1,
    });
  });
});

describe("buildCoPilotReviewData", () => {
  test("reuses the shared formatter contract for tool, trigger, and readiness summaries", () => {
    expect(
      buildCoPilotReviewData({
        selectedSkillIds: ["google-ads-audit"],
        totalSkillCount: 2,
        agentRules: ["Audit spend daily", "Escalate missing credentials"],
        runtimeInputs: [
          {
            key: "GOOGLE_ADS_CUSTOMER_ID",
            label: "Google Ads Customer ID",
            description: "Customer account id for runtime API calls.",
            required: true,
            source: "architect_requirement",
            value: "",
          },
        ],
        connectedTools: [
          {
            toolId: "google-ads",
            name: "Google Ads",
            description: "Inspect campaigns and budgets.",
            status: "missing_secret",
            authKind: "oauth",
            connectorType: "mcp",
            configSummary: ["Missing OAuth refresh token"],
          },
        ],
        triggers: [
          {
            id: "webhook-post",
            title: "Incoming webhook",
            kind: "webhook",
            status: "unsupported",
            description: "Would receive pacing alerts from an external source.",
          },
        ],
      }),
    ).toEqual({
      skillSummary: "1 of 2 selected",
      ruleSummary: "Audit spend daily · Escalate missing credentials",
      channels: [],
      channelSummary: "Web chat only",
      toolItems: [
        {
          id: "google-ads",
          name: "Google Ads",
          description: "Inspect campaigns and budgets.",
          status: "missing_secret",
          statusLabel: "Needs credentials",
          detail: "Missing OAuth refresh token",
          planNotes: [],
          sources: [],
        },
      ],
      runtimeInputItems: [
        {
          key: "GOOGLE_ADS_CUSTOMER_ID",
          label: "Google Ads Customer ID",
          required: true,
          statusLabel: "Missing value",
          detail: "Customer account id for runtime API calls.",
        },
      ],
      triggerItems: [
        {
          id: "webhook-post",
          text: "Incoming webhook",
          kind: "webhook",
          status: "unsupported",
          statusLabel: "Unsupported webhook",
          detail: "Would receive pacing alerts from an external source.",
        },
      ],
      deploySummary: {
        toolSummary: "1 needs credentials",
        triggerSummary: "1 unsupported",
        runtimeInputSummary: "1 missing runtime input",
        readinessLabel: "Action needed before deploy",
      },
    });
  });
});

describe("buildReviewStateFromArchitecturePlan", () => {
  test("derives generated skill graph, workflow, and built skill ids from build manifest", () => {
    const plan: ArchitecturePlan = {
      skills: [
        {
          id: "local-ui-inspector",
          name: "Local UI Inspector",
          description: "Capture local builder UI state.",
          dependencies: [],
          toolType: "mcp",
          envVars: ["FLOW_QA_TARGET_URL"],
        },
        {
          id: "stage-readiness-checker",
          name: "Stage Readiness Checker",
          description: "Compare visible state to readiness rules.",
          dependencies: ["local-ui-inspector"],
          toolType: "api",
          envVars: [],
        },
      ],
      workflow: {
        steps: [
          { skillId: "local-ui-inspector", parallel: false },
          { skillId: "stage-readiness-checker", parallel: false },
        ],
      },
      integrations: [],
      triggers: [],
      channels: [],
      envVars: [],
      subAgents: [],
      missionControl: null,
    };

    const reviewState = buildReviewStateFromArchitecturePlan({
      plan,
      agentName: "Flow QA Sentinel",
      manifest: {
        tasks: [
          {
            specialist: "skills",
            status: "done",
            files: [
              "skills/local-ui-inspector/SKILL.md",
              "skills/stage-readiness-checker/SKILL.md",
            ],
          },
        ],
      },
    });

    expect(reviewState.builtSkillIds).toEqual(["local-ui-inspector", "stage-readiness-checker"]);
    expect(reviewState.nodes).toEqual([
      {
        skill_id: "local-ui-inspector",
        name: "Local UI Inspector",
        description: "Capture local builder UI state.",
        status: "generated",
        source: "custom",
        depends_on: [],
        requires_env: ["FLOW_QA_TARGET_URL"],
        skill_md: "",
      },
      {
        skill_id: "stage-readiness-checker",
        name: "Stage Readiness Checker",
        description: "Compare visible state to readiness rules.",
        status: "generated",
        source: "custom",
        depends_on: ["local-ui-inspector"],
        requires_env: [],
        skill_md: "",
      },
    ]);
    expect(reviewState.workflow?.steps).toEqual([
      { id: "step-0", action: "execute", skill: "local-ui-inspector", wait_for: [] },
      { id: "step-1", action: "execute", skill: "stage-readiness-checker", wait_for: ["local-ui-inspector"] },
    ]);
  });
});

describe("resolveReviewSkillNodes", () => {
  test("falls back to plan skills when persisted skill graph is an empty array", () => {
    const nodes = resolveReviewSkillNodes(
      {
        skills: [
          {
            id: "local-ui-inspector",
            name: "Local UI Inspector",
            description: "Capture local builder UI state.",
            dependencies: [],
            toolType: "mcp",
            envVars: ["FLOW_QA_TARGET_URL"],
          },
        ],
        workflow: { steps: [] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
      },
      [],
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      skill_id: "local-ui-inspector",
      name: "Local UI Inspector",
      source: "custom",
      status: "generated",
    });
  });
});

describe("resolveEvalReviewState", () => {
  test("does not summarize manual evaluation results as all tests passed", () => {
    const state = resolveEvalReviewState({
      totalCount: 2,
      pendingCount: 0,
      runningCount: 0,
      failCount: 0,
      manualCount: 2,
      hasRealContainer: true,
      runMode: "single",
      loopIterations: 0,
    });

    expect(state.allDone).toBe(true);
    expect(state.canApprove).toBe(false);
    expect(state.canRerunManual).toBe(true);
    expect(state.canApproveManual).toBe(true);
    expect(state.buttonLabel).toBe("Approve Manual Results");
    expect(state.message).toBe("2 tests need manual review. Check the low-confidence results before deployment.");
  });
});

describe("approveManualEvalTasks", () => {
  test("marks manual results as passing while preserving non-manual results", () => {
    const tasks: EvalTask[] = [
      {
        id: "manual",
        title: "Manual",
        input: "input",
        expectedBehavior: "expected",
        status: "manual",
        confidence: 0.3,
        reasons: ["Low confidence"],
      },
      {
        id: "pass",
        title: "Pass",
        input: "input",
        expectedBehavior: "expected",
        status: "pass",
        confidence: 0.9,
      },
    ];

    const approved = approveManualEvalTasks(tasks);

    expect(approved[0]).toMatchObject({
      id: "manual",
      status: "pass",
      confidence: 0.7,
      reasons: ["Low confidence", "Manually accepted after review."],
    });
    expect(approved[1]).toBe(tasks[1]);
    expect(tasks[0].status).toBe("manual");
  });
});

describe("buildCoPilotReviewAgentSnapshot", () => {
  test("projects accepted improvements into the embedded review test snapshot", () => {
    const snapshot = buildCoPilotReviewAgentSnapshot({
      name: "Google Ads Optimizer",
      description: "Optimize paid search accounts",
      systemName: "google-ads-optimizer",
      selectedSkillIds: ["google-ads-audit"],
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaigns and budgets.",
          status: "generated",
          source: "custom",
          depends_on: [],
        },
      ],
      agentRules: ["Escalate missing prerequisites before making changes."],
      runtimeInputs: [
        {
          key: "GOOGLE_ADS_CUSTOMER_ID",
          label: "Google Ads Customer ID",
          description: "Customer account id for runtime API calls.",
          required: true,
          source: "architect_requirement",
          value: "123-456-7890",
        },
      ],
      connectedTools: [],
      triggers: [
        {
          id: "weekday-9am",
          title: "Every weekday at 9am",
          kind: "schedule",
          status: "supported",
          description: "Run on weekdays",
          schedule: "0 9 * * 1-5",
        },
      ],
      improvements: [
        {
          id: "connect-google-ads",
          kind: "tool_connection",
          status: "accepted",
          scope: "builder",
          title: "Connect Google Ads",
          summary: "Adds the Google Ads connector requirement.",
          rationale: "The agent needs campaign data access.",
          targetId: "google-ads",
        },
      ],
      workflow: {
        name: "main",
        description: "workflow",
        steps: [],
      },
    });

    expect(snapshot.name).toBe("Google Ads Optimizer");
    expect(snapshot.skills).toEqual(["Google Ads Audit"]);
    expect(snapshot.toolConnections).toEqual([
      expect.objectContaining({
        toolId: "google-ads",
        status: "missing_secret",
      }),
    ]);
    expect(snapshot.triggers).toEqual([
      expect.objectContaining({
        id: "weekday-9am",
        kind: "schedule",
        status: "supported",
      }),
    ]);
    expect(snapshot.improvements).toEqual([
      expect.objectContaining({
        id: "connect-google-ads",
        status: "accepted",
      }),
    ]);
  });
});

describe("createCoPilotSeedFromAgent", () => {
  test("hydrates saved improve-agent data into a ready copilot snapshot", () => {
    const agent = {
      id: "agent-1",
      name: "Google Ads Optimizer",
      avatar: "🤖",
      description: "Optimize paid search accounts",
      skills: ["Google Ads Audit", "budget-pacing-report"],
      triggerLabel: "Weekday schedule",
      status: "active",
      createdAt: "2026-03-26T00:00:00.000Z",
      sandboxIds: ["sandbox-1"],
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaigns",
          status: "generated",
          source: "custom",
          depends_on: [],
          requires_env: [],
          external_api: "google_ads",
        },
        {
          skill_id: "budget-pacing-report",
          name: "Budget Pacing Report",
          description: "Summarize spend",
          status: "generated",
          source: "custom",
          depends_on: [],
          requires_env: [],
        },
      ],
      workflow: {
        name: "main",
        description: "workflow",
        steps: [],
      },
      agentRules: ["Run every weekday at 9am"],
      runtimeInputs: [
        {
          key: "GOOGLE_ADS_CUSTOMER_ID",
          label: "Google Ads Customer ID",
          description: "Customer account id for runtime API calls.",
          required: true,
          source: "architect_requirement",
          value: "123-456-7890",
        },
      ],
      toolConnections: [
        {
          toolId: "google-ads",
          name: "Google Ads",
          description: "Connector",
          status: "configured",
          authKind: "oauth",
          connectorType: "mcp",
          configSummary: ["Authenticated"],
        },
      ],
      triggers: [
        {
          id: "weekday-9am",
          title: "Every weekday at 9am",
          kind: "schedule",
          status: "supported",
          description: "Run on weekdays",
          schedule: "0 9 * * 1-5",
        },
      ],
      channels: [
        {
          kind: "slack",
          status: "planned",
          label: "Slack",
          description: "Configure the workspace bot after deploy.",
        },
      ],
      improvements: [
        {
          id: "imp-1",
          kind: "workflow",
          status: "accepted",
          scope: "builder",
          title: "Add budget pacing alerts",
          summary: "Flag overspend earlier",
          rationale: "Escalate pacing risk sooner.",
        },
      ],
      discoveryDocuments: {
        prd: {
          title: "Product Requirements Document",
          sections: [
            {
              heading: "Goal",
              content: "Build a Google Ads optimization copilot.",
            },
          ],
        },
        trd: {
          title: "Technical Requirements Document",
          sections: [
            {
              heading: "Integrations",
              content: "Use the Google Ads MCP connector.",
            },
          ],
        },
      },
    } satisfies SavedAgent;

    expect(createCoPilotSeedFromAgent(agent)).toEqual({
      name: "Google Ads Optimizer",
      description: "Optimize paid search accounts",
      skillGraph: agent.skillGraph,
      selectedSkillIds: ["google-ads-audit", "budget-pacing-report"],
      builtSkillIds: ["google-ads-audit", "budget-pacing-report"],
      workflow: agent.workflow,
      skillGenerationStatus: "ready",
      skillGenerationError: null,
      connectedTools: agent.toolConnections,
      credentialDrafts: {},
      runtimeInputs: agent.runtimeInputs,
      triggers: agent.triggers,
      channels: agent.channels,
      agentRules: agent.agentRules,
      improvements: agent.improvements,
      discoveryDocuments: agent.discoveryDocuments,
      systemName: "Google Ads Optimizer",
      phase: "review",
      devStage: "review",
    });
  });

  test("projects accepted Google Ads connector improvements into reopened tool state", () => {
    const agent = {
      id: "agent-accepted-improvement",
      name: "Google Ads Optimizer",
      avatar: "🤖",
      description: "Optimize paid search accounts",
      skills: ["google-ads-audit"],
      triggerLabel: "Weekday schedule",
      status: "active",
      createdAt: "2026-03-26T00:00:00.000Z",
      sandboxIds: ["sandbox-1"],
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaigns",
          status: "generated",
          source: "custom",
          depends_on: [],
          requires_env: [],
          external_api: "google_ads",
        },
      ],
      workflow: null,
      agentRules: [],
      toolConnections: [],
      triggers: [],
      improvements: [
        {
          id: "connect-google-ads",
          kind: "tool_connection",
          status: "accepted",
          scope: "builder",
          title: "Connect Google Ads before deploy",
          summary: "Attach the Google Ads connector so the agent can read live account data.",
          rationale: "The generated Google Ads skill depends on account access that is not configured yet.",
          targetId: "google-ads",
        },
      ],
    } satisfies SavedAgent;

    expect(createCoPilotSeedFromAgent(agent).connectedTools).toEqual([
      {
        toolId: "google-ads",
        name: "Google Ads",
        description: "Campaigns, ad groups, keywords, budgets, and performance reporting.",
        status: "missing_secret",
        authKind: "oauth",
        connectorType: "mcp",
        configSummary: [
          "Selected from accepted builder improvement",
          "Credentials still required",
        ],
      },
    ]);
  });

  test("falls back to persisted skillGraph ids when saved improve-agent skills are missing", () => {
    const agent = {
      id: "agent-graph-only",
      name: "Google Ads Recovery",
      avatar: "🤖",
      description: "Recover saved Google Ads config in Co-Pilot",
      skills: [],
      triggerLabel: "Weekday schedule",
      status: "active",
      createdAt: "2026-03-26T00:00:00.000Z",
      sandboxIds: ["sandbox-1"],
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance",
          status: "generated",
          source: "custom",
          depends_on: [],
          requires_env: [],
        },
        {
          skill_id: "budget-pacing-report",
          name: "Budget Pacing Report",
          description: "Summarize pacing risk",
          status: "generated",
          source: "custom",
          depends_on: [],
          requires_env: [],
        },
      ],
      workflow: null,
      agentRules: [],
      toolConnections: [],
      triggers: [],
      improvements: [],
    } satisfies SavedAgent;

    const seed = createCoPilotSeedFromAgent(agent);
    expect(seed.selectedSkillIds).toEqual(["google-ads-audit", "budget-pacing-report"]);
    expect(seed.skillGenerationStatus).toBe("ready");
    expect(seed.phase).toBe("review");
  });

  test("trims saved skill labels before mapping them back to canonical skill ids", () => {
    const agent = {
      id: "agent-trimmed-skills",
      name: "Google Ads Recovery",
      avatar: "🤖",
      description: "Recover saved Google Ads config in Co-Pilot",
      skills: ["  Google Ads Audit  ", "budget-pacing-report"],
      triggerLabel: "Weekday schedule",
      status: "active",
      createdAt: "2026-03-26T00:00:00.000Z",
      sandboxIds: ["sandbox-1"],
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance",
          status: "generated",
          source: "custom",
          depends_on: [],
          requires_env: [],
        },
        {
          skill_id: "budget-pacing-report",
          name: "Budget Pacing Report",
          description: "Summarize pacing risk",
          status: "generated",
          source: "custom",
          depends_on: [],
          requires_env: [],
        },
      ],
      workflow: null,
      agentRules: [],
      toolConnections: [],
      triggers: [],
      improvements: [],
    } satisfies SavedAgent;

    expect(createCoPilotSeedFromAgent(agent).selectedSkillIds).toEqual([
      "google-ads-audit",
      "budget-pacing-report",
    ]);
  });

  test("fails closed when forge_stage claims review but no persisted skill graph exists", () => {
    const agent = {
      id: "agent-empty-review",
      name: "Google Ads Recovery",
      avatar: "🤖",
      description: "Recover saved Google Ads config in Co-Pilot",
      skills: [],
      triggerLabel: "Weekday schedule",
      status: "forging",
      forgeStage: "review",
      createdAt: "2026-03-26T00:00:00.000Z",
      sandboxIds: ["sandbox-1"],
      skillGraph: [],
      workflow: null,
      agentRules: [],
      toolConnections: [],
      triggers: [],
      improvements: [],
    } satisfies SavedAgent;

    const seed = createCoPilotSeedFromAgent(agent);
    expect(seed.phase).toBe("purpose");
    expect(seed.skillGenerationStatus).toBe("idle");
    expect(seed.devStage).toBeUndefined();
    expect(seed.thinkStatus).toBeUndefined();
    expect(seed.planStatus).toBeUndefined();
    expect(seed.buildStatus).toBeUndefined();
  });

  test("fails closed to think when forge_stage claims plan but PRD/TRD are missing", () => {
    const agent = {
      id: "agent-empty-plan",
      name: "Setup Defaults Probe",
      avatar: "🤖",
      description: "Inspect a local builder page.",
      skills: [],
      triggerLabel: "Manual",
      status: "forging",
      forgeStage: "plan",
      forgeSandboxId: "forge-sandbox-1",
      createdAt: "2026-03-26T00:00:00.000Z",
      sandboxIds: [],
      skillGraph: [],
      workflow: null,
      agentRules: [],
      toolConnections: [],
      triggers: [],
      improvements: [],
      discoveryDocuments: null,
    } satisfies SavedAgent;

    const seed = createCoPilotSeedFromAgent(agent);
    expect(seed.devStage).toBe("think");
    expect(seed.thinkStatus).toBeUndefined();
    expect(seed.discoveryDocuments).toBeNull();
  });

  test("restores lifecycle from legacy snake_case persisted agent fields", () => {
    const agent = {
      id: "agent-legacy-snake",
      name: "Legacy QA",
      avatar: "🤖",
      description: "Recover legacy persisted agent shape",
      skills: [],
      triggerLabel: "Manual",
      status: "forging",
      forgeStage: null,
      forgeSandboxId: null,
      createdAt: "2026-03-26T00:00:00.000Z",
      sandboxIds: [],
      skillGraph: undefined,
      workflow: null,
      agentRules: [],
      toolConnections: [],
      triggers: [],
      improvements: [],
      forge_stage: "test",
      forge_sandbox_id: "forge-sandbox-1",
      skill_graph: [
        {
          skill_id: "qa",
          name: "QA",
          source: "custom",
          status: "generated",
          depends_on: [],
        },
      ],
    } as unknown as SavedAgent;

    const seed = createCoPilotSeedFromAgent(agent);
    expect(seed.devStage).toBe("test");
    expect(seed.agentSandboxId).toBe("forge-sandbox-1");
    expect(seed.skillGraph).toHaveLength(1);
  });
});

describe("resolveCoPilotCompletionKind", () => {
  test("keeps existing agents on the improve-agent completion path", () => {
    expect(
      resolveCoPilotCompletionKind({
        existingAgentId: "agent-1",
        draftAgentId: "agent-1",
      }),
    ).toBe("improve-existing");
  });

  test("uses create-and-deploy semantics for drafts and new agents", () => {
    expect(
      resolveCoPilotCompletionKind({
        existingAgentId: null,
        draftAgentId: "draft-1",
      }),
    ).toBe("deploy-draft");
    expect(
      resolveCoPilotCompletionKind({
        existingAgentId: null,
        draftAgentId: null,
      }),
    ).toBe("deploy-new");
  });
});

describe("evaluateCoPilotDeployReadiness", () => {
  test("keeps deploy available when the create-flow summary only has advisory warnings", () => {
    expect(
      evaluateCoPilotDeployReadiness({
        purposeReady: true,
        skillGenerationStatus: "ready",
        skillGraphCount: 2,
        selectedSkillIds: ["google-ads-audit"],
        unresolvedSelectedSkills: [],
        missingRequiredRuntimeInputKeys: [],
        deploySummary: {
          toolSummary: "1 configured",
          runtimeInputSummary: "1 missing runtime input",
          triggerSummary: "1 supported",
          readinessLabel: "Action needed before deploy",
        },
      }),
    ).toEqual({
      canDeploy: true,
      blockerMessage: null,
    });
  });

  test("still blocks deploy when a selected skill remains unresolved", () => {
    expect(
      evaluateCoPilotDeployReadiness({
        purposeReady: true,
        skillGenerationStatus: "ready",
        skillGraphCount: 2,
        selectedSkillIds: ["google-ads-audit"],
        unresolvedSelectedSkills: ["google-ads-audit"],
        missingRequiredRuntimeInputKeys: [],
        deploySummary: {
          toolSummary: "1 configured",
          runtimeInputSummary: "1 runtime input ready",
          triggerSummary: "1 supported",
          readinessLabel: "Ready to deploy",
        },
      }),
    ).toEqual({
      canDeploy: false,
      blockerMessage: "Build or deselect 1 unresolved skill before deploy.",
    });
  });

  test("allows deploy when the shared readiness contract is clear", () => {
    expect(
      evaluateCoPilotDeployReadiness({
        purposeReady: true,
        skillGenerationStatus: "ready",
        skillGraphCount: 2,
        selectedSkillIds: ["google-ads-audit"],
        unresolvedSelectedSkills: [],
        missingRequiredRuntimeInputKeys: [],
        deploySummary: {
          toolSummary: "1 configured",
          runtimeInputSummary: "1 runtime input ready",
          triggerSummary: "1 supported",
          readinessLabel: "Ready to deploy",
        },
      }),
    ).toEqual({
      canDeploy: true,
      blockerMessage: null,
    });
  });

  test("allows deploy even when required runtime inputs are missing (collected at first chat)", () => {
    expect(
      evaluateCoPilotDeployReadiness({
        purposeReady: true,
        skillGenerationStatus: "ready",
        skillGraphCount: 2,
        selectedSkillIds: ["google-ads-audit"],
        unresolvedSelectedSkills: [],
        missingRequiredRuntimeInputKeys: ["GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_REFRESH_TOKEN"],
        deploySummary: {
          toolSummary: "1 configured",
          runtimeInputSummary: "2 missing runtime input",
          triggerSummary: "1 supported",
          readinessLabel: "Action needed before deploy",
        },
      }),
    ).toEqual({
      canDeploy: true,
      blockerMessage: null,
    });
  });
});
