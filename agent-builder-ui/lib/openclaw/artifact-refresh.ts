/**
 * artifact-refresh.ts — Re-read artifact files from the sandbox workspace
 * after the architect finishes a revision turn, and reconcile the co-pilot
 * store with what's actually on disk.
 *
 * Background
 * ----------
 * The agent-builder Architect writes PRD.md, TRD.md, architecture.json,
 * and build-report.json directly to the sandbox workspace via tool calls.
 * It also instructs itself (via the agent-builder SKILL.md "Artifact-Targeted
 * Revisions" section) to "reply with a 1–3 sentence summary" after editing
 * a file — but it does NOT consistently re-emit the markers the UI needs
 * to refresh its in-memory copy. Result: the workspace file is updated,
 * but the chat panel still shows the pre-revision version.
 *
 * Fix
 * ---
 * After every architect turn that targets a workspace artifact (PRD, TRD,
 * Plan, build report), the consumer (TabChat) calls
 * refetchArtifactFromWorkspace which:
 *   1. Reads the canonical file(s) from the sandbox via readWorkspaceFile.
 *   2. Parses them with the same logic the Think/Plan auto-trigger uses.
 *   3. Updates the store via the standard setters.
 *
 * Idempotent: workspace is the source of truth. Re-running this on a turn
 * that didn't actually change the file is a no-op (parse + setState with
 * identical content).
 */

import type { ArtifactTarget } from "./stage-context";
import type { AgentDevStage, ArchitecturePlan, BuildReport, DiscoveryDocument, DiscoveryDocuments } from "./types";

// ─── Markdown parsing ──────────────────────────────────────────────────────

export function parseDiscoveryMarkdown(md: string): DiscoveryDocument | null {
  if (!md.trim()) return null;
  const lines = md.split("\n");
  const titleLine = lines[0] ?? "";
  const hasH1 = titleLine.startsWith("# ");
  const title = hasH1 ? titleLine.replace(/^#\s+/, "").trim() : "Document";

  // When there's no H1, the first line might already be a section heading
  // (`## …`). Don't slice it off — we'd lose the only section in that case.
  const body = hasH1 ? lines.slice(1) : lines;
  const sections: { heading: string; content: string }[] = [];
  let heading = "";
  let content: string[] = [];
  for (const line of body) {
    if (line.startsWith("## ")) {
      if (heading) sections.push({ heading, content: content.join("\n").trim() });
      heading = line.replace(/^##\s+/, "").trim();
      content = [];
    } else {
      content.push(line);
    }
  }
  if (heading) sections.push({ heading, content: content.join("\n").trim() });

  if (sections.length === 0) return null;
  return { title, sections };
}

// ─── Stage-derived fallback target ────────────────────────────────────────

/**
 * When the user revises an artifact via free-form chat (rather than the
 * "Ask architect to revise" button), `selectedArtifactTarget` is null but
 * we still want to refetch the stage-relevant workspace files. Map the
 * current devStage to the artifact the architect would have edited.
 *
 * Returns null when the stage has no canonical architect-owned artifact
 * (reveal/test/ship/reflect). On those stages we skip the auto-refetch
 * rather than over-fetching.
 */
export function defaultArtifactForStage(devStage: AgentDevStage): ArtifactTarget | null {
  switch (devStage) {
    case "think":
      // 'prd' kind triggers re-read of BOTH PRD.md and TRD.md (see dispatcher)
      return { kind: "prd" };
    case "plan":
    case "prototype":
      return { kind: "plan" };
    case "build":
    case "review":
      return { kind: "build_report" };
    default:
      return null;
  }
}

// ─── Refresh dispatcher ────────────────────────────────────────────────────

export type ArtifactRefreshSetters = {
  /** Existing discoveryDocuments — used to preserve the other doc when only one is refreshable. */
  discoveryDocuments: DiscoveryDocuments | null;
  setDiscoveryDocuments: (docs: DiscoveryDocuments) => void;
  setArchitecturePlan: (plan: ArchitecturePlan) => void;
  setBuildReport: (report: BuildReport) => void;
};

export interface ArtifactRefreshResult {
  refreshed: ArtifactTarget["kind"][];
  error?: string;
}

/**
 * Read the workspace file(s) backing the given artifact target and update
 * the corresponding co-pilot store fields. Bounded to artifact kinds that
 * have a canonical workspace file — research / review / test_report fall
 * through as no-ops.
 *
 * On PRD/TRD revisions we re-read BOTH discovery docs and write them
 * together: the DiscoveryDocuments store shape requires a full pair, and
 * the architect may have touched both as part of a cross-doc revision.
 */
export async function refetchArtifactFromWorkspace(
  sandboxId: string,
  target: ArtifactTarget,
  setters: ArtifactRefreshSetters,
): Promise<ArtifactRefreshResult> {
  const { readWorkspaceFile } = await import("./workspace-writer");

  switch (target.kind) {
    case "prd":
    case "trd": {
      const [prdMd, trdMd] = await Promise.all([
        readWorkspaceFile(sandboxId, ".openclaw/discovery/PRD.md"),
        readWorkspaceFile(sandboxId, ".openclaw/discovery/TRD.md"),
      ]);
      const prd = prdMd ? parseDiscoveryMarkdown(prdMd) : null;
      const trd = trdMd ? parseDiscoveryMarkdown(trdMd) : null;
      if (!prd && !trd) {
        return { refreshed: [], error: "no_workspace_files" };
      }
      const existing = setters.discoveryDocuments;
      const finalPrd = prd
        ?? existing?.prd
        ?? { title: "Product Requirements Document", sections: [] };
      const finalTrd = trd
        ?? existing?.trd
        ?? { title: "Technical Requirements Document", sections: [] };
      setters.setDiscoveryDocuments({ prd: finalPrd, trd: finalTrd });
      const refreshed: ArtifactTarget["kind"][] = [];
      if (prd) refreshed.push("prd");
      if (trd) refreshed.push("trd");
      return { refreshed };
    }

    case "plan": {
      const planJson = await readWorkspaceFile(sandboxId, ".openclaw/plan/architecture.json");
      if (!planJson) return { refreshed: [], error: "no_workspace_file" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(planJson);
      } catch {
        return { refreshed: [], error: "invalid_json" };
      }
      const { normalizePlan } = await import("./plan-formatter");
      const plan = normalizePlan(parsed as Record<string, unknown>);
      setters.setArchitecturePlan(plan);
      return { refreshed: ["plan"] };
    }

    case "build_report": {
      const reportJson = await readWorkspaceFile(sandboxId, ".openclaw/build/build-report.json");
      if (!reportJson) return { refreshed: [], error: "no_workspace_file" };
      let report: BuildReport;
      try {
        report = JSON.parse(reportJson) as BuildReport;
      } catch {
        return { refreshed: [], error: "invalid_json" };
      }
      setters.setBuildReport(report);
      return { refreshed: ["build_report"] };
    }

    // research / review / test_report have no canonical workspace file
    // owned by the architect, so there's nothing to refetch.
    default:
      return { refreshed: [] };
  }
}

// ─── Backend reconciliation ────────────────────────────────────────────────

/**
 * Fire-and-forget POST to /api/agents/:id/forge/sync-plan. The backend reads
 * PRD.md, TRD.md, and architecture.json from the sandbox workspace and
 * writes them into the agent's DB columns (discovery_documents, skill_graph,
 * etc.). Defense in depth against the failure mode where the architect's
 * chat-turn-end SSE event doesn't fire (gateway WS drops mid-turn, edit
 * tool falls back to shell rewrites without a closing marker) — without
 * this, the DB stays stale relative to the workspace and the next page
 * reload renders pre-revision content from the backend.
 *
 * Safe to call repeatedly. Errors are swallowed (the in-memory copilot
 * store has already been updated by refetchArtifactFromWorkspace, so a
 * sync failure only affects the next reload, not the current view).
 */
export async function triggerBackendDiscoverySync(agentId: string): Promise<void> {
  if (!agentId) return;
  try {
    const { fetchBackendWithAuth } = await import("@/lib/auth/backend-fetch");
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const res = await fetchBackendWithAuth(
      `${API_BASE}/api/agents/${agentId}/forge/sync-plan`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );
    if (!res.ok) {
      console.warn(`[artifact-refresh] sync-plan → ${res.status}`);
    }
  } catch (err) {
    console.warn("[artifact-refresh] sync-plan failed:", err);
  }
}
