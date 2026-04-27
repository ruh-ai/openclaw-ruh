/**
 * Config substrate — types.
 *
 * Implements: docs/spec/openclaw-v1/009-config-substrate.md
 * Mirrors:    docs/spec/openclaw-v1/schemas/config-substrate.schema.json
 *
 * Multi-dimensional, versioned, hot-swappable operational data. Per spec
 * principle 3 — numbers do not get baked into prompts. Skills look up
 * config via `ctx.config.get(doc_id, key)`; the substrate handles
 * versioning, validation, authority, and decision-log emission.
 *
 * The substrate intentionally:
 * - Owns shapes (manifest, version envelope, import job)
 * - Owns the `Config` facade and its API
 * - Owns commit-time authority enforcement and decision-log emission
 *
 * It does NOT:
 * - Read `.openclaw/config/<doc>/current.json` from disk (filesystem
 *   adapter does that, in a downstream package)
 * - Run scheduled import jobs (orchestrator-layer scheduler does)
 * - Render diff UIs (dashboard does)
 */

// ─── Top-level config manifest (.openclaw/config/manifest.json) ────────

export interface DocIndexEntry {
  /** kebab-case doc id; matches the directory name. */
  readonly id: string;
  /** kebab-case path with trailing slash, relative to .openclaw/config/. */
  readonly path: string;
  /** Identity authorised to commit changes. Email or `import://...` URI. */
  readonly owner: string;
  /** Memory lane the review-required hook routes to. */
  readonly review_lane: string;
}

export interface TopLevelManifest {
  readonly spec_version: string;
  readonly docs: ReadonlyArray<DocIndexEntry>;
}

// ─── Per-doc manifest ─────────────────────────────────────────────────

export type DimensionType = "enum" | "string" | "integer" | "boolean";

export interface Dimension {
  /** snake_case dimension name. */
  readonly name: string;
  readonly type: DimensionType;
  /** When type='enum'. */
  readonly values?: ReadonlyArray<string>;
  /** When type='string', an optional regex constraint. */
  readonly pattern?: string;
}

export interface DocManifest {
  readonly id: string;
  readonly spec_version: string;
  readonly name: string;
  readonly description: string;
  readonly schema_path: "schema.json";
  readonly current_version: number;
  readonly current_path: "current.json";
  readonly dimensions: ReadonlyArray<Dimension>;
  /** Canonical lookup signature exposed to skills. */
  readonly lookup_function?: string;
  readonly version_history_path: "versions/";
  readonly owner: string;
  readonly last_updated_at: string;
  readonly last_updated_by: string;
}

// ─── Version envelope (immutable history) ─────────────────────────────

/**
 * One snapshot in `.openclaw/config/<doc>/versions/vNNNN.json`. Once written
 * a version envelope is immutable.
 */
export interface VersionEnvelope<TEntry = unknown> {
  readonly version: number;
  readonly spec_version: string;
  readonly committed_at: string;
  readonly committed_by: string;
  readonly summary: string;
  readonly supersedes_version: number | null;
  readonly data: ReadonlyArray<TEntry>;
}

// ─── Import job (pipeline-manifest-declared) ──────────────────────────

export interface ImportJob {
  readonly doc_id: string;
  /** Cron expression. */
  readonly schedule: string;
  /** External URL or named connector identifier. */
  readonly source: string;
  /** Optional path to a transformer module that normalises external data to the doc's schema. */
  readonly transformer?: string;
}

// ─── Commit input (what a writer hands the facade) ────────────────────

export interface ConfigCommitInput<TEntry = unknown> {
  readonly doc_id: string;
  readonly committed_by: string;
  readonly summary: string;
  readonly data: ReadonlyArray<TEntry>;
}

// ─── Storage adapter ──────────────────────────────────────────────────

/**
 * The substrate ships an in-memory adapter for tests and prototyping.
 * Production deploys provide a filesystem-backed adapter that reads/writes
 * `.openclaw/config/<doc>/{manifest.json,current.json,versions/vNNNN.json}`,
 * or a Postgres adapter — concrete adapters live in downstream packages.
 */
export interface ConfigStoreAdapter {
  hasDoc(doc_id: string): Promise<boolean>;
  /** All registered doc ids, in registration order. */
  listDocs(): Promise<ReadonlyArray<string>>;

  getDocManifest(doc_id: string): Promise<DocManifest | undefined>;
  setDocManifest(doc_id: string, manifest: DocManifest): Promise<void>;

  /** Returns the current live data, or undefined when the doc isn't registered. */
  getCurrent<TEntry = unknown>(doc_id: string): Promise<ReadonlyArray<TEntry> | undefined>;
  setCurrent<TEntry = unknown>(doc_id: string, data: ReadonlyArray<TEntry>): Promise<void>;

  getVersion<TEntry = unknown>(
    doc_id: string,
    version: number,
  ): Promise<VersionEnvelope<TEntry> | undefined>;
  setVersion<TEntry = unknown>(
    doc_id: string,
    envelope: VersionEnvelope<TEntry>,
  ): Promise<void>;
  /** All version numbers stored for the doc, sorted ascending. */
  listVersions(doc_id: string): Promise<ReadonlyArray<number>>;
}
