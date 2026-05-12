/**
 * Rehydrate `architecturePlan` from the agent's workspace when the store
 * lost it (e.g., creation_session was overwritten with `architecturePlan:
 * null` by a stale snapshot save).
 *
 * Source of truth: `.openclaw/plan/architecture.json` written by the
 * architect during the Plan stage. Reading it back in is safe — the file
 * is JSON and `normalizePlan` is the same routine that ingested it
 * originally.
 *
 * Guard: only fires when the user has actually progressed past Plan AND
 * the store is empty. For a fresh agent at Plan stage we let the normal
 * generate-plan flow run.
 */

import { useEffect, useRef, useState } from "react";
import type { CoPilotActions, CoPilotState } from "./copilot-state";
import { AGENT_DEV_STAGES } from "./types";

type RehydrationStatus = "idle" | "loading" | "loaded" | "missing" | "error";

export function useArchitecturePlanRehydration(
  store: CoPilotState & CoPilotActions,
): { status: RehydrationStatus; error: string | null } {
  const [status, setStatus] = useState<RehydrationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const attemptedKeyRef = useRef<string | null>(null);

  const sandboxId = store.agentSandboxId;
  const hasPlan = Boolean(store.architecturePlan);
  const planStageIdx = AGENT_DEV_STAGES.indexOf("plan");
  const unlockedStageIdx = AGENT_DEV_STAGES.indexOf(store.maxUnlockedDevStage);
  const reachedPastPlan = unlockedStageIdx > planStageIdx;
  const onPlanOrLater = AGENT_DEV_STAGES.indexOf(store.devStage) >= planStageIdx;

  useEffect(() => {
    // Only act when:
    //   - user has progressed past Plan (so a plan must already exist on disk)
    //   - the store currently has no plan (definite drift)
    //   - we have a sandbox to read from
    //   - we haven't already attempted this (sandbox, plan-presence) combo
    if (!sandboxId || hasPlan || !reachedPastPlan || !onPlanOrLater) return;
    const attemptKey = `${sandboxId}:no-plan`;
    if (attemptedKeyRef.current === attemptKey) return;
    attemptedKeyRef.current = attemptKey;

    let cancelled = false;
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const [{ readWorkspaceFile }, { normalizePlan }] = await Promise.all([
          import("./workspace-writer"),
          import("./plan-formatter"),
        ]);
        const raw = await readWorkspaceFile(sandboxId, ".openclaw/plan/architecture.json");
        if (cancelled) return;
        if (!raw) {
          setStatus("missing");
          setError("architecture.json not found in workspace");
          return;
        }
        const parsed = JSON.parse(raw);
        const plan = normalizePlan(parsed);
        store.setArchitecturePlan(plan);
        store.setPlanStatus("ready");
        setStatus("loaded");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error reading plan");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sandboxId, hasPlan, reachedPastPlan, onPlanOrLater, store]);

  return { status, error };
}
