/**
 * Memory model — Zod schemas.
 *
 * Mirrors docs/spec/openclaw-v1/schemas/memory.schema.json. JSON Schema is
 * the authoritative contract for cross-runtime validation; these Zod
 * schemas are the in-process equivalent the substrate uses for runtime
 * checks (and the type inference flows the other way for ergonomics).
 *
 * Per spec §source-identity: the schema enforces two distinct submission
 * shapes — `ClientMemoryWriteSubmissionSchema` (no source_identity) vs
 * `AttestedMemoryWriteRequestSchema` (runtime-attested). The strict()
 * call on ClientMemoryWriteSubmissionSchema is what makes "client supplies
 * source_identity" a parse-time error — strip-at-the-API-boundary in
 * code form.
 */

import { z } from "zod";
import type {
  MemoryAuthority,
  MemoryAuthorityRow,
  MemoryEntry,
  MemoryEntryContent,
  MemoryQueryFilter,
  MemoryStatus,
  MemoryTier,
  MemoryType,
  MemorySourceChannel,
  ClientMemoryWriteSubmission,
  AttestedMemoryWriteRequest,
} from "./types";

// ─── Primitive schemas ────────────────────────────────────────────────

const KEBAB_CASE = /^[a-z][a-z0-9-]*$/;
const SEM_VER = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$/;

export const MemoryTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const MemoryTypeSchema = z.enum(["project", "user", "feedback", "reference"]);
export const MemorySourceChannelSchema = z.enum([
  "email",
  "dashboard",
  "agent",
  "import",
  "teams",
  "webhook",
  "other",
]);
export const MemoryStatusSchema = z.enum([
  "proposed",
  "flagged",
  "confirmed",
  "permanent",
  "deprecated",
]);

const KebabSlugSchema = z.string().regex(KEBAB_CASE, "must be kebab-case");
const LaneSchema = z.string().regex(KEBAB_CASE, "lane must be kebab-case");

// ─── Memory entry content (shared by submissions + entry) ─────────────

export const MemoryEntryContentSchema = z
  .object({
    type: MemoryTypeSchema,
    title: z.string().min(1),
    description: z.string().max(200).optional(),
    body: z.string().min(1),
  })
  .strict();

// Type-level check: derived Zod type matches our hand-written interface.
const _contentCheck: z.infer<typeof MemoryEntryContentSchema> extends MemoryEntryContent
  ? true
  : false = true;
void _contentCheck;

// ─── Memory entry (frontmatter portion) ───────────────────────────────

export const MemoryEntrySchema = z
  .object({
    id: KebabSlugSchema,
    type: MemoryTypeSchema,
    title: z.string().min(1),
    description: z.string().min(1).max(200),
    tier: MemoryTierSchema,
    lane: LaneSchema,
    source_identity: z.string().min(1),
    source_channel: MemorySourceChannelSchema,
    status: MemoryStatusSchema,
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    expires_at: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
    supersedes: z.array(KebabSlugSchema).optional(),
    superseded_by: z.union([KebabSlugSchema, z.null()]).optional(),
    related: z.array(KebabSlugSchema).optional(),
    important: z.boolean().optional(),
    spec_version: z.string().regex(SEM_VER),
    body: z.string().optional(),
    requested_tier: MemoryTierSchema.optional(),
  })
  .strict();

// ─── Authority ─────────────────────────────────────────────────────────

export const MemoryAuthorityRowSchema = z
  .object({
    tier: MemoryTierSchema,
    lane: LaneSchema,
    writers: z.array(z.string().min(1)).min(1).refine(
      (arr) => new Set(arr).size === arr.length,
      { message: "writers must be unique" },
    ),
  })
  .strict();

export const MemoryAuthoritySchema = z.array(MemoryAuthorityRowSchema);

const _authorityRowCheck: z.infer<typeof MemoryAuthorityRowSchema> extends MemoryAuthorityRow
  ? true
  : false = true;
void _authorityRowCheck;

// ─── Submissions ──────────────────────────────────────────────────────

/**
 * What a client sends to the runtime. .strict() rejects extra fields —
 * including `source_identity`, which clients are forbidden from supplying.
 */
export const ClientMemoryWriteSubmissionSchema = z
  .object({
    tier: MemoryTierSchema,
    lane: LaneSchema,
    content: MemoryEntryContentSchema,
    id: KebabSlugSchema.optional(),
  })
  .strict();

const _clientCheck: z.infer<typeof ClientMemoryWriteSubmissionSchema> extends ClientMemoryWriteSubmission
  ? true
  : false = true;
void _clientCheck;

/**
 * What the runtime constructs internally after attesting identity. Pipeline
 * code that emits writes uses this shape; clients never construct it.
 */
export const AttestedMemoryWriteRequestSchema = z
  .object({
    tier: MemoryTierSchema,
    lane: LaneSchema,
    source_identity: z.string().min(1),
    source_channel: MemorySourceChannelSchema,
    content: MemoryEntryContentSchema,
    id: KebabSlugSchema.optional(),
  })
  .strict();

const _attestedCheck: z.infer<typeof AttestedMemoryWriteRequestSchema> extends AttestedMemoryWriteRequest
  ? true
  : false = true;
void _attestedCheck;

// ─── Query filter (visibility-restricted) ─────────────────────────────

/**
 * Per spec §read-patterns: the agent-facing filter is restricted to
 * confirmed | permanent. proposed/flagged would let the agent act on
 * unconfirmed knowledge — non-conformant.
 */
export const MemoryQueryFilterSchema = z
  .object({
    types: z.array(MemoryTypeSchema).optional(),
    lanes: z.array(LaneSchema).optional(),
    statuses: z
      .array(z.enum(["confirmed", "permanent"]))
      .optional(),
  })
  .strict();

const _filterCheck: z.infer<typeof MemoryQueryFilterSchema> extends MemoryQueryFilter
  ? true
  : false = true;
void _filterCheck;

// ─── Convenience: parse helpers used by the facade ────────────────────

/**
 * Strip extra fields and validate. Returns the parsed value or throws.
 * Used at the API boundary where a client-supplied source_identity must
 * be rejected (parse-time error from .strict()).
 */
export function parseClientSubmission(raw: unknown): ClientMemoryWriteSubmission {
  return ClientMemoryWriteSubmissionSchema.parse(raw) as ClientMemoryWriteSubmission;
}

export function parseAttestedRequest(raw: unknown): AttestedMemoryWriteRequest {
  return AttestedMemoryWriteRequestSchema.parse(raw) as AttestedMemoryWriteRequest;
}

export function parseMemoryAuthority(raw: unknown): MemoryAuthority {
  return MemoryAuthoritySchema.parse(raw) as MemoryAuthority;
}

/** Re-export the type-only enum widening for downstream use. */
export type {
  MemoryTier,
  MemoryType,
  MemoryStatus,
  MemorySourceChannel,
  MemoryEntryContent,
};
