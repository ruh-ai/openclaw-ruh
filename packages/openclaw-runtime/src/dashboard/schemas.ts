/**
 * Dashboard panel substrate — Zod schemas.
 *
 * Mirrors docs/spec/openclaw-v1/schemas/dashboard.schema.json.
 */

import { z } from "zod";
import type {
  BrandingConfig,
  DashboardManifest,
  DashboardRole,
  DataSource,
  DataSourceKind,
  NavigationConfig,
  NavigationGroup,
  NavigationLayout,
  PanelAction,
  PanelActionKind,
  PanelInstance,
  PanelKind,
  RefreshConfig,
  RoleVisibilityRules,
} from "./types";

const KEBAB_CASE = /^[a-z][a-z0-9-]*$/;
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const SEM_VER = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// ─── Enums ────────────────────────────────────────────────────────────

export const PanelKindSchema = z.enum([
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
]);

const _kindCheck: z.infer<typeof PanelKindSchema> extends PanelKind
  ? true
  : false = true;
void _kindCheck;

export const DataSourceKindSchema = z.enum([
  "decision-log-query",
  "memory-query",
  "memory-pending-query",
  "config-query",
  "metric-query",
  "eval-task-query",
  "workspace-file",
  "custom",
]);

const _dskCheck: z.infer<typeof DataSourceKindSchema> extends DataSourceKind
  ? true
  : false = true;
void _dskCheck;

export const PanelActionKindSchema = z.enum([
  "navigate",
  "agent-call",
  "memory-confirm",
  "memory-reject",
  "config-edit",
  "download",
  "external-link",
  "custom",
]);

const _pakCheck: z.infer<typeof PanelActionKindSchema> extends PanelActionKind
  ? true
  : false = true;
void _pakCheck;

export const NavigationLayoutSchema = z.enum(["sidebar", "topbar", "hybrid"]);

const _navCheck: z.infer<typeof NavigationLayoutSchema> extends NavigationLayout
  ? true
  : false = true;
void _navCheck;

// ─── Branding + refresh ──────────────────────────────────────────────

export const BrandingConfigSchema = z
  .object({
    primary_color: z.string().regex(HEX_COLOR).optional(),
    secondary_color: z.string().regex(HEX_COLOR).optional(),
    accent_color: z.string().regex(HEX_COLOR).optional(),
    logo_path: z.string().optional(),
    favicon_path: z.string().optional(),
    font_stack: z.string().optional(),
    custom_css_path: z.string().optional(),
  })
  .strict();

const _brCheck: z.infer<typeof BrandingConfigSchema> extends BrandingConfig
  ? true
  : false = true;
void _brCheck;

export const RefreshConfigSchema = z
  .object({
    /** Schema enforces 5..3600 per spec §anti-example "live-refresh stampede". */
    interval_seconds: z.number().int().min(5).max(3600).optional(),
    on_event: z.array(z.string()).optional(),
    manual_only: z.boolean().optional(),
  })
  .strict();

const _refCheck: z.infer<typeof RefreshConfigSchema> extends RefreshConfig
  ? true
  : false = true;
void _refCheck;

// ─── DataSource ──────────────────────────────────────────────────────

/**
 * `additionalProperties: true` per spec — each kind carries its own
 * payload (query shape, filter, etc.). Substrate validates the kind and
 * lets the runtime resolver interpret the rest.
 */
export const DataSourceSchema = z
  .object({
    kind: DataSourceKindSchema,
  })
  .passthrough();

const _dsCheck: z.infer<typeof DataSourceSchema> extends DataSource
  ? true
  : false = true;
void _dsCheck;

// ─── PanelAction ─────────────────────────────────────────────────────

const MUTATING_ACTION_SET = new Set([
  "memory-confirm",
  "memory-reject",
  "config-edit",
]);

export const PanelActionSchema = z
  .object({
    label: z.string().min(1),
    kind: PanelActionKindSchema,
    permission: z.string().optional(),
    requires_reason: z.boolean().optional(),
  })
  .passthrough()
  .refine(
    (a) => !MUTATING_ACTION_SET.has(a.kind) || (a.permission && a.permission.length > 0),
    {
      message:
        "mutating actions (memory-confirm / memory-reject / config-edit) MUST declare a `permission`",
    },
  );

const _paCheck: z.infer<typeof PanelActionSchema> extends PanelAction
  ? true
  : false = true;
void _paCheck;

// ─── PanelInstance ───────────────────────────────────────────────────

export const PanelInstanceSchema = z
  .object({
    kind: PanelKindSchema,
    id: z.string().regex(KEBAB_CASE),
    title: z.string().min(1),
    data_source: DataSourceSchema.optional(),
    actions: z.array(PanelActionSchema).optional(),
    refresh: RefreshConfigSchema.optional(),
    role_visibility: z.array(z.string().min(1)).optional(),
    permission_to_register: z.string().optional(),
    security_reviewed_at: z.string().datetime({ offset: true }).optional(),
    security_reviewed_by: z.string().optional(),
  })
  .passthrough()
  .refine(
    (p) =>
      p.kind !== "custom" ||
      (typeof p.security_reviewed_at === "string" &&
        typeof p.security_reviewed_by === "string" &&
        p.security_reviewed_by.length > 0 &&
        typeof p.permission_to_register === "string" &&
        p.permission_to_register.length > 0),
    {
      message:
        "kind:custom requires security_reviewed_at, security_reviewed_by, and permission_to_register",
    },
  );

const _piCheck: z.infer<typeof PanelInstanceSchema> extends PanelInstance
  ? true
  : false = true;
void _piCheck;

// ─── NavigationConfig ────────────────────────────────────────────────

export const NavigationGroupSchema = z
  .object({
    label: z.string().min(1),
    icon: z.string().optional(),
    panels: z.array(z.string().regex(KEBAB_CASE)).min(1),
    visible_to_roles: z.array(z.string()).optional(),
  })
  .strict();

const _ngCheck: z.infer<typeof NavigationGroupSchema> extends NavigationGroup
  ? true
  : false = true;
void _ngCheck;

export const NavigationConfigSchema = z
  .object({
    layout: NavigationLayoutSchema,
    groups: z.array(NavigationGroupSchema),
  })
  .strict();

const _ncCheck: z.infer<typeof NavigationConfigSchema> extends NavigationConfig
  ? true
  : false = true;
void _ncCheck;

// ─── Role visibility ─────────────────────────────────────────────────

export const DashboardRoleSchema = z
  .object({
    name: z.string().regex(SNAKE_CASE),
    description: z.string().min(1),
    granted_to: z.array(z.string().min(1)),
    permissions: z.array(z.string().min(1)),
    visible_panels: z.array(z.string().regex(KEBAB_CASE)),
    landing_panel: z.string().regex(KEBAB_CASE).optional(),
  })
  .strict();

const _drCheck: z.infer<typeof DashboardRoleSchema> extends DashboardRole
  ? true
  : false = true;
void _drCheck;

export const RoleVisibilityRulesSchema = z
  .object({
    roles: z.array(DashboardRoleSchema),
  })
  .strict();

const _rvCheck: z.infer<typeof RoleVisibilityRulesSchema> extends RoleVisibilityRules
  ? true
  : false = true;
void _rvCheck;

// ─── DashboardManifest ───────────────────────────────────────────────

export const DashboardManifestSchema = z
  .object({
    spec_version: z.string().regex(SEM_VER),
    pipeline_id: z.string().regex(KEBAB_CASE),
    title: z.string().min(1),
    description: z.string().min(1),
    branding: BrandingConfigSchema.optional(),
    panels: z.array(PanelInstanceSchema).min(1),
    navigation: NavigationConfigSchema,
    default_landing_panel: z.string().min(1),
    role_visibility: RoleVisibilityRulesSchema,
  })
  .strict();

const _mfCheck: z.infer<typeof DashboardManifestSchema> extends DashboardManifest
  ? true
  : false = true;
void _mfCheck;
