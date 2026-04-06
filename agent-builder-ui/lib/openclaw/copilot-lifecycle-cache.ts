/**
 * copilot-lifecycle-cache.ts — Persists wizard lifecycle state to localStorage
 * so page reloads (HMR crashes, manual refresh) can resume from the correct stage.
 *
 * Keyed by agent draft ID. Only stores lifecycle fields, not full agent config.
 */

import type { CoPilotState } from "./copilot-state";
import type { StageStatus } from "./types";

const CACHE_PREFIX = "openclaw-copilot-lifecycle-";
const CACHE_VERSION = 4;

/** Lifecycle fields worth persisting across page reloads. */
const LIFECYCLE_KEYS = [
  "devStage",
  "maxUnlockedDevStage",
  "thinkStatus",
  "userTriggeredThink",
  "thinkRunId",
  "lastDispatchedThinkRunId",
  "planStatus",
  "userTriggeredPlan",
  "planRunId",
  "lastDispatchedPlanRunId",
  "buildStatus",
  "userTriggeredBuild",
  "buildRunId",
  "evalStatus",
  "deployStatus",
  "architecturePlan",
  "buildReport",
  "evalTasks",
  "agentSandboxId",
  "discoveryDocuments",
  "sessionId",
  "buildManifest",
] as const;

type LifecycleKey = (typeof LIFECYCLE_KEYS)[number];

interface CachedLifecycle {
  version: number;
  timestamp: number;
  data: Pick<CoPilotState, LifecycleKey>;
}

function sanitizeRestoredLifecycleTrigger(seed: Partial<CoPilotState>): Partial<CoPilotState> {
  const sanitized: Partial<CoPilotState> = { ...seed };

  const thinkStatus = (seed.thinkStatus as StageStatus | undefined) ?? "idle";
  if (
    sanitized.userTriggeredThink &&
    (seed.devStage !== "think" ||
      thinkStatus !== "generating" ||
      !seed.thinkRunId ||
      (seed.lastDispatchedThinkRunId != null && seed.lastDispatchedThinkRunId === seed.thinkRunId))
  ) {
    sanitized.userTriggeredThink = false;
    sanitized.thinkRunId = null;
  }

  const planStatus = (seed.planStatus as StageStatus | undefined) ?? "idle";
  if (
    sanitized.userTriggeredPlan &&
    (seed.devStage !== "plan" ||
      planStatus !== "generating" ||
      !seed.planRunId ||
      (seed.lastDispatchedPlanRunId != null && seed.lastDispatchedPlanRunId === seed.planRunId))
  ) {
    sanitized.userTriggeredPlan = false;
    sanitized.planRunId = null;
  }

  // A "building" status from a previous session means the build was interrupted.
  // Reset to "failed" so the UI shows a retry button instead of a stale spinner.
  if (sanitized.buildStatus === ("building" as StageStatus)) {
    sanitized.buildStatus = "failed" as StageStatus;
    sanitized.userTriggeredBuild = false;
    sanitized.buildRunId = null;
  }

  // Same for "generating" think/plan — an interrupted generation should show retry.
  // On restore, any "generating" status is stale because the SSE/WS connection is gone.
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
    return sanitizeRestoredLifecycleTrigger(entry.data);
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
