import { describe, expect, test } from "bun:test";

import type { SkillGraphNode, WorkflowDefinition } from "@/lib/openclaw/types";
import type { AgentImprovement, AgentToolConnection, AgentTriggerDefinition } from "@/lib/agents/types";
import { buildReviewAgentSnapshot } from "./ReviewAgent";

const skillGraph: SkillGraphNode[] = [
  {
    skill_id: "google-ads-audit",
    name: "Google Ads Audit",
    description: "Inspect spend and campaign performance",
    source: "custom",
    status: "approved",
    depends_on: [],
  },
];

const workflow: WorkflowDefinition = {
  name: "main",
  description: "Main workflow",
  steps: [{ id: "step-1", action: "execute", skill: "google-ads-audit", wait_for: [] }],
};

const toolConnections: AgentToolConnection[] = [
  {
    toolId: "google-ads",
    name: "Google Ads",
    description: "Connected through the direct Google Ads MCP server.",
    status: "missing_secret",
    authKind: "oauth",
    connectorType: "mcp",
    configSummary: ["Google Ads credentials still required"],
  },
];

const triggers: AgentTriggerDefinition[] = [
  {
    id: "cron-schedule",
    title: "Weekday Optimization Run",
    kind: "schedule",
    status: "supported",
    description: "Runs weekdays at 9 AM.",
    schedule: "0 9 * * 1-5",
  },
];

const improvements: AgentImprovement[] = [
  {
    id: "improvement-1",
    kind: "tool_connection",
    status: "accepted",
    scope: "builder",
    title: "Connect Google Ads",
    summary: "Adds the Google Ads connector requirement.",
    rationale: "The agent needs campaign data access.",
    targetId: "google-ads",
  },
];

describe("buildReviewAgentSnapshot", () => {
  test("keeps persisted tool and trigger metadata on the review test snapshot", () => {
    const snapshot = buildReviewAgentSnapshot({
      name: "Google Ads Optimizer",
      rules: ["Always explain missing prerequisites"],
      skills: ["Google Ads Audit"],
      runtimeInputs: [],
      triggers: [
        {
          id: "cron-schedule",
          icon: "calendar",
          text: "Weekday Optimization Run",
          kind: "schedule",
          status: "supported",
        },
      ],
      improvements,
      accessTeams: [],
      skillGraph,
      workflow,
      persistedToolConnections: toolConnections,
      persistedTriggers: triggers,
    });

    expect(snapshot.toolConnections).toEqual(toolConnections);
    expect(snapshot.triggers).toEqual(triggers);
    expect(snapshot.improvements).toEqual(improvements);
    expect(snapshot.triggerLabel).toBe("Weekday Optimization Run");
  });

  test("reuses persisted trigger metadata when the review draft only keeps the title", () => {
    const snapshot = buildReviewAgentSnapshot({
      name: "Google Ads Optimizer",
      rules: ["Always explain missing prerequisites"],
      skills: ["Google Ads Audit"],
      runtimeInputs: [],
      triggers: [
        {
          icon: "calendar",
          text: "Weekday Optimization Run",
        },
      ],
      improvements,
      skillGraph,
      workflow,
      persistedToolConnections: toolConnections,
      persistedTriggers: triggers,
    });

    expect(snapshot.triggers).toEqual(triggers);
    expect(snapshot.triggerLabel).toBe("Weekday Optimization Run");
  });
});
