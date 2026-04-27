/**
 * Conformance runner — Layer-1 substrate slice.
 *
 * Implements: docs/spec/openclaw-v1/101-conformance.md (Layer-1 only)
 *
 * Bundles every substrate-shipped validator into one report so callers
 * (CI, dashboard, agent-builder) get a single yes/no answer with a
 * structured finding list. Runs in milliseconds — no I/O.
 *
 * Out of scope (Layers 2 + 3 — runtime / architect harness):
 *   - Tool-flag fuzzer (read-only / concurrency-safe verification)
 *   - Workspace-scope adversarial probes
 *   - Idempotency chaos test under interruption
 *   - Eval-suite execution
 *   - Architect quality bar (vague souls, generic anti-examples, etc.)
 */

import { validateDashboardManifest } from "../dashboard/validation";
import type { DashboardManifest } from "../dashboard/types";
import type { PipelineManifest } from "../pipeline-manifest/types";
import { validatePipelineManifest } from "../pipeline-manifest/validation";
import { runCrossArtifactChecks } from "./cross-checks";
import {
  dashboardFindingToConformance,
  pipelineManifestFindingToConformance,
  type ConformanceFinding,
  type ConformanceReport,
} from "./types";

// ─── Public entry ─────────────────────────────────────────────────────

export interface ConformanceInput {
  /** Pipeline manifest object (typed or raw — the runner re-validates). */
  readonly pipelineManifest?: unknown;
  /** Dashboard manifest object — optional; pipelines may ship without one. */
  readonly dashboardManifest?: unknown;
}

/**
 * Run every substrate validator against the supplied artifacts and
 * return one aggregated report.
 *
 *   ok = no errors across any validator (warnings allowed)
 *
 * Validators run independently — a failure in one doesn't short-circuit
 * the others; the goal is to give the caller every actionable finding
 * in a single pass.
 */
export function runConformance(input: ConformanceInput): ConformanceReport {
  const findings: ConformanceFinding[] = [];

  let parsedPipeline: PipelineManifest | undefined;
  let parsedDashboard: DashboardManifest | undefined;

  if (input.pipelineManifest !== undefined) {
    const r = validatePipelineManifest(input.pipelineManifest);
    for (const f of r.findings) findings.push(pipelineManifestFindingToConformance(f));
    if (r.ok) parsedPipeline = input.pipelineManifest as PipelineManifest;
  }

  if (input.dashboardManifest !== undefined) {
    const r = validateDashboardManifest(input.dashboardManifest);
    for (const f of r.findings) findings.push(dashboardFindingToConformance(f));
    if (r.ok) parsedDashboard = input.dashboardManifest as DashboardManifest;
  }

  // Cross-artifact checks only run when both artifacts schema-validated.
  // A schema failure in either means the cross-checks would operate on
  // malformed data — the per-artifact findings already surface the
  // primary problem.
  if (parsedPipeline !== undefined || parsedDashboard !== undefined) {
    const cross = runCrossArtifactChecks({
      ...(parsedPipeline !== undefined ? { pipelineManifest: parsedPipeline } : {}),
      ...(parsedDashboard !== undefined ? { dashboardManifest: parsedDashboard } : {}),
    });
    findings.push(...cross);
  }

  return summarise(findings);
}

/** Throwing variant: aborts with `ConformanceError` on any error finding. */
export function assertConformant(input: ConformanceInput): ConformanceReport {
  const report = runConformance(input);
  if (!report.ok) {
    throw new ConformanceError(report);
  }
  return report;
}

export class ConformanceError extends Error {
  readonly category = "manifest_invalid" as const;
  constructor(public readonly report: ConformanceReport) {
    const lines = report.findings
      .filter((f) => f.severity === "error")
      .slice(0, 10)
      .map(
        (f) =>
          `[${f.source}/${f.rule}${f.path ? ` @ ${f.path}` : ""}] ${f.message}`,
      )
      .join("; ");
    super(
      `pipeline conformance failed (${report.errors} error${
        report.errors === 1 ? "" : "s"
      }, ${report.warnings} warning${report.warnings === 1 ? "" : "s"}): ${lines}`,
    );
    this.name = "ConformanceError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function summarise(findings: ReadonlyArray<ConformanceFinding>): ConformanceReport {
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === "error") errors++;
    else warnings++;
  }
  return { ok: errors === 0, findings, errors, warnings };
}
