/**
 * HookRegistry.
 *
 * Three-scope storage of hook handlers per spec §registration:
 *   1. runtime-global (always fired first)
 *   2. pipeline-scoped (fired in manifest declaration order)
 *   3. session-scoped (fired in registration order, auto-cleaned on close)
 *
 * The substrate doesn't load handlers from disk or validate the
 * pipeline manifest — adapters do that and call `register()`. The
 * registry just maintains the priority-ordered list.
 */

import type {
  HookCapability,
  HookFireMode,
  HookHandler,
  HookName,
  HookScope,
  RegisteredHook,
} from "./types";

let __id_counter = 0;

/** Generate a per-process unique handler id. Not cryptographic. */
function nextId(): string {
  __id_counter += 1;
  return `hk_${__id_counter}_${Date.now().toString(36)}`;
}

export interface RegisterInput<TPayload = unknown> {
  readonly name: HookName;
  readonly handler: HookHandler<TPayload>;
  readonly fire_mode?: HookFireMode;
  readonly scope?: HookScope;
  readonly capabilities?: ReadonlyArray<HookCapability>;
  readonly label?: string;
}

export class HookRegistry {
  /** Insertion order preserved across maps; iteration honours scope priority. */
  readonly #runtime = new Map<string, RegisteredHook>();
  readonly #pipeline = new Map<string, RegisteredHook>();
  readonly #session = new Map<string, RegisteredHook>();

  /**
   * Register a handler. Returns the assigned id; pass it to `unregister`
   * to remove (rare — sessions auto-clear on close).
   */
  register<TPayload = unknown>(input: RegisterInput<TPayload>): string {
    const id = nextId();
    const scope: HookScope = input.scope ?? "pipeline";
    const record: RegisteredHook = {
      id,
      name: input.name,
      handler: input.handler as HookHandler,
      fire_mode: input.fire_mode ?? "sync",
      scope,
      capabilities: input.capabilities ?? [],
      ...(input.label !== undefined ? { label: input.label } : {}),
    };
    this.#mapFor(scope).set(id, record);
    return id;
  }

  /** Remove a handler. Returns true if it existed. */
  unregister(id: string): boolean {
    return (
      this.#runtime.delete(id) ||
      this.#pipeline.delete(id) ||
      this.#session.delete(id)
    );
  }

  /** Drop every session-scoped handler (called on session close). */
  clearSession(): void {
    this.#session.clear();
  }

  /**
   * All handlers for a hook name, in fire order: runtime → pipeline → session,
   * each map in insertion order.
   */
  list(name: HookName): ReadonlyArray<RegisteredHook> {
    const out: RegisteredHook[] = [];
    for (const map of [this.#runtime, this.#pipeline, this.#session]) {
      for (const rec of map.values()) {
        if (rec.name === name) out.push(rec);
      }
    }
    return out;
  }

  /** Number of handlers currently registered (across all scopes). */
  size(): number {
    return this.#runtime.size + this.#pipeline.size + this.#session.size;
  }

  #mapFor(scope: HookScope): Map<string, RegisteredHook> {
    if (scope === "runtime") return this.#runtime;
    if (scope === "pipeline") return this.#pipeline;
    return this.#session;
  }
}
