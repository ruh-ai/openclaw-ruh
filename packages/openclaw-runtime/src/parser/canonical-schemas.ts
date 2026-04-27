/**
 * Canonical marker schemas.
 *
 * Implements: docs/spec/openclaw-v1/015-output-validator.md (Schemas section)
 * Mirrors: docs/spec/openclaw-v1/schemas/output-validator.schema.json
 *
 * Every marker the runtime trusts has a Zod schema. Adding a new canonical
 * marker = adding its schema here AND updating the schema_ref bindings in
 * pipeline manifests that emit it.
 */

import { z } from "zod";

// ─── <reveal /> — employee profile reveal ──────────────────────────────

export const RevealSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().min(1),
    opening: z.string().min(1),
    what_i_heard: z.array(z.string()),
    what_i_will_own: z.array(z.string()),
    what_i_wont_do: z.array(z.string()),
    first_move: z.string().min(1),
    clarifying_question: z.string().min(1),
  })
  .strict();

export type Reveal = z.infer<typeof RevealSchema>;

// ─── <think_step /> — reasoning step ──────────────────────────────────

export const ThinkStepSchema = z
  .object({
    step: z.string().min(1),
    status: z.enum(["started", "complete"]),
  })
  .strict();

export type ThinkStep = z.infer<typeof ThinkStepSchema>;

// ─── <think_research_finding /> ───────────────────────────────────────

export const ThinkResearchFindingSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    source: z.string().optional(),
  })
  .strict();

export type ThinkResearchFinding = z.infer<typeof ThinkResearchFindingSchema>;

// ─── <think_document_ready /> ─────────────────────────────────────────

export const ThinkDocumentReadySchema = z
  .object({
    docType: z.string().min(1),
    path: z.string().min(1),
  })
  .strict();

export type ThinkDocumentReady = z.infer<typeof ThinkDocumentReadySchema>;

// ─── <plan_skill /> ────────────────────────────────────────────────────

export const PlanSkillSchema = z
  .object({
    id: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1),
    description: z.string().optional().default(""),
    dependencies: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).optional().default([]),
    toolType: z.string().optional(),
    envVars: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).optional(),
  })
  .strict();

export type PlanSkill = z.infer<typeof PlanSkillSchema>;

// ─── <plan_workflow /> ─────────────────────────────────────────────────

export const PlanWorkflowStepSchema = z
  .object({
    skillId: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/),
    parallel: z.boolean().optional(),
  })
  .strict();

export const PlanWorkflowSchema = z
  .object({
    steps: z.array(PlanWorkflowStepSchema),
  })
  .strict();

export type PlanWorkflow = z.infer<typeof PlanWorkflowSchema>;
export type PlanWorkflowStep = z.infer<typeof PlanWorkflowStepSchema>;

// ─── Canonical bindings (registry seed) ───────────────────────────────

import type { MarkerSchemaBinding } from "./structured-output-parser";

/**
 * Every canonical marker the runtime ships. Pipelines may extend with custom
 * markers via their `pipeline-manifest.json`'s `output_validator.schemas[]` —
 * those bindings register pipeline-local schemas alongside these.
 */
export const CANONICAL_BINDINGS: ReadonlyArray<MarkerSchemaBinding> = [
  { markerName: "reveal", schemaName: "openclaw-v1:RevealSchema", schema: RevealSchema },
  { markerName: "think_step", schemaName: "openclaw-v1:ThinkStepSchema", schema: ThinkStepSchema },
  {
    markerName: "think_research_finding",
    schemaName: "openclaw-v1:ThinkResearchFindingSchema",
    schema: ThinkResearchFindingSchema,
  },
  {
    markerName: "think_document_ready",
    schemaName: "openclaw-v1:ThinkDocumentReadySchema",
    schema: ThinkDocumentReadySchema,
  },
  { markerName: "plan_skill", schemaName: "openclaw-v1:PlanSkillSchema", schema: PlanSkillSchema },
  {
    markerName: "plan_workflow",
    schemaName: "openclaw-v1:PlanWorkflowSchema",
    schema: PlanWorkflowSchema,
  },
];

import type { MarkerSchemaRegistry } from "./structured-output-parser";

/** Bind every canonical marker schema to a registry. */
export function registerCanonicalBindings(registry: MarkerSchemaRegistry): void {
  for (const binding of CANONICAL_BINDINGS) {
    registry.bind(binding);
  }
}
