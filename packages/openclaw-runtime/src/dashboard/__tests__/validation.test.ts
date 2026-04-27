import { describe, expect, test } from "bun:test";
import {
  DashboardManifestInvalidError,
  assertValidDashboardManifest,
  validateDashboardManifest,
} from "../validation";
import type { DashboardManifest } from "../types";

function baseManifest(): DashboardManifest {
  return {
    spec_version: "1.0.0-rc.1",
    pipeline_id: "ecc-estimator",
    title: "ECC Estimator",
    description: "Bespoke dashboard.",
    panels: [
      { kind: "chat", id: "orchestrator-chat", title: "Talk" },
      { kind: "queue", id: "estimate-queue", title: "Queue" },
      {
        kind: "form",
        id: "memory-approval",
        title: "Approvals",
        actions: [
          {
            label: "Approve",
            kind: "memory-confirm",
            permission: "memory:confirm:estimating",
          },
        ],
      },
    ],
    navigation: {
      layout: "sidebar",
      groups: [
        {
          label: "Main",
          panels: ["orchestrator-chat", "estimate-queue", "memory-approval"],
        },
      ],
    },
    default_landing_panel: "orchestrator-chat",
    role_visibility: {
      roles: [
        {
          name: "lead_estimator",
          description: "Final estimating authority",
          granted_to: ["darrow@ecc.com"],
          permissions: ["memory:confirm:estimating"],
          visible_panels: ["orchestrator-chat", "estimate-queue", "memory-approval"],
          landing_panel: "memory-approval",
        },
      ],
    },
  };
}

describe("validateDashboardManifest — happy path", () => {
  test("canonical manifest passes with zero errors+warnings", () => {
    const r = validateDashboardManifest(baseManifest());
    expect(r.ok).toBe(true);
    expect(r.errors).toBe(0);
    expect(r.warnings).toBe(0);
  });
});

describe("validateDashboardManifest — schema-level errors", () => {
  test("malformed input surfaces as schema findings", () => {
    const r = validateDashboardManifest({});
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "schema")).toBe(true);
  });
});

describe("validateDashboardManifest — panel-id-unique", () => {
  test("duplicate panel ids rejected", () => {
    const m = baseManifest();
    const dup: DashboardManifest = {
      ...m,
      panels: [
        ...m.panels,
        { kind: "table", id: "estimate-queue", title: "Dup" },
      ],
    };
    const r = validateDashboardManifest(dup);
    expect(r.findings.some((f) => f.rule === "panel-id-unique")).toBe(true);
  });
});

describe("validateDashboardManifest — default-landing-exists", () => {
  test("default_landing_panel not in panels[] is rejected", () => {
    const m = { ...baseManifest(), default_landing_panel: "ghost" };
    const r = validateDashboardManifest(m);
    expect(r.findings.some((f) => f.rule === "default-landing-exists")).toBe(true);
  });
});

describe("validateDashboardManifest — role-landing-in-visible", () => {
  test("role.landing_panel not in role.visible_panels rejected", () => {
    const m = baseManifest();
    const broken: DashboardManifest = {
      ...m,
      role_visibility: {
        roles: [
          {
            ...m.role_visibility.roles[0]!,
            landing_panel: "estimate-queue",
            visible_panels: ["orchestrator-chat", "memory-approval"],
          },
        ],
      },
    };
    const r = validateDashboardManifest(broken);
    expect(
      r.findings.some((f) => f.rule === "role-landing-in-visible"),
    ).toBe(true);
  });

  test("role without landing_panel is OK", () => {
    const m = baseManifest();
    const updated: DashboardManifest = {
      ...m,
      role_visibility: {
        roles: [
          {
            ...m.role_visibility.roles[0]!,
            landing_panel: undefined,
          },
        ],
      },
    };
    const r = validateDashboardManifest(updated);
    expect(r.findings.some((f) => f.rule === "role-landing-in-visible")).toBe(false);
  });
});

describe("validateDashboardManifest — role-visible-panel-exists", () => {
  test("role references unknown panel id", () => {
    const m = baseManifest();
    const updated: DashboardManifest = {
      ...m,
      role_visibility: {
        roles: [
          {
            ...m.role_visibility.roles[0]!,
            visible_panels: ["orchestrator-chat", "ghost-panel"],
            landing_panel: "orchestrator-chat",
          },
        ],
      },
    };
    const r = validateDashboardManifest(updated);
    expect(
      r.findings.some(
        (f) =>
          f.rule === "role-visible-panel-exists" &&
          f.message.includes("ghost-panel"),
      ),
    ).toBe(true);
  });
});

describe("validateDashboardManifest — nav-panel-exists / nav-role-exists", () => {
  test("navigation group panel must exist", () => {
    const m = baseManifest();
    const broken: DashboardManifest = {
      ...m,
      navigation: {
        layout: "sidebar",
        groups: [{ label: "Main", panels: ["ghost-panel"] }],
      },
    };
    const r = validateDashboardManifest(broken);
    expect(r.findings.some((f) => f.rule === "nav-panel-exists")).toBe(true);
  });

  test("navigation group visible_to_roles must exist in role_visibility", () => {
    const m = baseManifest();
    const broken: DashboardManifest = {
      ...m,
      navigation: {
        layout: "sidebar",
        groups: [
          {
            label: "Main",
            panels: ["orchestrator-chat"],
            visible_to_roles: ["ghost_role"],
          },
        ],
      },
    };
    const r = validateDashboardManifest(broken);
    expect(r.findings.some((f) => f.rule === "nav-role-exists")).toBe(true);
  });
});

describe("validateDashboardManifest — action-permission-resolves", () => {
  test("action permission not declared by any role surfaces as error (panel is unreachable)", () => {
    const m = baseManifest();
    const broken: DashboardManifest = {
      ...m,
      panels: [
        ...m.panels,
        {
          kind: "table",
          id: "rates",
          title: "Rates",
          actions: [
            {
              label: "Edit",
              kind: "config-edit",
              permission: "config:write:nobody-has-this",
            },
          ],
        },
      ],
      navigation: {
        layout: "sidebar",
        groups: [
          {
            label: "Main",
            panels: ["orchestrator-chat", "estimate-queue", "memory-approval", "rates"],
          },
        ],
      },
    };
    const r = validateDashboardManifest(broken);
    expect(
      r.findings.some(
        (f) =>
          f.rule === "action-permission-resolves" &&
          f.message.includes("config:write:nobody-has-this"),
      ),
    ).toBe(true);
  });

  test("permission held by a role makes the action reachable", () => {
    const r = validateDashboardManifest(baseManifest());
    expect(
      r.findings.some((f) => f.rule === "action-permission-resolves"),
    ).toBe(false);
  });
});

describe("assertValidDashboardManifest", () => {
  test("returns the manifest on success", () => {
    const m = baseManifest();
    expect(assertValidDashboardManifest(m)).toBe(m);
  });

  test("throws DashboardManifestInvalidError with .category=manifest_invalid", () => {
    const m = { ...baseManifest(), default_landing_panel: "ghost" };
    let err: unknown;
    try {
      assertValidDashboardManifest(m);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DashboardManifestInvalidError);
    if (err instanceof DashboardManifestInvalidError) {
      expect(err.category).toBe("manifest_invalid");
      expect(err.report.errors).toBeGreaterThan(0);
    }
  });
});
