/**
 * Memory model — types.
 *
 * Implements: docs/spec/openclaw-v1/004-memory-model.md
 * Mirrors:    docs/spec/openclaw-v1/schemas/memory.schema.json
 *
 * Tier/lane-aware, role-attested, status-tracked memory. The substrate
 * provides the shapes, the authority-resolution logic, and the storage
 * facade. Filesystem layout (`.openclaw/memory/<type>/<slug>.md`),
 * compaction strategies, and external review-channel routing live one
 * layer up in the pipeline runtime — they consume what's defined here.
 */

// ─── Primitive enums ──────────────────────────────────────────────────

export type MemoryTier = 1 | 2 | 3;

export type MemoryType = "project" | "user" | "feedback" | "reference";

export type MemorySourceChannel =
  | "email"
  | "dashboard"
  | "agent"
  | "import"
  | "teams"
  | "webhook"
  | "other";

/**
 * Lifecycle states. Per spec §Status:
 *
 * - proposed   Tier-3 write awaiting routing decision (invisible to agent)
 * - flagged    Tier-2 write OR proposed surfaced for review (invisible to agent)
 * - confirmed  Approved by Tier-1 reviewer (visible to agent)
 * - permanent  Confirmed entry past the volatility threshold (visible to agent)
 * - deprecated Superseded; preserved for audit (filtered from agent context)
 */
export type MemoryStatus =
  | "proposed"
  | "flagged"
  | "confirmed"
  | "permanent"
  | "deprecated";

// ─── Memory entry (frontmatter portion) ───────────────────────────────

export interface MemoryEntryContent {
  readonly type: MemoryType;
  readonly title: string;
  readonly description?: string;
  readonly body: string;
}

export interface MemoryEntry {
  /** kebab-case identifier; matches the filename (without .md) per spec §filesystem-layout. */
  readonly id: string;
  readonly type: MemoryType;
  readonly title: string;
  /** ≤200 chars — shows in the index. */
  readonly description: string;
  readonly tier: MemoryTier;
  readonly lane: string;
  /** Runtime-attested identity. NEVER client-supplied. */
  readonly source_identity: string;
  readonly source_channel: MemorySourceChannel;
  readonly status: MemoryStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly expires_at?: string | null;
  readonly supersedes?: ReadonlyArray<string>;
  readonly superseded_by?: string | null;
  readonly related?: ReadonlyArray<string>;
  /** When true, survives reactive compaction. Use sparingly. */
  readonly important?: boolean;
  readonly spec_version: string;
  /** Body lives separately; many ops only need the index/frontmatter. */
  readonly body?: string;
  /**
   * Preserved when an auto-downgrade applied: the tier the writer requested.
   * Entry's `tier` reflects the effective tier; `requested_tier` records intent.
   */
  readonly requested_tier?: MemoryTier;
}

// ─── Memory authority (manifest declaration) ──────────────────────────

export interface MemoryAuthorityRow {
  readonly tier: MemoryTier;
  readonly lane: string;
  /** Identities authorised to write at this (tier, lane). */
  readonly writers: ReadonlyArray<string>;
}

export type MemoryAuthority = ReadonlyArray<MemoryAuthorityRow>;

// ─── Write submissions ────────────────────────────────────────────────

/**
 * What a client (browser, email handler, MCP integration) submits.
 * Crucially does NOT carry `source_identity` — the runtime derives that.
 */
export interface ClientMemoryWriteSubmission {
  readonly tier: MemoryTier;
  readonly lane: string;
  readonly content: MemoryEntryContent;
  /**
   * Optional caller-supplied id. If omitted, the runtime derives one from
   * the title. Either way the runtime owns id assignment — clients cannot
   * collide an existing entry by guessing the slug.
   */
  readonly id?: string;
}

/**
 * What the runtime constructs after attaching attested identity. Pipeline
 * integrations, hooks, tools, and decision-log entries see this shape —
 * never the client form.
 */
export interface AttestedMemoryWriteRequest {
  readonly tier: MemoryTier;
  readonly lane: string;
  readonly source_identity: string;
  readonly source_channel: MemorySourceChannel;
  readonly content: MemoryEntryContent;
  readonly id?: string;
}

// ─── Query / read shapes ──────────────────────────────────────────────

/**
 * Filter shape for ctx.memory.list(). Per spec §read-patterns + anti-example
 * "Agent reading flagged entries", the `statuses` filter is restricted to
 * confirmed | permanent. The runtime rejects flagged/proposed in this filter.
 */
export interface MemoryQueryFilter {
  readonly types?: ReadonlyArray<MemoryType>;
  readonly lanes?: ReadonlyArray<string>;
  /** ONLY confirmed and permanent. proposed/flagged are runtime-internal. */
  readonly statuses?: ReadonlyArray<Extract<MemoryStatus, "confirmed" | "permanent">>;
}

// ─── Effective-tier resolution result ─────────────────────────────────

/**
 * What `resolveEffectiveTier` returns. Either:
 * - allow: the write may proceed at `effective_tier` with `status` per the
 *   tier policy (and optional `requested_tier` if downgraded);
 * - reject: no path at any tier in the lane.
 */
export type AuthorityResolution =
  | {
      readonly outcome: "allow";
      readonly effective_tier: MemoryTier;
      readonly status: Extract<MemoryStatus, "confirmed" | "flagged" | "proposed">;
      /** Set when effective < requested (the original tier preserved for audit). */
      readonly requested_tier?: MemoryTier;
      readonly downgraded: boolean;
      /** Machine-readable reason: matched_at_requested_tier | downgraded_to_<n>. */
      readonly reason: string;
    }
  | {
      readonly outcome: "reject";
      /** Always "no_authority_in_lane". */
      readonly reason: string;
      readonly requested_tier: MemoryTier;
    };

// ─── Storage adapter ──────────────────────────────────────────────────

/**
 * The substrate ships an in-memory adapter for tests and prototyping.
 * Production deploys supply a real adapter (filesystem-backed or
 * Postgres-backed) in a downstream package — the runtime itself does not
 * couple to a specific persistence layer.
 */
export interface MemoryStoreAdapter {
  /**
   * Persist a new entry. Throws if `entry.id` already exists (write-once;
   * updates go through `update`).
   */
  put(entry: MemoryEntry): Promise<void>;
  /** Replace an existing entry (e.g., status flip). Throws if id missing. */
  update(entry: MemoryEntry): Promise<void>;
  /** Read by id. Returns undefined if not found. */
  get(id: string): Promise<MemoryEntry | undefined>;
  /** Returns entries matching the filter. Visibility rules enforced by Memory facade, not the store. */
  list(filter: { types?: ReadonlyArray<MemoryType>; lanes?: ReadonlyArray<string>; statuses?: ReadonlyArray<MemoryStatus> }): Promise<ReadonlyArray<MemoryEntry>>;
  /** True iff the id exists. */
  has(id: string): Promise<boolean>;
}
