import { describe, expect, test } from "bun:test";
import type { DashboardManifest } from "../../dashboard/types";
import type { PipelineManifest } from "../../pipeline-manifest/types";
import {
  ConformanceError,
  assertConformant,
  runConformance,
} from "../runner";

const SHA = `sha256:${"a".repeat(64)}`;

function basePipeline(): PipelineManifest {
  return {
    id: "ecc-estimator",
    spec_version: "1.0.0-rc.1",
    version: "0.1.0",
    name: "ECC Estimator",
    description: "Routine + edge estimates with autonomous cap.",
    agents: [
      {
        id: "orchestrator",
        path: "agents/orchestrator/",
        version: "0.1.0",
        role: "Pipeline orchestrator",
        is_orchestrator: true,
      },
      {
        id: "intake",
        path: "agents/intake/",
        version: "0.1.0",
        role: "Parse RFP",
      },
    ],
    orchestrator: { agent_id: "orchestrator", skills: ["route-user-input"] },
    routing: {
      rules: [{ match: { stage: "intake" }, specialist: "intake" }],
      fallback: "orchestrator",
    },
    failure_policy: { intake: "abort" },
    merge_policy: [],
    memory_authority: [
      { tier: 1, lane: "estimating", writers: ["darrow@ecc.com"] },
    ],
    config_docs: [],
    imports: [],
    output_validator: {
      layers: ["marker"],
      heuristic_confidence_threshold: 0.6,
      schemas: [],
    },
    dashboard: {
      manifest_path: "dashboard/manifest.json",
      title: "ECC Estimator",
      default_landing_panel: "orchestrator-chat",
    },
    eval_suite_ref: "eval/tasks.json",
    hooks: [],
    custom_hooks: [],
    runtime: {
      tenancy: "on-prem",
      egress: "tenant-bounded",
      llm_providers: [
        { provider: "anthropic", model: "claude-opus-4-7", via: "tenant-proxy" },
      ],
      sandbox: {
        image: "openclaw-runtime:1.0.0",
        resources: { cpu_cores: 4, memory_gb: 16, disk_gb: 100 },
      },
      database: { kind: "postgres" },
    },
    dev_stage: "validated",
    generated_at: "2026-04-27T00:00:00Z",
    generated_by: "architect@1.0.0",
    checksum: SHA,
  };
}

function baseDashboard(over: Partial<DashboardManifest> = {}): DashboardManifest {
  return {
    spec_version: "1.0.0-rc.1",
    pipeline_id: "ecc-estimator",
    title: "ECC Estimator",
    description: "Bespoke dashboard.",
    panels: [
      { kind: "chat", id: "orchestrator-chat", title: "Talk" },
      { kind: "queue", id: "estimate-queue", title: "Queue" },
    ],
    navigation: {
      layout: "sidebar",
      groups: [
        { label: "Main", panels: ["orchestrator-chat", "estimate-queue"] },
      ],
    },
    default_landing_panel: "orchestrator-chat",
    role_visibility: {
      roles: [
        {
          name: "lead_estimator",
          description: "Final estimating authority",
          granted_to: ["darrow@ecc.com"],
          permissions: [],
          visible_panels: ["orchestrator-chat", "estimate-queue"],
        },
      ],
    },
    ...over,
  };
}

describe("runConformance — happy path", () => {
  test("pipeline + dashboard: aggregate report includes both validators + cross-checks", () => {
    const r = runConformance({
      pipelineManifest: basePipeline(),
      dashboardManifest: baseDashboard(),
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toBe(0);
  });

  test("dashboard alone: runs dashboard validator only", () => {
    const r = runConformance({ dashboardManifest: baseDashboard() });
    expect(r.ok).toBe(true);
  });

  test("no inputs: empty report, ok:true (vacuous)", () => {
    const r = runConformance({});
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });
});

describe("runConformance — dashboard manifest required when pipeline declares one (regression P1)", () => {
  test("pipeline alone (with dashboard ref) fails — dashboard manifest must be supplied", () => {
    const r = runConformance({ pipelineManifest: basePipeline() });
    expect(r.ok).toBe(false);
    expect(
      r.findings.some(
        (f) =>
          f.source === "cross-artifact" &&
          f.rule === "dashboard-manifest-required",
      ),
    ).toBe(true);
  });

  test("error finding cites the manifest_path the pipeline declared", () => {
    const r = runConformance({ pipelineManifest: basePipeline() });
    const finding = r.findings.find(
      (f) => f.rule === "dashboard-manifest-required",
    );
    expect(finding?.message).toContain("dashboard/manifest.json");
  });

  test("malformed pipeline does NOT trigger dashboard-manifest-required (rule only fires when pipeline parses)", () => {
    const r = runConformance({ pipelineManifest: {} });
    expect(
      r.findings.some((f) => f.rule === "dashboard-manifest-required"),
    ).toBe(false);
  });
});

describe("runConformance — pipeline-manifest failures surface with source=pipeline-manifest", () => {
  test("malformed pipeline tagged source=pipeline-manifest", () => {
    const r = runConformance({ pipelineManifest: {} });
    expect(r.ok).toBe(false);
    expect(r.findings.every((f) => f.source === "pipeline-manifest")).toBe(true);
  });
});

describe("runConformance — dashboard-manifest failures surface with source=dashboard-manifest", () => {
  test("malformed dashboard tagged source=dashboard-manifest", () => {
    const r = runConformance({
      pipelineManifest: basePipeline(),
      dashboardManifest: {},
    });
    expect(r.ok).toBe(false);
    expect(
      r.findings.some((f) => f.source === "dashboard-manifest"),
    ).toBe(true);
  });
});

describe("runConformance — cross-artifact rule: pipeline-id alignment", () => {
  test("dashboard.pipeline_id mismatch with pipeline.id is an error", () => {
    const r = runConformance({
      pipelineManifest: basePipeline(),
      dashboardManifest: baseDashboard({ pipeline_id: "different-pipeline" }),
    });
    expect(r.ok).toBe(false);
    expect(
      r.findings.some(
        (f) =>
          f.source === "cross-artifact" &&
          f.rule === "pipeline-id-alignment",
      ),
    ).toBe(true);
  });
});

describe("runConformance — cross-artifact rule: spec-version alignment", () => {
  test("differing spec_version flagged", () => {
    const r = runConformance({
      pipelineManifest: basePipeline(),
      dashboardManifest: baseDashboard({ spec_version: "1.0.0" }),
    });
    expect(
      r.findings.some(
        (f) =>
          f.source === "cross-artifact" &&
          f.rule === "spec-version-alignment",
      ),
    ).toBe(true);
  });
});

describe("runConformance — cross-artifact rule: memory:confirm grants must align with memory_authority", () => {
  test("role granted memory:confirm:<lane> with NO Tier-1 writers in lane → error", () => {
    const pipeline = basePipeline();
    const dashboard = baseDashboard({
      role_visibility: {
        roles: [
          {
            name: "lead_estimator",
            description: "x",
            granted_to: ["darrow@ecc.com"],
            permissions: ["memory:confirm:business"], // pipeline has no Tier-1 in `business`
            visible_panels: ["orchestrator-chat", "estimate-queue"],
          },
        ],
      },
    });
    const r = runConformance({
      pipelineManifest: pipeline,
      dashboardManifest: dashboard,
    });
    expect(
      r.findings.some(
        (f) =>
          f.source === "cross-artifact" &&
          f.rule === "memory-confirm-needs-tier1",
      ),
    ).toBe(true);
  });

  test("role granted memory:confirm but identity not Tier-1 in lane → error", () => {
    const pipeline = basePipeline();
    const dashboard = baseDashboard({
      role_visibility: {
        roles: [
          {
            name: "lead_estimator",
            description: "x",
            granted_to: ["scott@ecc.com"], // not in pipeline's Tier-1 estimating
            permissions: ["memory:confirm:estimating"],
            visible_panels: ["orchestrator-chat", "estimate-queue"],
          },
        ],
      },
    });
    const r = runConformance({
      pipelineManifest: pipeline,
      dashboardManifest: dashboard,
    });
    expect(
      r.findings.some(
        (f) =>
          f.source === "cross-artifact" &&
          f.rule === "memory-confirm-grant-mismatch",
      ),
    ).toBe(true);
  });

  test("role granted memory:confirm with Tier-1-aligned identity passes", () => {
    const r = runConformance({
      pipelineManifest: basePipeline(),
      dashboardManifest: baseDashboard({
        role_visibility: {
          roles: [
            {
              name: "lead_estimator",
              description: "x",
              granted_to: ["darrow@ecc.com"],
              permissions: ["memory:confirm:estimating"],
              visible_panels: ["orchestrator-chat", "estimate-queue"],
            },
          ],
        },
      }),
    });
    expect(
      r.findings.some(
        (f) => f.source === "cross-artifact" && f.severity === "error",
      ),
    ).toBe(false);
  });
});

describe("runConformance — dashboard ref alignment (regression P2)", () => {
  test("pipeline.dashboard.default_landing_panel not in dashboard.panels[] is an error", () => {
    const pipeline = basePipeline();
    const broken = {
      ...pipeline,
      dashboard: { ...pipeline.dashboard, default_landing_panel: "ghost" },
    };
    const r = runConformance({
      pipelineManifest: broken,
      dashboardManifest: baseDashboard(),
    });
    expect(
      r.findings.some(
        (f) =>
          f.source === "cross-artifact" &&
          f.rule === "dashboard-default-landing-exists",
      ),
    ).toBe(true);
  });

  test("pipeline.dashboard.default_landing_panel exists but differs from dashboard.default_landing_panel → error (substrate can't predict which the runtime resolves)", () => {
    const pipeline = basePipeline();
    const stub = {
      ...pipeline,
      dashboard: { ...pipeline.dashboard, default_landing_panel: "estimate-queue" },
    };
    const r = runConformance({
      pipelineManifest: stub,
      // baseDashboard's default_landing_panel is "orchestrator-chat"
      dashboardManifest: baseDashboard(),
    });
    const finding = r.findings.find(
      (f) => f.rule === "dashboard-default-landing-mismatch",
    );
    expect(finding?.severity).toBe("error");
  });

  test("pipeline.dashboard.title differs from dashboard.title → warning", () => {
    const pipeline = basePipeline();
    const stub = {
      ...pipeline,
      dashboard: { ...pipeline.dashboard, title: "Different Title" },
    };
    const r = runConformance({
      pipelineManifest: stub,
      dashboardManifest: baseDashboard(),
    });
    expect(
      r.findings.some(
        (f) =>
          f.rule === "dashboard-title-mismatch" && f.severity === "warning",
      ),
    ).toBe(true);
  });
});

describe("runConformance — cross-checks skipped when one artifact failed schema", () => {
  test("pipeline schema-failure → no cross-artifact checks ran", () => {
    const r = runConformance({
      pipelineManifest: { id: "x" }, // malformed
      dashboardManifest: baseDashboard(),
    });
    // No cross-artifact findings possible — pipeline didn't parse
    expect(
      r.findings.some(
        (f) => f.source === "cross-artifact",
      ),
    ).toBe(false);
    // But pipeline-manifest findings still surface
    expect(
      r.findings.some((f) => f.source === "pipeline-manifest"),
    ).toBe(true);
  });
});

describe("assertConformant", () => {
  test("returns the report on success (pipeline + dashboard)", () => {
    const r = assertConformant({
      pipelineManifest: basePipeline(),
      dashboardManifest: baseDashboard(),
    });
    expect(r.ok).toBe(true);
  });

  test("throws ConformanceError on failure (carries .category=manifest_invalid)", () => {
    let err: unknown;
    try {
      assertConformant({ pipelineManifest: {} });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConformanceError);
    if (err instanceof ConformanceError) {
      expect(err.category).toBe("manifest_invalid");
      expect(err.report.errors).toBeGreaterThan(0);
    }
  });
});
