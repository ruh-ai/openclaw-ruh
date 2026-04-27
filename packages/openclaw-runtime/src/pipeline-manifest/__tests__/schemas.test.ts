import { describe, expect, test } from "bun:test";
import {
  AgentRefSchema,
  CustomHookDeclarationSchema,
  CustomToolKindSchema,
  DashboardRefSchema,
  HookHandlerRegistrationSchema,
  ManifestDecisionMetadataBindingSchema,
  OutputValidatorConfigSchema,
  PipelineManifestSchema,
  RuntimeRequirementsSchema,
} from "../schemas";

describe("AgentRefSchema", () => {
  test("valid orchestrator agent passes", () => {
    expect(
      AgentRefSchema.safeParse({
        id: "orchestrator",
        path: "agents/orchestrator/",
        version: "0.1.0",
        role: "Pipeline orchestrator",
        is_orchestrator: true,
      }).success,
    ).toBe(true);
  });

  test("path must be `agents/<kebab>/`", () => {
    expect(
      AgentRefSchema.safeParse({
        id: "x",
        path: "x/",
        version: "0.1.0",
        role: "y",
      }).success,
    ).toBe(false);
  });

  test("privileged: true requires non-empty extended_scopes", () => {
    expect(
      AgentRefSchema.safeParse({
        id: "reflector",
        path: "agents/reflector/",
        version: "0.1.0",
        role: "Reflector",
        privileged: true,
      }).success,
    ).toBe(false);

    expect(
      AgentRefSchema.safeParse({
        id: "reflector",
        path: "agents/reflector/",
        version: "0.1.0",
        role: "Reflector",
        privileged: true,
        extended_scopes: ["skills/"],
      }).success,
    ).toBe(true);
  });
});

describe("DashboardRefSchema", () => {
  test("valid dashboard passes", () => {
    expect(
      DashboardRefSchema.safeParse({
        manifest_path: "dashboard/manifest.json",
        title: "ECC Estimator",
        branding: {
          primary_color: "#1a3a5c",
          secondary_color: "#d4a017",
        },
        default_landing_panel: "estimate-queue",
      }).success,
    ).toBe(true);
  });

  test("hex colors must be 6-digit", () => {
    expect(
      DashboardRefSchema.safeParse({
        manifest_path: "x",
        title: "y",
        default_landing_panel: "z",
        branding: { primary_color: "#fff" },
      }).success,
    ).toBe(false);
  });
});

describe("RuntimeRequirementsSchema", () => {
  const validRuntime = {
    tenancy: "on-prem" as const,
    egress: "tenant-bounded" as const,
    llm_providers: [
      {
        provider: "anthropic" as const,
        model: "claude-opus-4-7",
        via: "tenant-proxy" as const,
      },
    ],
    sandbox: {
      image: "openclaw-runtime:1.0.0",
      resources: { cpu_cores: 4, memory_gb: 16, disk_gb: 100 },
    },
    database: { kind: "postgres" as const },
  };

  test("valid runtime passes", () => {
    expect(RuntimeRequirementsSchema.safeParse(validRuntime).success).toBe(true);
  });

  test("requires at least one llm_provider", () => {
    expect(
      RuntimeRequirementsSchema.safeParse({
        ...validRuntime,
        llm_providers: [],
      }).success,
    ).toBe(false);
  });

  test("rejects unknown provider", () => {
    expect(
      RuntimeRequirementsSchema.safeParse({
        ...validRuntime,
        llm_providers: [
          { provider: "tinytalk", model: "x", via: "direct" as const },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("CustomToolKindSchema", () => {
  test("requires security review evidence", () => {
    expect(
      CustomToolKindSchema.safeParse({
        kind: "scrape",
        implementation_path: "tools/scrape.ts",
        default_permissions: { isReadOnly: true },
      }).success,
    ).toBe(false); // missing security_reviewed_at / by / threat_model_path
  });

  test("valid custom tool kind passes", () => {
    expect(
      CustomToolKindSchema.safeParse({
        kind: "scrape",
        implementation_path: "tools/scrape.ts",
        default_permissions: { isReadOnly: true },
        security_reviewed_at: "2026-04-27T00:00:00Z",
        security_reviewed_by: "security@ecc.com",
        threat_model_path: "tools/scrape.threat-model.md",
      }).success,
    ).toBe(true);
  });
});

describe("HookHandlerRegistrationSchema", () => {
  test("canonical hook name accepted", () => {
    expect(
      HookHandlerRegistrationSchema.safeParse({
        name: "memory_write_review_required",
        handler: "hooks/route.ts",
        fire_mode: "sync",
      }).success,
    ).toBe(true);
  });
  test("custom hook name accepted", () => {
    expect(
      HookHandlerRegistrationSchema.safeParse({
        name: "custom:ecc:rfq-shipped",
        handler: "hooks/notify.ts",
      }).success,
    ).toBe(true);
  });
  test("rejects extra fields", () => {
    expect(
      HookHandlerRegistrationSchema.safeParse({
        name: "session_start",
        handler: "x",
        priority: 1,
      }).success,
    ).toBe(false);
  });

  test("typo'd hook name rejected (regression — round-1 broad regex accepted it)", () => {
    expect(
      HookHandlerRegistrationSchema.safeParse({
        name: "not_a_hook",
        handler: "x",
      }).success,
    ).toBe(false);
  });

  test("malformed capability rejected (regression — round-1 took z.record(string,unknown))", () => {
    expect(
      HookHandlerRegistrationSchema.safeParse({
        name: "session_start",
        handler: "x",
        capabilities: [{ kind: "made_up" }],
      }).success,
    ).toBe(false);
  });

  test("well-formed canonical capability kinds accepted", () => {
    expect(
      HookHandlerRegistrationSchema.safeParse({
        name: "memory_write_review_required",
        handler: "x",
        capabilities: [
          { kind: "decision_log_emit" },
          { kind: "send_email", from: "x@y", to_pattern: "*@y" },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("CustomHookDeclarationSchema", () => {
  test("name must start with `custom:`", () => {
    expect(
      CustomHookDeclarationSchema.safeParse({
        name: "session_start",
        payload_schema: "x",
      }).success,
    ).toBe(false);
    expect(
      CustomHookDeclarationSchema.safeParse({
        name: "custom:ecc:rfq",
        payload_schema: "schemas/rfq.schema.json",
      }).success,
    ).toBe(true);
  });

  test("rejects uppercase / underscore segments (regression — round-1 only checked custom:)", () => {
    expect(
      CustomHookDeclarationSchema.safeParse({
        name: "custom:ECC:Bad_Event",
        payload_schema: "x",
      }).success,
    ).toBe(false);
    expect(
      CustomHookDeclarationSchema.safeParse({
        name: "custom:ecc:rfq_shipped",
        payload_schema: "x",
      }).success,
    ).toBe(false);
  });

  test("rejects bare `custom:` prefix without segments", () => {
    expect(
      CustomHookDeclarationSchema.safeParse({
        name: "custom:",
        payload_schema: "x",
      }).success,
    ).toBe(false);
  });

  test("rejects 4+ segments (spec mandates exactly custom:<ns>:<event>)", () => {
    expect(
      CustomHookDeclarationSchema.safeParse({
        name: "custom:ecc:rfq:shipped",
        payload_schema: "x",
      }).success,
    ).toBe(false);
  });
});

describe("ManifestDecisionMetadataBindingSchema", () => {
  test("valid binding for canonical DecisionType", () => {
    expect(
      ManifestDecisionMetadataBindingSchema.safeParse({
        type: "tool_execution_end",
        schema_ref: "openclaw-v1:ToolExecutionEndMetadata",
      }).success,
    ).toBe(true);
  });

  test("rejects arbitrary type strings (regression — round-1 accepted any string)", () => {
    expect(
      ManifestDecisionMetadataBindingSchema.safeParse({
        type: "tool_execution_made_up",
        schema_ref: "x",
      }).success,
    ).toBe(false);
  });

  test("accepts optional spec_version_min (regression — round-1 .strict() rejected it)", () => {
    expect(
      ManifestDecisionMetadataBindingSchema.safeParse({
        type: "tool_execution_end",
        schema_ref: "openclaw-v1:ToolExecutionEndMetadata",
        spec_version_min: "1.1.0",
      }).success,
    ).toBe(true);
  });

  test("rejects malformed spec_version_min", () => {
    expect(
      ManifestDecisionMetadataBindingSchema.safeParse({
        type: "tool_execution_end",
        schema_ref: "x",
        spec_version_min: "v1",
      }).success,
    ).toBe(false);
  });
});

describe("OutputValidatorConfigSchema", () => {
  test("valid config passes", () => {
    expect(
      OutputValidatorConfigSchema.safeParse({
        layers: ["json", "marker"],
        heuristic_confidence_threshold: 0.6,
        schemas: [{ marker: "reveal", schema_ref: "openclaw-v1:RevealSchema" }],
      }).success,
    ).toBe(true);
  });
  test("threshold must be 0..1", () => {
    expect(
      OutputValidatorConfigSchema.safeParse({
        layers: [],
        heuristic_confidence_threshold: 1.5,
        schemas: [],
      }).success,
    ).toBe(false);
  });
});

describe("PipelineManifestSchema — schema-level required fields", () => {
  test("missing top-level field rejected", () => {
    expect(PipelineManifestSchema.safeParse({}).success).toBe(false);
  });

  test("requires agents.minItems = 1", () => {
    // Build an otherwise-complete manifest with empty agents[]
    const r = PipelineManifestSchema.safeParse({
      id: "x",
      spec_version: "1.0.0",
      version: "0.1.0",
      name: "x",
      description: "x",
      agents: [],
      orchestrator: { agent_id: "x", skills: ["y"] },
      routing: { rules: [], fallback: "x" },
      failure_policy: {},
      merge_policy: [],
      memory_authority: [],
      config_docs: [],
      imports: [],
      output_validator: {
        layers: [],
        heuristic_confidence_threshold: 0,
        schemas: [],
      },
      dashboard: {
        manifest_path: "x",
        title: "x",
        default_landing_panel: "x",
      },
      eval_suite_ref: "x",
      hooks: [],
      custom_hooks: [],
      runtime: {
        tenancy: "shared",
        egress: "open",
        llm_providers: [
          { provider: "anthropic", model: "x", via: "direct" },
        ],
        sandbox: {
          image: "x",
          resources: { cpu_cores: 1, memory_gb: 1, disk_gb: 1 },
        },
        database: { kind: "sqlite" },
      },
      dev_stage: "drafted",
      generated_at: "2026-04-27T00:00:00Z",
      generated_by: "architect@1.0.0",
      checksum: `sha256:${"a".repeat(64)}`,
    });
    expect(r.success).toBe(false);
  });
});
