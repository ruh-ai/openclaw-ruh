/**
 * Pipeline manifest — Zod schemas.
 *
 * Mirrors docs/spec/openclaw-v1/schemas/pipeline-manifest.schema.json.
 * Reuses Zod schemas from already-substrate-implemented modules
 * (orchestrator, memory, config, eval, decision-log) and ships small
 * inline schemas for fields whose substrate module hasn't landed yet.
 */

import { z } from "zod";
import { ConvergenceLoopConfigSchema } from "../eval/schemas";
import {
  DocIndexEntrySchema,
  ImportJobSchema,
} from "../config/schemas";
import { MemoryAuthoritySchema } from "../memory/schemas";
import {
  FailurePolicySchema,
  MergePolicyRuleSchema,
  OrchestratorRefSchema,
  RoutingRulesSchema,
} from "../orchestrator/schemas";
import {
  HookCapabilitySchema,
  HookFireModeSchema,
  HookNameSchema,
} from "../hooks/schemas";
import { CUSTOM_HOOK_NAME_PATTERN } from "../hooks/types";
import type {
  AgentRef,
  CustomHookDeclaration,
  CustomToolKind,
  DashboardRef,
  ManifestDecisionMetadataBinding,
  HookHandlerRegistration,
  OutputValidatorConfig,
  PipelineDevStage,
  PipelineManifest,
  PipelineRetryOverride,
  RuntimeRequirements,
} from "./types";

const KEBAB_CASE = /^[a-z][a-z0-9-]*$/;
const KEBAB_PATH = /^agents\/[a-z][a-z0-9-]*\/$/;
const SEM_VER = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// ─── Pipeline dev_stage subset ────────────────────────────────────────

export const PipelineDevStageSchema = z.enum([
  "drafted",
  "validated",
  "tested",
  "shipped",
]);

const _devStageCheck: z.infer<typeof PipelineDevStageSchema> extends PipelineDevStage
  ? true
  : false = true;
void _devStageCheck;

// ─── AgentRef ─────────────────────────────────────────────────────────

export const AgentRefSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE),
    path: z.string().regex(KEBAB_PATH),
    version: z.string().regex(SEM_VER),
    role: z.string().min(1),
    is_orchestrator: z.boolean().optional(),
    privileged: z.boolean().optional(),
    extended_scopes: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine(
    (a) =>
      !a.privileged ||
      (Array.isArray(a.extended_scopes) && a.extended_scopes.length > 0),
    {
      message:
        "privileged agents must declare a non-empty extended_scopes array (per spec 011 validation rules)",
    },
  );

const _agentRefCheck: z.infer<typeof AgentRefSchema> extends AgentRef
  ? true
  : false = true;
void _agentRefCheck;

// ─── DashboardRef ─────────────────────────────────────────────────────

const DashboardBrandingSchema = z
  .object({
    primary_color: z.string().regex(HEX_COLOR).optional(),
    secondary_color: z.string().regex(HEX_COLOR).optional(),
    logo_path: z.string().optional(),
  })
  .strict();

export const DashboardRefSchema = z
  .object({
    manifest_path: z.string().min(1),
    title: z.string().min(1),
    branding: DashboardBrandingSchema.optional(),
    default_landing_panel: z.string().min(1),
  })
  .strict();

const _dashCheck: z.infer<typeof DashboardRefSchema> extends DashboardRef
  ? true
  : false = true;
void _dashCheck;

// ─── CustomToolKind ───────────────────────────────────────────────────

export const CustomToolKindSchema = z
  .object({
    kind: z.string().regex(KEBAB_CASE),
    implementation_path: z.string().min(1),
    schema_ref: z.string().optional(),
    default_permissions: z.record(z.string(), z.unknown()),
    egress_scope: z
      .object({
        allowed_hosts: z.array(z.string().min(1)).optional(),
        rate_limit_per_minute: z.number().int().min(1).optional(),
      })
      .strict()
      .optional(),
    subprocess_allowed: z.boolean().optional(),
    security_reviewed_at: z.string().datetime({ offset: true }),
    security_reviewed_by: z.string().min(1),
    threat_model_path: z.string().min(1),
  })
  .strict();

const _toolKindCheck: z.infer<typeof CustomToolKindSchema> extends CustomToolKind
  ? true
  : false = true;
void _toolKindCheck;

// ─── RuntimeRequirements ──────────────────────────────────────────────

export const RuntimeRequirementsSchema = z
  .object({
    tenancy: z.enum(["shared", "dedicated", "on-prem"]),
    egress: z.enum(["open", "restricted", "tenant-bounded"]),
    llm_providers: z
      .array(
        z
          .object({
            provider: z.enum([
              "anthropic",
              "openai",
              "openrouter",
              "gemini",
              "ollama",
            ]),
            model: z.string().min(1),
            via: z.enum(["direct", "tenant-proxy"]),
          })
          .strict(),
      )
      .min(1),
    sandbox: z
      .object({
        image: z.string().min(1),
        resources: z
          .object({
            cpu_cores: z.number().int().min(1),
            memory_gb: z.number().int().min(1),
            disk_gb: z.number().int().min(1),
          })
          .strict(),
        persistent_volumes: z.array(z.string()).optional(),
      })
      .strict(),
    database: z
      .object({
        kind: z.enum(["postgres", "sqlite"]),
        connection_ref: z.string().optional(),
      })
      .strict(),
    required_integrations: z.array(z.string()).optional(),
  })
  .strict();

const _runtimeCheck: z.infer<typeof RuntimeRequirementsSchema> extends RuntimeRequirements
  ? true
  : false = true;
void _runtimeCheck;

// ─── HookHandlerRegistration / CustomHookDeclaration ──────────────────

/**
 * Reuses HookNameSchema / HookFireModeSchema / HookCapabilitySchema from
 * the hooks module so the manifest validator stays in sync with the
 * runtime. The previous round had a broad regex for the name and an
 * untyped record for capabilities, which let typo'd hook names and
 * malformed capability shapes pass validation only to fail (or worse,
 * silently no-op) at runtime.
 */
export const HookHandlerRegistrationSchema = z
  .object({
    name: HookNameSchema,
    handler: z.string().min(1),
    fire_mode: HookFireModeSchema.optional(),
    capabilities: z.array(HookCapabilitySchema).optional(),
  })
  .strict();

const _hookCheck: z.infer<typeof HookHandlerRegistrationSchema> extends HookHandlerRegistration
  ? true
  : false = true;
void _hookCheck;

export const CustomHookDeclarationSchema = z
  .object({
    /**
     * Canonical custom hook name pattern per
     * `docs/spec/openclaw-v1/schemas/hooks.schema.json`. The previous
     * revision used `^custom:` which let typo'd names like
     * `custom:ECC:Bad_Event` or `custom:` pass validation. Using the
     * shared pattern keeps the manifest schema and the hooks runtime
     * in lockstep.
     */
    name: z.string().regex(CUSTOM_HOOK_NAME_PATTERN),
    payload_schema: z.string().min(1),
  })
  .strict();

const _customHookCheck: z.infer<typeof CustomHookDeclarationSchema> extends CustomHookDeclaration
  ? true
  : false = true;
void _customHookCheck;

export const HookCapabilityModeSchema = z.enum(["strict", "loose"]);

// ─── Decision metadata schema binding (manifest layer) ────────────────

import { DecisionTypeSchema } from "../decision-log/schemas";

export const ManifestDecisionMetadataBindingSchema = z
  .object({
    /** Canonical DecisionType from spec 005 — narrowed to prevent typos. */
    type: DecisionTypeSchema,
    schema_ref: z.string().min(1),
    /** Optional spec_version floor (semver). Round-1 .strict() rejected this; spec 005 permits it. */
    spec_version_min: z
      .string()
      .regex(SEM_VER, "must be semver (M.m.p[-prerelease])")
      .optional(),
  })
  .strict();

const _bindingCheck: z.infer<typeof ManifestDecisionMetadataBindingSchema> extends ManifestDecisionMetadataBinding
  ? true
  : false = true;
void _bindingCheck;

// ─── OutputValidatorConfig ────────────────────────────────────────────

export const OutputValidatorConfigSchema = z
  .object({
    layers: z.array(z.enum(["json", "marker", "heuristic"])),
    heuristic_confidence_threshold: z.number().min(0).max(1),
    schemas: z.array(
      z
        .object({
          marker: z.string().min(1),
          schema_ref: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

const _outputCheck: z.infer<typeof OutputValidatorConfigSchema> extends OutputValidatorConfig
  ? true
  : false = true;
void _outputCheck;

// ─── PipelineRetryOverrides ───────────────────────────────────────────

export const PipelineRetryOverrideSchema = z
  .object({
    category: z.string().min(1),
    max_attempts: z.number().int().min(0).optional(),
    initial_delay_ms: z.number().int().min(0).optional(),
    backoff_multiplier: z.number().min(1).optional(),
    max_delay_ms: z.number().int().min(0).optional(),
    retryable: z.boolean().optional(),
  })
  .strict();

const _retryCheck: z.infer<typeof PipelineRetryOverrideSchema> extends PipelineRetryOverride
  ? true
  : false = true;
void _retryCheck;

// ─── PipelineManifest ─────────────────────────────────────────────────

export const PipelineManifestSchema = z
  .object({
    // Identity
    id: z.string().regex(KEBAB_CASE),
    spec_version: z.string().regex(SEM_VER),
    version: z.string().regex(SEM_VER),
    name: z.string().min(1),
    description: z.string().min(1),

    // Composition
    agents: z.array(AgentRefSchema).min(1),
    orchestrator: OrchestratorRefSchema,

    // Routing
    routing: RoutingRulesSchema,
    failure_policy: z.record(z.string(), FailurePolicySchema),
    merge_policy: z.array(MergePolicyRuleSchema),

    // Memory + config
    memory_authority: MemoryAuthoritySchema,
    config_docs: z.array(DocIndexEntrySchema),
    imports: z.array(ImportJobSchema),

    // Output validation
    output_validator: OutputValidatorConfigSchema,

    // Surface
    dashboard: DashboardRefSchema,

    // Verification
    eval_suite_ref: z.string().min(1),
    convergence_loop: ConvergenceLoopConfigSchema.optional(),

    // Audit + observability
    decision_metadata_schemas: z
      .array(ManifestDecisionMetadataBindingSchema)
      .optional(),

    // Extensibility
    hooks: z.array(HookHandlerRegistrationSchema),
    hook_capability_mode: HookCapabilityModeSchema.optional(),
    custom_hooks: z.array(CustomHookDeclarationSchema),
    custom_tool_kinds: z.array(CustomToolKindSchema).optional(),

    // Runtime
    retry_overrides: z.array(PipelineRetryOverrideSchema).optional(),
    runtime: RuntimeRequirementsSchema,

    // Lifecycle
    dev_stage: PipelineDevStageSchema,

    // Provenance
    generated_at: z.string().datetime({ offset: true }),
    generated_by: z.string().min(1),
    checksum: z.string().regex(SHA256),
  })
  .strict();

// PipelineManifest has many readonly fields and optional unions that
// trip the plain `extends` check; the structural type the schema infers
// IS compatible at runtime. We skip the type-level guard here and rely
// on the field-level guards above.
const _ = (manifest: z.infer<typeof PipelineManifestSchema>): PipelineManifest =>
  manifest as PipelineManifest;
void _;
