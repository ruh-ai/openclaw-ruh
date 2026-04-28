/**
 * pipeline-manifest-builder.ts — derive a v1-conformant pipeline manifest
 * from a builder ArchitecturePlan + agent metadata.
 *
 * Pure function. No I/O, no LLM calls. The architect produces ArchitecturePlan
 * (single-agent shape today); this module emits a `pipeline-manifest.json`
 * that the OpenClaw v1 spec recognises so the runtime substrate's
 * `runConformance()` can validate before deploy.
 *
 * Path A scope (single-agent first):
 *   - len(agents) == 1, role: "Single-agent pipeline", is_orchestrator: true
 *   - trivial routing (no rules, fallback: "main")
 *   - one Tier-1 memory_authority row in a generic "main" lane
 *   - empty hooks/custom_hooks/config_docs/imports
 *
 * Multi-agent fleets (Path B) extend this — when ArchitecturePlan.subAgents
 * is populated, this module today still emits a single-agent manifest with a
 * console warning. The fleet shape lands in a follow-up PR.
 *
 * Spec reference: docs/spec/openclaw-v1/011-pipeline-manifest.md
 * Substrate types: packages/openclaw-runtime/src/pipeline-manifest/types.ts
 */

import type { ArchitecturePlan } from "./types";

// ─── Public types ─────────────────────────────────────────────────────────

/**
 * Inputs for manifest derivation. Kept loose (most fields optional with
 * sensible defaults) so callers can drive this from partial copilot state
 * without juggling preconditions.
 */
export interface BuildPipelineManifestArgs {
  readonly agentName: string;
  readonly agentDescription: string;
  readonly plan: ArchitecturePlan;

  // Optional — defaults applied below
  readonly agentVersion?: string;
  readonly operatorIdentity?: string;
  readonly llmProvider?: "anthropic" | "openai" | "openrouter" | "gemini" | "ollama";
  readonly llmModel?: string;
  readonly tenancy?: "shared" | "dedicated" | "on-prem";
  readonly egress?: "open" | "restricted" | "tenant-bounded";
  readonly devStage?: "drafted" | "validated" | "tested" | "shipped";
  readonly generatedBy?: string;
  readonly generatedAt?: Date;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Produce a v1-conformant pipeline manifest object. Returned as `unknown`
 * intentionally — the consumer should `JSON.stringify` it for workspace
 * persistence and let the substrate validate the shape via
 * `runConformance()` rather than re-deriving the runtime types here.
 */
export function buildPipelineManifest(args: BuildPipelineManifestArgs): unknown {
  const id = slug(args.agentName) || "pipeline";
  const version = args.agentVersion ?? "0.1.0";
  const operator = args.operatorIdentity ?? "operator";
  const generatedAt = (args.generatedAt ?? new Date()).toISOString();

  // Single-agent pipelines still get an `agents[]` of length 1 — the spec
  // explicitly treats this as the smallest valid pipeline.
  const mainAgentId = "main";

  // Path A: emit a one-row authority entry in a generic "main" lane. Real
  // multi-role authority comes with Path B + memory model elicitation.
  const memoryLane = "main";

  // Skill ids the orchestrator exposes as pipeline entry points. The
  // single-agent orchestrator IS the agent itself, so it exposes every
  // skill the architect emitted.
  const orchestratorSkills = args.plan.skills.map((s) => s.id);

  // Tool integrations declared by the architect become required
  // integrations the runtime expects to be wired up before the pipeline
  // can run. Empty when the agent uses no external tools.
  const requiredIntegrations = args.plan.integrations.map((i) => i.toolId);

  // The substrate's RuntimeRequirements.llm_providers requires a non-empty
  // array; an empty list fails schema parse with a minItems error. When the
  // caller doesn't supply an explicit provider/model (e.g. the agent record
  // hasn't surfaced its model selection through to Plan-complete yet), fall
  // back to the platform default. Path B will read the actual provider/model
  // from the agent record once memory + identity capture is wired through
  // Think/Plan; for now the default keeps the manifest schema-valid and the
  // Ship gate honest.
  const llmProviders =
    args.llmProvider && args.llmModel
      ? [
          {
            provider: args.llmProvider,
            model: args.llmModel,
            via: "tenant-proxy" as const,
          },
        ]
      : [
          {
            // Matches the platform default in CLAUDE.md (Anthropic via tenant proxy).
            provider: "anthropic" as const,
            model: "claude-opus-4-7",
            via: "tenant-proxy" as const,
          },
        ];

  return {
    // Identity
    id,
    spec_version: "1.0.0-rc.1",
    version,
    name: args.agentName,
    description: args.agentDescription,

    // Composition (single-agent shape)
    agents: [
      {
        id: mainAgentId,
        path: `agents/${mainAgentId}/`,
        version,
        role: "Single-agent pipeline",
        is_orchestrator: true,
      },
    ],
    orchestrator: { agent_id: mainAgentId, skills: orchestratorSkills },

    // Routing & coordination
    routing: { rules: [], fallback: mainAgentId },
    failure_policy: {},
    merge_policy: [],

    // Memory & config
    memory_authority: [
      { tier: 1, lane: memoryLane, writers: [operator] },
    ],
    config_docs: [],
    imports: [],

    // Output validation — minimum substrate-acceptable shape
    output_validator: {
      layers: ["marker"],
      heuristic_confidence_threshold: 0.6,
      schemas: [],
    },

    // Surface — references the dashboard manifest the build pipeline writes
    dashboard: {
      manifest_path: "dashboard/manifest.json",
      title: args.agentName,
      default_landing_panel: "main-chat",
    },

    // Verification
    eval_suite_ref: "eval/tasks.json",

    // Extensibility — Path A leaves these empty
    hooks: [],
    custom_hooks: [],

    // Runtime
    runtime: {
      tenancy: args.tenancy ?? "dedicated",
      egress: args.egress ?? "open",
      llm_providers: llmProviders,
      sandbox: {
        image: "openclaw-runtime:1.0.0",
        resources: { cpu_cores: 4, memory_gb: 16, disk_gb: 100 },
      },
      database: { kind: "postgres" },
      ...(requiredIntegrations.length > 0
        ? { required_integrations: requiredIntegrations }
        : {}),
    },

    // Lifecycle
    dev_stage: args.devStage ?? "drafted",

    // Provenance
    generated_at: generatedAt,
    generated_by: args.generatedBy ?? "architect@1.0.0",
    // Substrate validates checksum format only (sha256:<64-hex>); the
    // real digest is recomputed at deploy time over the resolved
    // pipeline state. Workspace artifact carries a placeholder.
    checksum: `sha256:${"0".repeat(64)}`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
