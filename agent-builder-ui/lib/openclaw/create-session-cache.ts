import type { SavedAgent } from "@/hooks/use-agents-store";
import type { BuilderState } from "./builder-state";
import type { CoPilotState } from "./copilot-state";
import { createCoPilotSeedFromAgent } from "./copilot-flow";

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
      coPilot: entry.coPilot ?? {},
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

export function buildResumedCoPilotSeed(
  agent: SavedAgent | null,
  cachedCoPilot: Partial<CoPilotState> | null,
): Partial<CoPilotState> {
  const persistedSeed = agent ? createCoPilotSeedFromAgent(agent) : {};
  return cachedCoPilot ? { ...persistedSeed, ...cachedCoPilot } : persistedSeed;
}

export function buildResumedBuilderState(
  agentId: string,
  agent: SavedAgent | null,
  cachedBuilder: Partial<BuilderState> | null,
  cachedCoPilot: Partial<CoPilotState> | null,
): Partial<BuilderState> {
  return {
    ...(cachedBuilder?.sessionId ? { sessionId: cachedBuilder.sessionId } : {}),
    name: cachedBuilder?.name ?? cachedCoPilot?.name ?? agent?.name ?? "",
    description: cachedBuilder?.description ?? cachedCoPilot?.description ?? agent?.description ?? "",
    skillGraph: cachedBuilder?.skillGraph ?? cachedCoPilot?.skillGraph ?? agent?.skillGraph ?? null,
    workflow: cachedBuilder?.workflow ?? cachedCoPilot?.workflow ?? agent?.workflow ?? null,
    systemName: cachedBuilder?.systemName ?? cachedCoPilot?.systemName ?? agent?.name ?? null,
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
