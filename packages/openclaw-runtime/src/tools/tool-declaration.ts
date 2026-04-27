/**
 * Tool declaration — the JSON shape in `tools/<tool-id>.json` within an agent workspace.
 *
 * Implements: docs/spec/openclaw-v1/003-tool-contract.md (declaration file)
 *           + docs/spec/openclaw-v1/schemas/tool.schema.json
 *
 * Critically: declarations carry the SAME permission flags as the runtime methods.
 * If a declaration says permissions.read_only=true but the registered tool's
 * isReadOnly() returns false, the runtime emits a `tool_flag_mismatch` and refuses
 * to load the agent. This is enforced by `crossCheckDeclaration` below.
 */

import { z } from "zod";
import type { OpenClawTool } from "./tool-interface";
import type { AgentDevStage, ExecutionMode } from "../types/lifecycle";

// ─── Permission config (mirrors schemas/tool.schema.json#PermissionConfig) ─

const PermissionConfigSchema = z
  .object({
    stages: z
      .array(
        z.enum([
          "drafted",
          "validated",
          "tested",
          "shipped",
          "running",
          "plan",
          "build",
          "review",
          "test",
          "ship",
          "reflect",
        ]),
      )
      .optional(),
    modes: z.array(z.enum(["agent", "copilot", "build", "test", "ship"])).optional(),
    read_only: z.boolean(),
    destructive: z.boolean(),
    concurrency_safe: z.boolean(),
    requires_approval: z.boolean().optional(),
  })
  .refine((v) => !(v.read_only && v.destructive), {
    message: "A tool cannot be both read_only and destructive.",
  });

export type PermissionConfig = z.infer<typeof PermissionConfigSchema>;

// ─── Built-in tool kinds (per spec 003) ────────────────────────────────

export const BUILT_IN_TOOL_KINDS = [
  "workspace-read",
  "workspace-write",
  "sandbox-exec",
  "research",
  "plan-validate",
] as const;

export type BuiltInToolKind = (typeof BUILT_IN_TOOL_KINDS)[number];

const ToolKindSchema = z.union([
  z.enum(BUILT_IN_TOOL_KINDS),
  z.string().regex(/^[a-z][a-z0-9-]*$/, "Custom tool kinds must be kebab-case."),
]);

// ─── Tool declaration ──────────────────────────────────────────────────

const CredentialRefSchema = z.object({
  ref: z.string().min(1),
  schema_ref: z.string().optional(),
});

export const ToolDeclarationSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  spec_version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$/),
  name: z.string().min(1),
  description: z.string().min(1),
  tool_kind: ToolKindSchema,
  permissions: PermissionConfigSchema,
  credentials: CredentialRefSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type ToolDeclaration = z.infer<typeof ToolDeclarationSchema>;

// ─── Parsing + validation ──────────────────────────────────────────────

export type ParseResult =
  | { readonly ok: true; readonly declaration: ToolDeclaration }
  | { readonly ok: false; readonly error: string };

/** Parse a `tools/<id>.json` payload (already JSON.parsed) into a typed declaration. */
export function parseToolDeclaration(raw: unknown): ParseResult {
  const result = ToolDeclarationSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, declaration: result.data };
  }
  const error = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { ok: false, error };
}

// ─── Cross-check — declaration ⇄ registered tool ──────────────────────

export interface CrossCheckMismatch {
  readonly field: "read_only" | "destructive" | "concurrency_safe" | "available_stages" | "available_modes";
  readonly declared: unknown;
  readonly runtime: unknown;
  readonly message: string;
}

/**
 * Verify that a registered tool's runtime methods match its declaration.
 * The conformance gate (per spec 101) refuses to load agents when this returns
 * mismatches — declaration honesty is a security property, not just hygiene.
 */
export function crossCheckDeclaration(
  declaration: ToolDeclaration,
  tool: OpenClawTool,
): ReadonlyArray<CrossCheckMismatch> {
  const mismatches: CrossCheckMismatch[] = [];

  if (declaration.permissions.read_only !== tool.isReadOnly()) {
    mismatches.push({
      field: "read_only",
      declared: declaration.permissions.read_only,
      runtime: tool.isReadOnly(),
      message: `Tool "${tool.name}" declaration says read_only=${declaration.permissions.read_only} but runtime isReadOnly()=${tool.isReadOnly()}.`,
    });
  }

  if (declaration.permissions.destructive !== tool.isDestructive()) {
    mismatches.push({
      field: "destructive",
      declared: declaration.permissions.destructive,
      runtime: tool.isDestructive(),
      message: `Tool "${tool.name}" declaration says destructive=${declaration.permissions.destructive} but runtime isDestructive()=${tool.isDestructive()}.`,
    });
  }

  if (declaration.permissions.concurrency_safe !== tool.isConcurrencySafe()) {
    mismatches.push({
      field: "concurrency_safe",
      declared: declaration.permissions.concurrency_safe,
      runtime: tool.isConcurrencySafe(),
      message: `Tool "${tool.name}" declaration says concurrency_safe=${declaration.permissions.concurrency_safe} but runtime isConcurrencySafe()=${tool.isConcurrencySafe()}.`,
    });
  }

  // Stages: declaration's `stages` field is a subset constraint. If declared, the
  // runtime's availableStages must be either null (broader) or a subset.
  const declaredStages = declaration.permissions.stages;
  if (declaredStages && tool.availableStages !== null) {
    const runtimeSet = new Set<AgentDevStage>(tool.availableStages);
    const onlyInRuntime = tool.availableStages.filter(
      (s) => !declaredStages.includes(s as (typeof declaredStages)[number]),
    );
    if (onlyInRuntime.length > 0) {
      mismatches.push({
        field: "available_stages",
        declared: declaredStages,
        runtime: Array.from(runtimeSet),
        message: `Tool "${tool.name}" runtime availableStages includes ${onlyInRuntime.join(", ")} not in declaration.`,
      });
    }
  }

  const declaredModes = declaration.permissions.modes;
  if (declaredModes && tool.availableModes !== null) {
    const onlyInRuntime = tool.availableModes.filter(
      (m) => !declaredModes.includes(m as ExecutionMode),
    );
    if (onlyInRuntime.length > 0) {
      mismatches.push({
        field: "available_modes",
        declared: declaredModes,
        runtime: Array.from(tool.availableModes),
        message: `Tool "${tool.name}" runtime availableModes includes ${onlyInRuntime.join(", ")} not in declaration.`,
      });
    }
  }

  return mismatches;
}
