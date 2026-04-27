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

  test("action unreachable when permission held by a role that CAN'T see the panel (regression P2-2)", () => {
    // The role with `memory:confirm:estimating` does NOT see the
    // memory-approval panel, while the role that DOES see it has no
    // permissions. Globally the permission exists, but no single role
    // both holds it AND sees the panel — every user gets a 403.
    const m = baseManifest();
    const broken: DashboardManifest = {
      ...m,
      role_visibility: {
        roles: [
          {
            name: "regional_estimator",
            description: "Can see approvals but can't approve",
            granted_to: ["amelia@ecc.com"],
            permissions: [],
            visible_panels: ["orchestrator-chat", "memory-approval"],
          },
          {
            name: "lead_estimator_remote",
            description: "Holds permission but doesn't see the approval panel",
            granted_to: ["darrow@ecc.com"],
            permissions: ["memory:confirm:estimating"],
            visible_panels: ["orchestrator-chat", "estimate-queue"],
          },
        ],
      },
    };
    const r = validateDashboardManifest(broken);
    expect(
      r.findings.some(
        (f) =>
          f.rule === "action-permission-resolves" &&
          f.message.includes("memory:confirm:estimating"),
      ),
    ).toBe(true);
  });

  test("per-panel role_visibility tightens reachability — only listed roles count", () => {
    // The lead_estimator role has the permission AND `memory-approval`
    // is in its visible_panels, BUT the panel itself declares
    // role_visibility: ["regional_estimator"], so lead_estimator can't
    // see the panel anymore → action becomes unreachable.
    //
    // We add `regional_estimator` as a real role so the
    // panel-role-visibility-exists rule doesn't fire alongside —
    // isolating the action-permission-resolves check.
    const m = baseManifest();
    const broken: DashboardManifest = {
      ...m,
      panels: m.panels.map((p) =>
        p.id === "memory-approval"
          ? { ...p, role_visibility: ["regional_estimator"] }
          : p,
      ),
      role_visibility: {
        roles: [
          ...m.role_visibility.roles,
          {
            name: "regional_estimator",
            description: "Tier-3 writer; no confirm authority",
            granted_to: ["jim@ecc.com"],
            permissions: [],
            visible_panels: ["orchestrator-chat", "memory-approval"],
          },
        ],
      },
    };
    const r = validateDashboardManifest(broken);
    expect(
      r.findings.some((f) => f.rule === "action-permission-resolves"),
    ).toBe(true);
    // No spurious panel-role-visibility-exists since the listed role is real.
    expect(
      r.findings.some((f) => f.rule === "panel-role-visibility-exists"),
    ).toBe(false);
  });
});

describe("validateDashboardManifest — panel-role-visibility-exists (regression — symmetric to nav-role-exists)", () => {
  test("typo'd role name in panel.role_visibility is an error", () => {
    const m = baseManifest();
    const broken: DashboardManifest = {
      ...m,
      panels: m.panels.map((p) =>
        p.id === "memory-approval"
          ? { ...p, role_visibility: ["typo_role"] }
          : p,
      ),
    };
    const r = validateDashboardManifest(broken);
    expect(
      r.findings.some(
        (f) =>
          f.rule === "panel-role-visibility-exists" &&
          f.message.includes("typo_role"),
      ),
    ).toBe(true);
  });

  test("multiple typos each surface a finding with the path", () => {
    const m = baseManifest();
    const broken: DashboardManifest = {
      ...m,
      panels: m.panels.map((p) =>
        p.id === "memory-approval"
          ? { ...p, role_visibility: ["typo_a", "typo_b"] }
          : p,
      ),
    };
    const r = validateDashboardManifest(broken);
    const matches = r.findings.filter(
      (f) => f.rule === "panel-role-visibility-exists",
    );
    expect(matches.length).toBe(2);
  });

  test("empty role_visibility:[] is treated as `no constraint` — no finding (P3 contract pin)", () => {
    const m = baseManifest();
    const updated: DashboardManifest = {
      ...m,
      panels: m.panels.map((p) =>
        p.id === "memory-approval" ? { ...p, role_visibility: [] } : p,
      ),
    };
    const r = validateDashboardManifest(updated);
    expect(
      r.findings.some((f) => f.rule === "panel-role-visibility-exists"),
    ).toBe(false);
    // The action remains reachable through normal visible_panels.
    expect(
      r.findings.some((f) => f.rule === "action-permission-resolves"),
    ).toBe(false);
  });

  test("real role name in role_visibility doesn't trigger the rule", () => {
    const m = baseManifest();
    const updated: DashboardManifest = {
      ...m,
      panels: m.panels.map((p) =>
        p.id === "memory-approval"
          ? { ...p, role_visibility: ["lead_estimator"] }
          : p,
      ),
    };
    const r = validateDashboardManifest(updated);
    expect(
      r.findings.some((f) => f.rule === "panel-role-visibility-exists"),
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
