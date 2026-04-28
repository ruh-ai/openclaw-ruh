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
 *
 * `readWorkspaceFile` contract is **strict** (different from the shared
 * `workspace-writer.ts` helper):
 *   - returns content string when the file exists
 *   - returns null **only** when the backend reports 404 (legitimate absence)
 *   - throws on any other failure — auth (401/403), server (5xx), malformed
 *     response, network error, parse error
 *
 * The strictness matters: the shared `readWorkspaceFile` in
 * `workspace-writer.ts` collapses every non-OK response and parse error to
 * null. That's fine for UI display callers (missing file and backend outage
 * render the same "no content" empty state), but it's wrong for a deploy
 * gate. If we cannot tell the difference between "manifest absent" (Path A
 * soft-skip) and "validator could not run" (must block), the gate becomes
 * theater — a 401 mid-deploy would silently bypass conformance.
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
 * Production entry point — wires a **strict** workspace reader (404 → null,
 * everything else → throw) and an auth-aware fetch into the testable core.
 *
 * The strict reader is intentionally NOT the shared `readWorkspaceFile` in
 * `workspace-writer.ts`. That helper collapses every error to null so UI
 * callers can render a uniform "no content" state. Reusing it here would
 * let a 401 or 5xx during the workspace read silently look like a missing
 * manifest, which the gate then treats as the Path A soft-skip — and the
 * deploy proceeds without ever validating.
 */
export async function runDeployConformanceCheck(
  agentSandboxId: string | null,
  apiBase: string,
): Promise<ConformanceCheckOutcome> {
  if (!agentSandboxId) return { status: "skipped" };

  const { fetchBackendWithAuth } = await import("@/lib/auth/backend-fetch");
  const fetchAuth = (url: string, init?: RequestInit) =>
    fetchBackendWithAuth(url, init);

  return runDeployConformanceCheckWithDeps(agentSandboxId, apiBase, {
    readWorkspaceFile: (sandboxId, path) =>
      strictReadWorkspaceFile(sandboxId, path, apiBase, fetchAuth),
    fetchBackend: (url, init) => fetchAuth(url, init),
  });
}

/**
 * Strict workspace read for the conformance gate.
 *
 * Tries the copilot workspace first (where Plan-complete writes), falls
 * back to the main workspace (where the build merge step copies it).
 *
 * Return contract:
 *   - `string` — file content
 *   - `null` — backend returned 404 from BOTH copilot and main workspace
 *     (file genuinely doesn't exist anywhere yet)
 *   - throws — any other condition (auth failure, 5xx, malformed JSON,
 *     network error, missing `content` field on a 200 response). The
 *     gate's caller catches and converts to `{ status: "blocked" }`.
 *
 * Exported for direct unit testing — callers should use
 * `runDeployConformanceCheck`, not this directly.
 */
export async function strictReadWorkspaceFile(
  sandboxId: string,
  path: string,
  apiBase: string,
  fetchAuth: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<string | null> {
  const enc = encodeURIComponent(path);

  // Copilot workspace
  const copilotUrl = `${apiBase}/api/sandboxes/${sandboxId}/workspace-copilot/file?path=${enc}`;
  const copilotRes = await fetchAuth(copilotUrl);
  if (copilotRes.ok) {
    return extractContent(copilotRes, "workspace-copilot", path);
  }
  if (copilotRes.status !== 404) {
    throw new Error(
      `workspace-copilot read for "${path}" returned HTTP ${copilotRes.status}`,
    );
  }

  // Fall back to main workspace
  const mainUrl = `${apiBase}/api/sandboxes/${sandboxId}/workspace/file?path=${enc}`;
  const mainRes = await fetchAuth(mainUrl);
  if (mainRes.status === 404) return null; // legitimately absent in both
  if (!mainRes.ok) {
    throw new Error(
      `workspace read for "${path}" returned HTTP ${mainRes.status}`,
    );
  }
  return extractContent(mainRes, "workspace", path);
}

async function extractContent(
  res: Response,
  source: string,
  path: string,
): Promise<string> {
  let data: { content?: unknown };
  try {
    data = (await res.json()) as { content?: unknown };
  } catch (err) {
    throw new Error(
      `${source} read for "${path}" returned non-JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof data.content !== "string") {
    throw new Error(
      `${source} read for "${path}" returned 200 but no content string`,
    );
  }
  return data.content;
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
