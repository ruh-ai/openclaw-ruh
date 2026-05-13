/**
 * Rehydrate `buildReport` from the agent's workspace when the store has a
 * stale or missing copy.
 *
 * Why this exists: the build pipeline writes
 * `.openclaw/build/build-report.json` as the source of truth. The store's
 * `buildReport` field is a denormalized cache populated by SSE events
 * during the build run. If the build SSE failed mid-way (e.g.,
 * "post_accept" gateway drop) and saved a "blocked" report to the store,
 * then re-ran and produced a fresh "ship-ready" report on disk, the
 * frontend's persisted creation_session still holds the OLD report on
 * reload. The UI shows blockers that no longer exist on disk.
 *
 * Guard: fires when `devStage >= build` AND the on-disk report's
 * `generatedAt` is newer than the store's. Fire-once per
 * (sandbox, store-generatedAt) tuple so we don't fight live SSE updates.
 */

import { useEffect, useRef, useState } from "react";
import type { CoPilotActions, CoPilotState } from "./copilot-state";
import type { BuildReport } from "./types";
import { AGENT_DEV_STAGES } from "./types";

type RehydrationStatus = "idle" | "loading" | "loaded" | "missing" | "error";

export function useBuildReportRehydration(
  store: CoPilotState & CoPilotActions,
): { status: RehydrationStatus; error: string | null } {
  const [status, setStatus] = useState<RehydrationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const attemptedKeyRef = useRef<string | null>(null);

  const sandboxId = store.agentSandboxId;
  const buildStageIdx = AGENT_DEV_STAGES.indexOf("build");
  const onBuildOrLater = AGENT_DEV_STAGES.indexOf(store.devStage) >= buildStageIdx;
  const storeGeneratedAt = store.buildReport?.generatedAt ?? null;

  useEffect(() => {
    if (!sandboxId || !onBuildOrLater) return;
    const attemptKey = `${sandboxId}:${storeGeneratedAt ?? "no-report"}`;
    if (attemptedKeyRef.current === attemptKey) return;
    attemptedKeyRef.current = attemptKey;

    let cancelled = false;
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const { readWorkspaceFile } = await import("./workspace-writer");
        const raw = await readWorkspaceFile(sandboxId, ".openclaw/build/build-report.json");
        if (cancelled) return;
        if (!raw) {
          setStatus("missing");
          return;
        }
        let report: BuildReport;
        try {
          report = JSON.parse(raw) as BuildReport;
        } catch {
          setStatus("error");
          setError("build-report.json is not valid JSON");
          return;
        }
        const diskGeneratedAt = report.generatedAt ?? null;
        // Only overwrite if disk is strictly newer than store. If they
        // match, store is already correct. If disk is older, the SSE has
        // already pushed a newer in-memory state that hasn't hit disk yet.
        if (
          diskGeneratedAt &&
          (!storeGeneratedAt || new Date(diskGeneratedAt).getTime() > new Date(storeGeneratedAt).getTime())
        ) {
          store.setBuildReport(report);
        }
        setStatus("loaded");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error reading build report");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sandboxId, onBuildOrLater, storeGeneratedAt, store]);

  return { status, error };
}
