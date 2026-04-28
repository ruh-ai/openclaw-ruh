/**
 * ship-conformance-check.ts — Ship-stage gate that validates the agent's
 * pipeline manifest against the OpenClaw v1 spec via
 * `POST /api/conformance/check` before deploy.
 *
 * The gate fails CLOSED on any infrastructure failure: HTTP error, network
 * failure, JSON parse failure, missing report shape. A conformance gate
 * that lets deploy proceed when it can't actually validate is worse than
 * no gate at all — it creates the false impression of safety while
 * shipping invalid manifests silently.
 *
 * Soft skip is reserved exclusively for the "no manifest in workspace yet"
 * case — Path A tolerates this since not every Plan run has flushed the
 * manifest to disk yet. Path B will turn this into a hard block once
 * manifest emission is on the critical path.
 *
 * Spec reference: docs/spec/openclaw-v1/101-conformance.md
 *                 docs/knowledge-base/specs/SPEC-builder-pipeline-manifest.md
 */

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * Discriminated outcome from the gate.
 * - `ok`       — manifest validates (or only carries warnings + the expected
 *                Path-A `dashboard-manifest-required` finding)
 * - `skipped`  — no manifest in workspace yet; Path A allows deploy to proceed
 * - `blocked`  — deploy MUST NOT proceed. Used for both substrate-reported
 *                errors AND for any condition where the validator could not
 *                run (HTTP failure, parse failure, malformed response).
 */
export type ConformanceCheckOutcome =
  | { status: "ok" }
  | { status: "skipped" }
  | { status: "blocked"; reasons: string[] };

interface ConformanceFinding {
  severity: "error" | "warning";
  rule: string;
  message: string;
}

/**
 * Dependencies — injected so the gate is testable without hitting the real
 * workspace or backend. Production callers use the default in
 * `runDeployConformanceCheck`.
 */
export interface ShipConformanceDeps {
  readWorkspaceFile: (sandboxId: string, path: string) => Promise<string | null>;
  fetchBackend: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => Promise<Response>;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Production entry point — wires the real workspace reader + auth-aware
 * fetch into the testable core below.
 */
export async function runDeployConformanceCheck(
  agentSandboxId: string | null,
  apiBase: string,
): Promise<ConformanceCheckOutcome> {
  if (!agentSandboxId) return { status: "skipped" };

  const { readWorkspaceFile } = await import("@/lib/openclaw/workspace-writer");
  const { fetchBackendWithAuth } = await import("@/lib/auth/backend-fetch");

  return runDeployConformanceCheckWithDeps(agentSandboxId, apiBase, {
    readWorkspaceFile,
    fetchBackend: (url, init) => fetchBackendWithAuth(url, init),
  });
}

/**
 * Testable core. Same logic as `runDeployConformanceCheck` but with all
 * I/O delegated to the `deps` argument so unit tests can simulate every
 * branch — workspace miss, network failure, HTTP 500, malformed JSON,
 * substrate-reported errors, success.
 */
export async function runDeployConformanceCheckWithDeps(
  agentSandboxId: string,
  apiBase: string,
  deps: ShipConformanceDeps,
): Promise<ConformanceCheckOutcome> {
  // ── 1. Read the manifest from the agent's copilot workspace ───────────
  let manifest: unknown;
  try {
    const manifestJson = await deps.readWorkspaceFile(
      agentSandboxId,
      ".openclaw/plan/pipeline-manifest.json",
    );
    if (!manifestJson) {
      // Path A soft-skip: no manifest yet, deploy proceeds. Path B turns
      // this into a hard block once emission is on the critical path.
      return { status: "skipped" };
    }
    manifest = JSON.parse(manifestJson);
  } catch (err) {
    return {
      status: "blocked",
      reasons: [
        `Could not read or parse .openclaw/plan/pipeline-manifest.json: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  // ── 2. Hit the conformance endpoint ───────────────────────────────────
  let res: Response;
  try {
    res = await deps.fetchBackend(`${apiBase}/api/conformance/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineManifest: manifest }),
    });
  } catch (err) {
    return {
      status: "blocked",
      reasons: [
        `Conformance check did not run (network/auth failure): ${err instanceof Error ? err.message : String(err)}. Deploy blocked — fix the platform connection or retry.`,
      ],
    };
  }

  if (!res.ok) {
    return {
      status: "blocked",
      reasons: [
        `Conformance check returned HTTP ${res.status} — validator did not run. Deploy blocked.`,
      ],
    };
  }

  // ── 3. Parse the report ───────────────────────────────────────────────
  let data: { report?: { findings?: ConformanceFinding[] } };
  try {
    data = (await res.json()) as { report?: { findings?: ConformanceFinding[] } };
  } catch (err) {
    return {
      status: "blocked",
      reasons: [
        `Conformance response was not valid JSON: ${err instanceof Error ? err.message : String(err)}. Deploy blocked.`,
      ],
    };
  }

  const findings = data?.report?.findings;
  if (!Array.isArray(findings)) {
    return {
      status: "blocked",
      reasons: [
        "Conformance response missing report.findings[] — validator output malformed. Deploy blocked.",
      ],
    };
  }

  // Path A tolerates `dashboard-manifest-required`: we don't emit a dashboard
  // manifest yet, so the substrate (correctly) reports the dashboard side is
  // missing. Path B emits the dashboard manifest and removes this filter.
  const blocking = findings
    .filter((f) => f.severity === "error" && f.rule !== "dashboard-manifest-required")
    .map((f) => `[${f.rule}] ${f.message}`);

  return blocking.length > 0
    ? { status: "blocked", reasons: blocking }
    : { status: "ok" };
}
