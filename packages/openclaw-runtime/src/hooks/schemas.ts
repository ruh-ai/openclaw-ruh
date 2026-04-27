/**
 * Hooks substrate — Zod schemas.
 *
 * Mirrors docs/spec/openclaw-v1/schemas/hooks.schema.json (where
 * applicable). The substrate validates HookCapability shapes and the
 * canonical hook name space; canonical payload schemas are documented in
 * the spec but mostly enforced at the producer side (e.g., the decision-
 * log writer fires hook payloads it just emitted to its own log, so they
 * are already typed).
 */

import { z } from "zod";
import type { CanonicalHookName, HookCapability } from "./types";
import { CANONICAL_HOOK_NAMES, isCustomHookName } from "./types";

const KEBAB_OR_DOT = /^[a-z][a-z0-9._-]*$/;

// ─── HookName schema (canonical OR custom:<ns>:<event>) ───────────────

const CANONICAL_NAMES = CANONICAL_HOOK_NAMES as ReadonlyArray<string>;

export const HookNameSchema = z.string().refine(
  (s) => CANONICAL_NAMES.includes(s) || isCustomHookName(s),
  {
    message:
      'must be a canonical hook name or `custom:<namespace>:<event>`',
  },
);

export const CanonicalHookNameSchema = z.enum(
  CANONICAL_HOOK_NAMES as unknown as [CanonicalHookName, ...CanonicalHookName[]],
);

// ─── HookFireMode + HookScope ─────────────────────────────────────────

export const HookFireModeSchema = z.enum(["sync", "fire_and_forget"]);

export const HookScopeSchema = z.enum(["runtime", "pipeline", "session"]);

// ─── HookCapability — discriminated union by kind ─────────────────────

export const HookCapabilitySchema = z.union([
  z.object({ kind: z.literal("decision_log_emit") }).strict(),
  z
    .object({
      kind: z.literal("egress_http"),
      allowed_hosts: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("send_email"),
      from: z.string().min(1),
      to_pattern: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("send_teams_card"),
      channel: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("publish_metric"),
      namespace: z.string().regex(KEBAB_OR_DOT),
    })
    .strict(),
  z
    .object({
      kind: z.literal("external_approval_gate"),
      request_id_prefix: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("read_decision_log"),
      scope: z.enum(["session", "pipeline"]),
    })
    .strict(),
]);

const _capCheck: z.infer<typeof HookCapabilitySchema> extends HookCapability
  ? true
  : false = true;
void _capCheck;

// ─── Manifest declaration shape ───────────────────────────────────────

/**
 * Shape of a single entry in pipeline-manifest.json's `hooks[]`. The
 * substrate validates these so loaders can fail fast with structured
 * error messages instead of crashing inside the runner later.
 */
export const HookManifestEntrySchema = z
  .object({
    name: HookNameSchema,
    handler: z.string().min(1),
    fire_mode: HookFireModeSchema.optional(),
    capabilities: z.array(HookCapabilitySchema).optional(),
  })
  .strict();
