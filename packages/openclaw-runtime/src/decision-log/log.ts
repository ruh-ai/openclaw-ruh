/**
 * DecisionLog facade.
 *
 * Implements: docs/spec/openclaw-v1/005-decision-log.md
 *
 * This is the handle tools and orchestrators use to emit structured decisions.
 * It owns: ULID generation, redaction-at-write-time, parent_id derivation,
 * metric routing, optional per-type metadata schema validation.
 *
 * The runtime constructs a DecisionLog per session and threads it through
 * ToolContext and the orchestrator. Direct instantiation is for tests.
 */

import type { ZodType } from "zod";
import { redactObject, redactString, type RedactionOptions } from "./redaction";
import type {
  Decision,
  DecisionInput,
  DecisionMetric,
  DecisionMetricInput,
  DecisionStoreAdapter,
  DecisionLogQuery,
  DecisionLogResult,
  DecisionType,
} from "./types";

// ─── ULID generation ───────────────────────────────────────────────────

/**
 * Crockford Base32 alphabet — excludes I, L, O, U.
 */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Generate a ULID — 26-char Crockford Base32 string.
 * - Time component (10 chars): milliseconds since epoch
 * - Random component (16 chars): 80 bits of randomness
 *
 * Sortable by timestamp prefix. Globally unique within a session at >2^80
 * randomness per millisecond.
 */
export function ulid(now: number = Date.now(), randomFn: () => number = Math.random): string {
  let time = now;
  const out: string[] = new Array(26);

  // Time prefix (10 chars, big-endian Crockford Base32)
  for (let i = 9; i >= 0; i--) {
    const mod = time % 32;
    out[i] = CROCKFORD[mod] ?? "0";
    time = Math.floor(time / 32);
  }

  // Random suffix (16 chars)
  for (let i = 10; i < 26; i++) {
    const r = Math.floor(randomFn() * 32);
    out[i] = CROCKFORD[r] ?? "0";
  }

  return out.join("");
}

// ─── Per-type metadata schema binding ──────────────────────────────────

export interface DecisionMetadataSchemaBinding {
  readonly type: DecisionType;
  readonly schemaName: string;
  readonly schema: ZodType<unknown>;
}

// ─── DecisionLog ──────────────────────────────────────────────────────

export interface DecisionLogOptions {
  readonly pipeline_id: string;
  readonly agent_id: string;
  readonly session_id: string;
  readonly spec_version: string;
  readonly store: DecisionStoreAdapter;
  /** Test seam — override Date.now for deterministic ULIDs. */
  readonly now?: () => number;
  /** Test seam — override Math.random for deterministic ULIDs. */
  readonly random?: () => number;
  /** Per-type metadata validators. Mismatched metadata throws DecisionMetadataValidationError. */
  readonly metadataSchemas?: ReadonlyArray<DecisionMetadataSchemaBinding>;
  /** Custom redaction rules to add to the canonical set. */
  readonly redaction?: RedactionOptions;
}

export class DecisionMetadataValidationError extends Error {
  constructor(
    public readonly type: DecisionType,
    public readonly schemaName: string,
    message: string,
  ) {
    super(message);
    this.name = "DecisionMetadataValidationError";
  }
}

export class DecisionLog {
  readonly #opts: DecisionLogOptions;
  readonly #stack: string[] = []; // parent_id stack for automatic call-tree derivation
  readonly #schemas: Map<DecisionType, DecisionMetadataSchemaBinding>;

  constructor(opts: DecisionLogOptions) {
    this.#opts = opts;
    this.#schemas = new Map();
    if (opts.metadataSchemas) {
      for (const binding of opts.metadataSchemas) {
        this.#schemas.set(binding.type, binding);
      }
    }
  }

  /**
   * Emit a decision. Fills in id (ULID), pipeline/agent/session ids, parent_id
   * (from current stack frame), timestamp, spec_version. Metadata is redacted
   * and (if a schema is bound) validated.
   */
  async emit(input: DecisionInput): Promise<Decision> {
    const now = this.#opts.now ?? Date.now;
    const random = this.#opts.random ?? Math.random;

    const rawMetadata = input.metadata ?? {};
    const metadata = redactObject(rawMetadata, this.#opts.redaction);

    // Validate against bound schema if one exists
    const binding = this.#schemas.get(input.type);
    if (binding) {
      const result = binding.schema.safeParse(metadata);
      if (!result.success) {
        const errMsg = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw new DecisionMetadataValidationError(
          input.type,
          binding.schemaName,
          `metadata for ${input.type} failed ${binding.schemaName}: ${errMsg}`,
        );
      }
    }

    const decision: Decision = {
      id: ulid(now(), random),
      pipeline_id: this.#opts.pipeline_id,
      agent_id: this.#opts.agent_id,
      session_id: this.#opts.session_id,
      ...(input.parent_id !== undefined ? { parent_id: input.parent_id } : this.#currentParent()),
      type: input.type,
      timestamp: new Date(now()).toISOString(),
      description: redactString(input.description, this.#opts.redaction),
      metadata,
      spec_version: this.#opts.spec_version,
    };

    await this.#opts.store.write(decision);
    return decision;
  }

  /**
   * Push a parent_id onto the stack so subsequent emits attribute to it.
   * Pair with `popParent` (or use `withParent` for automatic cleanup).
   */
  pushParent(parentId: string): void {
    this.#stack.push(parentId);
  }

  popParent(): string | undefined {
    return this.#stack.pop();
  }

  /**
   * Run a callback with a parent_id pushed onto the stack; pop afterwards
   * regardless of success/failure.
   */
  async withParent<T>(parentId: string, fn: () => Promise<T>): Promise<T> {
    this.pushParent(parentId);
    try {
      return await fn();
    } finally {
      this.popParent();
    }
  }

  /** Emit a metric. */
  async metric(input: DecisionMetricInput): Promise<DecisionMetric> {
    const now = this.#opts.now ?? Date.now;
    const metric: DecisionMetric = {
      pipeline_id: this.#opts.pipeline_id,
      agent_id: this.#opts.agent_id,
      session_id: this.#opts.session_id,
      name: input.name,
      value: input.value,
      unit: input.unit,
      timestamp: new Date(now()).toISOString(),
      ...(input.labels !== undefined ? { labels: input.labels } : {}),
    };
    await this.#opts.store.writeMetric(metric);
    return metric;
  }

  /** Query the store (scoped to this pipeline by default). */
  async query(q: Omit<DecisionLogQuery, "pipeline_id"> & { pipeline_id?: string }): Promise<DecisionLogResult> {
    const fullQuery: DecisionLogQuery = {
      pipeline_id: q.pipeline_id ?? this.#opts.pipeline_id,
      ...(q.agent_id !== undefined ? { agent_id: q.agent_id } : {}),
      ...(q.session_id !== undefined ? { session_id: q.session_id } : {}),
      ...(q.types !== undefined ? { types: q.types } : {}),
      ...(q.since !== undefined ? { since: q.since } : {}),
      ...(q.until !== undefined ? { until: q.until } : {}),
      ...(q.parent_id !== undefined ? { parent_id: q.parent_id } : {}),
      ...(q.limit !== undefined ? { limit: q.limit } : {}),
      ...(q.cursor !== undefined ? { cursor: q.cursor } : {}),
    };
    return this.#opts.store.query(fullQuery);
  }

  #currentParent(): { parent_id?: string } {
    const top = this.#stack[this.#stack.length - 1];
    return top !== undefined ? { parent_id: top } : {};
  }
}
