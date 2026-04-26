import type { SavedAgent } from "@/hooks/use-agents-store";
import type { BuilderState } from "./builder-state";
import type { CoPilotState } from "./copilot-state";
import { createCoPilotSeedFromAgent } from "./copilot-flow";
import type { AgentDevStage, StageStatus } from "./types";

const CACHE_PREFIX = "openclaw-create-session-";
const CACHE_VERSION = 1;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export interface CachedCreateSession {
  version: number;
  timestamp: number;
  coPilot: CoPilotState;
  builder: BuilderState;
}

export interface LoadedCreateSession {
  coPilot: Partial<CoPilotState>;
  builder: Partial<BuilderState>;
}

function sanitizeRestoredLifecycleTrigger(seed: Partial<CoPilotState>): Partial<CoPilotState> {
  const sanitized: Partial<CoPilotState> = { ...seed };
  const devStage = (seed.devStage as AgentDevStage | undefined) ?? null;

  const thinkStatus = (seed.thinkStatus as StageStatus | undefined) ?? "idle";
  if (
    sanitized.userTriggeredThink &&
    (
      devStage !== "think" ||
      thinkStatus !== "generating" ||
      !seed.thinkRunId ||
      (seed.lastDispatchedThinkRunId != null && seed.lastDispatchedThinkRunId === seed.thinkRunId)
    )
  ) {
    sanitized.userTriggeredThink = false;
    sanitized.thinkRunId = null;
  }

  const planStatus = (seed.planStatus as StageStatus | undefined) ?? "idle";
  if (
    sanitized.userTriggeredPlan &&
    (
      devStage !== "plan" ||
      planStatus !== "generating" ||
      !seed.planRunId ||
      (seed.lastDispatchedPlanRunId != null && seed.lastDispatchedPlanRunId === seed.planRunId)
    )
  ) {
    sanitized.userTriggeredPlan = false;
    sanitized.planRunId = null;
  }

  // On restore, any in-progress status is stale because the SSE/WS connection
  // that was driving it is gone. Convert to "failed" so the UI shows a retry
  // button instead of a permanent spinner. Matches the equivalent logic in
  // copilot-lifecycle-cache.ts sanitizeRestoredLifecycleTrigger.
  if (sanitized.buildStatus === ("building" as StageStatus)) {
    sanitized.buildStatus = "failed" as StageStatus;
    sanitized.userTriggeredBuild = false;
    sanitized.buildRunId = null;
  }
  if (sanitized.thinkStatus === ("generating" as StageStatus)) {
    sanitized.thinkStatus = "failed" as StageStatus;
    sanitized.userTriggeredThink = false;
    sanitized.thinkRunId = null;
  }
  if (sanitized.planStatus === ("generating" as StageStatus)) {
    sanitized.planStatus = "failed" as StageStatus;
    sanitized.userTriggeredPlan = false;
    sanitized.planRunId = null;
  }

  return sanitized;
}

export function saveCreateSessionToCache(
  agentId: string,
  snapshot: {
    coPilot: CoPilotState;
    builder: BuilderState;
  },
): void {
  if (typeof window === "undefined") return;

  try {
    const entry: CachedCreateSession = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      coPilot: snapshot.coPilot,
      builder: snapshot.builder,
    };
    localStorage.setItem(CACHE_PREFIX + agentId, JSON.stringify(entry));
  } catch {
    // localStorage may be unavailable or full in some browser contexts
  }
}

export function loadCreateSessionFromCache(agentId: string): LoadedCreateSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(CACHE_PREFIX + agentId);
    if (!raw) return null;

    const entry = JSON.parse(raw) as CachedCreateSession;
    if (entry.version !== CACHE_VERSION) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + agentId);
      return null;
    }

    return {
      coPilot: sanitizeRestoredLifecycleTrigger(entry.coPilot ?? {}),
      builder: entry.builder ?? {},
    };
  } catch {
    return null;
  }
}

export function clearCreateSessionCache(agentId: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(CACHE_PREFIX + agentId);
  } catch {
    // ignore
  }
}

export function shouldWaitForRouteAgentBeforeCacheRestore({
  editingAgentId,
  hasAgentRecord,
  isRouteAgentHydrated,
}: {
  editingAgentId: string | null;
  hasAgentRecord: boolean;
  isRouteAgentHydrated: boolean;
}): boolean {
  return Boolean(editingAgentId && !hasAgentRecord && !isRouteAgentHydrated);
}

const DEV_STAGE_ORDER: AgentDevStage[] = ["reveal", "think", "plan", "build", "review", "test", "ship", "reflect"];

function resolvePersistedForgeStage(agent: SavedAgent | null): AgentDevStage | null {
  if (!agent) return null;
  const legacyAgent = agent as SavedAgent & { forge_stage?: string | null };
  const rawStage = agent.forgeStage ?? legacyAgent.forge_stage;
  if (!rawStage) return null;
  return DEV_STAGE_ORDER.includes(rawStage as AgentDevStage) ? rawStage as AgentDevStage : null;
}

function restorePersistedLifecycle(
  merged: Partial<CoPilotState>,
  seed: Partial<CoPilotState>,
): void {
  merged.devStage = seed.devStage;
  merged.maxUnlockedDevStage = seed.devStage;
  merged.thinkStatus = seed.thinkStatus ?? "idle";
  merged.planStatus = seed.planStatus ?? "idle";
  merged.buildStatus = seed.buildStatus ?? "idle";
  merged.userTriggeredThink = false;
  merged.userTriggeredPlan = false;
  merged.userTriggeredBuild = false;
  merged.thinkRunId = null;
  merged.planRunId = null;
  merged.buildRunId = null;
}

export function shouldReconcileToPersistedForgeStage({
  currentStage,
  persistedStage,
}: {
  currentStage: AgentDevStage;
  persistedStage: AgentDevStage | null | undefined;
}): boolean {
  if (!persistedStage) return false;
  return DEV_STAGE_ORDER.indexOf(persistedStage) > DEV_STAGE_ORDER.indexOf(currentStage);
}

export function shouldSuppressRevealTriggerForResume({
  hasRestoredSession,
  currentStage,
  persistedStage,
}: {
  hasRestoredSession: boolean;
  currentStage: AgentDevStage;
  persistedStage: AgentDevStage | null | undefined;
}): boolean {
  if (!hasRestoredSession) return true;
  return shouldReconcileToPersistedForgeStage({ currentStage, persistedStage });
}

export function resolveRouteAgentForRestore<T extends { id: string }>({
  editingAgentId,
  storeAgent,
  routeFetchedAgent,
}: {
  editingAgentId: string | null;
  storeAgent: T | null;
  routeFetchedAgent: T | null;
}): T | null {
  if (editingAgentId && routeFetchedAgent?.id === editingAgentId) {
    return routeFetchedAgent;
  }
  return storeAgent;
}

export function buildResumedCoPilotSeed(
  agent: SavedAgent | null,
  cachedCoPilot: Partial<CoPilotState> | null,
): Partial<CoPilotState> {
  const persistedSeed = agent ? createCoPilotSeedFromAgent(agent) : {};
  if (!cachedCoPilot) return persistedSeed;

  // Merge cache over persisted seed, but never let empty-string cache values
  // for identity fields overwrite real agent data. This prevents a stale cache
  // (written after a page-refresh reset) from wiping the agent's name/description.
  const merged: Partial<CoPilotState> = sanitizeRestoredLifecycleTrigger({
    ...persistedSeed,
    ...cachedCoPilot,
  });
  const identityFields: (keyof CoPilotState)[] = ["name", "description", "systemName"];
  for (const field of identityFields) {
    const cached = cachedCoPilot[field];
    const persisted = (persistedSeed as Record<string, unknown>)[field];
    if (typeof cached === "string" && cached === "" && typeof persisted === "string" && persisted !== "") {
      (merged as Record<string, unknown>)[field] = persisted;
    }
  }

  // Never let a stale cache regress devStage behind the backend forge_stage.
  // The persisted seed derives devStage from the agent's forge_stage which is
  // the source of truth for how far creation has actually progressed. A
  // localStorage cache may be from an earlier session that never advanced.
  const seed = persistedSeed as Partial<CoPilotState>;
  const persistedStageIdx = DEV_STAGE_ORDER.indexOf(seed.devStage as AgentDevStage);
  const mergedStageIdx = DEV_STAGE_ORDER.indexOf(merged.devStage as AgentDevStage);
  if (persistedStageIdx > mergedStageIdx) {
    restorePersistedLifecycle(merged, seed);
  }

  // Also block the opposite stale-cache failure mode: a cached devStage cannot
  // move forward when the persisted forge_stage was intentionally failed closed
  // by createCoPilotSeedFromAgent because required artifacts are missing.
  const forgeStage = resolvePersistedForgeStage(agent);
  const forgeStageIdx = forgeStage ? DEV_STAGE_ORDER.indexOf(forgeStage) : -1;
  if (forgeStageIdx > persistedStageIdx && mergedStageIdx > persistedStageIdx) {
    restorePersistedLifecycle(merged, seed);
  }

  const effectiveStage = (merged.devStage ?? seed.devStage) as AgentDevStage | undefined;
  const effectiveStageIdx = effectiveStage ? DEV_STAGE_ORDER.indexOf(effectiveStage) : -1;
  if (
    effectiveStageIdx >= DEV_STAGE_ORDER.indexOf("review")
    && Array.isArray(seed.skillGraph)
    && seed.skillGraph.length > 0
    && (!Array.isArray(merged.skillGraph) || merged.skillGraph.length === 0)
  ) {
    merged.skillGraph = seed.skillGraph;
    if (seed.workflow) merged.workflow = seed.workflow;
  }
  if (
    effectiveStageIdx >= DEV_STAGE_ORDER.indexOf("review")
    && Array.isArray(cachedCoPilot.selectedSkillIds)
    && cachedCoPilot.selectedSkillIds.length === 0
    && Array.isArray(seed.selectedSkillIds)
    && seed.selectedSkillIds.length > 0
  ) {
    merged.selectedSkillIds = seed.selectedSkillIds;
  }

  if (agent?.forgeSandboxId) {
    merged.agentSandboxId = agent.forgeSandboxId;
  }

  return merged;
}

export function buildResumedBuilderState(
  agentId: string,
  agent: SavedAgent | null,
  cachedBuilder: Partial<BuilderState> | null,
  cachedCoPilot: Partial<CoPilotState> | null,
): Partial<BuilderState> {
  // Use `||` instead of `??` for string fields so empty strings from a stale
  // cache fall through to the agent's real values.
  return {
    ...(cachedBuilder?.sessionId ? { sessionId: cachedBuilder.sessionId } : {}),
    name: cachedBuilder?.name || cachedCoPilot?.name || agent?.name || "",
    description: cachedBuilder?.description || cachedCoPilot?.description || agent?.description || "",
    skillGraph: cachedBuilder?.skillGraph ?? cachedCoPilot?.skillGraph ?? agent?.skillGraph ?? null,
    workflow: cachedBuilder?.workflow ?? cachedCoPilot?.workflow ?? agent?.workflow ?? null,
    systemName: cachedBuilder?.systemName || cachedCoPilot?.systemName || agent?.name || null,
    agentRules: cachedBuilder?.agentRules ?? cachedCoPilot?.agentRules ?? agent?.agentRules ?? [],
    toolConnectionHints: cachedBuilder?.toolConnectionHints ?? [],
    toolConnections: cachedBuilder?.toolConnections ?? cachedCoPilot?.connectedTools ?? agent?.toolConnections ?? [],
    triggerHints: cachedBuilder?.triggerHints ?? [],
    triggers: cachedBuilder?.triggers ?? cachedCoPilot?.triggers ?? agent?.triggers ?? [],
    channelHints: cachedBuilder?.channelHints ?? [],
    improvements: cachedBuilder?.improvements ?? cachedCoPilot?.improvements ?? agent?.improvements ?? [],
    draftAgentId: cachedBuilder?.draftAgentId ?? agent?.id ?? agentId,
    draftSaveStatus: cachedBuilder?.draftSaveStatus ?? "idle",
    lastSavedAt: cachedBuilder?.lastSavedAt ?? null,
    lastSavedHash: cachedBuilder?.lastSavedHash ?? null,
    forgeSandboxId: agent?.forgeSandboxId ?? cachedBuilder?.forgeSandboxId ?? null,
    forgeSandboxStatus:
      agent?.forgeSandboxId
        ? "ready"
        : (cachedBuilder?.forgeSandboxStatus ?? "idle"),
    forgeVncPort: cachedBuilder?.forgeVncPort ?? null,
    forgeError: cachedBuilder?.forgeError ?? null,
  };
}
