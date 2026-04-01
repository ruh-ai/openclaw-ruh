/**
 * copilot-lifecycle-cache.ts — Persists wizard lifecycle state to localStorage
 * so page reloads (HMR crashes, manual refresh) can resume from the correct stage.
 *
 * Keyed by agent draft ID. Only stores lifecycle fields, not full agent config.
 */

import type { CoPilotState } from "./copilot-state";

const CACHE_PREFIX = "openclaw-copilot-lifecycle-";
const CACHE_VERSION = 1;

/** Lifecycle fields worth persisting across page reloads. */
const LIFECYCLE_KEYS = [
  "devStage",
  "maxUnlockedDevStage",
  "thinkStatus",
  "planStatus",
  "buildStatus",
  "evalStatus",
  "deployStatus",
  "architecturePlan",
  "buildReport",
  "evalTasks",
] as const;

type LifecycleKey = (typeof LIFECYCLE_KEYS)[number];

interface CachedLifecycle {
  version: number;
  timestamp: number;
  data: Pick<CoPilotState, LifecycleKey>;
}

export function saveCoPilotLifecycleToCache(
  agentId: string,
  state: CoPilotState,
): void {
  if (typeof window === "undefined") return;
  try {
    const data = {} as Record<string, unknown>;
    for (const key of LIFECYCLE_KEYS) {
      data[key] = state[key];
    }
    const entry: CachedLifecycle = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      data: data as Pick<CoPilotState, LifecycleKey>,
    };
    localStorage.setItem(CACHE_PREFIX + agentId, JSON.stringify(entry));
  } catch {
    // localStorage quota or security error — silently ignore
  }
}

export function loadCoPilotLifecycleFromCache(
  agentId: string,
): Partial<CoPilotState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + agentId);
    if (!raw) return null;
    const entry: CachedLifecycle = JSON.parse(raw);
    if (entry.version !== CACHE_VERSION) return null;
    // Expire after 2 hours — stale lifecycle state is worse than starting fresh
    if (Date.now() - entry.timestamp > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(CACHE_PREFIX + agentId);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function clearCoPilotLifecycleCache(agentId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CACHE_PREFIX + agentId);
  } catch {
    // ignore
  }
}
