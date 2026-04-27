/**
 * Cross-artifact conformance checks — pure, deterministic.
 *
 * These rules can only run when more than one artifact is in scope.
 * The single-artifact validators in pipeline-manifest/ and dashboard/
 * cover everything internal to one document; the rules here verify the
 * artifacts agree with each other.
 */

import type { DashboardManifest, DashboardRole } from "../dashboard/types";
import type {
  MemoryAuthority,
  MemoryAuthorityRow,
} from "../memory/types";
import type { PipelineManifest } from "../pipeline-manifest/types";
import type { ConformanceFinding } from "./types";

// ─── Public entry ─────────────────────────────────────────────────────

export interface CrossCheckInput {
  readonly pipelineManifest?: PipelineManifest;
  readonly dashboardManifest?: DashboardManifest;
}

/**
 * Run every cross-artifact rule and return the findings. Skip rules
 * whose required artifacts weren't supplied. Pure — no I/O.
 */
export function runCrossArtifactChecks(
  input: CrossCheckInput,
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  if (input.pipelineManifest && input.dashboardManifest) {
    checkPipelineIdAlignment(
      input.pipelineManifest,
      input.dashboardManifest,
      findings,
    );
    checkSpecVersionAlignment(
      input.pipelineManifest,
      input.dashboardManifest,
      findings,
    );
    checkDashboardRefAlignment(
      input.pipelineManifest,
      input.dashboardManifest,
      findings,
    );
    checkDashboardPermissionsResolveToMemoryAuthority(
      input.pipelineManifest.memory_authority,
      input.dashboardManifest,
      findings,
    );
  }

  return findings;
}

// ─── Individual rules ────────────────────────────────────────────────

function checkPipelineIdAlignment(
  pipeline: PipelineManifest,
  dashboard: DashboardManifest,
  findings: ConformanceFinding[],
): void {
  if (pipeline.id !== dashboard.pipeline_id) {
    findings.push({
      severity: "error",
      source: "cross-artifact",
      rule: "pipeline-id-alignment",
      message: `pipeline-manifest.id "${pipeline.id}" does not match dashboard-manifest.pipeline_id "${dashboard.pipeline_id}"`,
      involves: ["pipeline-manifest", "dashboard-manifest"],
    });
  }
}

function checkSpecVersionAlignment(
  pipeline: PipelineManifest,
  dashboard: DashboardManifest,
  findings: ConformanceFinding[],
): void {
  // Strict equality — both artifacts target the same spec version.
  // (Different tolerance would mean dashboard fields could diverge from
  // pipeline schema expectations; not allowed in v1.)
  if (pipeline.spec_version !== dashboard.spec_version) {
    findings.push({
      severity: "error",
      source: "cross-artifact",
      rule: "spec-version-alignment",
      message: `pipeline.spec_version "${pipeline.spec_version}" ≠ dashboard.spec_version "${dashboard.spec_version}"`,
      involves: ["pipeline-manifest", "dashboard-manifest"],
    });
  }
}

/**
 * The pipeline manifest's `dashboard` is a stub referring to the full
 * dashboard manifest. Required fields on both must agree:
 *
 *   - default_landing_panel — error in BOTH cases:
 *       (a) pipeline's value isn't a real panel id in the dashboard, or
 *       (b) pipeline's value differs from the dashboard's own
 *           default_landing_panel.
 *     The substrate cannot predict which the runtime will resolve to,
 *     and divergent stubs let users land on the wrong panel — that's a
 *     functional defect, not a style nit. (Earlier revision marked (b)
 *     as a warning; tightened on review pass.)
 *
 *   - title — warning when they differ (pipeline's stub usually mirrors
 *     the dashboard's title, but the pipeline-stub's title can
 *     legitimately be a deployment-name with the dashboard carrying a
 *     UI brand-name; cosmetic conventions, not load-bearing).
 */
function checkDashboardRefAlignment(
  pipeline: PipelineManifest,
  dashboard: DashboardManifest,
  findings: ConformanceFinding[],
): void {
  const refLanding = pipeline.dashboard.default_landing_panel;
  const panelIds = new Set(dashboard.panels.map((p) => p.id));

  if (!panelIds.has(refLanding)) {
    findings.push({
      severity: "error",
      source: "cross-artifact",
      rule: "dashboard-default-landing-exists",
      message: `pipeline.dashboard.default_landing_panel "${refLanding}" not found in dashboard.panels[]`,
      path: "dashboard.default_landing_panel",
      involves: ["pipeline-manifest.dashboard", "dashboard-manifest.panels"],
    });
  } else if (refLanding !== dashboard.default_landing_panel) {
    findings.push({
      severity: "error",
      source: "cross-artifact",
      rule: "dashboard-default-landing-mismatch",
      message: `pipeline.dashboard.default_landing_panel "${refLanding}" differs from dashboard.default_landing_panel "${dashboard.default_landing_panel}" — the substrate cannot predict which the runtime resolves; users could land on the wrong panel`,
      path: "dashboard.default_landing_panel",
      involves: ["pipeline-manifest.dashboard", "dashboard-manifest"],
    });
  }

  if (pipeline.dashboard.title !== dashboard.title) {
    findings.push({
      severity: "warning",
      source: "cross-artifact",
      rule: "dashboard-title-mismatch",
      message: `pipeline.dashboard.title "${pipeline.dashboard.title}" ≠ dashboard.title "${dashboard.title}" — usually the stub mirrors the dashboard's title; cosmetic only`,
      path: "dashboard.title",
      involves: ["pipeline-manifest.dashboard", "dashboard-manifest"],
    });
  }
}

/**
 * Per spec 010 anti-example "Role with broad visibility but narrow
 * permissions": a role granted `memory:confirm:<lane>` must include
 * identities listed at Tier-1 in that lane in the pipeline's
 * `memory_authority`. Otherwise the role can show the approval panel
 * but not actually approve — defective.
 *
 * Permission grammar parsed: `memory:confirm:<lane>` only. Other
 * permission strings are pass-through (substrate doesn't infer their
 * cross-artifact meaning).
 */
function checkDashboardPermissionsResolveToMemoryAuthority(
  authority: MemoryAuthority,
  dashboard: DashboardManifest,
  findings: ConformanceFinding[],
): void {
  const tier1ByLane = buildTier1IdentityMap(authority);

  dashboard.role_visibility.roles.forEach((role, ri) => {
    role.permissions.forEach((permission) => {
      const lane = parseMemoryConfirmPermission(permission);
      if (!lane) return; // permission isn't a memory-confirm grant — skip
      const tier1Identities = tier1ByLane.get(lane);
      if (!tier1Identities || tier1Identities.size === 0) {
        findings.push({
          severity: "error",
          source: "cross-artifact",
          rule: "memory-confirm-needs-tier1",
          message: `dashboard role "${role.name}" has permission "${permission}" but pipeline memory_authority has no Tier-1 writers for lane "${lane}"`,
          path: `role_visibility.roles[${ri}].permissions`,
          involves: ["dashboard-manifest", "pipeline-manifest.memory_authority"],
        });
        return;
      }
      // Every identity in role.granted_to MUST appear in the lane's Tier-1
      // writer list. A mismatch means the role purports to confirm writes
      // it has no authority over.
      assertGrantedIdentitiesInTier1(
        role,
        ri,
        permission,
        lane,
        tier1Identities,
        findings,
      );
    });
  });
}

function buildTier1IdentityMap(
  authority: MemoryAuthority,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of authority) {
    if (row.tier !== 1) continue;
    if (!map.has(row.lane)) map.set(row.lane, new Set());
    const set = map.get(row.lane);
    if (!set) continue;
    for (const w of row.writers) set.add(w);
    void (row as MemoryAuthorityRow);
  }
  return map;
}

function parseMemoryConfirmPermission(p: string): string | undefined {
  const parts = p.split(":");
  if (parts.length !== 3) return undefined;
  if (parts[0] !== "memory") return undefined;
  if (parts[1] !== "confirm") return undefined;
  const lane = parts[2];
  return lane && lane.length > 0 ? lane : undefined;
}

function assertGrantedIdentitiesInTier1(
  role: DashboardRole,
  ri: number,
  permission: string,
  lane: string,
  tier1Identities: ReadonlySet<string>,
  findings: ConformanceFinding[],
): void {
  const missing = role.granted_to.filter((id) => !tier1Identities.has(id));
  if (missing.length === 0) return;
  findings.push({
    severity: "error",
    source: "cross-artifact",
    rule: "memory-confirm-grant-mismatch",
    message: `dashboard role "${role.name}" holds "${permission}" but identities [${missing.join(
      ", ",
    )}] are not Tier-1 writers in lane "${lane}" per pipeline memory_authority`,
    path: `role_visibility.roles[${ri}]`,
    involves: ["dashboard-manifest", "pipeline-manifest.memory_authority"],
  });
}
