/**
 * In-memory ConfigStoreAdapter.
 *
 * Reference implementation for tests, scripts, and prototyping. Production
 * deployments use a filesystem-backed adapter that maps to
 * `.openclaw/config/<doc>/{manifest.json,current.json,versions/vNNNN.json}`,
 * or a Postgres-backed adapter — concrete adapters live in downstream
 * packages so the substrate stays free of persistence dependencies.
 */

import type {
  ConfigStoreAdapter,
  DocManifest,
  VersionEnvelope,
} from "./types";

interface DocSlot {
  manifest?: DocManifest;
  current?: ReadonlyArray<unknown>;
  versions: Map<number, VersionEnvelope<unknown>>;
}

export class InMemoryConfigStore implements ConfigStoreAdapter {
  readonly #docs = new Map<string, DocSlot>();

  #slot(doc_id: string): DocSlot {
    let slot = this.#docs.get(doc_id);
    if (!slot) {
      slot = { versions: new Map() };
      this.#docs.set(doc_id, slot);
    }
    return slot;
  }

  async hasDoc(doc_id: string): Promise<boolean> {
    return this.#docs.has(doc_id);
  }

  async listDocs(): Promise<ReadonlyArray<string>> {
    return [...this.#docs.keys()];
  }

  async getDocManifest(doc_id: string): Promise<DocManifest | undefined> {
    return this.#docs.get(doc_id)?.manifest;
  }

  async setDocManifest(doc_id: string, manifest: DocManifest): Promise<void> {
    this.#slot(doc_id).manifest = manifest;
  }

  async getCurrent<TEntry = unknown>(
    doc_id: string,
  ): Promise<ReadonlyArray<TEntry> | undefined> {
    return this.#docs.get(doc_id)?.current as ReadonlyArray<TEntry> | undefined;
  }

  async setCurrent<TEntry = unknown>(
    doc_id: string,
    data: ReadonlyArray<TEntry>,
  ): Promise<void> {
    this.#slot(doc_id).current = data as ReadonlyArray<unknown>;
  }

  async getVersion<TEntry = unknown>(
    doc_id: string,
    version: number,
  ): Promise<VersionEnvelope<TEntry> | undefined> {
    const slot = this.#docs.get(doc_id);
    if (!slot) return undefined;
    return slot.versions.get(version) as VersionEnvelope<TEntry> | undefined;
  }

  async setVersion<TEntry = unknown>(
    doc_id: string,
    envelope: VersionEnvelope<TEntry>,
  ): Promise<void> {
    const slot = this.#slot(doc_id);
    if (slot.versions.has(envelope.version)) {
      throw new Error(
        `version ${envelope.version} of doc "${doc_id}" already exists; envelopes are immutable`,
      );
    }
    slot.versions.set(envelope.version, envelope as VersionEnvelope<unknown>);
  }

  async listVersions(doc_id: string): Promise<ReadonlyArray<number>> {
    const slot = this.#docs.get(doc_id);
    if (!slot) return [];
    return [...slot.versions.keys()].sort((a, b) => a - b);
  }
}
