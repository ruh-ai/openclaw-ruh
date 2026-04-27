import { describe, expect, test } from "bun:test";
import {
  BrandingConfigSchema,
  DashboardManifestSchema,
  DashboardRoleSchema,
  DataSourceSchema,
  NavigationConfigSchema,
  NavigationGroupSchema,
  PanelActionSchema,
  PanelInstanceSchema,
  PanelKindSchema,
  RefreshConfigSchema,
} from "../schemas";

describe("PanelKindSchema", () => {
  test("accepts every documented kind", () => {
    for (const k of [
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
    ]) {
      expect(PanelKindSchema.safeParse(k).success).toBe(true);
    }
  });

  test("rejects unknown kind", () => {
    expect(PanelKindSchema.safeParse("dashboard-tile").success).toBe(false);
  });
});

describe("BrandingConfigSchema", () => {
  test("hex colors must be 6-digit", () => {
    expect(
      BrandingConfigSchema.safeParse({
        primary_color: "#1a3a5c",
        secondary_color: "#d4a017",
      }).success,
    ).toBe(true);
    expect(
      BrandingConfigSchema.safeParse({ primary_color: "#fff" }).success,
    ).toBe(false);
  });

  test("rejects extra fields", () => {
    expect(
      BrandingConfigSchema.safeParse({ extra: "no" }).success,
    ).toBe(false);
  });
});

describe("RefreshConfigSchema", () => {
  test("interval_seconds within 5..3600 accepted", () => {
    expect(RefreshConfigSchema.safeParse({ interval_seconds: 30 }).success).toBe(true);
  });

  test("interval_seconds < 5 rejected (anti-stampede rule from spec)", () => {
    expect(RefreshConfigSchema.safeParse({ interval_seconds: 1 }).success).toBe(false);
  });

  test("interval_seconds > 3600 rejected", () => {
    expect(
      RefreshConfigSchema.safeParse({ interval_seconds: 4000 }).success,
    ).toBe(false);
  });

  test("on_event + manual_only allowed alongside interval", () => {
    expect(
      RefreshConfigSchema.safeParse({
        interval_seconds: 30,
        on_event: ["eval_iteration_complete"],
        manual_only: false,
      }).success,
    ).toBe(true);
  });
});

describe("DataSourceSchema — passthrough preserves kind-specific fields", () => {
  test("decision-log-query with custom payload survives parse", () => {
    const r = DataSourceSchema.parse({
      kind: "decision-log-query",
      query: { types: ["session_start"], limit: 50 },
      row_template: { title: "{user_message}" },
    });
    expect(r.kind).toBe("decision-log-query");
    expect((r as Record<string, unknown>).query).toBeDefined();
    expect((r as Record<string, unknown>).row_template).toBeDefined();
  });

  test("rejects unknown kind", () => {
    expect(DataSourceSchema.safeParse({ kind: "secret-feed" }).success).toBe(false);
  });

  test("kind required", () => {
    expect(DataSourceSchema.safeParse({}).success).toBe(false);
  });
});

describe("PanelActionSchema — mutating actions require permission", () => {
  test("memory-confirm without permission rejected", () => {
    expect(
      PanelActionSchema.safeParse({
        label: "Approve",
        kind: "memory-confirm",
      }).success,
    ).toBe(false);
  });

  test("memory-confirm WITH permission accepted", () => {
    expect(
      PanelActionSchema.safeParse({
        label: "Approve",
        kind: "memory-confirm",
        permission: "memory:confirm:estimating",
      }).success,
    ).toBe(true);
  });

  test("config-edit requires permission", () => {
    expect(
      PanelActionSchema.safeParse({
        label: "Edit",
        kind: "config-edit",
      }).success,
    ).toBe(false);
  });

  test("non-mutating action (navigate / download) does NOT require permission", () => {
    expect(
      PanelActionSchema.safeParse({
        label: "Open",
        kind: "navigate",
      }).success,
    ).toBe(true);
  });

  test("requires_reason boolean accepted", () => {
    expect(
      PanelActionSchema.safeParse({
        label: "Reject",
        kind: "memory-reject",
        permission: "memory:confirm:estimating",
        requires_reason: true,
      }).success,
    ).toBe(true);
  });
});

describe("PanelInstanceSchema — kind:custom evidence requirement", () => {
  test("custom kind without security review evidence rejected", () => {
    expect(
      PanelInstanceSchema.safeParse({
        kind: "custom",
        id: "ecc-pricing-comparator",
        title: "ECC pricing",
      }).success,
    ).toBe(false);
  });

  test("custom kind with full evidence accepted", () => {
    expect(
      PanelInstanceSchema.safeParse({
        kind: "custom",
        id: "ecc-pricing-comparator",
        title: "ECC pricing",
        permission_to_register: "ecc-platform-team",
        security_reviewed_at: "2026-04-15T00:00:00Z",
        security_reviewed_by: "security@ecc.com",
        implementation_path: "panels/pricing-comparator/",
      }).success,
    ).toBe(true);
  });

  test("non-custom kinds don't need security review evidence", () => {
    expect(
      PanelInstanceSchema.safeParse({
        kind: "queue",
        id: "estimate-queue",
        title: "Estimates",
      }).success,
    ).toBe(true);
  });

  test("non-kebab id rejected", () => {
    expect(
      PanelInstanceSchema.safeParse({
        kind: "queue",
        id: "Estimate_Queue",
        title: "x",
      }).success,
    ).toBe(false);
  });
});

describe("NavigationGroupSchema + NavigationConfigSchema", () => {
  test("group requires non-empty panels", () => {
    expect(
      NavigationGroupSchema.safeParse({ label: "Main", panels: [] }).success,
    ).toBe(false);
  });

  test("layout enum enforced", () => {
    expect(
      NavigationConfigSchema.safeParse({
        layout: "carousel",
        groups: [],
      }).success,
    ).toBe(false);
    expect(
      NavigationConfigSchema.safeParse({
        layout: "sidebar",
        groups: [],
      }).success,
    ).toBe(true);
  });
});

describe("DashboardRoleSchema", () => {
  test("snake_case role name enforced", () => {
    expect(
      DashboardRoleSchema.safeParse({
        name: "leadEstimator",
        description: "x",
        granted_to: ["x@y"],
        permissions: [],
        visible_panels: [],
      }).success,
    ).toBe(false);
    expect(
      DashboardRoleSchema.safeParse({
        name: "lead_estimator",
        description: "x",
        granted_to: ["x@y"],
        permissions: [],
        visible_panels: [],
      }).success,
    ).toBe(true);
  });

  test("kebab-case panel ids in visible_panels", () => {
    expect(
      DashboardRoleSchema.safeParse({
        name: "x",
        description: "x",
        granted_to: ["x"],
        permissions: [],
        visible_panels: ["BadCase"],
      }).success,
    ).toBe(false);
  });
});

describe("DashboardManifestSchema — top-level required fields", () => {
  test("empty input rejected", () => {
    expect(DashboardManifestSchema.safeParse({}).success).toBe(false);
  });

  test("requires panels.minItems = 1", () => {
    expect(
      DashboardManifestSchema.safeParse({
        spec_version: "1.0.0",
        pipeline_id: "x",
        title: "x",
        description: "x",
        panels: [],
        navigation: { layout: "sidebar", groups: [] },
        default_landing_panel: "x",
        role_visibility: { roles: [] },
      }).success,
    ).toBe(false);
  });
});
