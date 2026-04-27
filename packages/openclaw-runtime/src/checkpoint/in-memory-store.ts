/**
 * In-memory CheckpointStoreAdapter.
 *
 * Reference implementation for tests, scripts, and prototyping. Production
 * deployments use a Postgres-backed adapter (see spec §storage). The
 * substrate stays free of persistence-layer dependencies.
 */

import type {
  Checkpoint,
  CheckpointQuery,
  CheckpointStoreAdapter,
} from "./types";

interface Slot {
  readonly checkpoint: Checkpoint;
  retired_at: string | null;
}

export class InMemoryCheckpointStore implements CheckpointStoreAdapter {
  readonly #slots = new Map<string, Slot>();

  async put(checkpoint: Checkpoint): Promise<void> {
    if (this.#slots.has(checkpoint.id)) {
      throw new Error(`checkpoint ${checkpoint.id} already exists`);
    }
    this.#slots.set(checkpoint.id, { checkpoint, retired_at: null });
  }

  async get(id: string): Promise<Checkpoint | undefined> {
    return this.#slots.get(id)?.checkpoint;
  }

  async latest(opts: {
    pipeline_id: string;
    agent_id: string;
    session_id: string;
  }): Promise<Checkpoint | undefined> {
    let best: Checkpoint | undefined;
    for (const slot of this.#slots.values()) {
      if (slot.retired_at !== null) continue;
      const c = slot.checkpoint;
      if (
        c.pipeline_id !== opts.pipeline_id ||
        c.agent_id !== opts.agent_id ||
        c.session_id !== opts.session_id
      ) {
        continue;
      }
      if (!best || c.created_at > best.created_at) {
        best = c;
      }
    }
    return best;
  }

  async query(q: CheckpointQuery): Promise<ReadonlyArray<Checkpoint>> {
    const out: Checkpoint[] = [];
    for (const slot of this.#slots.values()) {
      const c = slot.checkpoint;
      if (c.pipeline_id !== q.pipeline_id) continue;
      if (q.agent_id !== undefined && c.agent_id !== q.agent_id) continue;
      if (q.session_id !== undefined && c.session_id !== q.session_id) continue;
      if (q.since !== undefined && c.created_at < q.since) continue;
      if (q.until !== undefined && c.created_at >= q.until) continue;
      if (!q.include_retired && slot.retired_at !== null) continue;
      out.push(c);
    }
    // Newest first for dashboard rendering.
    out.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    if (q.limit !== undefined) return out.slice(0, q.limit);
    return out;
  }

  async retire(id: string, retired_at: string): Promise<void> {
    const slot = this.#slots.get(id);
    if (!slot) throw new Error(`checkpoint ${id} not found`);
    slot.retired_at = retired_at;
  }

  async isRetired(id: string): Promise<boolean> {
    const slot = this.#slots.get(id);
    if (!slot) return false;
    return slot.retired_at !== null;
  }

  /** Test helper. Not part of the adapter contract. */
  size(): number {
    return this.#slots.size;
  }
}
