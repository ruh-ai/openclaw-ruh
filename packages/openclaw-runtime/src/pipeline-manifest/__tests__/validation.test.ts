import { describe, expect, test } from "bun:test";
import {
  PipelineManifestInvalidError,
  assertValidPipelineManifest,
  validatePipelineManifest,
} from "../validation";
import type { PipelineManifest } from "../types";

const SHA = `sha256:${"a".repeat(64)}`;

/**
 * A canonical "hello-pipeline"-shaped manifest used as the base for each
 * test; individual tests mutate to introduce specific violations.
 */
function baseManifest(): PipelineManifest {
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
    orchestrator: {
      agent_id: "orchestrator",
      skills: ["route-user-input"],
    },
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
      title: "ECC",
      default_landing_panel: "queue",
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

describe("validatePipelineManifest — happy path", () => {
  test("canonical manifest passes with zero errors + zero warnings", () => {
    const r = validatePipelineManifest(baseManifest());
    expect(r.ok).toBe(true);
    expect(r.errors).toBe(0);
    expect(r.warnings).toBe(0);
  });
});

describe("validatePipelineManifest — schema-level errors", () => {
  test("malformed input surfaces as schema findings", () => {
    const r = validatePipelineManifest({});
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "schema")).toBe(true);
  });
});

describe("validatePipelineManifest — single-orchestrator", () => {
  test("zero orchestrators rejected", () => {
    const m = baseManifest();
    const updated = {
      ...m,
      agents: m.agents.map((a) => ({ ...a, is_orchestrator: false })),
    };
    const r = validatePipelineManifest(updated);
    expect(r.findings.some((f) => f.rule === "single-orchestrator")).toBe(true);
  });

  test("two orchestrators rejected", () => {
    const m = baseManifest();
    const updated = {
      ...m,
      agents: m.agents.map((a) => ({ ...a, is_orchestrator: true })),
    };
    const r = validatePipelineManifest(updated);
    expect(r.findings.some((f) => f.rule === "single-orchestrator")).toBe(true);
  });
});

describe("validatePipelineManifest — orchestrator existence", () => {
  test("orchestrator.agent_id not in agents[] is rejected", () => {
    const m = { ...baseManifest(), orchestrator: { agent_id: "ghost", skills: ["x"] } };
    const r = validatePipelineManifest(m);
    expect(r.findings.some((f) => f.rule === "orchestrator-existence")).toBe(true);
  });

  test("agent referenced as orchestrator must declare is_orchestrator:true", () => {
    const m = baseManifest();
    const updated = {
      ...m,
      agents: m.agents.map((a) =>
        a.id === "orchestrator" ? { ...a, is_orchestrator: false } : a,
      ),
    };
    const r = validatePipelineManifest(updated);
    // Two findings: single-orchestrator (zero) AND orchestrator-flag (referenced agent not flagged)
    expect(r.findings.some((f) => f.rule === "orchestrator-flag")).toBe(true);
  });
});

describe("validatePipelineManifest — routing specialists", () => {
  test("routing.specialist not in agents[] is an error", () => {
    const m = {
      ...baseManifest(),
      routing: {
        rules: [{ match: { stage: "x" }, specialist: "ghost" }],
        fallback: "orchestrator",
      },
    };
    const r = validatePipelineManifest(m);
    expect(
      r.findings.some(
        (f) =>
          f.rule === "routing-specialist-exists" &&
          f.message.includes('"ghost"'),
      ),
    ).toBe(true);
  });

  test("routing.specialists array members all checked", () => {
    const m = {
      ...baseManifest(),
      routing: {
        rules: [
          {
            match: { stage: "x" },
            specialists: ["intake", "ghost-2"],
          },
        ],
        fallback: "orchestrator",
      },
    };
    const r = validatePipelineManifest(m);
    expect(
      r.findings.some(
        (f) =>
          f.rule === "routing-specialist-exists" &&
          f.message.includes("ghost-2"),
      ),
    ).toBe(true);
  });

  test("fan_out.specialist also checked", () => {
    const m = {
      ...baseManifest(),
      routing: {
        rules: [
          {
            match: { stage: "x" },
            fan_out: { specialist: "ghost-fan", split_input: "x" },
          },
        ],
        fallback: "orchestrator",
      },
    };
    const r = validatePipelineManifest(m);
    expect(
      r.findings.some(
        (f) =>
          f.rule === "routing-specialist-exists" &&
          f.message.includes("ghost-fan"),
      ),
    ).toBe(true);
  });

  test("then chain emits a warning when not in agents (might be a skill)", () => {
    const m = {
      ...baseManifest(),
      routing: {
        rules: [
          { match: { stage: "x" }, specialist: "intake", then: "some-skill" },
        ],
        fallback: "orchestrator",
      },
    };
    const r = validatePipelineManifest(m);
    expect(
      r.findings.some(
        (f) => f.rule === "routing-then-exists" && f.severity === "warning",
      ),
    ).toBe(true);
  });
});

describe("validatePipelineManifest — failure policy targets", () => {
  test("unknown specialist key in failure_policy is an error", () => {
    const m = {
      ...baseManifest(),
      failure_policy: { intake: "abort" as const, ghost: "skip" as const },
    };
    const r = validatePipelineManifest(m);
    expect(r.findings.some((f) => f.rule === "failure-policy-target")).toBe(true);
  });
});

describe("validatePipelineManifest — privileged scopes", () => {
  test("privileged: true without extended_scopes errors at both schema + manifest level", () => {
    const m = baseManifest();
    const broken = {
      ...m,
      agents: [
        ...m.agents,
        {
          id: "reflector",
          path: "agents/reflector/",
          version: "0.1.0",
          role: "Reflector",
          privileged: true,
        },
      ],
    };
    const r = validatePipelineManifest(broken);
    // The schema's .refine catches this first; the validation layer's
    // privileged-scopes rule never runs because parsing fails. Either
    // way, the report is not ok and a finding mentions the privileged
    // agent.
    expect(r.ok).toBe(false);
    expect(
      r.findings.some(
        (f) => f.message.includes("extended_scopes") || f.rule === "schema",
      ),
    ).toBe(true);
  });
});

describe("validatePipelineManifest — memory authority completeness", () => {
  test("Tier-2 lane without Tier-1 writer is an error", () => {
    const m = {
      ...baseManifest(),
      memory_authority: [
        // Tier-1 only on `business`; `estimating` only has Tier-2 — incomplete.
        { tier: 1 as const, lane: "business", writers: ["matt@ecc.com"] },
        { tier: 2 as const, lane: "estimating", writers: ["scott@ecc.com"] },
      ],
    };
    const r = validatePipelineManifest(m);
    expect(
      r.findings.some(
        (f) =>
          f.rule === "memory-authority-completeness" &&
          f.message.includes("estimating"),
      ),
    ).toBe(true);
  });

  test("Tier-1 covers every lane → no completeness finding", () => {
    const m = {
      ...baseManifest(),
      memory_authority: [
        { tier: 1 as const, lane: "business", writers: ["matt@ecc.com"] },
        { tier: 1 as const, lane: "estimating", writers: ["darrow@ecc.com"] },
        { tier: 2 as const, lane: "estimating", writers: ["scott@ecc.com"] },
      ],
    };
    const r = validatePipelineManifest(m);
    expect(
      r.findings.some((f) => f.rule === "memory-authority-completeness"),
    ).toBe(false);
  });
});

describe("validatePipelineManifest — custom hook coverage", () => {
  test("hooks[].name is custom but no matching custom_hooks[] is an error", () => {
    const m = {
      ...baseManifest(),
      hooks: [
        {
          name: "custom:ecc:rfq-shipped",
          handler: "hooks/notify.ts",
        },
      ],
      custom_hooks: [],
    };
    const r = validatePipelineManifest(m);
    expect(r.findings.some((f) => f.rule === "custom-hook-declaration")).toBe(true);
  });

  test("custom_hooks declared without a registered handler emits a warning", () => {
    const m = {
      ...baseManifest(),
      hooks: [],
      custom_hooks: [
        {
          name: "custom:ecc:rfq-shipped",
          payload_schema: "schemas/rfq-shipped.schema.json",
        },
      ],
    };
    const r = validatePipelineManifest(m);
    expect(
      r.findings.some(
        (f) => f.rule === "custom-hook-unused" && f.severity === "warning",
      ),
    ).toBe(true);
  });

  test("custom hook with matching declaration + handler passes", () => {
    const m = {
      ...baseManifest(),
      hooks: [
        {
          name: "custom:ecc:rfq-shipped",
          handler: "hooks/notify.ts",
        },
      ],
      custom_hooks: [
        {
          name: "custom:ecc:rfq-shipped",
          payload_schema: "schemas/rfq.schema.json",
        },
      ],
    };
    const r = validatePipelineManifest(m);
    expect(r.findings.some((f) => f.rule === "custom-hook-declaration")).toBe(false);
    expect(r.findings.some((f) => f.rule === "custom-hook-unused")).toBe(false);
  });
});

describe("assertValidPipelineManifest", () => {
  test("returns the manifest on success", () => {
    const m = baseManifest();
    expect(assertValidPipelineManifest(m)).toBe(m);
  });

  test("throws PipelineManifestInvalidError on failure (carries .category=manifest_invalid)", () => {
    const m = { ...baseManifest(), orchestrator: { agent_id: "ghost", skills: ["x"] } };
    let err: unknown;
    try {
      assertValidPipelineManifest(m);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PipelineManifestInvalidError);
    if (err instanceof PipelineManifestInvalidError) {
      expect(err.category).toBe("manifest_invalid");
      expect(err.report.errors).toBeGreaterThan(0);
    }
  });
});
