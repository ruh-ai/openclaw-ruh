/**
 * pipeline-manifest-builder.ts — derive a v1-conformant pipeline manifest
 * from a builder ArchitecturePlan + agent metadata.
 *
 * Pure function. No I/O, no LLM calls. The architect produces
 * ArchitecturePlan; this module emits a `pipeline-manifest.json` that the
 * OpenClaw v1 spec recognises so the runtime substrate's `runConformance()`
 * can validate before deploy.
 *
 * Path A (shipped) — single-agent pipelines:
 *   - `len(agents) == 1`, role: "Single-agent pipeline", is_orchestrator: true
 *   - trivial routing (no rules, fallback: "main")
 *   - one Tier-1 memory_authority row in a generic "main" lane
 *   - empty hooks/custom_hooks/config_docs/imports
 *
 * Path B Slice 1 (this PR) — multi-agent fleet emission:
 *   - When `plan.subAgents.length > 0`, manifest grows:
 *       * `agents[]` = [main orchestrator] + one entry per sub-agent
 *       * `routing.rules` derived from each sub-agent's `trigger`
 *       * `failure_policy` row per sub-agent (default `retry-then-escalate`)
 *       * one Tier-1 memory_authority row per sub-agent (lane = sub-agent id)
 *   - Single-agent shape (empty subAgents) is unchanged from Path A
 *   - Operator is still the only writer in every authority row;
 *     per-role identity capture is Path B Slice 4
 *
 * Out of scope for this slice (Path B Slices 2/3/4):
 *   - Architect's Plan instruction does not yet ELICIT sub-agents — this
 *     module emits the right manifest IF subAgents are populated, but
 *     today the architect leaves them empty
 *   - Build pipeline does not yet decompose across sub-agents — the
 *     emitted manifest is structurally valid but the per-sub-agent file
 *     trees the manifest references won't be generated until B3
 *   - Real per-role memory authority (Darrow-Tier1-Estimating, etc.)
 *     captured in Think/Plan — Path B Slice 4
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

  // ── Sub-agent lift (Path B Slice 1) ──────────────────────────────────
  // When the architect populated `plan.subAgents`, the manifest becomes a
  // multi-agent fleet: main orchestrator + one entry per sub-agent. Empty
  // subAgents preserves the Path A single-agent shape exactly.
  const subAgents = args.plan.subAgents ?? [];
  const isFleet = subAgents.length > 0;

  const mainAgent = {
    id: mainAgentId,
    path: `agents/${mainAgentId}/`,
    version,
    role: isFleet ? "Pipeline orchestrator" : "Single-agent pipeline",
    is_orchestrator: true,
  };

  const subAgentEntries = subAgents.map((sa) => ({
    id: sa.id,
    path: `agents/${sa.id}/`,
    version,
    // Sub-agents NEVER carry is_orchestrator: true (substrate enforces
    // exactly one orchestrator per pipeline; main owns it).
    role: sa.description?.trim() || sa.name,
  }));

  const agents = [mainAgent, ...subAgentEntries];

  // Routing rules — one per sub-agent that declared a non-empty trigger.
  // Sub-agents without triggers fall through to the orchestrator (`fallback`).
  // The architect's `trigger` field maps directly to MatchClause.stage.
  const routingRules = subAgents
    .filter((sa) => typeof sa.trigger === "string" && sa.trigger.trim().length > 0)
    .map((sa) => ({
      match: { stage: sa.trigger.trim() },
      specialist: sa.id,
    }));

  // Failure policy per sub-agent. `retry-then-escalate` is the safe default
  // for unknown specialists; per-agent customisation lands in Path B Slice 2
  // when the architect can express failure intent.
  const failurePolicy: Record<string, "abort" | "skip" | "retry-then-escalate" | "retry-then-skip" | "manual-review"> = {};
  for (const sa of subAgents) {
    failurePolicy[sa.id] = "retry-then-escalate";
  }

  // Memory authority — one row per agent. Each sub-agent gets its own lane
  // (kebab-case from sub-agent id) so writes from one specialist don't
  // overwrite another's. Operator remains the writer in every row; real
  // per-role identity (Darrow → estimating, etc.) is Path B Slice 4.
  const memoryAuthority = [
    { tier: 1 as const, lane: memoryLane, writers: [operator] },
    ...subAgents.map((sa) => ({
      tier: 1 as const,
      lane: sa.id,
      writers: [operator],
    })),
  ];

  return {
    // Identity
    id,
    spec_version: "1.0.0-rc.1",
    version,
    name: args.agentName,
    description: args.agentDescription,

    // Composition — single-agent (Path A) or fleet (Path B Slice 1)
    agents,
    orchestrator: { agent_id: mainAgentId, skills: orchestratorSkills },

    // Routing & coordination
    routing: { rules: routingRules, fallback: mainAgentId },
    failure_policy: failurePolicy,
    merge_policy: [],

    // Memory & config
    memory_authority: memoryAuthority,
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
