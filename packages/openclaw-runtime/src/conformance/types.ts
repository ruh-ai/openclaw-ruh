/**
 * Conformance — types.
 *
 * Implements: docs/spec/openclaw-v1/101-conformance.md (Layer-1 slice)
 *
 * The substrate covers Layer-1 of conformance: continuous runtime
 * validation + static cross-artifact checks. Layers 2 (CI fuzzers,
 * tool flag honesty, idempotency chaos) and 3 (architect quality bar)
 * live in the runtime + architect harness, not the substrate library.
 *
 * What this module ships:
 *   - A `ConformanceReport` shape that aggregates findings from every
 *     substrate validator (pipeline manifest, dashboard manifest, ...)
 *   - `runConformance()` — runs every available validator on the inputs
 *     it's given and merges the reports
 *   - Cross-artifact checks the individual modules can't do alone:
 *       - dashboard role permissions resolve against pipeline
 *         memory_authority (e.g., a role granted
 *         "memory:confirm:estimating" must include identities present at
 *         Tier-1 in that lane)
 *       - dashboard's pipeline_id matches the pipeline manifest's id
 *       - dashboard's spec_version is compatible with the pipeline's
 */

import type {
  DashboardValidationFinding,
} from "../dashboard/validation";
import type { ValidationFinding } from "../pipeline-manifest/validation";

// ─── Findings ─────────────────────────────────────────────────────────

export type ConformanceSeverity = "error" | "warning";

export interface ConformanceFinding {
  readonly severity: ConformanceSeverity;
  readonly source:
    | "pipeline-manifest"
    | "dashboard-manifest"
    | "cross-artifact"
    | "spec-version";
  readonly rule: string;
  readonly message: string;
  /** Path inside the artifact (e.g. "panels[2].id"). */
  readonly path?: string;
  /** When `cross-artifact`, the two artifact roles that disagreed. */
  readonly involves?: ReadonlyArray<string>;
}

export interface ConformanceReport {
  readonly ok: boolean;
  readonly findings: ReadonlyArray<ConformanceFinding>;
  readonly errors: number;
  readonly warnings: number;
}

// ─── Adapters from per-module finding shapes ─────────────────────────

export function pipelineManifestFindingToConformance(
  finding: ValidationFinding,
): ConformanceFinding {
  return {
    severity: finding.severity,
    source: "pipeline-manifest",
    rule: finding.rule,
    message: finding.message,
    ...(finding.path !== undefined ? { path: finding.path } : {}),
  };
}

export function dashboardFindingToConformance(
  finding: DashboardValidationFinding,
): ConformanceFinding {
  return {
    severity: finding.severity,
    source: "dashboard-manifest",
    rule: finding.rule,
    message: finding.message,
    ...(finding.path !== undefined ? { path: finding.path } : {}),
  };
}
