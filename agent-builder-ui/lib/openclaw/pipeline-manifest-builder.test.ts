/**
 * pipeline-manifest-builder tests
 *
 * The pure function under test produces JSON. The substrate's
 * `runConformance()` is the authority on whether the JSON is valid; we
 * import it directly here so the tests fail loudly the moment the
 * builder's emitted shape drifts from what the spec accepts.
 */

import { describe, expect, test } from "bun:test";
import { runConformance } from "@ruh/openclaw-runtime";
import {
  buildPipelineManifest,
  type BuildPipelineManifestArgs,
} from "./pipeline-manifest-builder";
import type { ArchitecturePlan } from "./types";

function basePlan(): ArchitecturePlan {
  return {
    skills: [
      {
        id: "main-skill",
        name: "Main Skill",
        description: "Primary skill",
        dependencies: [],
        envVars: [],
      },
    ],
    workflow: { steps: [{ skillId: "main-skill", parallel: false }] },
    integrations: [],
    triggers: [],
    channels: [],
    envVars: [],
    subAgents: [],
    missionControl: null,
  };
}

function baseArgs(over: Partial<BuildPipelineManifestArgs> = {}): BuildPipelineManifestArgs {
  return {
    agentName: "Google Ads Agent",
    agentDescription: "Manages Google Ads campaigns end-to-end.",
    plan: basePlan(),
    operatorIdentity: "operator@example.com",
    llmProvider: "anthropic",
    llmModel: "claude-opus-4-7",
    generatedAt: new Date("2026-04-27T18:00:00Z"),
    ...over,
  };
}

describe("buildPipelineManifest — substrate conformance", () => {
  test("default single-agent shape passes runConformance() without errors", () => {
    const manifest = buildPipelineManifest(baseArgs());
    const report = runConformance({ pipelineManifest: manifest });

    // The pipeline manifest schema-parses; the only finding allowed is
    // dashboard-manifest-required because we did not pass a dashboard
    // manifest in this test (path A doesn't emit one yet).
    const fatal = report.findings.filter(
      (f) => f.severity === "error" && f.rule !== "dashboard-manifest-required",
    );
    expect(fatal).toEqual([]);
  });

  test("manifest declares a dashboard ref with manifest_path so the substrate knows to expect a dashboard manifest at deploy", () => {
    const manifest = buildPipelineManifest(baseArgs()) as {
      dashboard: { manifest_path: string };
    };
    expect(manifest.dashboard.manifest_path).toBe("dashboard/manifest.json");
  });
});

describe("buildPipelineManifest — derivation rules", () => {
  test("id is kebab-cased from agent name", () => {
    const m = buildPipelineManifest(baseArgs({ agentName: "ECC Estimator!" })) as {
      id: string;
    };
    expect(m.id).toBe("ecc-estimator");
  });

  test("falls back to 'pipeline' when name yields an empty slug", () => {
    const m = buildPipelineManifest(baseArgs({ agentName: "??" })) as { id: string };
    expect(m.id).toBe("pipeline");
  });

  test("orchestrator.skills mirrors plan.skills[].id", () => {
    const plan = basePlan();
    plan.skills = [
      { id: "intake", name: "Intake", description: "", dependencies: [], envVars: [] },
      { id: "takeoff", name: "Takeoff", description: "", dependencies: [], envVars: [] },
    ];
    const m = buildPipelineManifest(baseArgs({ plan })) as {
      orchestrator: { skills: string[] };
    };
    expect(m.orchestrator.skills).toEqual(["intake", "takeoff"]);
  });

  test("emits exactly one Tier-1 memory_authority row with the operator identity", () => {
    const m = buildPipelineManifest(
      baseArgs({ operatorIdentity: "darrow@ecc.com" }),
    ) as {
      memory_authority: ReadonlyArray<{
        tier: number;
        lane: string;
        writers: ReadonlyArray<string>;
      }>;
    };
    expect(m.memory_authority).toHaveLength(1);
    expect(m.memory_authority[0]).toEqual({
      tier: 1,
      lane: "main",
      writers: ["darrow@ecc.com"],
    });
  });

  test("falls back to 'operator' as the writer when no operator identity supplied", () => {
    const args = baseArgs();
    const m = buildPipelineManifest({
      ...args,
      operatorIdentity: undefined,
    }) as { memory_authority: ReadonlyArray<{ writers: ReadonlyArray<string> }> };
    expect(m.memory_authority[0]?.writers).toEqual(["operator"]);
  });

  test("plan integrations become required_integrations on runtime", () => {
    const plan = basePlan();
    plan.integrations = [
      { toolId: "google-ads-mcp", name: "Google Ads MCP", method: "mcp", envVars: [] },
      { toolId: "sheets", name: "Sheets", method: "api", envVars: [] },
    ];
    const m = buildPipelineManifest(baseArgs({ plan })) as {
      runtime: { required_integrations?: ReadonlyArray<string> };
    };
    expect(m.runtime.required_integrations).toEqual(["google-ads-mcp", "sheets"]);
  });

  test("required_integrations is omitted when no integrations declared", () => {
    const m = buildPipelineManifest(baseArgs()) as {
      runtime: { required_integrations?: ReadonlyArray<string> };
    };
    expect(m.runtime.required_integrations).toBeUndefined();
  });

  test("llm_providers defaults to anthropic+claude-opus-4-7 when caller does not supply provider/model", () => {
    // Empty llm_providers fails the substrate's schema (minItems(1)). The
    // builder defaults to the platform's CLAUDE.md baseline so the manifest
    // is always schema-valid even when the caller hasn't plumbed the agent's
    // explicit model selection through yet. Path B will replace this default
    // with the real per-agent selection.
    const args = baseArgs();
    const m = buildPipelineManifest({
      ...args,
      llmProvider: undefined,
      llmModel: undefined,
    }) as {
      runtime: {
        llm_providers: ReadonlyArray<{ provider: string; model: string; via: string }>;
      };
    };
    expect(m.runtime.llm_providers).toEqual([
      { provider: "anthropic", model: "claude-opus-4-7", via: "tenant-proxy" },
    ]);
  });

  test("default-emit (no llm args) passes runConformance() — regression for P1 review finding", () => {
    // Mirrors the production call site in event-consumer-map's
    // emitPipelineManifest — name + description + plan only, no llm args.
    // Before the fix, this manifest failed runConformance with a schema
    // error at runtime.llm_providers (minItems).
    const manifest = buildPipelineManifest({
      agentName: baseArgs().agentName,
      agentDescription: baseArgs().agentDescription,
      plan: basePlan(),
    });
    const report = runConformance({ pipelineManifest: manifest });
    const fatal = report.findings.filter(
      (f) => f.severity === "error" && f.rule !== "dashboard-manifest-required",
    );
    expect(fatal).toEqual([]);
  });

  test("default tenancy is 'dedicated' and egress 'open' (overridable for on-prem)", () => {
    const m = buildPipelineManifest(baseArgs()) as {
      runtime: { tenancy: string; egress: string };
    };
    expect(m.runtime.tenancy).toBe("dedicated");
    expect(m.runtime.egress).toBe("open");

    const onPrem = buildPipelineManifest(
      baseArgs({ tenancy: "on-prem", egress: "tenant-bounded" }),
    ) as { runtime: { tenancy: string; egress: string } };
    expect(onPrem.runtime.tenancy).toBe("on-prem");
    expect(onPrem.runtime.egress).toBe("tenant-bounded");
  });

  test("default dev_stage is 'drafted'; overridable", () => {
    expect(
      (buildPipelineManifest(baseArgs()) as { dev_stage: string }).dev_stage,
    ).toBe("drafted");
    expect(
      (buildPipelineManifest(baseArgs({ devStage: "validated" })) as {
        dev_stage: string;
      }).dev_stage,
    ).toBe("validated");
  });

  test("checksum carries a sha256:<64-hex> placeholder; deploy recomputes the real digest", () => {
    const m = buildPipelineManifest(baseArgs()) as { checksum: string };
    expect(m.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("generated_at is ISO-8601 UTC and stable when supplied", () => {
    const m = buildPipelineManifest(
      baseArgs({ generatedAt: new Date("2026-04-27T18:00:00Z") }),
    ) as { generated_at: string };
    expect(m.generated_at).toBe("2026-04-27T18:00:00.000Z");
  });
});

describe("buildPipelineManifest — Path A scope", () => {
  test("emits exactly one agent (single-agent pipelines today)", () => {
    const m = buildPipelineManifest(baseArgs()) as {
      agents: ReadonlyArray<{ id: string; is_orchestrator?: boolean }>;
    };
    expect(m.agents).toHaveLength(1);
    expect(m.agents[0]?.id).toBe("main");
    expect(m.agents[0]?.is_orchestrator).toBe(true);
  });

  test("ignores plan.subAgents — Path B will lift them into agents[] (regression pin)", () => {
    const plan = basePlan();
    plan.subAgents = [
      {
        id: "specialist-a",
        name: "Specialist A",
        description: "",
        type: "specialist",
        skills: [],
        trigger: "",
        autonomy: "fully_autonomous",
      },
    ];
    const m = buildPipelineManifest(baseArgs({ plan })) as {
      agents: ReadonlyArray<unknown>;
    };
    // Path A intentionally still emits a single-agent manifest. Once Path B
    // lands, this test should be replaced with the multi-agent expectation.
    expect(m.agents).toHaveLength(1);
  });

  test("hooks, custom_hooks, config_docs, imports, merge_policy are empty for Path A", () => {
    const m = buildPipelineManifest(baseArgs()) as {
      hooks: ReadonlyArray<unknown>;
      custom_hooks: ReadonlyArray<unknown>;
      config_docs: ReadonlyArray<unknown>;
      imports: ReadonlyArray<unknown>;
      merge_policy: ReadonlyArray<unknown>;
    };
    expect(m.hooks).toEqual([]);
    expect(m.custom_hooks).toEqual([]);
    expect(m.config_docs).toEqual([]);
    expect(m.imports).toEqual([]);
    expect(m.merge_policy).toEqual([]);
  });
});
