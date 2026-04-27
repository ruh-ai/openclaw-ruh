/**
 * In-memory MemoryStoreAdapter.
 *
 * Reference implementation for tests, scripts, and early-stage prototyping.
 * Production deployments use a filesystem-backed adapter (parses
 * `.openclaw/memory/<type>/<slug>.md`) or a Postgres adapter — concrete
 * adapters live outside this substrate so the runtime stays free of
 * persistence-layer dependencies.
 */

import type {
  MemoryEntry,
  MemoryStatus,
  MemoryStoreAdapter,
  MemoryType,
} from "./types";

export class InMemoryMemoryStore implements MemoryStoreAdapter {
  readonly #entries = new Map<string, MemoryEntry>();

  async put(entry: MemoryEntry): Promise<void> {
    if (this.#entries.has(entry.id)) {
      throw new Error(`memory entry "${entry.id}" already exists; use update()`);
    }
    this.#entries.set(entry.id, entry);
  }

  async update(entry: MemoryEntry): Promise<void> {
    if (!this.#entries.has(entry.id)) {
      throw new Error(`memory entry "${entry.id}" does not exist; use put()`);
    }
    this.#entries.set(entry.id, entry);
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    return this.#entries.get(id);
  }

  async has(id: string): Promise<boolean> {
    return this.#entries.has(id);
  }

  async list(filter: {
    types?: ReadonlyArray<MemoryType>;
    lanes?: ReadonlyArray<string>;
    statuses?: ReadonlyArray<MemoryStatus>;
  }): Promise<ReadonlyArray<MemoryEntry>> {
    const out: MemoryEntry[] = [];
    for (const e of this.#entries.values()) {
      if (filter.types && !filter.types.includes(e.type)) continue;
      if (filter.lanes && !filter.lanes.includes(e.lane)) continue;
      if (filter.statuses && !filter.statuses.includes(e.status)) continue;
      out.push(e);
    }
    // Stable order: created_at asc, then id asc for ties.
    out.sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return out;
  }

  /** Test helper: total entries regardless of status. Not part of the adapter contract. */
  size(): number {
    return this.#entries.size;
  }
}
