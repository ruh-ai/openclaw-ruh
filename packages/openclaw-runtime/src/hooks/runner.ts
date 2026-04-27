/**
 * HookRunner — fires hooks per spec §multiple-handlers-per-hook + §veto-handlers.
 *
 * Behaviours:
 *   - Iterates registry handlers in fire order (runtime → pipeline → session)
 *   - For sync handlers, awaits each in sequence and catches errors
 *   - For fire-and-forget handlers, dispatches without awaiting; rejected
 *     promises are caught and logged as hook_failed (still no throw)
 *   - VETO returns honoured ONLY for veto-able hooks; non-veto hooks log
 *     a warning and ignore the sentinel
 *   - When a veto fires, remaining handlers in the same fire still run —
 *     spec is explicit ("All handlers fire even if earlier ones throw"),
 *     but the operation is short-circuited at the call site (the veto
 *     wins). The runner returns the veto record so the caller can decide.
 *   - Emits a `hook_fired` decision (and `hook_failed` per failure)
 *     iff a decisionLog is supplied
 */

import type { DecisionLog } from "../decision-log/log";
import type {
  HookContext,
  HookFireResult,
  HookHandlerFailure,
  HookHandlerReturn,
  HookName,
  RegisteredHook,
} from "./types";
import { isVetoResult, isVetoableHook } from "./types";
import type { HookRegistry } from "./registry";

export interface HookRunnerOptions {
  readonly pipelineId: string;
  readonly agentId?: string;
  readonly sessionId?: string;
  readonly registry: HookRegistry;
  readonly decisionLog?: DecisionLog;
}

export class HookRunner {
  readonly #opts: HookRunnerOptions;

  constructor(opts: HookRunnerOptions) {
    this.#opts = opts;
  }

  /**
   * Fire a hook. Returns when every sync handler has resolved or thrown;
   * fire-and-forget handlers are dispatched but not awaited (their
   * outcome is reported asynchronously through the decision log).
   */
  async fire(name: HookName, payload: unknown): Promise<HookFireResult> {
    const handlers = this.#opts.registry.list(name);
    const failures: HookHandlerFailure[] = [];
    let succeeded = 0;
    let dispatched_async = 0;
    let veto: HookFireResult["veto"];

    for (const rec of handlers) {
      const ctx: HookContext = {
        pipeline_id: this.#opts.pipelineId,
        ...(this.#opts.agentId !== undefined ? { agent_id: this.#opts.agentId } : {}),
        ...(this.#opts.sessionId !== undefined ? { session_id: this.#opts.sessionId } : {}),
        fire_mode: rec.fire_mode,
        capabilities: rec.capabilities,
        ...(this.#hasDecisionLogCap(rec) && this.#opts.decisionLog !== undefined
          ? { decisionLog: this.#opts.decisionLog }
          : {}),
      };

      if (rec.fire_mode === "fire_and_forget") {
        dispatched_async++;
        // Dispatch without awaiting. Any rejection is caught + logged as a
        // separate hook_failed decision (best-effort; we never throw out
        // of the runner for a fire-and-forget handler).
        void Promise.resolve()
          .then(() => rec.handler(payload, ctx))
          .then((ret) => {
            this.#warnIfVetoIgnored(name, rec, ret);
          })
          .catch((err) => {
            void this.#emitHookFailed(name, rec, err);
          });
        // Sync handler accounting still records this as "succeeded" from
        // the runner's perspective — we'll know later if it threw.
        succeeded++;
        continue;
      }

      try {
        const ret = await rec.handler(payload, ctx);
        if (isVetoResult(ret)) {
          if (isVetoableHook(name)) {
            // Honour the first veto we see; remaining handlers still run.
            if (!veto) veto = { handler_id: rec.id, reason: ret.reason };
          } else {
            // Spec: ignore VETO returns from non-veto hooks; warn but do
            // not count as failure.
            this.#warnIfVetoIgnored(name, rec, ret);
          }
        }
        succeeded++;
      } catch (err) {
        failures.push({
          handler_id: rec.id,
          ...(rec.label !== undefined ? { label: rec.label } : {}),
          error: err instanceof Error ? err.message : String(err),
        });
        await this.#emitHookFailed(name, rec, err);
      }
    }

    const result: HookFireResult = {
      hook_name: name,
      handler_count: handlers.length,
      succeeded,
      failed: failures.length,
      failures,
      ...(veto ? { veto } : {}),
      dispatched_async,
    };

    if (this.#opts.decisionLog && handlers.length > 0) {
      await this.#opts.decisionLog.emit({
        type: "hook_fired",
        description: `hook "${name}" fired (${handlers.length} handler${handlers.length === 1 ? "" : "s"})`,
        metadata: {
          hook_name: name,
          handler_count: handlers.length,
          succeeded,
          failed: failures.length,
          all_succeeded: failures.length === 0,
          ...(veto ? { vetoed_by: veto.handler_id, veto_reason: veto.reason } : {}),
          dispatched_async,
        },
      });
    }

    return result;
  }

  // ─── internals ────────────────────────────────────────────────────

  #hasDecisionLogCap(rec: RegisteredHook): boolean {
    for (const cap of rec.capabilities) {
      if (cap.kind === "decision_log_emit") return true;
    }
    return false;
  }

  async #emitHookFailed(
    name: HookName,
    rec: RegisteredHook,
    err: unknown,
  ): Promise<void> {
    if (!this.#opts.decisionLog) return;
    await this.#opts.decisionLog.emit({
      type: "hook_failed",
      description: `handler "${rec.label ?? rec.id}" failed for hook "${name}"`,
      metadata: {
        hook_name: name,
        handler_id: rec.id,
        ...(rec.label !== undefined ? { label: rec.label } : {}),
        error: err instanceof Error ? err.message : String(err),
        scope: rec.scope,
        fire_mode: rec.fire_mode,
      },
    });
  }

  #warnIfVetoIgnored(
    name: HookName,
    rec: RegisteredHook,
    ret: HookHandlerReturn,
  ): void {
    if (!isVetoResult(ret)) return;
    if (!this.#opts.decisionLog) return;

    // Two cases the runner cannot honor a VETO and must surface as a
    // hook_failed:
    //   1. Non-vetoable hook returned VETO  → spec ignores VETO; warn.
    //   2. Vetoable hook in fire_and_forget mode → registry should have
    //      rejected this at register time, but if some adapter bypassed
    //      register, the FaF path can't surface VETO since the calling
    //      pipeline never awaited the handler. Emit hook_failed so the
    //      misconfiguration is visible.
    const vetoable = isVetoableHook(name);
    const faf = rec.fire_mode === "fire_and_forget";
    if (!vetoable) {
      void this.#opts.decisionLog.emit({
        type: "hook_failed",
        description: `handler "${rec.label ?? rec.id}" returned VETO from non-veto hook "${name}" — ignored`,
        metadata: {
          hook_name: name,
          handler_id: rec.id,
          error: "veto_returned_from_non_veto_hook",
          veto_reason: ret.reason,
          scope: rec.scope,
          fire_mode: rec.fire_mode,
        },
      });
      return;
    }
    if (faf) {
      void this.#opts.decisionLog.emit({
        type: "hook_failed",
        description: `handler "${rec.label ?? rec.id}" returned VETO from fire_and_forget hook "${name}" — unobservable, dropped`,
        metadata: {
          hook_name: name,
          handler_id: rec.id,
          error: "veto_returned_from_fire_and_forget_handler",
          veto_reason: ret.reason,
          scope: rec.scope,
          fire_mode: rec.fire_mode,
        },
      });
      return;
    }
    // Vetoable + sync — handled in the sync branch of fire(); nothing to do here.
  }
}
