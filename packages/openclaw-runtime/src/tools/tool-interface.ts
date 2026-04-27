/**
 * Tool harness — runtime interface.
 *
 * Implements: docs/spec/openclaw-v1/003-tool-contract.md
 *
 * Every tool has TWO faces:
 *   1. The runtime interface (this file) — what the tool's code implements.
 *      Permission flags are METHODS, not data fields.
 *   2. The declaration file (tools/<id>.json in the agent workspace) — validated
 *      against schemas/tool.schema.json. Permission flags appear under a
 *      `permissions` object (read_only/destructive/concurrency_safe/requires_approval).
 *
 * The runtime cross-checks declaration vs implementation: a tool whose declaration
 * says permissions.read_only=true MUST have isReadOnly() === true. The conformance
 * fuzzer (per spec 101) snapshots workspace state and asserts read-only tools
 * produce no diffs.
 */

import type { ZodType } from "zod";
import type { AgentDevStage, ExecutionMode } from "../types/lifecycle";
import type { DecisionLog } from "../decision-log/log";

// ─── Tool context ─────────────────────────────────────────────────────

/**
 * The runtime hands a ToolContext to every tool call. Tools cannot reach into
 * globals or singletons; everything they need flows through this object.
 *
 * Phase 1d added `decisionLog` for structured audit emission. Phase 1e-1h
 * will add `memory`, `config`, `checkpoint`, `hooks` similarly. Tools that
 * don't need a handle can ignore it; tools that do, receive a session-scoped
 * instance.
 */
export interface ToolContext {
  readonly sandboxId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly pipelineId: string;
  readonly mode: ExecutionMode;
  readonly devStage: AgentDevStage;
  /** Phase 1d. Optional during the rollout window — tests may omit. The pipeline always passes one in production. */
  readonly decisionLog?: DecisionLog;
}

// ─── Tool result ───────────────────────────────────────────────────────

/**
 * Structured event emitted by a tool, forwarded to the AG-UI stream and the
 * decision log. Per spec 003, these are CUSTOM events with a `name` from the
 * registered marker set.
 */
export interface AgUiCustomEvent {
  readonly type: "CUSTOM";
  readonly name: string;
  readonly value?: unknown;
}

/**
 * What a tool returns. `output` is always an object so consumers can rely on
 * shape; primitives must be wrapped (e.g., { message: "ok" } not "ok").
 */
export interface ToolResult<TOutput = unknown> {
  readonly success: boolean;
  readonly output: TOutput;
  readonly error?: string;
  /**
   * Tool may modify ctx for downstream calls in this turn. Concurrency-safe
   * tools MUST NOT return modifiers (the pipeline applies them serially only).
   */
  readonly contextModifier?: Partial<ToolContext>;
  readonly events?: ReadonlyArray<AgUiCustomEvent>;
}

// ─── Permission decision ──────────────────────────────────────────────

export type PermissionDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string; readonly requiresApproval: boolean };

// ─── Tool interface ────────────────────────────────────────────────────

/**
 * Every tool implements this interface. Permission flags are METHODS so the
 * conformance fuzzer can call them directly to verify declaration alignment.
 */
export interface OpenClawTool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly specVersion: string;

  readonly inputSchema: ZodType<TInput>;
  readonly outputSchema?: ZodType<TOutput>;

  /** Stages where this tool may be invoked. `null` = all stages. */
  readonly availableStages: ReadonlyArray<AgentDevStage> | null;

  /** Modes where this tool may be invoked. `null` = all modes. */
  readonly availableModes: ReadonlyArray<ExecutionMode> | null;

  call(input: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;

  checkPermissions(input: TInput, ctx: ToolContext): PermissionDecision;

  /** True iff this tool produces no side effects on workspace, memory, config, network egress, subprocess, or external services. */
  isReadOnly(): boolean;

  /** True iff this tool can cause irreversible changes (delete, deploy, send). Mutually exclusive with isReadOnly(). */
  isDestructive(): boolean;

  /** True iff multiple invocations may run in parallel without observable interference. */
  isConcurrencySafe(): boolean;
}

// ─── Base class ────────────────────────────────────────────────────────

/**
 * Convenience base class. Concrete tools only need to implement `call()` and
 * the abstract identity/schema fields; everything else has sensible defaults.
 *
 * Defaults are conservative: not read-only, not destructive, not concurrency-safe.
 * Tools that ARE read-only / destructive / concurrency-safe override the methods.
 */
export abstract class BaseTool<TInput = unknown, TOutput = unknown>
  implements OpenClawTool<TInput, TOutput>
{
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;
  abstract readonly specVersion: string;
  abstract readonly inputSchema: ZodType<TInput>;
  readonly outputSchema?: ZodType<TOutput>;

  readonly availableStages: ReadonlyArray<AgentDevStage> | null = null;
  readonly availableModes: ReadonlyArray<ExecutionMode> | null = null;

  abstract call(input: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;

  /**
   * Default permission policy from spec 003 — driven by the flag methods + mode.
   *
   * - isReadOnly() && agent/copilot mode → allowed
   * - isReadOnly() && build/test/ship → allowed (read-only is always safe)
   * - isDestructive() → always requires approval (agent mode included; the runtime
   *   may still bypass via mode-specific allowlists, but the default is "needs approval")
   * - non-read-only, non-destructive (write-capable but reversible) → allowed in agent
   *   and copilot modes, requires approval in build/test/ship modes
   *
   * Concrete tools override this when they need finer-grained policy (e.g.,
   * sandbox-exec with a per-command allowlist).
   */
  checkPermissions(_input: TInput, ctx: ToolContext): PermissionDecision {
    if (this.isReadOnly()) {
      return { allowed: true };
    }
    if (this.isDestructive()) {
      return {
        allowed: false,
        reason: `Tool "${this.name}" is destructive and requires approval.`,
        requiresApproval: true,
      };
    }
    // Write-capable but not destructive: allowed at runtime; gated in build/test/ship.
    if (ctx.mode === "build" || ctx.mode === "test" || ctx.mode === "ship") {
      return {
        allowed: false,
        reason: `Tool "${this.name}" writes state and requires approval in "${ctx.mode}" mode.`,
        requiresApproval: true,
      };
    }
    return { allowed: true };
  }

  isReadOnly(): boolean {
    return false;
  }

  isDestructive(): boolean {
    return false;
  }

  isConcurrencySafe(): boolean {
    return false;
  }
}
