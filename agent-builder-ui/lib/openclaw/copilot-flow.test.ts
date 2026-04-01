import { describe, expect, test } from "bun:test";
import type { SavedAgent } from "@/hooks/use-agents-store";

import {
  buildCoPilotReviewData,
  buildCoPilotReviewAgentSnapshot,
  evaluateCoPilotDeployReadiness,
  countSkillAvailability,
  createCoPilotSeedFromAgent,
  getSelectedUnresolvedSkillIds,
  hasPurposeMetadata,
  resolveCoPilotToolResearchUseCase,
  resolveCoPilotCompletionKind,
} from "./copilot-flow";

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
      builtSkillIds: [],
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
