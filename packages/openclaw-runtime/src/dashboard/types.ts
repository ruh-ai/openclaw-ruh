/**
 * Dashboard panel substrate — types.
 *
 * Implements: docs/spec/openclaw-v1/010-dashboard-panels.md
 * Mirrors:    docs/spec/openclaw-v1/schemas/dashboard.schema.json
 *
 * The substrate provides:
 *   - Shapes for the dashboard manifest (DashboardManifest, PanelInstance,
 *     DataSource, PanelAction, RoleVisibilityRules, NavigationConfig,
 *     BrandingConfig, RefreshConfig)
 *   - Cross-validation rules every adapter runs at pipeline load
 *
 * Out of scope (deferred to runtime / UI layers):
 *   - The actual panel components (React or otherwise)
 *   - Data-source query execution (panels reference APIs the runtime
 *     resolves separately)
 *   - Live-refresh subscription wiring (runtime layer attaches hook
 *     listeners + debounces)
 *   - Custom panel security review enforcement (filesystem-layer adapter
 *     verifies implementation_path)
 */

// ─── Panel kinds (canonical library) ──────────────────────────────────

export type PanelKind =
  | "chat"
  | "queue"
  | "timeline"
  | "table"
  | "form"
  | "kpi"
  | "map"
  | "decision-log-explorer"
  | "eval-results"
  | "custom";

export const PANEL_KINDS: ReadonlyArray<PanelKind> = [
  "chat",
  "queue",
  "timeline",
  "table",
  "form",
  "kpi",
  "map",
  "decision-log-explorer",
  "eval-results",
  "custom",
];

// ─── Data source kinds ────────────────────────────────────────────────

export type DataSourceKind =
  | "decision-log-query"
  | "memory-query"
  | "memory-pending-query"
  | "config-query"
  | "metric-query"
  | "eval-task-query"
  | "workspace-file"
  | "custom";

export const DATA_SOURCE_KINDS: ReadonlyArray<DataSourceKind> = [
  "decision-log-query",
  "memory-query",
  "memory-pending-query",
  "config-query",
  "metric-query",
  "eval-task-query",
  "workspace-file",
  "custom",
];

/**
 * Data source shape. Open-ended (`additionalProperties: true` in the
 * spec) so each kind can carry its own typed query payload — the runtime
 * resolves the kind-specific shape against its corresponding API.
 */
export interface DataSource {
  readonly kind: DataSourceKind;
  readonly [key: string]: unknown;
}

// ─── Panel action kinds ───────────────────────────────────────────────

export type PanelActionKind =
  | "navigate"
  | "agent-call"
  | "memory-confirm"
  | "memory-reject"
  | "config-edit"
  | "download"
  | "external-link"
  | "custom";

export const PANEL_ACTION_KINDS: ReadonlyArray<PanelActionKind> = [
  "navigate",
  "agent-call",
  "memory-confirm",
  "memory-reject",
  "config-edit",
  "download",
  "external-link",
  "custom",
];

/** Mutating action kinds — schema requires a permission declaration. */
export const MUTATING_ACTION_KINDS: ReadonlyArray<PanelActionKind> = [
  "memory-confirm",
  "memory-reject",
  "config-edit",
];

export interface PanelAction {
  readonly label: string;
  readonly kind: PanelActionKind;
  readonly permission?: string;
  readonly requires_reason?: boolean;
  readonly [key: string]: unknown;
}

// ─── Refresh config ───────────────────────────────────────────────────

export interface RefreshConfig {
  /** Poll every N seconds. Schema bounds: 5..3600 (per spec anti-stampede rule). */
  readonly interval_seconds?: number;
  /** Refresh when these hooks fire. */
  readonly on_event?: ReadonlyArray<string>;
  /** User must click refresh — disables auto-refresh. */
  readonly manual_only?: boolean;
}

// ─── Panel instance ───────────────────────────────────────────────────

export interface PanelInstance {
  readonly kind: PanelKind;
  /** kebab-case panel id, unique within the dashboard. */
  readonly id: string;
  readonly title: string;
  readonly data_source?: DataSource;
  readonly actions?: ReadonlyArray<PanelAction>;
  readonly refresh?: RefreshConfig;
  /** When set, only listed roles see this panel. */
  readonly role_visibility?: ReadonlyArray<string>;
  // Required when kind === "custom":
  readonly permission_to_register?: string;
  readonly security_reviewed_at?: string;
  readonly security_reviewed_by?: string;
  /** Permits panel-kind-specific fields without losing type safety on the rest. */
  readonly [key: string]: unknown;
}

// ─── Branding ─────────────────────────────────────────────────────────

export interface BrandingConfig {
  readonly primary_color?: string;
  readonly secondary_color?: string;
  readonly accent_color?: string;
  readonly logo_path?: string;
  readonly favicon_path?: string;
  readonly font_stack?: string;
  readonly custom_css_path?: string;
}

// ─── Navigation ───────────────────────────────────────────────────────

export type NavigationLayout = "sidebar" | "topbar" | "hybrid";

export interface NavigationGroup {
  readonly label: string;
  readonly icon?: string;
  /** Panel IDs in display order. */
  readonly panels: ReadonlyArray<string>;
  /** When set, only listed roles see this group. */
  readonly visible_to_roles?: ReadonlyArray<string>;
}

export interface NavigationConfig {
  readonly layout: NavigationLayout;
  readonly groups: ReadonlyArray<NavigationGroup>;
}

// ─── Role visibility ──────────────────────────────────────────────────

export interface DashboardRole {
  /** snake_case identifier. */
  readonly name: string;
  readonly description: string;
  /** Identities (emails) or group references granted this role. */
  readonly granted_to: ReadonlyArray<string>;
  /** Permission strings the role holds (e.g. "memory:confirm:estimating"). */
  readonly permissions: ReadonlyArray<string>;
  /** Panel IDs visible to this role. */
  readonly visible_panels: ReadonlyArray<string>;
  /** Override default landing panel for this role. Must be in `visible_panels`. */
  readonly landing_panel?: string;
}

export interface RoleVisibilityRules {
  readonly roles: ReadonlyArray<DashboardRole>;
}

// ─── Top-level dashboard manifest ─────────────────────────────────────

export interface DashboardManifest {
  readonly spec_version: string;
  readonly pipeline_id: string;
  readonly title: string;
  readonly description: string;
  readonly branding?: BrandingConfig;
  readonly panels: ReadonlyArray<PanelInstance>;
  readonly navigation: NavigationConfig;
  /** Panel ID the dashboard lands on by default (overridable per role). */
  readonly default_landing_panel: string;
  readonly role_visibility: RoleVisibilityRules;
}
