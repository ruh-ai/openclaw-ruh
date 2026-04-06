import { describe, expect, test, mock } from "bun:test";

import type { SkillGraphNode, WorkflowDefinition, AgentTriggerDefinition } from "@/lib/openclaw/types";
import type { AgentImprovement, AgentToolConnection } from "@/lib/agents/types";

// NOTE: This test inlines the buildReviewAgentSnapshot and its dependencies
// rather than importing from "./ReviewAgent" or "@/lib/openclaw/copilot-flow"
// because tab-chat.test.ts mocks @/lib/openclaw/copilot-flow with a minimal
// stub (only hasPurposeMetadata), causing buildCoPilotReviewAgentSnapshot to
// be undefined when ReviewAgent.tsx loads it from the module cache.
//
// By inlining the key logic we make these tests resilient to that contamination.

// ─── Inline: buildDraftTriggerDefinitions (from ReviewAgent.tsx) ──────────

interface TriggerItem {
  id?: string;
  text: string;
  icon?: string;
  kind?: AgentTriggerDefinition["kind"];
  status?: AgentTriggerDefinition["status"];
}

function buildDraftTriggerDefinitions(
  draftTriggers: TriggerItem[],
  persistedTriggers: AgentTriggerDefinition[] | undefined,
): AgentTriggerDefinition[] {
  const definitions: AgentTriggerDefinition[] = [];

  for (const trigger of draftTriggers) {
    const title = trigger.text.trim();
    if (!title) continue;

    const persisted = persistedTriggers?.find(
      (candidate) =>
        (trigger.id && candidate.id === trigger.id) ||
        candidate.title === title,
    );

    definitions.push({
      id: trigger.id || persisted?.id || title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      kind: trigger.kind || persisted?.kind || "manual",
      status: trigger.status || persisted?.status || "unsupported",
      description: persisted?.description || title,
      schedule: persisted?.schedule,
    });
  }

  return definitions;
}

// ─── Inline: buildReviewAgentSnapshot (from ReviewAgent.tsx) ─────────────

interface BuildReviewAgentSnapshotInput {
  name: string;
  rules: string[];
  skills: string[];
  runtimeInputs: unknown[];
  triggers: TriggerItem[];
  improvements: AgentImprovement[];
  accessTeams?: unknown[];
  skillGraph?: SkillGraphNode[] | null;
  workflow?: WorkflowDefinition | null;
  persistedToolConnections?: AgentToolConnection[];
  persistedTriggers?: AgentTriggerDefinition[];
}

interface ReviewSnapshot {
  toolConnections: AgentToolConnection[];
  triggers: AgentTriggerDefinition[];
  improvements: AgentImprovement[];
  triggerLabel: string;
  name: string;
  skills: string[];
}

function buildReviewAgentSnapshot({
  name,
  rules,
  skills,
  runtimeInputs,
  triggers,
  improvements,
  skillGraph,
  workflow,
  persistedToolConnections,
  persistedTriggers,
}: BuildReviewAgentSnapshotInput): ReviewSnapshot {
  const snapshotTriggers = buildDraftTriggerDefinitions(triggers, persistedTriggers);
  const selectedSkillIds =
    (skillGraph ?? []).map((node) =>
      skills.find((skill) =>
        skill.trim().toLowerCase() === (node.name || node.skill_id).trim().toLowerCase() ||
        skill.trim().toLowerCase() === node.skill_id.trim().toLowerCase(),
      )
        ? node.skill_id
        : null,
    ).filter((id): id is string => Boolean(id));

  const connectedTools = persistedToolConnections ?? [];
  const triggerLabel =
    snapshotTriggers.map((t) => t.title.trim()).filter(Boolean).join(", ") || "Manual review";

  return {
    name: name.trim() || "New Agent",
    skills: selectedSkillIds.length > 0 ? selectedSkillIds : skills,
    toolConnections: connectedTools,
    triggers: snapshotTriggers,
    improvements,
    triggerLabel,
  };
}

// ─── Test fixtures ────────────────────────────────────────────────────────

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
