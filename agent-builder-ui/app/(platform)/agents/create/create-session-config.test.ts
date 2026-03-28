import { describe, expect, test } from "bun:test";

import type { AgentImprovement, AgentToolConnection } from "@/lib/agents/types";
import type { SkillGraphNode } from "@/lib/openclaw/types";
import {
  applyAcceptedImprovementsToConfig,
  applyReviewOutputToCreateSessionConfig,
  createInitialCreateSessionConfig,
  deriveCreateSessionReviewState,
  projectSelectedSkillsRuntimeContract,
} from "./create-session-config";

const connectGoogleImprovement: AgentImprovement = {
  id: "connect-google-ads",
  kind: "tool_connection",
  status: "accepted",
  scope: "builder",
  title: "Connect Google Ads before deploy",
  summary: "Attach the Google Ads connector so the agent can read live account data.",
  rationale: "The generated Google Ads skills depend on Google Ads account access that is not configured yet.",
  targetId: "google-ads",
};

function buildGoogleConnection(
  overrides: Partial<AgentToolConnection> = {},
): AgentToolConnection {
  return {
    toolId: "google-ads",
    name: "Google Ads",
    description: "Campaigns, ad groups, keywords, budgets, and performance reporting.",
    status: "missing_secret",
    authKind: "oauth",
    connectorType: "mcp",
    configSummary: ["Selected from accepted builder improvement", "Credentials still required"],
    ...overrides,
  };
}

describe("applyAcceptedImprovementsToConfig", () => {
  test("projects accepted Google Ads tool improvements into truthful connector state", () => {
    const projected = applyAcceptedImprovementsToConfig({
      toolConnections: [],
      improvements: [connectGoogleImprovement],
    });

    expect(projected.toolConnections).toEqual([
      buildGoogleConnection(),
    ]);
  });

  test("does not duplicate projected connectors when the same improvement is re-applied", () => {
    const projected = applyAcceptedImprovementsToConfig({
      toolConnections: [buildGoogleConnection()],
      improvements: [connectGoogleImprovement],
    });

    expect(projected.toolConnections).toEqual([
      buildGoogleConnection(),
    ]);
  });

  test("preserves stronger saved connector state when projecting accepted improvements", () => {
    const projected = applyAcceptedImprovementsToConfig({
      toolConnections: [
        buildGoogleConnection({
          status: "configured",
          configSummary: ["Connected account: Acme Ads", "Credentials stored securely"],
        }),
      ],
      improvements: [connectGoogleImprovement],
    });

    expect(projected.toolConnections).toEqual([
      buildGoogleConnection({
        status: "configured",
        configSummary: ["Connected account: Acme Ads", "Credentials stored securely"],
      }),
    ]);
  });

  test("upgrades weaker saved Google Ads connections without duplicating the connector", () => {
    const projected = applyAcceptedImprovementsToConfig({
      toolConnections: [
        buildGoogleConnection({
          status: "unsupported",
          connectorType: "api",
          authKind: "none",
          configSummary: ["Manual setup required", "Legacy connector placeholder"],
        }),
      ],
      improvements: [connectGoogleImprovement],
    });

    expect(projected.toolConnections).toEqual([
      buildGoogleConnection({
        status: "missing_secret",
        configSummary: [
          "Manual setup required",
          "Legacy connector placeholder",
          "Selected from accepted builder improvement",
          "Credentials still required",
        ],
      }),
    ]);
  });

  test("ignores pending or dismissed improvements", () => {
    const projected = applyAcceptedImprovementsToConfig({
      toolConnections: [],
      improvements: [
        { ...connectGoogleImprovement, status: "pending" },
        { ...connectGoogleImprovement, id: "dismissed-google", status: "dismissed" },
      ],
    });

    expect(projected.toolConnections).toEqual([]);
  });
});

describe("deriveCreateSessionReviewState", () => {
  test("projects accepted improvements into review state when the session has not touched tool connections", () => {
    const reviewState = deriveCreateSessionReviewState(
      {
        toolConnections: [],
        toolConnectionsTouched: false,
        credentialDrafts: {},
        selectedSkills: [],
        triggers: [],
        triggersTouched: false,
      },
      {
        toolConnections: [],
        triggers: [],
      },
      [connectGoogleImprovement],
    );

    expect(reviewState.toolConnections).toEqual([
      buildGoogleConnection(),
    ]);
  });

  test("preserves stronger touched-session connector state after review projection", () => {
    const reviewState = deriveCreateSessionReviewState(
      {
        toolConnections: [
          buildGoogleConnection({
            status: "configured",
            configSummary: ["Connected account: Acme Ads", "Credentials stored securely"],
          }),
        ],
        toolConnectionsTouched: true,
        credentialDrafts: {},
        selectedSkills: [],
        triggers: [],
        triggersTouched: false,
      },
      {
        toolConnections: [],
        triggers: [],
      },
      [connectGoogleImprovement],
    );

    expect(reviewState.toolConnections).toEqual([
      buildGoogleConnection({
        status: "configured",
        configSummary: ["Connected account: Acme Ads", "Credentials stored securely"],
      }),
    ]);
  });
});

describe("createInitialCreateSessionConfig", () => {
  test("re-seeds Google Ads drafts with canonical skill ids and accepted connector improvements on reopen", () => {
    const session = createInitialCreateSessionConfig({
      skills: ["Google Ads Audit", "budget-pacing-report"],
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance",
        },
        {
          skill_id: "budget-pacing-report",
          name: "Budget Pacing Report",
          description: "Summarize pacing risk",
        },
      ],
      toolConnections: [],
      triggers: [],
      improvements: [connectGoogleImprovement],
    });

    expect(session.selectedSkills).toEqual([
      "google-ads-audit",
      "budget-pacing-report",
    ]);
    expect(session.toolConnections).toEqual([buildGoogleConnection()]);
    expect(session.toolConnectionsTouched).toBe(false);
    expect(session.triggersTouched).toBe(false);
  });
});

describe("applyReviewOutputToCreateSessionConfig", () => {
  const skillGraph: SkillGraphNode[] = [
    {
      skill_id: "google-ads-audit",
      name: "Google Ads Audit",
      description: "Inspect campaign performance",
    },
    {
      skill_id: "budget-pacing-report",
      name: "Budget Pacing Report",
      description: "Summarize pacing risk",
    },
  ];

  test("maps review-edited skill labels back to canonical ids and persists confirmed triggers", () => {
    const projected = applyReviewOutputToCreateSessionConfig({
      current: {
        toolConnections: [],
        toolConnectionsTouched: false,
        credentialDrafts: {},
        selectedSkills: ["google-ads-audit", "budget-pacing-report"],
        triggers: [],
        triggersTouched: false,
      },
      skillGraph,
      reviewSkills: ["Budget Pacing Report"],
      reviewTriggers: [
        {
          id: "cron-schedule",
          icon: "calendar",
          text: "Weekday Pacing Review",
          kind: "schedule",
          status: "supported",
          detail: "Every weekday at 9am",
        },
      ],
      improvements: [connectGoogleImprovement],
      fallbackToolConnections: [],
      fallbackTriggers: [
        {
          id: "cron-schedule",
          title: "Cron Schedule",
          kind: "schedule",
          status: "supported",
          description: "Run on a recurring schedule.",
          schedule: "0 9 * * 1-5",
        },
      ],
    });

    expect(projected.selectedSkills).toEqual(["budget-pacing-report"]);
    expect(projected.triggersTouched).toBe(true);
    expect(projected.triggers).toEqual([
      {
        id: "cron-schedule",
        title: "Weekday Pacing Review",
        kind: "schedule",
        status: "supported",
        description: "Run on a recurring schedule.",
        schedule: "0 9 * * 1-5",
      },
    ]);
    expect(projected.toolConnectionsTouched).toBe(true);
    expect(projected.toolConnections).toEqual([buildGoogleConnection()]);
  });

  test("allows review confirm to intentionally clear skills and triggers", () => {
    const projected = applyReviewOutputToCreateSessionConfig({
      current: {
        toolConnections: [buildGoogleConnection()],
        toolConnectionsTouched: true,
        credentialDrafts: {},
        selectedSkills: ["google-ads-audit"],
        triggers: [
          {
            id: "cron-schedule",
            title: "Cron Schedule",
            kind: "schedule",
            status: "supported",
            description: "Run on a recurring schedule.",
            schedule: "0 9 * * 1-5",
          },
        ],
        triggersTouched: true,
      },
      skillGraph,
      reviewSkills: [],
      reviewTriggers: [],
      improvements: [],
      fallbackToolConnections: [],
      fallbackTriggers: [],
    });

    expect(projected.selectedSkills).toEqual([]);
    expect(projected.triggers).toEqual([]);
    expect(projected.triggersTouched).toBe(true);
  });
});

describe("projectSelectedSkillsRuntimeContract", () => {
  test("filters the saved graph, workflow, and runtime inputs to the selected skill subset", () => {
    const projection = projectSelectedSkillsRuntimeContract({
      selectedSkillIds: ["Budget Pacing Report"],
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance",
          depends_on: [],
          requires_env: ["GOOGLE_ADS_CUSTOMER_ID"],
          source: "custom",
          status: "generated",
        },
        {
          skill_id: "budget-pacing-report",
          name: "Budget Pacing Report",
          description: "Summarize pacing risk",
          depends_on: ["google-ads-audit"],
          requires_env: [],
          source: "custom",
          status: "generated",
        },
      ],
      workflow: {
        name: "main",
        description: "Google Ads workflow",
        steps: [
          {
            id: "step-0",
            action: "execute",
            skill: "google-ads-audit",
            wait_for: [],
          },
          {
            id: "step-1",
            action: "execute",
            skill: "budget-pacing-report",
            wait_for: ["google-ads-audit"],
          },
        ],
      },
      runtimeInputs: [
        {
          key: "GOOGLE_ADS_CUSTOMER_ID",
          label: "Customer ID",
          description: "Google Ads customer ID for the target account.",
          required: true,
          source: "architect_requirement",
          value: "123-456-7890",
        },
      ],
      agentRules: [],
    });

    expect(projection.selectedSkillIds).toEqual(["budget-pacing-report"]);
    expect(projection.skillGraph).toEqual([
      expect.objectContaining({
        skill_id: "budget-pacing-report",
        depends_on: [],
      }),
    ]);
    expect(projection.workflow).toEqual({
      name: "main",
      description: "Google Ads workflow",
      steps: [
        {
          id: "step-1",
          action: "execute",
          skill: "budget-pacing-report",
          wait_for: [],
        },
      ],
    });
    expect(projection.runtimeInputs).toEqual([]);
  });

  test("preserves matching runtime input values for the kept skills", () => {
    const projection = projectSelectedSkillsRuntimeContract({
      selectedSkillIds: ["google-ads-audit"],
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance",
          depends_on: [],
          requires_env: ["GOOGLE_ADS_CUSTOMER_ID"],
          source: "custom",
          status: "generated",
        },
      ],
      workflow: null,
      runtimeInputs: [
        {
          key: "GOOGLE_ADS_CUSTOMER_ID",
          label: "Saved customer id",
          description: "Stored on the saved agent already.",
          required: false,
          source: "architect_requirement",
          value: "123-456-7890",
        },
        {
          key: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
          label: "Login customer id",
          description: "No longer needed once pacing is deselected.",
          required: true,
          source: "architect_requirement",
          value: "999-999-9999",
        },
      ],
      agentRules: [],
    });

    expect(projection.runtimeInputs).toEqual([
      {
        key: "GOOGLE_ADS_CUSTOMER_ID",
        label: "Saved customer id",
        description: "Stored on the saved agent already.",
        required: false,
        source: "architect_requirement",
        value: "123-456-7890",
      },
    ]);
  });
});
