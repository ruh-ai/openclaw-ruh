import { beforeEach, describe, expect, test } from "bun:test";

import type { SavedAgent } from "@/hooks/use-agents-store";
import {
  buildResumedBuilderState,
  buildResumedCoPilotSeed,
  clearCreateSessionCache,
  loadCreateSessionFromCache,
  saveCreateSessionToCache,
  resolveRouteAgentForRestore,
  shouldReconcileToPersistedForgeStage,
  shouldSuppressRevealTriggerForResume,
  shouldWaitForRouteAgentBeforeCacheRestore,
} from "./create-session-cache";

const storage = new Map<string, string>();
if (typeof globalThis.window === "undefined") {
  (globalThis as typeof globalThis & { window: typeof globalThis }).window = globalThis;
}
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
  writable: true,
});

const agent: SavedAgent = {
  id: "agent-1",
  name: "Inventory Alert Bot",
  avatar: "🤖",
  description: "Watches Shopify inventory and sends Slack alerts.",
  skills: ["Inventory Monitor"],
  triggerLabel: "Hourly",
  status: "forging",
  createdAt: "2026-03-30T00:00:00.000Z",
  sandboxIds: ["sb-1"],
  forgeSandboxId: "forge-sb-1",
  skillGraph: [
    {
      skill_id: "inventory-monitor",
      name: "Inventory Monitor",
      description: "Checks stock levels",
    },
  ],
  workflow: {
    name: "inventory-alerts",
    description: "Monitor inventory and notify Slack",
    steps: [{ id: "step-1", action: "execute", skill: "inventory-monitor", wait_for: [] }],
  },
  agentRules: ["Alert when stock falls below threshold"],
  runtimeInputs: [
    {
      key: "SHOPIFY_STORE_DOMAIN",
      label: "Store domain",
      description: "Shopify store domain.",
      required: true,
      source: "architect_requirement",
    },
  ],
  toolConnections: [
    {
      toolId: "shopify",
      name: "Shopify",
      description: "Access products and inventory",
      status: "configured",
      authKind: "api_key",
      connectorType: "mcp",
    },
  ],
  triggers: [
    {
      id: "hourly-cron",
      title: "Hourly",
      kind: "schedule",
      status: "supported",
      description: "Runs every hour.",
      schedule: "0 * * * *",
    },
  ],
  improvements: [
    {
      id: "connect-slack",
      kind: "tool_connection",
      status: "pending",
      scope: "builder",
      title: "Connect Slack",
      summary: "Attach a Slack workspace before deploy.",
      rationale: "Alerts need a destination.",
      targetId: "slack",
    },
  ],
  channels: [
    {
      kind: "slack",
      status: "planned",
      label: "Slack",
      description: "Post alerts to Slack",
    },
  ],
  discoveryDocuments: {
    prd: {
      title: "PRD",
      sections: [{ heading: "Goal", content: "Alert on low inventory" }],
    },
    trd: {
      title: "TRD",
      sections: [{ heading: "Integrations", content: "Shopify + Slack" }],
    },
  },
};

describe("create-session-cache", () => {
  beforeEach(() => {
    storage.clear();
  });

  test("save and load round-trips full builder/copilot resume snapshots", () => {
    saveCreateSessionToCache("agent-1", {
      coPilot: {
        sessionId: "copilot-session-1",
        phase: "review",
        name: "Inventory Alert Bot",
        description: "Tracks inventory",
        discoveryQuestions: null,
        discoveryAnswers: {},
        discoveryDocuments: agent.discoveryDocuments ?? null,
        discoveryStatus: "ready",
        skillGraph: agent.skillGraph ?? null,
        selectedSkillIds: ["inventory-monitor"],
        workflow: agent.workflow ?? null,
        skillGenerationStatus: "ready",
        skillGenerationError: null,
        skillAvailability: [],
        builtSkillIds: ["inventory-monitor"],
        connectedTools: agent.toolConnections ?? [],
        credentialDrafts: {},
        runtimeInputs: agent.runtimeInputs ?? [],
        triggers: agent.triggers ?? [],
        channels: agent.channels ?? [],
        agentRules: agent.agentRules ?? [],
        improvements: agent.improvements ?? [],
        systemName: "inventory-alert-bot",
        devStage: "build",
        thinkStatus: "approved",
        architecturePlan: null,
        planStatus: "approved",
        buildStatus: "building",
        evalTasks: [],
        evalStatus: "idle",
        deployStatus: "idle",
        buildReport: null,
      },
      builder: {
        sessionId: "builder-session-1",
        name: "Inventory Alert Bot",
        description: "Tracks inventory",
        skillGraph: agent.skillGraph ?? null,
        workflow: agent.workflow ?? null,
        systemName: "inventory-alert-bot",
        agentRules: agent.agentRules ?? [],
        toolConnectionHints: ["shopify", "slack"],
        toolConnections: agent.toolConnections ?? [],
        triggerHints: ["hourly-cron"],
        triggers: agent.triggers ?? [],
        channelHints: ["slack"],
        improvements: agent.improvements ?? [],
        draftAgentId: "agent-1",
        draftSaveStatus: "saved",
        lastSavedAt: "2026-03-30T11:00:00.000Z",
        lastSavedHash: "{\"name\":\"Inventory Alert Bot\"}",
        forgeSandboxId: "forge-sb-1",
        forgeSandboxStatus: "ready",
        forgeVncPort: 6081,
        forgeError: null,
      },
    });

    expect(loadCreateSessionFromCache("agent-1")).toEqual(
      expect.objectContaining({
        coPilot: expect.objectContaining({
          devStage: "build",
          buildStatus: "failed",
          selectedSkillIds: ["inventory-monitor"],
        }),
        builder: expect.objectContaining({
          draftAgentId: "agent-1",
          forgeSandboxId: "forge-sb-1",
          toolConnectionHints: ["shopify", "slack"],
        }),
      }),
    );
  });

  test("loadCreateSessionFromCache sanitizes stale think trigger when restored stage is not think", () => {
    storage.set("openclaw-create-session-agent-1", JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      coPilot: {
        devStage: "plan",
        thinkStatus: "generating",
        userTriggeredThink: true,
        thinkRunId: "think-run-1",
        lastDispatchedThinkRunId: null,
      },
      builder: {},
    }));

    const loaded = loadCreateSessionFromCache("agent-1");

    expect(loaded).toEqual(
      expect.objectContaining({
        coPilot: expect.objectContaining({
          userTriggeredThink: false,
          thinkRunId: null,
        }),
      }),
    );
  });

  test("loadCreateSessionFromCache sanitizes stale plan trigger when restored stage is not plan", () => {
    storage.set("openclaw-create-session-agent-1", JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      coPilot: {
        devStage: "think",
        planStatus: "generating",
        userTriggeredPlan: true,
        planRunId: "plan-run-1",
        lastDispatchedPlanRunId: null,
      },
      builder: {},
    }));

    const loaded = loadCreateSessionFromCache("agent-1");

    expect(loaded).toEqual(
      expect.objectContaining({
        coPilot: expect.objectContaining({
          userTriggeredPlan: false,
          planRunId: null,
        }),
      }),
    );
  });

  test("clear removes the cached session", () => {
    saveCreateSessionToCache("agent-1", {
      coPilot: {
        sessionId: "copilot-session-1",
        phase: "purpose",
        name: "",
        description: "",
        discoveryQuestions: null,
        discoveryAnswers: {},
        discoveryDocuments: null,
        discoveryStatus: "idle",
        skillGraph: null,
        selectedSkillIds: [],
        workflow: null,
        skillGenerationStatus: "idle",
        skillGenerationError: null,
        skillAvailability: [],
        builtSkillIds: [],
        connectedTools: [],
        credentialDrafts: {},
        runtimeInputs: [],
        triggers: [],
        channels: [],
        agentRules: [],
        improvements: [],
        systemName: null,
        devStage: "think",
        thinkStatus: "idle",
        architecturePlan: null,
        planStatus: "idle",
        buildStatus: "idle",
        evalTasks: [],
        evalStatus: "idle",
        deployStatus: "idle",
        buildReport: null,
      },
      builder: {
        sessionId: "builder-session-1",
        name: "",
        description: "",
        skillGraph: null,
        workflow: null,
        systemName: null,
        agentRules: [],
        toolConnectionHints: [],
        toolConnections: [],
        triggerHints: [],
        triggers: [],
        channelHints: [],
        improvements: [],
        draftAgentId: "agent-1",
        draftSaveStatus: "idle",
        lastSavedAt: null,
        lastSavedHash: null,
        forgeSandboxId: null,
        forgeSandboxStatus: "idle",
        forgeVncPort: null,
        forgeError: null,
      },
    });

    clearCreateSessionCache("agent-1");
    expect(loadCreateSessionFromCache("agent-1")).toBeNull();
  });

  test("expired entries are ignored", () => {
    storage.set("openclaw-create-session-agent-1", JSON.stringify({
      version: 1,
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      coPilot: {},
      builder: {},
    }));

    expect(loadCreateSessionFromCache("agent-1")).toBeNull();
  });

  test("waits for route agent data before applying cache-only restore", () => {
    expect(shouldWaitForRouteAgentBeforeCacheRestore({
      editingAgentId: "agent-1",
      hasAgentRecord: false,
      isRouteAgentHydrated: false,
    })).toBe(true);

    expect(shouldWaitForRouteAgentBeforeCacheRestore({
      editingAgentId: "agent-1",
      hasAgentRecord: true,
      isRouteAgentHydrated: false,
    })).toBe(false);

    expect(shouldWaitForRouteAgentBeforeCacheRestore({
      editingAgentId: null,
      hasAgentRecord: false,
      isRouteAgentHydrated: false,
    })).toBe(false);
  });

  test("reconciles forward when backend forge stage is ahead of restored UI stage", () => {
    expect(shouldReconcileToPersistedForgeStage({
      currentStage: "reveal",
      persistedStage: "test",
    })).toBe(true);

    expect(shouldReconcileToPersistedForgeStage({
      currentStage: "test",
      persistedStage: "reveal",
    })).toBe(false);

    expect(shouldReconcileToPersistedForgeStage({
      currentStage: "test",
      persistedStage: null,
    })).toBe(false);
  });

  test("suppresses reveal trigger until resume is restored or backend stage is reconciled", () => {
    expect(shouldSuppressRevealTriggerForResume({
      hasRestoredSession: false,
      currentStage: "reveal",
      persistedStage: null,
    })).toBe(true);

    expect(shouldSuppressRevealTriggerForResume({
      hasRestoredSession: true,
      currentStage: "reveal",
      persistedStage: "test",
    })).toBe(true);

    expect(shouldSuppressRevealTriggerForResume({
      hasRestoredSession: true,
      currentStage: "reveal",
      persistedStage: "reveal",
    })).toBe(false);
  });

  test("prefers freshly fetched route agent over stale persisted store agent", () => {
    const staleAgent = { ...agent, forgeStage: null };
    const freshAgent = { ...agent, forgeStage: "test" };

    expect(resolveRouteAgentForRestore({
      editingAgentId: "agent-1",
      storeAgent: staleAgent,
      routeFetchedAgent: freshAgent,
    })?.forgeStage).toBe("test");

    expect(resolveRouteAgentForRestore({
      editingAgentId: "agent-1",
      storeAgent: staleAgent,
      routeFetchedAgent: { ...freshAgent, id: "agent-2" },
    })?.forgeStage).toBeNull();
  });

  test("buildResumedCoPilotSeed layers cached progress over persisted agent data", () => {
    const resumed = buildResumedCoPilotSeed(agent, {
      devStage: "build",
      buildStatus: "building",
      selectedSkillIds: [],
      channels: [],
    });

    expect(resumed).toEqual(expect.objectContaining({
      name: "Inventory Alert Bot",
      buildStatus: "failed",
      selectedSkillIds: [],
      channels: [],
      runtimeInputs: agent.runtimeInputs,
    }));
  });

  test("buildResumedCoPilotSeed does not let empty cached skill selection block deploy after review", () => {
    const resumed = buildResumedCoPilotSeed(
      {
        ...agent,
        forgeStage: "ship",
      },
      {
        devStage: "ship",
        selectedSkillIds: [],
      },
    );

    expect(resumed.selectedSkillIds).toEqual(["inventory-monitor"]);
  });

  test("buildResumedCoPilotSeed does not let empty cached skill graph block deploy after review", () => {
    const resumed = buildResumedCoPilotSeed(
      {
        ...agent,
        forgeStage: "ship",
      },
      {
        devStage: "ship",
        skillGraph: null,
        selectedSkillIds: [],
      },
    );

    expect(resumed.skillGraph).toEqual(agent.skillGraph);
    expect(resumed.selectedSkillIds).toEqual(["inventory-monitor"]);
  });

  test("buildResumedCoPilotSeed prefers the backend forge sandbox over stale cached agentSandboxId", () => {
    const resumed = buildResumedCoPilotSeed(agent, {
      agentSandboxId: "previous-forge-sandbox",
      devStage: "think",
      thinkStatus: "ready",
    });

    expect(resumed.agentSandboxId).toBe("forge-sb-1");
  });

  test("buildResumedCoPilotSeed does not let stale cached reveal regress a backend test stage", () => {
    const resumed = buildResumedCoPilotSeed(
      {
        ...agent,
        forgeStage: "test",
      },
      {
        devStage: "reveal",
        thinkStatus: "idle",
        planStatus: "idle",
        buildStatus: "idle",
      },
    );

    expect(resumed.devStage).toBe("test");
    expect(resumed.thinkStatus).toBe("approved");
    expect(resumed.planStatus).toBe("approved");
    expect(resumed.buildStatus).toBe("done");
  });

  test("buildResumedCoPilotSeed does not let stale cached plan outrun missing discovery docs", () => {
    const resumed = buildResumedCoPilotSeed(
      {
        ...agent,
        forgeStage: "plan",
        discoveryDocuments: null,
        skillGraph: [],
        skills: [],
        workflow: null,
      },
      {
        devStage: "plan",
        maxUnlockedDevStage: "plan",
        thinkStatus: "approved",
        planStatus: "failed",
        userTriggeredPlan: true,
        planRunId: "plan-run-1",
      },
    );

    expect(resumed.devStage).toBe("think");
    expect(resumed.maxUnlockedDevStage).toBe("think");
    expect(resumed.planStatus).toBe("idle");
    expect(resumed.userTriggeredPlan).toBe(false);
    expect(resumed.planRunId).toBeNull();
  });

  test("buildResumedCoPilotSeed clears stale think trigger when status is not generating", () => {
    const resumed = buildResumedCoPilotSeed(agent, {
      userTriggeredThink: true,
      thinkStatus: "ready",
      thinkRunId: "think-run-1",
      lastDispatchedThinkRunId: null,
    });

    expect(resumed.userTriggeredThink).toBe(false);
    expect(resumed.thinkRunId).toBeNull();
    expect(resumed.thinkStatus).toBe("ready");
  });

  test("buildResumedCoPilotSeed converts stale generating think to failed on restore", () => {
    const resumed = buildResumedCoPilotSeed(agent, {
      devStage: "think",
      thinkStatus: "generating",
      userTriggeredThink: true,
      thinkRunId: "think-run-1",
      lastDispatchedThinkRunId: null,
    });

    // Stale "generating" → "failed" on restore since the connection is gone
    expect(resumed.userTriggeredThink).toBe(false);
    expect(resumed.thinkRunId).toBeNull();
    expect(resumed.thinkStatus).toBe("failed");
  });

  test("buildResumedCoPilotSeed clears stale think trigger when stage is not think", () => {
    const resumed = buildResumedCoPilotSeed(agent, {
      devStage: "plan",
      thinkStatus: "generating",
      userTriggeredThink: true,
      thinkRunId: "think-run-1",
      lastDispatchedThinkRunId: null,
    });

    expect(resumed.userTriggeredThink).toBe(false);
    expect(resumed.thinkRunId).toBeNull();
  });

  test("buildResumedCoPilotSeed converts stale generating plan to failed on restore", () => {
    const resumed = buildResumedCoPilotSeed(agent, {
      userTriggeredPlan: true,
      thinkStatus: "ready",
      planStatus: "generating",
      planRunId: "plan-run-1",
      lastDispatchedPlanRunId: "plan-run-1",
    });

    expect(resumed.userTriggeredPlan).toBe(false);
    expect(resumed.planRunId).toBeNull();
    expect(resumed.planStatus).toBe("failed");
  });

  test("buildResumedCoPilotSeed converts undispatched generating plan to failed on restore", () => {
    const resumed = buildResumedCoPilotSeed(agent, {
      devStage: "plan",
      thinkStatus: "ready",
      planStatus: "generating",
      userTriggeredPlan: true,
      planRunId: "plan-run-1",
      lastDispatchedPlanRunId: null,
    });

    // Even undispatched generating is stale on restore — connection is gone
    expect(resumed.userTriggeredPlan).toBe(false);
    expect(resumed.planRunId).toBeNull();
    expect(resumed.planStatus).toBe("failed");
  });

  test("buildResumedCoPilotSeed clears stale plan trigger when stage is not plan", () => {
    const resumed = buildResumedCoPilotSeed(agent, {
      devStage: "think",
      thinkStatus: "ready",
      planStatus: "generating",
      userTriggeredPlan: true,
      planRunId: "plan-run-1",
      lastDispatchedPlanRunId: null,
    });

    expect(resumed.userTriggeredPlan).toBe(false);
    expect(resumed.planRunId).toBeNull();
    expect(resumed.planStatus).toBe("failed");
  });

  test("buildResumedBuilderState prefers the persisted forge sandbox while restoring cached work", () => {
    const resumed = buildResumedBuilderState(
      "agent-1",
      agent,
      {
        sessionId: "builder-session-2",
        name: "Cached Name",
        description: "Cached description",
        skillGraph: agent.skillGraph ?? null,
        workflow: agent.workflow ?? null,
        systemName: "cached-name",
        agentRules: ["Cached rule"],
        toolConnectionHints: ["shopify"],
        toolConnections: [],
        triggerHints: ["hourly-cron"],
        triggers: [],
        channelHints: ["slack"],
        improvements: [],
        draftAgentId: "agent-1",
        draftSaveStatus: "saved",
        lastSavedAt: "2026-03-30T11:00:00.000Z",
        lastSavedHash: "{\"name\":\"Cached Name\"}",
        forgeSandboxId: "stale-forge-id",
        forgeSandboxStatus: "failed",
        forgeVncPort: 6081,
        forgeError: "old error",
      },
      {
        name: "Cached Name",
        description: "Cached description",
        skillGraph: agent.skillGraph ?? null,
        workflow: agent.workflow ?? null,
        agentRules: ["Cached rule"],
        connectedTools: [],
        triggers: [],
        improvements: [],
      } as Partial<any>,
    );

    expect(resumed).toEqual(expect.objectContaining({
      sessionId: "builder-session-2",
      name: "Cached Name",
      draftAgentId: "agent-1",
      forgeSandboxId: "forge-sb-1",
      forgeSandboxStatus: "ready",
    }));
  });
});
