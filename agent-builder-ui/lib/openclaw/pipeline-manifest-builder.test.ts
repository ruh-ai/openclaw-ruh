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

describe("buildPipelineManifest — single-agent shape (Path A preserved)", () => {
  test("empty subAgents → exactly one agent", () => {
    const m = buildPipelineManifest(baseArgs()) as {
      agents: ReadonlyArray<{ id: string; is_orchestrator?: boolean; role: string }>;
    };
    expect(m.agents).toHaveLength(1);
    expect(m.agents[0]?.id).toBe("main");
    expect(m.agents[0]?.is_orchestrator).toBe(true);
    expect(m.agents[0]?.role).toBe("Single-agent pipeline");
  });

  test("empty subAgents → routing.rules empty, failure_policy empty, single memory row", () => {
    const m = buildPipelineManifest(baseArgs()) as {
      routing: { rules: ReadonlyArray<unknown>; fallback: string };
      failure_policy: Record<string, string>;
      memory_authority: ReadonlyArray<{ lane: string }>;
    };
    expect(m.routing.rules).toEqual([]);
    expect(m.routing.fallback).toBe("main");
    expect(m.failure_policy).toEqual({});
    expect(m.memory_authority).toHaveLength(1);
    expect(m.memory_authority[0]?.lane).toBe("main");
  });

  test("hooks, custom_hooks, config_docs, imports, merge_policy are empty", () => {
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

describe("buildPipelineManifest — multi-agent fleet (Path B Slice 1)", () => {
  function planWithSubAgents() {
    const plan = basePlan();
    plan.subAgents = [
      {
        id: "intake",
        name: "Intake",
        description: "Parse RFP into structured requirements",
        type: "specialist",
        skills: ["parse-rfp"],
        trigger: "intake",
        autonomy: "fully_autonomous",
      },
      {
        id: "takeoff",
        name: "Takeoff",
        description: "Compute material quantities from photos + drawings",
        type: "specialist",
        skills: ["read-photos", "compute-takeoff"],
        trigger: "takeoff",
        autonomy: "requires_approval",
      },
      {
        id: "narrator",
        name: "Narrator",
        description: "",
        type: "worker",
        skills: ["compose-narrative"],
        trigger: "", // intentionally empty — should fall through to fallback
        autonomy: "fully_autonomous",
      },
    ];
    return plan;
  }

  test("agents[] = main orchestrator + one entry per sub-agent (in declaration order)", () => {
    const m = buildPipelineManifest(baseArgs({ plan: planWithSubAgents() })) as {
      agents: ReadonlyArray<{ id: string; is_orchestrator?: boolean; role: string; path: string }>;
    };
    expect(m.agents).toHaveLength(4);
    expect(m.agents[0]).toEqual({
      id: "main",
      path: "agents/main/",
      version: "0.1.0",
      role: "Pipeline orchestrator",
      is_orchestrator: true,
    });
    expect(m.agents[1]).toEqual({
      id: "intake",
      path: "agents/intake/",
      version: "0.1.0",
      role: "Parse RFP into structured requirements",
    });
    // Sub-agents must NOT carry is_orchestrator: true — the substrate
    // pins exactly one orchestrator per pipeline.
    expect(m.agents[1]?.is_orchestrator).toBeUndefined();
    expect(m.agents[3]?.role).toBe("Narrator"); // empty description falls back to name
  });

  test("main agent role flips from 'Single-agent pipeline' to 'Pipeline orchestrator' when fleet emerges", () => {
    const single = buildPipelineManifest(baseArgs()) as { agents: ReadonlyArray<{ role: string }> };
    expect(single.agents[0]?.role).toBe("Single-agent pipeline");

    const fleet = buildPipelineManifest(
      baseArgs({ plan: planWithSubAgents() }),
    ) as { agents: ReadonlyArray<{ role: string }> };
    expect(fleet.agents[0]?.role).toBe("Pipeline orchestrator");
  });

  test("routing.rules emitted only for sub-agents with non-empty trigger; rest fall through to fallback", () => {
    const m = buildPipelineManifest(baseArgs({ plan: planWithSubAgents() })) as {
      routing: {
        rules: ReadonlyArray<{ match: { stage: string }; specialist: string }>;
        fallback: string;
      };
    };
    expect(m.routing.rules).toEqual([
      { match: { stage: "intake" }, specialist: "intake" },
      { match: { stage: "takeoff" }, specialist: "takeoff" },
    ]);
    // narrator (empty trigger) intentionally absent from rules
    expect(m.routing.fallback).toBe("main");
  });

  test("failure_policy carries one entry per sub-agent (default retry-then-escalate)", () => {
    const m = buildPipelineManifest(baseArgs({ plan: planWithSubAgents() })) as {
      failure_policy: Record<string, string>;
    };
    expect(m.failure_policy).toEqual({
      intake: "retry-then-escalate",
      takeoff: "retry-then-escalate",
      narrator: "retry-then-escalate",
    });
  });

  test("memory_authority: one row per agent — main + each sub-agent — operator as writer", () => {
    const m = buildPipelineManifest(
      baseArgs({ plan: planWithSubAgents(), operatorIdentity: "darrow@ecc.com" }),
    ) as {
      memory_authority: ReadonlyArray<{ tier: number; lane: string; writers: ReadonlyArray<string> }>;
    };
    expect(m.memory_authority).toHaveLength(4);
    expect(m.memory_authority).toEqual([
      { tier: 1, lane: "main", writers: ["darrow@ecc.com"] },
      { tier: 1, lane: "intake", writers: ["darrow@ecc.com"] },
      { tier: 1, lane: "takeoff", writers: ["darrow@ecc.com"] },
      { tier: 1, lane: "narrator", writers: ["darrow@ecc.com"] },
    ]);
  });

  test("multi-agent manifest passes runConformance() with no fatal findings", () => {
    const manifest = buildPipelineManifest(baseArgs({ plan: planWithSubAgents() }));
    const report = runConformance({ pipelineManifest: manifest });
    const fatal = report.findings.filter(
      (f) => f.severity === "error" && f.rule !== "dashboard-manifest-required",
    );
    expect(fatal).toEqual([]);
  });
});
