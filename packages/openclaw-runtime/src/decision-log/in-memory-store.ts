/**
 * In-memory decision store.
 *
 * Reference implementation of DecisionStoreAdapter for tests, scripts, and
 * early-stage prototyping. Production deployments use a Postgres-backed
 * adapter (lives in ruh-backend or a separate package — the runtime
 * substrate doesn't depend on Postgres).
 *
 * Bounded by an optional max-entries cap; oldest-first eviction when full.
 * Cap defaults to unlimited — appropriate for tests; production adapters
 * never use this implementation.
 */

import type {
  Decision,
  DecisionMetric,
  DecisionLogQuery,
  DecisionLogResult,
  DecisionStoreAdapter,
} from "./types";

export interface InMemoryStoreOptions {
  /** Maximum entries retained. Older entries are evicted first when full. Default: unlimited. */
  readonly maxEntries?: number;
}

export class InMemoryDecisionStore implements DecisionStoreAdapter {
  readonly #decisions: Decision[] = [];
  readonly #metrics: DecisionMetric[] = [];
  readonly #maxEntries: number;

  constructor(options?: InMemoryStoreOptions) {
    this.#maxEntries = options?.maxEntries ?? Number.POSITIVE_INFINITY;
  }

  async write(decision: Decision): Promise<void> {
    this.#decisions.push(decision);
    if (this.#decisions.length > this.#maxEntries) {
      this.#decisions.shift();
    }
  }

  async writeMetric(metric: DecisionMetric): Promise<void> {
    this.#metrics.push(metric);
    if (this.#metrics.length > this.#maxEntries) {
      this.#metrics.shift();
    }
  }

  async query(q: DecisionLogQuery): Promise<DecisionLogResult> {
    const filtered = this.#decisions.filter((d) => matches(d, q));

    // Sort by id (ULID is sortable by timestamp prefix) so callers see oldest first.
    // Stable sort preserves insertion order for ties.
    const sorted = filtered.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const limit = q.limit ?? 100;
    const cursorIndex = q.cursor ? findCursorIndex(sorted, q.cursor) : 0;
    const start = cursorIndex >= 0 ? cursorIndex : 0;
    const slice = sorted.slice(start, start + limit);

    const result: DecisionLogResult = {
      entries: slice,
      total_count: filtered.length,
      ...(start + limit < sorted.length && slice.length > 0
        ? { next_cursor: slice[slice.length - 1]?.id ?? "" }
        : {}),
    };
    return result;
  }

  /** Test/inspection helper. Not part of DecisionStoreAdapter. */
  metrics(): ReadonlyArray<DecisionMetric> {
    return this.#metrics.slice();
  }

  /** Test/inspection helper. Not part of DecisionStoreAdapter. */
  size(): number {
    return this.#decisions.length;
  }
}

function matches(d: Decision, q: DecisionLogQuery): boolean {
  if (d.pipeline_id !== q.pipeline_id) return false;
  if (q.agent_id !== undefined && d.agent_id !== q.agent_id) return false;
  if (q.session_id !== undefined && d.session_id !== q.session_id) return false;
  if (q.types && !q.types.includes(d.type)) return false;
  if (q.parent_id !== undefined && d.parent_id !== q.parent_id) return false;
  if (q.since !== undefined && d.timestamp < q.since) return false;
  if (q.until !== undefined && d.timestamp >= q.until) return false;
  return true;
}

function findCursorIndex(sorted: Decision[], cursor: string): number {
  // Cursor is the id of the last entry in the previous page; we want the next entry.
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]?.id === cursor) return i + 1;
  }
  // Cursor not found — likely a stale cursor. Return -1 to signal restart from 0
  // (the query method coerces -1 to 0).
  return -1;
}
