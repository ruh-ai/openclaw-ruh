/**
 * Pipeline manifest — types.
 *
 * Implements: docs/spec/openclaw-v1/011-pipeline-manifest.md
 * Mirrors:    docs/spec/openclaw-v1/schemas/pipeline-manifest.schema.json
 *
 * Top-level artifact tying every other section together. The substrate
 * provides the shape + cross-validation. The parts of the manifest that
 * reference modules already implemented in earlier phases (orchestrator,
 * memory, config, eval, hooks, decision-log) reuse those types directly.
 *
 * For modules NOT yet substrate-implemented (output-validator config,
 * pipeline retry overrides, custom-hook declarations, dashboard refs)
 * the substrate ships minimal local shapes that match the spec's JSON
 * Schema. They can move to dedicated modules later.
 */

import type { ConvergenceLoopConfig } from "../eval/types";
import type { DocIndexEntry, ImportJob } from "../config/types";
import type { DecisionType } from "../decision-log/types";
import type { MemoryAuthority } from "../memory/types";
import type {
  FailurePolicy,
  MergePolicyRule,
  OrchestratorRef,
  RoutingRules,
} from "../orchestrator/types";

// ─── Pipeline-level dev_stage subset ──────────────────────────────────

/**
 * Per spec §lifecycle: pipeline-level dev_stage is a strict 4-value subset
 * of agent dev_stage. Pipelines never enter `running` / `paused` /
 * `archived` — those are agent-level runtime states.
 */
export type PipelineDevStage = "drafted" | "validated" | "tested" | "shipped";

export const PIPELINE_DEV_STAGES: ReadonlyArray<PipelineDevStage> = [
  "drafted",
  "validated",
  "tested",
  "shipped",
];

// ─── AgentRef ─────────────────────────────────────────────────────────

export interface AgentRef {
  readonly id: string;
  /** `agents/<kebab-id>/` — workspace path with trailing slash. */
  readonly path: string;
  readonly version: string;
  readonly role: string;
  readonly is_orchestrator?: boolean;
  /** When `privileged: true`, the agent gains additional read/write scopes. */
  readonly privileged?: boolean;
  readonly extended_scopes?: ReadonlyArray<string>;
}

// ─── DashboardRef ─────────────────────────────────────────────────────

export interface DashboardBranding {
  readonly primary_color?: string;
  readonly secondary_color?: string;
  readonly logo_path?: string;
}

export interface DashboardRef {
  readonly manifest_path: string;
  readonly title: string;
  readonly branding?: DashboardBranding;
  readonly default_landing_panel: string;
}

// ─── CustomToolKind ───────────────────────────────────────────────────

export interface CustomToolEgressScope {
  readonly allowed_hosts?: ReadonlyArray<string>;
  readonly rate_limit_per_minute?: number;
}

export interface CustomToolKind {
  readonly kind: string;
  readonly implementation_path: string;
  readonly schema_ref?: string;
  /** Default permission flags for instances; concrete tool refs may override but never loosen. */
  readonly default_permissions: Readonly<Record<string, unknown>>;
  readonly egress_scope?: CustomToolEgressScope;
  readonly subprocess_allowed?: boolean;
  readonly security_reviewed_at: string;
  readonly security_reviewed_by: string;
  readonly threat_model_path: string;
}

// ─── RuntimeRequirements ──────────────────────────────────────────────

export type RuntimeTenancy = "shared" | "dedicated" | "on-prem";
export type RuntimeEgress = "open" | "restricted" | "tenant-bounded";

export interface RuntimeLlmProvider {
  readonly provider: "anthropic" | "openai" | "openrouter" | "gemini" | "ollama";
  readonly model: string;
  readonly via: "direct" | "tenant-proxy";
}

export interface RuntimeSandboxResources {
  readonly cpu_cores: number;
  readonly memory_gb: number;
  readonly disk_gb: number;
}

export interface RuntimeSandbox {
  readonly image: string;
  readonly resources: RuntimeSandboxResources;
  readonly persistent_volumes?: ReadonlyArray<string>;
}

export interface RuntimeDatabase {
  readonly kind: "postgres" | "sqlite";
  readonly connection_ref?: string;
}

export interface RuntimeRequirements {
  readonly tenancy: RuntimeTenancy;
  readonly egress: RuntimeEgress;
  readonly llm_providers: ReadonlyArray<RuntimeLlmProvider>;
  readonly sandbox: RuntimeSandbox;
  readonly database: RuntimeDatabase;
  readonly required_integrations?: ReadonlyArray<string>;
}

// ─── Hook + decision-metadata refs (manifest-bound shapes) ────────────

/**
 * Reference shape — the substrate's `hooks` module owns the canonical
 * shapes for hook names and capabilities. The schema validators reuse
 * `HookNameSchema` and `HookCapabilitySchema` from there so a typo'd
 * name (`not_a_hook`) or a malformed capability (`{ kind: "made_up" }`)
 * fails parse instead of registering an inert hook.
 *
 * `name` is typed as `string` here even though Zod's `HookNameSchema`
 * narrows to canonical | custom: at parse time, because the inferred
 * type is plain `string` (the schema uses `.refine`, not a discriminated
 * literal union).
 */
import type { HookCapability } from "../hooks/types";
export type { HookCapability, HookName } from "../hooks/types";

export interface HookHandlerRegistration {
  /** Canonical hook name OR `custom:<ns>:<event>` (validated at parse). */
  readonly name: string;
  /** Workspace-relative path to the handler module. */
  readonly handler: string;
  readonly fire_mode?: "sync" | "fire_and_forget";
  /** Validated against the canonical 7 capability kinds at parse time. */
  readonly capabilities?: ReadonlyArray<HookCapability>;
}

export type HookCapabilityMode = "strict" | "loose";

export interface CustomHookDeclaration {
  readonly name: string;
  /** Path to the JSON Schema validating this custom hook's payload. */
  readonly payload_schema: string;
}

/**
 * Manifest-layer reference to a metadata schema. Distinct from
 * `DecisionMetadataSchemaBinding` in `src/decision-log/`, which is the
 * runtime in-memory binding holding a live `ZodType`. Pipelines declare
 * `ManifestDecisionMetadataBinding` (string `schema_ref`); the runtime
 * resolves them into `DecisionMetadataSchemaBinding` at load time.
 */
export interface ManifestDecisionMetadataBinding {
  /** Must be a canonical DecisionType from spec 005. */
  readonly type: DecisionType;
  /** Schema reference: `openclaw-v1:<Name>` or `schemas/<file>.json[#/$defs/Type]`. */
  readonly schema_ref: string;
  /**
   * Optional spec-version floor: the binding only applies when the
   * runtime's spec version ≥ this value. Useful for additive metadata
   * shapes that landed in a later minor.
   */
  readonly spec_version_min?: string;
}

// ─── Output validator config (referenced from manifest) ───────────────

export type OutputValidatorLayer = "json" | "marker" | "heuristic";

export interface OutputValidatorSchemaRef {
  readonly marker: string;
  readonly schema_ref: string;
}

export interface OutputValidatorConfig {
  readonly layers: ReadonlyArray<OutputValidatorLayer>;
  /** 0..1 confidence threshold below which heuristic layer rejects. */
  readonly heuristic_confidence_threshold: number;
  readonly schemas: ReadonlyArray<OutputValidatorSchemaRef>;
}

// ─── Pipeline retry overrides ─────────────────────────────────────────

export interface PipelineRetryOverride {
  readonly category: string;
  readonly max_attempts?: number;
  readonly initial_delay_ms?: number;
  readonly backoff_multiplier?: number;
  readonly max_delay_ms?: number;
  readonly retryable?: boolean;
}

export type PipelineRetryOverrides = ReadonlyArray<PipelineRetryOverride>;

// ─── PipelineManifest ─────────────────────────────────────────────────

export interface PipelineManifest {
  // Identity
  readonly id: string;
  readonly spec_version: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;

  // Composition
  readonly agents: ReadonlyArray<AgentRef>;
  readonly orchestrator: OrchestratorRef;

  // Routing & coordination
  readonly routing: RoutingRules;
  readonly failure_policy: Readonly<Record<string, FailurePolicy>>;
  readonly merge_policy: ReadonlyArray<MergePolicyRule>;

  // Memory & config
  readonly memory_authority: MemoryAuthority;
  readonly config_docs: ReadonlyArray<DocIndexEntry>;
  readonly imports: ReadonlyArray<ImportJob>;

  // Output validation
  readonly output_validator: OutputValidatorConfig;

  // Surface
  readonly dashboard: DashboardRef;

  // Verification
  readonly eval_suite_ref: string;
  readonly convergence_loop?: ConvergenceLoopConfig;

  // Audit + observability
  readonly decision_metadata_schemas?: ReadonlyArray<ManifestDecisionMetadataBinding>;

  // Extensibility
  readonly hooks: ReadonlyArray<HookHandlerRegistration>;
  readonly hook_capability_mode?: HookCapabilityMode;
  readonly custom_hooks: ReadonlyArray<CustomHookDeclaration>;
  readonly custom_tool_kinds?: ReadonlyArray<CustomToolKind>;

  // Runtime
  readonly retry_overrides?: PipelineRetryOverrides;
  readonly runtime: RuntimeRequirements;

  // Lifecycle
  readonly dev_stage: PipelineDevStage;

  // Provenance
  readonly generated_at: string;
  readonly generated_by: string;
  /** sha256:<64-hex> of the resolved pipeline state. */
  readonly checksum: string;
}
