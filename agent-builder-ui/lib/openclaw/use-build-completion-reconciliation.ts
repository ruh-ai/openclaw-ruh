/**
 * Reconcile `buildStatus` from the workspace when the in-memory pipeline
 * state lies about reality.
 *
 * Symptom this fixes: backend restart kills the build mid-run. The
 * specialist outputs (skills, db/, backend/, identity) are on disk in
 * the workspace but the agent's `creation_session.coPilot.buildStatus`
 * stays at `"building"` forever because no completion event ever fired.
 * UI shows "build in progress" spinner indefinitely; no Retry button
 * renders (Retry only shows on `"failed"`); operator is trapped.
 *
 * Behavior: when devStage ≥ build and buildStatus === "building", call
 * GET /api/agents/:id/build-completion-status. If `allFilesPresent`
 * comes back true, flip the store's buildStatus to "done". The Build
 * stage UI then transitions to the BuildReport view and the operator
 * can advance to Review.
 *
 * Pattern mirrors `useArchitecturePlanRehydration` — workspace is the
 * source of truth for completed work; in-memory state is a cache that
 * can drift.
 */

import { useEffect, useRef, useState } from "react";
import type { CoPilotActions, CoPilotState } from "./copilot-state";
import { AGENT_DEV_STAGES } from "./types";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ReconciliationStatus = "idle" | "checking" | "reconciled" | "files_missing" | "error";

interface BuildCompletionResponse {
  allFilesPresent: boolean;
  reason?: string;
  completedSpecialists: string[];
  missingBySpecialist: Record<string, string[]>;
}

export function useBuildCompletionReconciliation(
  store: CoPilotState & CoPilotActions,
  agentId: string | null | undefined,
): { status: ReconciliationStatus; error: string | null; lastResult: BuildCompletionResponse | null } {
  const [status, setStatus] = useState<ReconciliationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BuildCompletionResponse | null>(null);
  const attemptedRef = useRef<string | null>(null);

  const buildStageIdx = AGENT_DEV_STAGES.indexOf("build");
  const onBuildOrLater = AGENT_DEV_STAGES.indexOf(store.devStage) >= buildStageIdx;

  useEffect(() => {
    // Fire whenever the user is on Build stage or later. Idempotent on the
    // backend (read-only check + idempotent build-report rewrite when
    // allFilesPresent). The attempt-key below dedupes within a session so
    // we don't hammer the endpoint on every render. We DO NOT gate on
    // buildStatus === "building" — the workspace's build-report.json can
    // still be "blocked" from a prior failed run even after our in-memory
    // status is "done", and the lifecycle-advance guard reads that file
    // (not the store), so the report needs an idempotent rewrite too.
    if (!agentId || !onBuildOrLater) return;
    const attemptKey = `${agentId}:reconcile`;
    if (attemptedRef.current === attemptKey) return;
    attemptedRef.current = attemptKey;

    let cancelled = false;
    setStatus("checking");
    setError(null);

    (async () => {
      try {
        const r = await fetchBackendWithAuth(
          `${API_BASE}/api/agents/${agentId}/build-completion-status`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!r.ok) {
          setStatus("error");
          setError(`HTTP ${r.status}`);
          return;
        }
        const data = (await r.json()) as BuildCompletionResponse;
        if (cancelled) return;
        setLastResult(data);
        if (data.allFilesPresent) {
          store.setBuildStatus("done");
          setStatus("reconciled");
        } else {
          setStatus("files_missing");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId, onBuildOrLater, store]);

  return { status, error, lastResult };
}
