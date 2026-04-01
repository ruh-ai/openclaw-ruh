import type { SavedAgent, SaveAgentDraftInput } from "@/hooks/use-agents-store";
import type { AgentImprovement } from "@/lib/agents/types";
import { applyAcceptedImprovementsToConfig } from "@/app/(platform)/agents/create/create-session-config";
import type { BuilderState } from "../builder-state";
import {
  CustomEventName,
  createInitialBuilderMetadataState,
  type BuilderMetadataState,
  type SkillGraphReadyPayload,
  type WizardConnectToolsPayload,
  type WizardSetRulesPayload,
  type WizardSetSkillsPayload,
  type WizardSetChannelsPayload,
  type WizardSetTriggersPayload,
  type WizardUpdateFieldsPayload,
} from "./types";

interface NormalizedDraftPayload {
  payload: SaveAgentDraftInput;
  hash: string;
}

interface BuilderMetadataAutosaveScheduler {
  schedule: (run: () => void) => unknown;
  clear: (handle: unknown) => void;
}

interface BuilderMetadataAutosaveControllerConfig {
  agent: SavedAgent | null;
  saveAgentDraft: (draft: SaveAgentDraftInput) => Promise<SavedAgent>;
  scheduler: BuilderMetadataAutosaveScheduler;
  now: () => string;
  onMetadataPatch: (patch: Partial<BuilderMetadataState>) => void;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function hashDraftPayload(payload: SaveAgentDraftInput): string {
  const { agentId: _agentId, ...contentPayload } = payload;
  void _agentId;
  return stableStringify(contentPayload);
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mergeImprovements(
  previous: AgentImprovement[],
  next: AgentImprovement[],
): AgentImprovement[] {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  return next.map((item) => {
    const existing = previousById.get(item.id);
    return existing
      ? { ...item, status: existing.status }
      : item;
  });
}

function deriveImprovements(
  metadata: BuilderMetadataState,
  existingImprovements: AgentImprovement[] = [],
): AgentImprovement[] {
  const derived: AgentImprovement[] = [];
  const toolIds = new Set([
    ...metadata.toolConnectionHints,
    ...(metadata.toolConnections ?? []).map((connection) => connection.toolId),
  ]);
  const hasGoogleAdsConnectorHint = toolIds.has("google-ads");
  const hasGoogleWorkspaceConnectorHint = toolIds.has("google");

  if (hasGoogleAdsConnectorHint) {
    derived.push({
      id: "connect-google-ads",
      kind: "tool_connection",
      status: "pending",
      scope: "builder",
      title: "Connect Google Ads before deploy",
      summary: "Attach the Google Ads connector so the agent can read live account data.",
      rationale: "The generated Google Ads skills depend on Google Ads account access that is not configured yet.",
      targetId: "google-ads",
    });
  }

  if (hasGoogleWorkspaceConnectorHint) {
    derived.push({
      id: "connect-google-workspace",
      kind: "tool_connection",
      status: "pending",
      scope: "builder",
      title: "Connect Google Workspace before deploy",
      summary: "Attach the Google connector so the agent can reach the required Google services.",
      rationale: "The generated Google Ads skills depend on Google account data that is not available yet.",
      targetId: "google",
    });
  }

  return mergeImprovements(existingImprovements, derived);
}

export function reduceBuilderMetadataEvent(
  metadata: BuilderMetadataState,
  name: string,
  value: unknown,
): BuilderMetadataState {
  switch (name) {
    case CustomEventName.SKILL_GRAPH_READY: {
      const payload = value as SkillGraphReadyPayload;
      return {
        ...metadata,
        skillGraph: payload.skillGraph,
        workflow: payload.workflow,
        systemName: payload.systemName,
        agentRules: payload.agentRules,
        toolConnectionHints: payload.toolConnectionHints,
        toolConnections: payload.toolConnections,
        triggerHints: payload.triggerHints,
        triggers: payload.triggers,
        improvements: (payload.improvements?.length ?? 0) > 0
          ? mergeImprovements(metadata.improvements, payload.improvements ?? [])
          : deriveImprovements({
            ...metadata,
            toolConnectionHints: payload.toolConnectionHints,
            toolConnections: payload.toolConnections,
          }, metadata.improvements),
      };
    }

    case CustomEventName.WIZARD_UPDATE_FIELDS: {
      const payload = value as WizardUpdateFieldsPayload;
      return {
        ...metadata,
        name: payload.name ?? metadata.name,
        description: payload.description ?? metadata.description,
        systemName: payload.systemName ?? metadata.systemName,
      };
    }

    case CustomEventName.WIZARD_SET_SKILLS: {
      const payload = value as WizardSetSkillsPayload;
      return {
        ...metadata,
        skillGraph: payload.nodes,
        workflow: payload.workflow,
        agentRules: payload.rules,
      };
    }

    case CustomEventName.WIZARD_CONNECT_TOOLS: {
      const payload = value as WizardConnectToolsPayload;
      return {
        ...metadata,
        toolConnectionHints: payload.toolIds,
        toolConnections: payload.toolConnections ?? metadata.toolConnections,
        improvements: deriveImprovements({
          ...metadata,
          toolConnectionHints: payload.toolIds,
          toolConnections: payload.toolConnections ?? metadata.toolConnections,
        }, metadata.improvements),
      };
    }

    case CustomEventName.WIZARD_SET_TRIGGERS: {
      const payload = value as WizardSetTriggersPayload;
      return {
        ...metadata,
        triggerHints: payload.triggerIds,
        triggers: payload.triggers ?? metadata.triggers,
      };
    }

    case CustomEventName.WIZARD_SET_RULES: {
      const payload = value as WizardSetRulesPayload;
      return {
        ...metadata,
        agentRules: payload.rules,
      };
    }

    case CustomEventName.WIZARD_SET_CHANNELS: {
      const payload = value as WizardSetChannelsPayload;
      return {
        ...metadata,
        channelHints: payload.channelIds,
      };
    }

    default:
      return metadata;
  }
}

export function buildNormalizedDraftPayload(
  metadata: BuilderMetadataState,
  agent: SavedAgent | null,
): NormalizedDraftPayload | null {
  const name = trimOrNull(metadata.name) ?? trimOrNull(metadata.systemName) ?? trimOrNull(agent?.name);
  const skillGraph = metadata.skillGraph ?? agent?.skillGraph ?? null;

  if (!name && (!skillGraph || skillGraph.length === 0)) {
    return null;
  }

  const projected = applyAcceptedImprovementsToConfig({
    toolConnections:
      metadata.toolConnections.length > 0
        ? metadata.toolConnections
        : (agent?.toolConnections ?? []),
    improvements: metadata.improvements.length > 0 ? metadata.improvements : (agent?.improvements ?? []),
  });

  const payload: SaveAgentDraftInput = {
    agentId: metadata.draftAgentId ?? agent?.id,
    name: name ?? "New Agent",
    description: trimOrNull(metadata.description) ?? agent?.description ?? "",
    skillGraph,
    workflow: metadata.workflow ?? agent?.workflow ?? null,
    agentRules: metadata.agentRules.length > 0 ? metadata.agentRules : (agent?.agentRules ?? []),
    toolConnections: projected.toolConnections,
    triggers: metadata.triggers.length > 0 ? metadata.triggers : (agent?.triggers ?? []),
    improvements: metadata.improvements.length > 0 ? metadata.improvements : (agent?.improvements ?? []),
  };

  return {
    payload,
    hash: hashDraftPayload(payload),
  };
}

export function createSeededBuilderMetadataState(
  agent: SavedAgent | null,
  builderState?: Partial<BuilderState> | null,
): BuilderMetadataState {
  const seeded: BuilderMetadataState = {
    ...createInitialBuilderMetadataState(),
    draftAgentId: builderState?.draftAgentId ?? agent?.id ?? null,
    name: builderState?.name ?? agent?.name ?? "",
    description: builderState?.description ?? agent?.description ?? "",
    systemName: builderState?.systemName ?? agent?.name ?? null,
    skillGraph: builderState?.skillGraph ?? agent?.skillGraph ?? null,
    workflow: builderState?.workflow ?? agent?.workflow ?? null,
    agentRules: builderState?.agentRules ?? agent?.agentRules ?? [],
    toolConnectionHints: builderState?.toolConnectionHints ?? [],
    toolConnections: builderState?.toolConnections ?? agent?.toolConnections ?? [],
    triggerHints: builderState?.triggerHints ?? [],
    triggers: builderState?.triggers ?? agent?.triggers ?? [],
    channelHints: builderState?.channelHints ?? [],
    improvements: builderState?.improvements ?? agent?.improvements ?? [],
    draftSaveStatus: builderState?.draftSaveStatus ?? "idle",
    lastSavedAt: builderState?.lastSavedAt ?? null,
    lastSavedHash: builderState?.lastSavedHash ?? null,
  };

  const normalized = buildNormalizedDraftPayload(seeded, agent);
  if (normalized && !seeded.lastSavedHash) {
    seeded.lastSavedHash = normalized.hash;
  }

  return seeded;
}

export function createBuilderMetadataAutosaveController(
  config: BuilderMetadataAutosaveControllerConfig,
) {
  let queuedHandle: unknown = null;
  let queuedHash: string | null = null;
  let inFlightHash: string | null = null;
  let requestVersion = 0;

  return {
    schedule(metadata: BuilderMetadataState) {
      const normalized = buildNormalizedDraftPayload(metadata, config.agent);
      if (!normalized) {
        return;
      }

      if (
        normalized.hash === metadata.lastSavedHash
        || normalized.hash === queuedHash
        || normalized.hash === inFlightHash
      ) {
        return;
      }

      if (queuedHandle != null) {
        config.scheduler.clear(queuedHandle);
      }

      queuedHash = normalized.hash;
      const currentRequestVersion = ++requestVersion;

      queuedHandle = config.scheduler.schedule(() => {
        queuedHandle = null;
        queuedHash = null;
        inFlightHash = normalized.hash;

        config.onMetadataPatch({
          draftSaveStatus: "saving",
        });

        void (async () => {
          try {
            const saved = await config.saveAgentDraft(normalized.payload);

            if (currentRequestVersion !== requestVersion) {
              return;
            }

            config.onMetadataPatch({
              draftAgentId: saved.id,
              draftSaveStatus: "saved",
              lastSavedAt: config.now(),
              lastSavedHash: normalized.hash,
            });
          } catch {
            if (currentRequestVersion !== requestVersion) {
              return;
            }

            config.onMetadataPatch({
              draftSaveStatus: "error",
            });
          } finally {
            if (currentRequestVersion === requestVersion) {
              inFlightHash = null;
            }
          }
        })();
      });
    },

    cancel() {
      if (queuedHandle != null) {
        config.scheduler.clear(queuedHandle);
        queuedHandle = null;
        queuedHash = null;
      }
    },
  };
}
