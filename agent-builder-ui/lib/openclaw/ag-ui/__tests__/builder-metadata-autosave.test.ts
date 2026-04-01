import { describe, expect, mock, test } from "bun:test";

import type { SavedAgent } from "@/hooks/use-agents-store";
import {
  CustomEventName,
  createInitialBuilderMetadataState,
} from "../types";
import {
  buildNormalizedDraftPayload,
  createBuilderMetadataAutosaveController,
  createSeededBuilderMetadataState,
  reduceBuilderMetadataEvent,
} from "../builder-metadata-autosave";

const existingAgent: SavedAgent = {
  id: "agent-1",
  name: "Existing Agent",
  avatar: "🤖",
  description: "Existing description",
  skills: ["Existing Skill"],
  triggerLabel: "Manual trigger",
  status: "active",
  createdAt: "2026-03-26T00:00:00.000Z",
  sandboxIds: [],
  skillGraph: [
    {
      skill_id: "existing-skill",
      name: "Existing Skill",
      description: "Existing skill graph",
    },
  ],
  workflow: {
    name: "existing-workflow",
    description: "Existing workflow",
    steps: [
      { id: "step-0", action: "execute", skill: "existing-skill", wait_for: [] },
    ],
  },
  agentRules: ["Keep existing tone"],
  toolConnections: [
    {
      toolId: "google-ads",
      name: "Google Ads",
      description: "Manage campaigns",
      status: "configured",
      authKind: "oauth",
      connectorType: "mcp",
      configSummary: ["Connected account: Acme Ads"],
    },
  ],
  triggers: [
    {
      id: "cron-schedule",
      title: "Cron Schedule",
      kind: "schedule",
      status: "supported",
      description: "Runs every weekday at 9 AM.",
      schedule: "0 9 * * 1-5",
    },
  ],
};

function createManualScheduler() {
  let nextId = 1;
  const pending = new Map<number, () => void>();

  return {
    schedule: mock((run: () => void) => {
      const id = nextId++;
      pending.set(id, run);
      return id;
    }),
    clear: mock((handle: number) => {
      pending.delete(handle);
    }),
    flush: async (handle?: number) => {
      if (handle != null) {
        const run = pending.get(handle);
        pending.delete(handle);
        await run?.();
        return;
      }

      const ids = [...pending.keys()];
      for (const id of ids) {
        const run = pending.get(id);
        pending.delete(id);
        await run?.();
      }
    },
  };
}

describe("builder metadata autosave helpers", () => {
  test("reduces AG-UI builder custom events into canonical metadata", () => {
    let metadata = createInitialBuilderMetadataState();

    metadata = reduceBuilderMetadataEvent(metadata, CustomEventName.SKILL_GRAPH_READY, {
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance",
        },
      ],
      workflow: {
        name: "main-workflow",
        description: "Audit workflow",
        steps: [
          { id: "step-0", action: "execute", skill: "google-ads-audit", wait_for: [] },
        ],
      },
        systemName: "google-ads-optimizer",
        agentRules: ["Keep recommendations concise"],
        toolConnectionHints: ["google-ads"],
        toolConnections: [],
        triggerHints: ["cron-schedule"],
        triggers: [],
      });

    metadata = reduceBuilderMetadataEvent(metadata, CustomEventName.WIZARD_UPDATE_FIELDS, {
      name: "Google Ads Optimizer",
      description: "Optimizes paid media accounts",
      systemName: "google-ads-optimizer",
    });

    metadata = reduceBuilderMetadataEvent(metadata, CustomEventName.WIZARD_SET_RULES, {
      rules: ["Keep recommendations concise", "Call out wasted spend first"],
    });

    metadata = reduceBuilderMetadataEvent(metadata, CustomEventName.WIZARD_CONNECT_TOOLS, {
      toolIds: ["google-ads", "google-sheets"],
    });

    metadata = reduceBuilderMetadataEvent(metadata, CustomEventName.WIZARD_SET_TRIGGERS, {
      triggerIds: ["cron-schedule", "webhook-post"],
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        name: "Google Ads Optimizer",
        description: "Optimizes paid media accounts",
        systemName: "google-ads-optimizer",
        skillGraph: [
          expect.objectContaining({ skill_id: "google-ads-audit" }),
        ],
        agentRules: ["Keep recommendations concise", "Call out wasted spend first"],
        toolConnectionHints: ["google-ads", "google-sheets"],
        triggerHints: ["cron-schedule", "webhook-post"],
        improvements: [
          expect.objectContaining({
            id: "connect-google-ads",
            targetId: "google-ads",
          }),
        ],
      }),
    );
  });

  test("creates a new backend draft when builder metadata crosses the save threshold", async () => {
    const scheduler = createManualScheduler();
    const saveAgentDraft = mock(async (draft) => ({
      ...existingAgent,
      id: "agent-draft",
      name: draft.name,
      description: draft.description,
      skillGraph: draft.skillGraph ?? undefined,
      workflow: draft.workflow ?? undefined,
      agentRules: draft.agentRules ?? [],
      toolConnections: draft.toolConnections ?? [],
      triggers: draft.triggers ?? [],
    }));
    const patches: Array<Partial<ReturnType<typeof createInitialBuilderMetadataState>>> = [];

    const controller = createBuilderMetadataAutosaveController({
      agent: null,
      saveAgentDraft,
      scheduler,
      now: () => "2026-03-26T14:30:00.000Z",
      onMetadataPatch: (patch) => patches.push(patch),
    });

    const metadata = reduceBuilderMetadataEvent(
      createInitialBuilderMetadataState(),
      CustomEventName.WIZARD_UPDATE_FIELDS,
      {
        name: "Google Ads Optimizer",
        description: "Optimizes paid media accounts",
        systemName: "google-ads-optimizer",
      },
    );

    controller.schedule(metadata);
    expect(saveAgentDraft).not.toHaveBeenCalled();

    await scheduler.flush();

    expect(saveAgentDraft).toHaveBeenCalledTimes(1);
    expect(saveAgentDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Google Ads Optimizer",
        description: "Optimizes paid media accounts",
      }),
    );
    expect(patches.at(-1)).toEqual(
      expect.objectContaining({
        draftAgentId: "agent-draft",
        draftSaveStatus: "saved",
        lastSavedAt: "2026-03-26T14:30:00.000Z",
      }),
    );
  });

  test("debounces repeated builder metadata changes into one save", async () => {
    const scheduler = createManualScheduler();
    const saveAgentDraft = mock(async (draft) => ({
      ...existingAgent,
      id: "agent-draft",
      name: draft.name,
      description: draft.description,
    }));

    const controller = createBuilderMetadataAutosaveController({
      agent: null,
      saveAgentDraft,
      scheduler,
      now: () => "2026-03-26T14:35:00.000Z",
      onMetadataPatch: () => {},
    });

    controller.schedule({
      ...createInitialBuilderMetadataState(),
      name: "Draft 1",
    });
    controller.schedule({
      ...createInitialBuilderMetadataState(),
      name: "Draft 2",
    });

    expect(scheduler.clear).toHaveBeenCalledTimes(1);

    await scheduler.flush();

    expect(saveAgentDraft).toHaveBeenCalledTimes(1);
    expect(saveAgentDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Draft 2",
      }),
    );
  });

  test("does not autosave unchanged normalized payloads", async () => {
    const scheduler = createManualScheduler();
    const saveAgentDraft = mock(async (draft) => ({
      ...existingAgent,
      id: "agent-draft",
      name: draft.name,
      description: draft.description,
      skillGraph: draft.skillGraph ?? undefined,
      workflow: draft.workflow ?? undefined,
      agentRules: draft.agentRules ?? [],
    }));

    const metadata = {
      ...createInitialBuilderMetadataState(),
      name: "Google Ads Optimizer",
      description: "Optimizes paid media accounts",
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance",
        },
      ],
    };

    const controller = createBuilderMetadataAutosaveController({
      agent: null,
      saveAgentDraft,
      scheduler,
      now: () => "2026-03-26T14:40:00.000Z",
      onMetadataPatch: () => {},
    });

    controller.schedule(metadata);
    await scheduler.flush();

    controller.schedule({
      ...metadata,
      draftAgentId: "agent-draft",
      draftSaveStatus: "saved",
      lastSavedAt: "2026-03-26T14:40:00.000Z",
      lastSavedHash: buildNormalizedDraftPayload(metadata, null)?.hash ?? null,
    });
    await scheduler.flush();

    expect(saveAgentDraft).toHaveBeenCalledTimes(1);
  });

  test("projects accepted tool improvements into draft tool connections", () => {
    const normalized = buildNormalizedDraftPayload(
      {
        ...createInitialBuilderMetadataState(),
        name: "Google Ads Optimizer",
        improvements: [
          {
            id: "connect-google-ads",
            kind: "tool_connection",
            status: "accepted",
            scope: "builder",
            title: "Connect Google Ads before deploy",
            summary: "Attach the Google Ads connector so the agent can read live account data.",
            rationale: "The generated Google Ads skills depend on Google Ads account access that is not configured yet.",
            targetId: "google-ads",
          },
        ],
      },
      null,
    );

    expect(normalized?.payload.toolConnections).toEqual([
      expect.objectContaining({
        toolId: "google-ads",
        status: "missing_secret",
      }),
    ]);
  });

  test("updates an existing agent draft instead of creating a new one in improve mode", async () => {
    const scheduler = createManualScheduler();
    const saveAgentDraft = mock(async (draft) => ({
      ...existingAgent,
      id: draft.agentId ?? existingAgent.id,
      name: draft.name,
      description: draft.description,
    }));
    const patches: Array<Partial<ReturnType<typeof createInitialBuilderMetadataState>>> = [];

    const seeded = createSeededBuilderMetadataState(existingAgent, {
      sessionId: "session-1",
      name: existingAgent.name,
      description: existingAgent.description,
      skillGraph: existingAgent.skillGraph ?? null,
      workflow: existingAgent.workflow ?? null,
      systemName: existingAgent.name,
      agentRules: existingAgent.agentRules ?? [],
      toolConnectionHints: [],
      triggerHints: [],
      draftAgentId: existingAgent.id,
      draftSaveStatus: "idle",
      lastSavedAt: null,
      lastSavedHash: null,
    });

    const controller = createBuilderMetadataAutosaveController({
      agent: existingAgent,
      saveAgentDraft,
      scheduler,
      now: () => "2026-03-26T14:45:00.000Z",
      onMetadataPatch: (patch) => patches.push(patch),
    });

    controller.schedule({
      ...seeded,
      description: "Refined description",
    });

    await scheduler.flush();

    expect(saveAgentDraft).toHaveBeenCalledTimes(1);
    expect(saveAgentDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        name: "Existing Agent",
        description: "Refined description",
      }),
    );
    expect(patches.at(-1)).toEqual(
      expect.objectContaining({
        draftAgentId: "agent-1",
        draftSaveStatus: "saved",
      }),
    );
  });

  test("preserves channel hints when seeded from existing builder state", () => {
    const seeded = createSeededBuilderMetadataState(existingAgent, {
      sessionId: "session-1",
      name: existingAgent.name,
      description: existingAgent.description,
      skillGraph: existingAgent.skillGraph ?? null,
      workflow: existingAgent.workflow ?? null,
      systemName: existingAgent.name,
      agentRules: existingAgent.agentRules ?? [],
      toolConnectionHints: ["google-ads"],
      triggerHints: ["cron-schedule"],
      channelHints: ["telegram", "discord"],
      draftAgentId: existingAgent.id,
      draftSaveStatus: "saved",
      lastSavedAt: "2026-03-26T14:45:00.000Z",
      lastSavedHash: "hash-1",
    });

    expect(seeded.channelHints).toEqual(["telegram", "discord"]);
    expect(seeded.toolConnectionHints).toEqual(["google-ads"]);
    expect(seeded.triggerHints).toEqual(["cron-schedule"]);
  });

  test("ignores stale save completions from older requests", async () => {
    const scheduler = createManualScheduler();
    let resolveFirst: ((agent: SavedAgent) => void) | null = null;
    let resolveSecond: ((agent: SavedAgent) => void) | null = null;
    const patches: Array<Partial<ReturnType<typeof createInitialBuilderMetadataState>>> = [];

    const saveAgentDraft = mock((draft) => new Promise<SavedAgent>((resolve) => {
      if (draft.description === "first") {
        resolveFirst = resolve;
        return;
      }
      resolveSecond = resolve;
    }));

    const controller = createBuilderMetadataAutosaveController({
      agent: null,
      saveAgentDraft,
      scheduler,
      now: () => "2026-03-26T14:50:00.000Z",
      onMetadataPatch: (patch) => patches.push(patch),
    });

    controller.schedule({
      ...createInitialBuilderMetadataState(),
      name: "Google Ads Optimizer",
      description: "first",
    });
    await scheduler.flush();

    controller.schedule({
      ...createInitialBuilderMetadataState(),
      name: "Google Ads Optimizer",
      description: "second",
    });
    await scheduler.flush();

    resolveFirst?.({
      ...existingAgent,
      id: "agent-first",
      name: "Google Ads Optimizer",
      description: "first",
    });
    await Promise.resolve();

    resolveSecond?.({
      ...existingAgent,
      id: "agent-second",
      name: "Google Ads Optimizer",
      description: "second",
    });
    await Promise.resolve();

    expect(patches.some((patch) => patch.draftAgentId === "agent-first")).toBe(false);
    expect(patches.at(-1)).toEqual(
      expect.objectContaining({
        draftAgentId: "agent-second",
        draftSaveStatus: "saved",
      }),
    );
  });

  test("allows retrying the same draft after a save failure", async () => {
    const scheduler = createManualScheduler();
    const patches: Array<Partial<ReturnType<typeof createInitialBuilderMetadataState>>> = [];
    let attempts = 0;

    const saveAgentDraft = mock(async (draft) => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("temporary save failure");
      }

      return {
        ...existingAgent,
        id: "agent-retry",
        name: draft.name,
        description: draft.description,
      };
    });

    const controller = createBuilderMetadataAutosaveController({
      agent: null,
      saveAgentDraft,
      scheduler,
      now: () => "2026-03-26T15:20:00.000Z",
      onMetadataPatch: (patch) => patches.push(patch),
    });

    const metadata = {
      ...createInitialBuilderMetadataState(),
      name: "Google Ads Optimizer",
      description: "Optimizes paid media accounts",
    };

    controller.schedule(metadata);
    await scheduler.flush();
    await Promise.resolve();

    expect(saveAgentDraft).toHaveBeenCalledTimes(1);
    expect(patches).toContainEqual(
      expect.objectContaining({
        draftSaveStatus: "error",
      }),
    );

    controller.schedule(metadata);
    await scheduler.flush();
    await Promise.resolve();

    expect(saveAgentDraft).toHaveBeenCalledTimes(2);
    expect(patches.at(-1)).toEqual(
      expect.objectContaining({
        draftAgentId: "agent-retry",
        draftSaveStatus: "saved",
        lastSavedAt: "2026-03-26T15:20:00.000Z",
      }),
    );
  });

  test("derives a Google Ads connector improvement from structured builder metadata", () => {
    const metadata = reduceBuilderMetadataEvent(
      createInitialBuilderMetadataState(),
      CustomEventName.SKILL_GRAPH_READY,
      {
        skillGraph: [
          {
            skill_id: "google-ads-audit",
            name: "Google Ads Audit",
            description: "Inspect campaign performance",
          },
        ],
        workflow: {
          name: "main-workflow",
          description: "Audit workflow",
          steps: [
            { id: "step-0", action: "execute", skill: "google-ads-audit", wait_for: [] },
          ],
        },
        systemName: "google-ads-optimizer",
        agentRules: [],
        toolConnectionHints: ["google-ads"],
        toolConnections: [],
        triggerHints: ["cron-schedule"],
        triggers: [],
      },
    );

    expect(metadata.improvements).toEqual([
      expect.objectContaining({
        id: "connect-google-ads",
        kind: "tool_connection",
        status: "pending",
        targetId: "google-ads",
      }),
    ]);
  });

  test("preserves accepted improvement status when later builder metadata re-emits the same recommendation", () => {
    const acceptedMetadata = reduceBuilderMetadataEvent(
      createInitialBuilderMetadataState(),
      CustomEventName.SKILL_GRAPH_READY,
      {
        skillGraph: [
          {
            skill_id: "google-ads-audit",
            name: "Google Ads Audit",
            description: "Inspect campaign performance",
          },
        ],
        workflow: {
          name: "main-workflow",
          description: "Audit workflow",
          steps: [
            { id: "step-0", action: "execute", skill: "google-ads-audit", wait_for: [] },
          ],
        },
        systemName: "google-ads-optimizer",
        agentRules: [],
        toolConnectionHints: ["google-ads"],
        toolConnections: [],
        triggerHints: ["cron-schedule"],
        triggers: [],
        improvements: [
          {
            id: "connect-google-ads",
            kind: "tool_connection",
            status: "accepted",
            scope: "builder",
            title: "Connect Google Ads before deploy",
            summary: "Attach the Google Ads connector so the agent can read live account data.",
            rationale: "The generated Google Ads skills depend on Google Ads account access that is not configured yet.",
            targetId: "google-ads",
          },
        ],
      },
    );

    const refreshedMetadata = reduceBuilderMetadataEvent(
      acceptedMetadata,
      CustomEventName.SKILL_GRAPH_READY,
      {
        skillGraph: [
          {
            skill_id: "google-ads-audit",
            name: "Google Ads Audit",
            description: "Inspect campaign performance",
          },
        ],
        workflow: {
          name: "main-workflow",
          description: "Audit workflow",
          steps: [
            { id: "step-0", action: "execute", skill: "google-ads-audit", wait_for: [] },
          ],
        },
        systemName: "google-ads-optimizer",
        agentRules: [],
        toolConnectionHints: ["google-ads"],
        triggerHints: ["cron-schedule"],
        improvements: [
          {
            id: "connect-google-ads",
            kind: "tool_connection",
            status: "pending",
            scope: "builder",
            title: "Connect Google Ads before deploy",
            summary: "Attach the Google Ads connector so the agent can read live account data.",
            rationale: "The generated Google Ads skills depend on Google Ads account access that is not configured yet.",
            targetId: "google-ads",
          },
        ],
      },
    );

    expect(refreshedMetadata.improvements).toEqual([
      expect.objectContaining({
        id: "connect-google-ads",
        kind: "tool_connection",
        status: "accepted",
        targetId: "google-ads",
      }),
    ]);
  });
});
