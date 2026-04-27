// Public surface of the dashboard panel substrate (Phase 3a).

export type {
  PanelKind,
  DataSourceKind,
  DataSource,
  PanelActionKind,
  PanelAction,
  RefreshConfig,
  PanelInstance,
  BrandingConfig,
  NavigationLayout,
  NavigationGroup,
  NavigationConfig,
  DashboardRole,
  RoleVisibilityRules,
  DashboardManifest,
} from "./types";

export {
  PANEL_KINDS,
  DATA_SOURCE_KINDS,
  PANEL_ACTION_KINDS,
  MUTATING_ACTION_KINDS,
} from "./types";

export {
  PanelKindSchema,
  DataSourceKindSchema,
  DataSourceSchema,
  PanelActionKindSchema,
  PanelActionSchema,
  RefreshConfigSchema,
  PanelInstanceSchema,
  BrandingConfigSchema,
  NavigationLayoutSchema,
  NavigationGroupSchema,
  NavigationConfigSchema,
  DashboardRoleSchema,
  RoleVisibilityRulesSchema,
  DashboardManifestSchema,
} from "./schemas";

export type {
  DashboardValidationSeverity,
  DashboardValidationFinding,
  DashboardValidationReport,
} from "./validation";
export {
  validateDashboardManifest,
  assertValidDashboardManifest,
  DashboardManifestInvalidError,
} from "./validation";
