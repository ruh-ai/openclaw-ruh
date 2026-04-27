/**
 * Config facade.
 *
 * Implements the `ctx.config` handle described in spec §read-api +
 * §write-paths. Owns the API surface skills call:
 *
 *   - registerDoc(manifest, entrySchema, initialData, committed_by, summary)
 *   - get(doc_id, key)         — single-key lookup; throws on zero-or-multi
 *   - query(doc_id, filter)    — array of matches
 *   - commit(input)            — schema-validated, version-bumping write
 *   - current_version(doc_id)
 *   - at_version(doc_id, n)    — VersionedHandle for time-travel reads
 *
 * The substrate enforces:
 *   - commits validate against the per-doc Zod schema before persisting
 *   - committers must be the doc's owner (anything else throws
 *     ConfigAuthorityError); pipelines that need a review path implement
 *     it on top by surfacing a hook *before* the commit lands here
 *   - every commit emits a `config_commit` decision-log entry
 *   - cache invalidation: in-memory adapter is already authoritative, so
 *     hot-swap is automatic — the next get() reads the new current.json
 */

import type { ZodType } from "zod";
import type { DecisionLog } from "../decision-log/log";
import { DocManifestSchema, versionEnvelopeSchema } from "./schemas";
import type {
  ConfigCommitInput,
  ConfigStoreAdapter,
  DocManifest,
  VersionEnvelope,
} from "./types";

// ─── Errors ───────────────────────────────────────────────────────────

export class ConfigAuthorityError extends Error {
  readonly category = "permission_denied" as const;
  constructor(
    public readonly doc_id: string,
    public readonly committer: string,
    public readonly owner: string,
  ) {
    super(
      `config commit rejected: doc="${doc_id}" committer="${committer}" owner="${owner}"`,
    );
    this.name = "ConfigAuthorityError";
  }
}

export class ConfigDocNotFoundError extends Error {
  constructor(public readonly doc_id: string) {
    super(`config doc "${doc_id}" not registered`);
    this.name = "ConfigDocNotFoundError";
  }
}

export class ConfigDocAlreadyExistsError extends Error {
  constructor(public readonly doc_id: string) {
    super(`config doc "${doc_id}" already registered`);
    this.name = "ConfigDocAlreadyExistsError";
  }
}

export class ConfigEntryValidationError extends Error {
  constructor(
    public readonly doc_id: string,
    public readonly issues: ReadonlyArray<string>,
  ) {
    super(
      `config commit for "${doc_id}" failed entry validation: ${issues.join("; ")}`,
    );
    this.name = "ConfigEntryValidationError";
  }
}

export class ConfigLookupError extends Error {
  constructor(
    public readonly doc_id: string,
    public readonly reason: "no_match" | "multi_match",
    public readonly matchCount: number,
  ) {
    super(`config lookup on "${doc_id}" returned ${matchCount} match(es) — ${reason}`);
    this.name = "ConfigLookupError";
  }
}

// ─── Versioned handle for at_version() ────────────────────────────────

export interface VersionedConfigHandle {
  get<TEntry = unknown>(key: Record<string, unknown>): Promise<TEntry>;
  query<TEntry = unknown>(filter: Record<string, unknown>): Promise<ReadonlyArray<TEntry>>;
  readonly version: number;
  readonly doc_id: string;
}

// ─── Config options ───────────────────────────────────────────────────

export interface ConfigOptions {
  readonly pipelineId: string;
  readonly agentId: string;
  readonly store: ConfigStoreAdapter;
  readonly specVersion: string;
  /** Test seam — override Date.now for deterministic timestamps. */
  readonly now?: () => number;
  readonly decisionLog?: DecisionLog;
}

// ─── Config class ─────────────────────────────────────────────────────

export class Config {
  readonly #opts: ConfigOptions;
  readonly #entrySchemas = new Map<string, ZodType<unknown>>();

  constructor(opts: ConfigOptions) {
    this.#opts = opts;
  }

  /**
   * Register a config doc. Persists the manifest, stores the entry schema
   * for future commits, and writes initial data as version 1. Subsequent
   * commits must come through `commit()`.
   */
  async registerDoc<TEntry>(
    manifest: DocManifest,
    entrySchema: ZodType<TEntry>,
    initialData: ReadonlyArray<TEntry>,
    committed_by: string,
    summary: string,
  ): Promise<void> {
    const parsedManifest = DocManifestSchema.parse(manifest) as DocManifest;
    if (await this.#opts.store.hasDoc(parsedManifest.id)) {
      throw new ConfigDocAlreadyExistsError(parsedManifest.id);
    }
    if (committed_by !== parsedManifest.owner) {
      throw new ConfigAuthorityError(parsedManifest.id, committed_by, parsedManifest.owner);
    }

    // Validate initial data using the entry schema.
    const validation = this.#validateEntries(parsedManifest.id, entrySchema, initialData);
    if (validation.length > 0) {
      throw new ConfigEntryValidationError(parsedManifest.id, validation);
    }

    const now = new Date((this.#opts.now ?? Date.now)()).toISOString();
    const envelope: VersionEnvelope<TEntry> = {
      version: 1,
      spec_version: this.#opts.specVersion,
      committed_at: now,
      committed_by,
      summary,
      supersedes_version: null,
      data: initialData,
    };

    // Persist
    this.#entrySchemas.set(parsedManifest.id, entrySchema as ZodType<unknown>);
    await this.#opts.store.setDocManifest(parsedManifest.id, {
      ...parsedManifest,
      current_version: 1,
      last_updated_at: now,
      last_updated_by: committed_by,
    });
    await this.#opts.store.setVersion<TEntry>(parsedManifest.id, envelope);
    await this.#opts.store.setCurrent<TEntry>(parsedManifest.id, initialData);

    if (this.#opts.decisionLog) {
      await this.#opts.decisionLog.emit({
        type: "config_commit",
        description: `Registered config doc "${parsedManifest.id}" at v1`,
        metadata: {
          doc_id: parsedManifest.id,
          version: 1,
          supersedes_version: null,
          committed_by,
          diff_summary: summary,
          schema_validated: true,
          entry_count: initialData.length,
        },
      });
    }
  }

  /**
   * Commit a new version. The committer must be the doc's owner. Data is
   * validated against the registered Zod schema; on failure throws
   * ConfigEntryValidationError. On success: writes immutable version
   * envelope, replaces current, increments version, emits config_commit.
   */
  async commit<TEntry>(input: ConfigCommitInput<TEntry>): Promise<number> {
    const manifest = await this.#requireManifest(input.doc_id);
    if (input.committed_by !== manifest.owner) {
      if (this.#opts.decisionLog) {
        await this.#opts.decisionLog.emit({
          type: "permission_denied",
          description: `Config commit on "${input.doc_id}" rejected — committer is not owner`,
          metadata: {
            doc_id: input.doc_id,
            committer: input.committed_by,
            owner: manifest.owner,
            requires_approval: false,
          },
        });
      }
      throw new ConfigAuthorityError(input.doc_id, input.committed_by, manifest.owner);
    }

    const schema = this.#entrySchemas.get(input.doc_id);
    if (!schema) {
      throw new ConfigDocNotFoundError(input.doc_id);
    }

    const issues = this.#validateEntries(input.doc_id, schema, input.data);
    if (issues.length > 0) {
      throw new ConfigEntryValidationError(input.doc_id, issues);
    }

    const newVersion = manifest.current_version + 1;
    const now = new Date((this.#opts.now ?? Date.now)()).toISOString();
    const envelope: VersionEnvelope<TEntry> = {
      version: newVersion,
      spec_version: this.#opts.specVersion,
      committed_at: now,
      committed_by: input.committed_by,
      summary: input.summary,
      supersedes_version: manifest.current_version,
      data: input.data,
    };

    // Validate the envelope shape before persisting (defence in depth).
    versionEnvelopeSchema(schema).parse(envelope);

    await this.#opts.store.setVersion<TEntry>(input.doc_id, envelope);
    await this.#opts.store.setCurrent<TEntry>(input.doc_id, input.data);
    await this.#opts.store.setDocManifest(input.doc_id, {
      ...manifest,
      current_version: newVersion,
      last_updated_at: now,
      last_updated_by: input.committed_by,
    });

    if (this.#opts.decisionLog) {
      await this.#opts.decisionLog.emit({
        type: "config_commit",
        description: `Config commit on "${input.doc_id}" v${manifest.current_version}→v${newVersion}`,
        metadata: {
          doc_id: input.doc_id,
          version: newVersion,
          supersedes_version: manifest.current_version,
          committed_by: input.committed_by,
          diff_summary: input.summary,
          schema_validated: true,
          entry_count: input.data.length,
        },
      });
    }
    return newVersion;
  }

  /**
   * Single-key lookup. Returns the unique matching entry. Throws
   * ConfigLookupError(no_match) if zero match, or (multi_match) if more
   * than one match — keys must uniquely identify an entry per the doc's
   * `dimensions`.
   */
  async get<TEntry = unknown>(
    doc_id: string,
    key: Record<string, unknown>,
  ): Promise<TEntry> {
    const matches = await this.query<TEntry>(doc_id, key);
    if (matches.length === 0) {
      throw new ConfigLookupError(doc_id, "no_match", 0);
    }
    if (matches.length > 1) {
      throw new ConfigLookupError(doc_id, "multi_match", matches.length);
    }
    return matches[0]!;
  }

  /** Filter query — every entry where every filter key matches the entry's value. */
  async query<TEntry = unknown>(
    doc_id: string,
    filter: Record<string, unknown>,
  ): Promise<ReadonlyArray<TEntry>> {
    const data = await this.#opts.store.getCurrent<TEntry>(doc_id);
    if (data === undefined) {
      throw new ConfigDocNotFoundError(doc_id);
    }
    return data.filter((entry) => entryMatches(entry, filter));
  }

  /** Returns the current live version number. */
  async current_version(doc_id: string): Promise<number> {
    const manifest = await this.#requireManifest(doc_id);
    return manifest.current_version;
  }

  /**
   * Time-travel handle. Returns a VersionedConfigHandle bound to a
   * specific historical version. Throws ConfigDocNotFoundError if the
   * version isn't stored.
   */
  at_version(doc_id: string, version: number): VersionedConfigHandle {
    const store = this.#opts.store;
    return {
      doc_id,
      version,
      async get<TEntry = unknown>(key: Record<string, unknown>): Promise<TEntry> {
        const env = await store.getVersion<TEntry>(doc_id, version);
        if (!env) throw new ConfigDocNotFoundError(`${doc_id}@v${version}`);
        const matches = env.data.filter((e) => entryMatches(e, key));
        if (matches.length === 0) throw new ConfigLookupError(doc_id, "no_match", 0);
        if (matches.length > 1) {
          throw new ConfigLookupError(doc_id, "multi_match", matches.length);
        }
        return matches[0]!;
      },
      async query<TEntry = unknown>(filter: Record<string, unknown>): Promise<ReadonlyArray<TEntry>> {
        const env = await store.getVersion<TEntry>(doc_id, version);
        if (!env) throw new ConfigDocNotFoundError(`${doc_id}@v${version}`);
        return env.data.filter((e) => entryMatches(e, filter));
      },
    };
  }

  /** True when the doc has been registered. */
  async hasDoc(doc_id: string): Promise<boolean> {
    return this.#opts.store.hasDoc(doc_id);
  }

  // ─── Internals ──────────────────────────────────────────────────────

  async #requireManifest(doc_id: string): Promise<DocManifest> {
    const m = await this.#opts.store.getDocManifest(doc_id);
    if (!m) throw new ConfigDocNotFoundError(doc_id);
    return m;
  }

  #validateEntries<TEntry>(
    doc_id: string,
    schema: ZodType<TEntry>,
    data: ReadonlyArray<TEntry>,
  ): string[] {
    const issues: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const r = schema.safeParse(data[i]);
      if (!r.success) {
        for (const issue of r.error.issues) {
          issues.push(`[${i}] ${issue.path.join(".") || "<root>"}: ${issue.message}`);
        }
      }
    }
    return issues;
  }
}

// ─── Match helper ─────────────────────────────────────────────────────

/**
 * True iff `entry` is an object whose every key in `filter` equals the
 * corresponding filter value. Equality is strict (===); arrays/objects in
 * filter values are not deep-compared. Filter keys missing from the
 * entry are treated as "no match." Per spec, keys must come from the
 * doc's dimensions; non-dimension keys are not rejected here (caller's
 * responsibility) but they will simply never match.
 */
function entryMatches(entry: unknown, filter: Record<string, unknown>): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const obj = entry as Record<string, unknown>;
  for (const [k, v] of Object.entries(filter)) {
    if (obj[k] !== v) return false;
  }
  return true;
}
