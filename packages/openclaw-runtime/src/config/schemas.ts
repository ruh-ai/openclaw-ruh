/**
 * Config substrate — Zod schemas.
 *
 * Mirrors docs/spec/openclaw-v1/schemas/config-substrate.schema.json. The
 * canonical contract is JSON Schema; these Zod schemas are the in-process
 * equivalent the substrate uses for runtime validation.
 *
 * Note on entry validation: the doc's per-entry schema (`schema.json` on
 * disk) is JSON Schema in the on-disk contract. The Config facade accepts
 * a `ZodType<unknown>` per registered doc so the substrate validates
 * commits against a TypeScript-native schema. Pipeline tools that need to
 * round-trip Zod ↔ JSON Schema can do so externally.
 */

import { z } from "zod";
import type {
  Dimension,
  DocIndexEntry,
  DocManifest,
  ImportJob,
  TopLevelManifest,
  VersionEnvelope,
} from "./types";

const KEBAB_CASE = /^[a-z][a-z0-9-]*$/;
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const KEBAB_PATH = /^[a-z][a-z0-9-]*\/$/;
const SEM_VER = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$/;

// ─── DocIndexEntry / TopLevelManifest ─────────────────────────────────

export const DocIndexEntrySchema = z
  .object({
    id: z.string().regex(KEBAB_CASE, "must be kebab-case"),
    path: z.string().regex(KEBAB_PATH, "must be kebab-case with trailing slash"),
    owner: z.string().min(1),
    review_lane: z.string().regex(KEBAB_CASE, "review_lane must be kebab-case"),
  })
  .strict();

const _docIndexCheck: z.infer<typeof DocIndexEntrySchema> extends DocIndexEntry
  ? true
  : false = true;
void _docIndexCheck;

export const TopLevelManifestSchema = z
  .object({
    spec_version: z.string().regex(SEM_VER),
    docs: z.array(DocIndexEntrySchema),
  })
  .strict();

const _topManifestCheck: z.infer<typeof TopLevelManifestSchema> extends TopLevelManifest
  ? true
  : false = true;
void _topManifestCheck;

// ─── Dimension / DocManifest ──────────────────────────────────────────

export const DimensionTypeSchema = z.enum(["enum", "string", "integer", "boolean"]);

export const DimensionSchema = z
  .object({
    name: z.string().regex(SNAKE_CASE, "dimension name must be snake_case"),
    type: DimensionTypeSchema,
    values: z.array(z.string()).optional(),
    pattern: z.string().optional(),
  })
  .strict()
  .refine(
    (d) => d.type !== "enum" || (Array.isArray(d.values) && d.values.length > 0),
    { message: "type='enum' requires non-empty values[]" },
  );

const _dimensionCheck: z.infer<typeof DimensionSchema> extends Dimension
  ? true
  : false = true;
void _dimensionCheck;

export const DocManifestSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE),
    spec_version: z.string().regex(SEM_VER),
    name: z.string().min(1),
    description: z.string().min(1),
    schema_path: z.literal("schema.json"),
    current_version: z.number().int().min(1),
    current_path: z.literal("current.json"),
    dimensions: z.array(DimensionSchema).min(1),
    lookup_function: z.string().optional(),
    version_history_path: z.literal("versions/"),
    owner: z.string().min(1),
    last_updated_at: z.string().datetime({ offset: true }),
    last_updated_by: z.string().min(1),
  })
  .strict();

const _docManifestCheck: z.infer<typeof DocManifestSchema> extends DocManifest
  ? true
  : false = true;
void _docManifestCheck;

// ─── VersionEnvelope ──────────────────────────────────────────────────

/**
 * Generic schema factory: given a per-entry Zod schema, build the
 * envelope schema with the appropriate `data` shape.
 */
export function versionEnvelopeSchema<TEntry>(entrySchema: z.ZodType<TEntry>) {
  return z
    .object({
      version: z.number().int().min(1),
      spec_version: z.string().regex(SEM_VER),
      committed_at: z.string().datetime({ offset: true }),
      committed_by: z.string().min(1),
      summary: z.string().min(1),
      supersedes_version: z.union([z.number().int().min(1), z.null()]),
      data: z.array(entrySchema),
    })
    .strict();
}

/** Loose envelope schema (entries unvalidated) — useful for read paths. */
export const VersionEnvelopeLooseSchema = z
  .object({
    version: z.number().int().min(1),
    spec_version: z.string().regex(SEM_VER),
    committed_at: z.string().datetime({ offset: true }),
    committed_by: z.string().min(1),
    summary: z.string().min(1),
    supersedes_version: z.union([z.number().int().min(1), z.null()]),
    data: z.array(z.unknown()),
  })
  .strict();

const _envelopeCheck: z.infer<typeof VersionEnvelopeLooseSchema> extends VersionEnvelope<unknown>
  ? true
  : false = true;
void _envelopeCheck;

// ─── ImportJob ────────────────────────────────────────────────────────

export const ImportJobSchema = z
  .object({
    doc_id: z.string().regex(KEBAB_CASE),
    schedule: z.string().min(1),
    source: z.string().url().or(z.string().min(1)), // URLs OR named connectors
    transformer: z.string().optional(),
  })
  .strict();

const _importCheck: z.infer<typeof ImportJobSchema> extends ImportJob
  ? true
  : false = true;
void _importCheck;
