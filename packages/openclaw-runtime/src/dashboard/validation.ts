/**
 * Dashboard manifest — cross-validation rules.
 *
 * Implements: docs/spec/openclaw-v1/010-dashboard-panels.md §validation
 *
 * Substrate-enforceable rules (no I/O):
 *   - Schema (auto)
 *   - Panel ID uniqueness
 *   - default_landing_panel ∈ panels[].id
 *   - Each role.landing_panel ∈ role.visible_panels
 *   - Each role.visible_panels[i] ∈ panels[].id
 *   - Each navigation.groups[i].panels[j] ∈ panels[].id
 *   - Each navigation.groups[i].visible_to_roles ⊆ role.name set
 *   - Action-permission cross-check: every action.permission appears in
 *     at least one role's permissions[] (otherwise nobody can run it)
 *
 * Rules deferred to filesystem-layer adapters (out of substrate scope):
 *   - Custom panel implementation_path exists
 *   - Data sources resolvable (referenced doc/metric/eval suite present)
 *   - Memory-confirm permissions cross-checked against pipeline manifest's
 *     memory_authority (would require coupling dashboard validation to
 *     pipeline manifest — adapter does that combined check)
 */

import { DashboardManifestSchema } from "./schemas";
import type { DashboardManifest, PanelAction } from "./types";

// ─── Validation findings ──────────────────────────────────────────────

export type DashboardValidationSeverity = "error" | "warning";

export interface DashboardValidationFinding {
  readonly severity: DashboardValidationSeverity;
  readonly rule: string;
  readonly message: string;
  readonly path?: string;
}

export interface DashboardValidationReport {
  readonly ok: boolean;
  readonly findings: ReadonlyArray<DashboardValidationFinding>;
  readonly errors: number;
  readonly warnings: number;
}

// ─── Errors ───────────────────────────────────────────────────────────

export class DashboardManifestInvalidError extends Error {
  readonly category = "manifest_invalid" as const;
  constructor(public readonly report: DashboardValidationReport) {
    const errorLines = report.findings
      .filter((f) => f.severity === "error")
      .slice(0, 10)
      .map((f) => `[${f.rule}${f.path ? ` @ ${f.path}` : ""}] ${f.message}`)
      .join("; ");
    super(
      `dashboard manifest invalid (${report.errors} error${report.errors === 1 ? "" : "s"}, ${report.warnings} warning${report.warnings === 1 ? "" : "s"}): ${errorLines}`,
    );
    this.name = "DashboardManifestInvalidError";
  }
}

// ─── Public API ───────────────────────────────────────────────────────

export function validateDashboardManifest(
  input: unknown,
): DashboardValidationReport {
  const findings: DashboardValidationFinding[] = [];

  const parsed = DashboardManifestSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      findings.push({
        severity: "error",
        rule: "schema",
        message: issue.message,
        path: issue.path.join(".") || undefined,
      });
    }
    return summarise(findings);
  }

  const manifest = parsed.data as unknown as DashboardManifest;

  checkPanelIdUniqueness(manifest, findings);
  checkDefaultLandingExists(manifest, findings);
  checkRoleLandingInVisible(manifest, findings);
  checkRoleVisiblePanelsExist(manifest, findings);
  checkNavigationPanelsExist(manifest, findings);
  checkNavigationVisibleRolesExist(manifest, findings);
  checkPanelRoleVisibilityExists(manifest, findings);
  checkActionPermissionsResolve(manifest, findings);

  return summarise(findings);
}

export function assertValidDashboardManifest(input: unknown): DashboardManifest {
  const report = validateDashboardManifest(input);
  if (!report.ok) {
    throw new DashboardManifestInvalidError(report);
  }
  return input as DashboardManifest;
}

// ─── Individual checks ────────────────────────────────────────────────

function checkPanelIdUniqueness(
  m: DashboardManifest,
  findings: DashboardValidationFinding[],
): void {
  const seen = new Map<string, number>();
  m.panels.forEach((p, i) => {
    const prior = seen.get(p.id);
    if (prior !== undefined) {
      findings.push({
        severity: "error",
        rule: "panel-id-unique",
        message: `panel id "${p.id}" appears at index ${prior} and again at ${i}; ids must be unique`,
        path: `panels[${i}].id`,
      });
    } else {
      seen.set(p.id, i);
    }
  });
}

function checkDefaultLandingExists(
  m: DashboardManifest,
  findings: DashboardValidationFinding[],
): void {
  const ids = new Set(m.panels.map((p) => p.id));
  if (!ids.has(m.default_landing_panel)) {
    findings.push({
      severity: "error",
      rule: "default-landing-exists",
      message: `default_landing_panel "${m.default_landing_panel}" not found in panels[]`,
      path: "default_landing_panel",
    });
  }
}

function checkRoleLandingInVisible(
  m: DashboardManifest,
  findings: DashboardValidationFinding[],
): void {
  m.role_visibility.roles.forEach((role, i) => {
    if (!role.landing_panel) return;
    if (!role.visible_panels.includes(role.landing_panel)) {
      findings.push({
        severity: "error",
        rule: "role-landing-in-visible",
        message: `role "${role.name}" landing_panel "${role.landing_panel}" not in its visible_panels`,
        path: `role_visibility.roles[${i}].landing_panel`,
      });
    }
  });
}

function checkRoleVisiblePanelsExist(
  m: DashboardManifest,
  findings: DashboardValidationFinding[],
): void {
  const ids = new Set(m.panels.map((p) => p.id));
  m.role_visibility.roles.forEach((role, i) => {
    role.visible_panels.forEach((panelId, j) => {
      if (!ids.has(panelId)) {
        findings.push({
          severity: "error",
          rule: "role-visible-panel-exists",
          message: `role "${role.name}" references unknown panel "${panelId}" in visible_panels`,
          path: `role_visibility.roles[${i}].visible_panels[${j}]`,
        });
      }
    });
  });
}

function checkNavigationPanelsExist(
  m: DashboardManifest,
  findings: DashboardValidationFinding[],
): void {
  const ids = new Set(m.panels.map((p) => p.id));
  m.navigation.groups.forEach((group, i) => {
    group.panels.forEach((panelId, j) => {
      if (!ids.has(panelId)) {
        findings.push({
          severity: "error",
          rule: "nav-panel-exists",
          message: `navigation group "${group.label}" references unknown panel "${panelId}"`,
          path: `navigation.groups[${i}].panels[${j}]`,
        });
      }
    });
  });
}

function checkNavigationVisibleRolesExist(
  m: DashboardManifest,
  findings: DashboardValidationFinding[],
): void {
  const roleNames = new Set(m.role_visibility.roles.map((r) => r.name));
  m.navigation.groups.forEach((group, i) => {
    group.visible_to_roles?.forEach((roleName, j) => {
      if (!roleNames.has(roleName)) {
        findings.push({
          severity: "error",
          rule: "nav-role-exists",
          message: `navigation group "${group.label}" references unknown role "${roleName}"`,
          path: `navigation.groups[${i}].visible_to_roles[${j}]`,
        });
      }
    });
  });
}

/**
 * Symmetric to `nav-role-exists` but for per-panel `role_visibility`.
 * A panel that lists `role_visibility: ["typo_role"]` silently locks
 * itself to nobody — same defect class as misspelt nav roles.
 *
 * Empty `role_visibility: []` is treated as "no constraint" (the panel
 * is visible to any role whose `visible_panels` includes its id) — this
 * rule only fires for non-empty arrays containing unknown role names.
 */
function checkPanelRoleVisibilityExists(
  m: DashboardManifest,
  findings: DashboardValidationFinding[],
): void {
  const roleNames = new Set(m.role_visibility.roles.map((r) => r.name));
  m.panels.forEach((panel, pi) => {
    panel.role_visibility?.forEach((roleName, ri) => {
      if (!roleNames.has(roleName)) {
        findings.push({
          severity: "error",
          rule: "panel-role-visibility-exists",
          message: `panel "${panel.id}" references unknown role "${roleName}" in role_visibility`,
          path: `panels[${pi}].role_visibility[${ri}]`,
        });
      }
    });
  });
}

/**
 * For every action that requires a permission, at least one role must
 * BOTH (a) be able to see the panel AND (b) hold the permission.
 *
 * Earlier revision only checked global existence — a permission held by
 * any role passed even when no role with that permission could see the
 * panel. The result: a panel action that's visible to one user group
 * but the permission is held by a different group entirely → every
 * user who sees the action gets a 403.
 *
 * Visibility precedence:
 *   - role can see panel iff panel.id ∈ role.visible_panels
 *   - AND (panel has no per-panel role_visibility OR role.name ∈ panel.role_visibility)
 */
function checkActionPermissionsResolve(
  m: DashboardManifest,
  findings: DashboardValidationFinding[],
): void {
  m.panels.forEach((panel, pi) => {
    panel.actions?.forEach((action: PanelAction, ai: number) => {
      if (!action.permission) return;

      const reachable = m.role_visibility.roles.some((role) => {
        const roleSeesPanel =
          role.visible_panels.includes(panel.id) &&
          (!panel.role_visibility ||
            panel.role_visibility.length === 0 ||
            panel.role_visibility.includes(role.name));
        const roleHasPermission = role.permissions.includes(action.permission!);
        return roleSeesPanel && roleHasPermission;
      });

      if (!reachable) {
        findings.push({
          severity: "error",
          rule: "action-permission-resolves",
          message: `panel "${panel.id}" action "${action.label}" requires permission "${action.permission}" but no role both sees the panel AND holds the permission — the action is unreachable for every user`,
          path: `panels[${pi}].actions[${ai}].permission`,
        });
      }
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function summarise(
  findings: ReadonlyArray<DashboardValidationFinding>,
): DashboardValidationReport {
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === "error") errors++;
    else warnings++;
  }
  return { ok: errors === 0, findings, errors, warnings };
}
