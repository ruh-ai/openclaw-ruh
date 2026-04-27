/**
 * Memory facade.
 *
 * Implements: docs/spec/openclaw-v1/004-memory-model.md (substrate slice)
 *
 * Owns the API surface tools and pipeline integrations call:
 *   - acceptClient(submission, identity, channel)  — attestation step
 *   - propose(request)                              — authority + write + log
 *   - confirm(id, reviewer)                         — flagged → confirmed
 *   - reject(id, reviewer, reason)                  — flagged → deprecated
 *   - list(filter)                                  — agent-visible read
 *   - read(id)                                      — agent-visible read
 *
 * The substrate does NOT:
 *   - parse `.openclaw/memory/<type>/<slug>.md` files (filesystem adapter does)
 *   - send emails / teams cards / webhooks (pipeline routing layer does)
 *   - run compaction (separate orchestration concern)
 *
 * What it DOES:
 *   - Enforce attestation (clients can never set source_identity)
 *   - Apply the canonical auto-downgrade rule via authority.ts
 *   - Enforce visibility (agents see only confirmed | permanent)
 *   - Emit memory_* decision-log entries for every state transition
 */

import type { DecisionLog } from "../decision-log/log";
import type { HookRunner } from "../hooks/runner";
import { resolveEffectiveTier } from "./authority";
import {
  AttestedMemoryWriteRequestSchema,
  ClientMemoryWriteSubmissionSchema,
  MemoryAuthoritySchema,
  MemoryQueryFilterSchema,
} from "./schemas";
import type {
  AttestedMemoryWriteRequest,
  ClientMemoryWriteSubmission,
  MemoryAuthority,
  MemoryEntry,
  MemoryQueryFilter,
  MemorySourceChannel,
  MemoryStatus,
  MemoryStoreAdapter,
  MemoryTier,
} from "./types";

// ─── Errors ───────────────────────────────────────────────────────────

export class MemoryAuthorityError extends Error {
  readonly category = "permission_denied" as const;
  constructor(
    public readonly identity: string,
    public readonly lane: string,
    public readonly requestedTier: MemoryTier,
    public readonly reason: string,
  ) {
    super(
      `memory write rejected: identity="${identity}" lane="${lane}" requested_tier=${requestedTier} reason=${reason}`,
    );
    this.name = "MemoryAuthorityError";
  }
}

export class MemoryNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`memory entry "${id}" not found`);
    this.name = "MemoryNotFoundError";
  }
}

export class MemoryReviewError extends Error {
  constructor(
    public readonly id: string,
    public readonly currentStatus: MemoryStatus,
    message: string,
  ) {
    super(message);
    this.name = "MemoryReviewError";
  }
}

// ─── Memory facade options ────────────────────────────────────────────

export interface MemoryOptions {
  readonly pipelineId: string;
  readonly agentId: string;
  readonly authority: MemoryAuthority;
  readonly store: MemoryStoreAdapter;
  readonly specVersion: string;
  /** Test seam — override Date.now for deterministic timestamps. */
  readonly now?: () => number;
  /** When provided, every memory state transition emits a decision-log entry. */
  readonly decisionLog?: DecisionLog;
  /**
   * When provided, Tier-2 and Tier-3 writes also fire the
   * `memory_write_review_required` hook so pipeline integrations (email,
   * Teams, webhook) can route the entry to a Tier-1 reviewer. Without a
   * hook runner the substrate still emits decision-log entries — the
   * audit trail is preserved — but no external review path is invoked.
   */
  readonly hooks?: HookRunner;
}

// ─── Memory class ─────────────────────────────────────────────────────

export class Memory {
  readonly #opts: MemoryOptions;

  constructor(opts: MemoryOptions) {
    this.#opts = {
      ...opts,
      authority: MemoryAuthoritySchema.parse(opts.authority) as MemoryAuthority,
    };
  }

  /**
   * The attestation step. Clients submit `ClientMemoryWriteSubmission`
   * (no identity). The runtime — having authenticated the inbound
   * channel — attaches the verified identity and channel before any
   * authority check runs. .strict() on the client schema rejects any
   * client-supplied source_identity at parse time.
   */
  acceptClient(
    raw: unknown,
    identity: string,
    channel: MemorySourceChannel,
  ): AttestedMemoryWriteRequest {
    const parsed = ClientMemoryWriteSubmissionSchema.parse(raw) as ClientMemoryWriteSubmission;
    const attested: AttestedMemoryWriteRequest = {
      tier: parsed.tier,
      lane: parsed.lane,
      source_identity: identity,
      source_channel: channel,
      content: parsed.content,
      ...(parsed.id !== undefined ? { id: parsed.id } : {}),
    };
    return attested;
  }

  /**
   * Apply authority resolution, persist the entry, and emit decision-log
   * entries for the proposal + (if Tier-2/3) routing. Throws
   * MemoryAuthorityError when no path exists.
   */
  async propose(raw: AttestedMemoryWriteRequest): Promise<MemoryEntry> {
    const req = AttestedMemoryWriteRequestSchema.parse(raw) as AttestedMemoryWriteRequest;
    const resolution = resolveEffectiveTier({
      authority: this.#opts.authority,
      identity: req.source_identity,
      lane: req.lane,
      requestedTier: req.tier,
    });

    if (resolution.outcome === "reject") {
      // Emit memory_write_proposed (with status_assigned: rejected) +
      // memory_write_rejected for the audit trail, then throw.
      if (this.#opts.decisionLog) {
        await this.#opts.decisionLog.emit({
          type: "memory_write_proposed",
          description: `Rejected memory write at tier=${req.tier} lane="${req.lane}"`,
          metadata: {
            requested_tier: req.tier,
            effective_tier: null,
            lane: req.lane,
            source_identity: req.source_identity,
            source_channel: req.source_channel,
            status_assigned: "rejected",
            reason: resolution.reason,
          },
        });
        await this.#opts.decisionLog.emit({
          type: "memory_write_rejected",
          description: `No authority for "${req.source_identity}" in lane "${req.lane}"`,
          metadata: {
            requested_tier: req.tier,
            source_identity: req.source_identity,
            lane: req.lane,
            reason: resolution.reason,
          },
        });
      }
      throw new MemoryAuthorityError(
        req.source_identity,
        req.lane,
        req.tier,
        resolution.reason,
      );
    }

    // allow path — write the entry at effective tier
    const id = await this.#assignId(req);
    const now = new Date((this.#opts.now ?? Date.now)()).toISOString();
    const entry: MemoryEntry = {
      id,
      type: req.content.type,
      title: req.content.title,
      description: req.content.description ?? req.content.title.slice(0, 200),
      tier: resolution.effective_tier,
      lane: req.lane,
      source_identity: req.source_identity,
      source_channel: req.source_channel,
      status: resolution.status,
      created_at: now,
      updated_at: now,
      spec_version: this.#opts.specVersion,
      body: req.content.body,
      ...(resolution.downgraded ? { requested_tier: req.tier } : {}),
    };

    await this.#opts.store.put(entry);

    if (this.#opts.decisionLog) {
      await this.#opts.decisionLog.emit({
        type: "memory_write_proposed",
        description: `Memory write tier=${req.tier}→${resolution.effective_tier} lane="${req.lane}" status=${resolution.status}`,
        metadata: {
          entry_id: entry.id,
          requested_tier: req.tier,
          effective_tier: resolution.effective_tier,
          lane: req.lane,
          source_identity: req.source_identity,
          source_channel: req.source_channel,
          status_assigned: resolution.status,
          ...(resolution.downgraded ? { downgrade_reason: resolution.reason } : {}),
        },
      });

      // Tier-2 / Tier-3 → emit memory_write_routed with the recipient list.
      if (resolution.status === "flagged" || resolution.status === "proposed") {
        const routed_to = this.#tier1ReviewersFor(req.lane);
        await this.#opts.decisionLog.emit({
          type: "memory_write_routed",
          description: `Routing ${resolution.status} entry "${entry.id}" for review`,
          metadata: {
            entry_id: entry.id,
            routed_to,
            channel: req.source_channel,
          },
        });
      }
    }

    // Tier-2 / Tier-3 → fire memory_write_review_required so pipeline
    // integrations (email card to Darrow, Teams adaptive card, webhook)
    // can route approval. The hook fires AFTER persistence + decision-log
    // emission so handlers see the entry's stored shape, not a
    // pre-persistence draft. Decision-log emission is the audit trail;
    // the hook is the integration point.
    if (
      this.#opts.hooks &&
      (resolution.status === "flagged" || resolution.status === "proposed")
    ) {
      const routed_to = this.#tier1ReviewersFor(req.lane);
      await this.#opts.hooks.fire("memory_write_review_required", {
        pending_entry: entry,
        routed_to,
        channel: req.source_channel,
      });
    }

    return entry;
  }

  /**
   * Reviewer flips a flagged/proposed entry to confirmed. Reviewer must
   * be a Tier-1 writer in the entry's lane. Emits memory_write_confirmed.
   */
  async confirm(id: string, reviewer: string): Promise<MemoryEntry> {
    const entry = await this.#requireEntry(id);
    if (entry.status !== "flagged" && entry.status !== "proposed") {
      throw new MemoryReviewError(
        id,
        entry.status,
        `cannot confirm entry "${id}" — status is "${entry.status}", expected flagged|proposed`,
      );
    }
    if (!this.#isTier1Writer(entry.lane, reviewer)) {
      throw new MemoryAuthorityError(reviewer, entry.lane, 1, "reviewer_not_tier_1");
    }
    const now = new Date((this.#opts.now ?? Date.now)()).toISOString();
    const updated: MemoryEntry = { ...entry, status: "confirmed", updated_at: now };
    await this.#opts.store.update(updated);

    if (this.#opts.decisionLog) {
      await this.#opts.decisionLog.emit({
        type: "memory_write_confirmed",
        description: `Reviewer "${reviewer}" confirmed entry "${id}"`,
        metadata: {
          entry_id: id,
          reviewer_identity: reviewer,
          // Latency to confirmation isn't computable here without storing
          // the proposal time on the entry; downstream pipeline that
          // tracks the hook lifecycle owns that metric.
        },
      });
    }
    if (this.#opts.hooks) {
      await this.#opts.hooks.fire("memory_write_confirmed", {
        entry_id: id,
        reviewer_identity: reviewer,
      });
    }
    return updated;
  }

  /**
   * Reviewer rejects a flagged/proposed entry. Status flips to deprecated
   * (kept on disk for audit). Emits memory_write_rejected.
   */
  async reject(id: string, reviewer: string, reason: string): Promise<MemoryEntry> {
    const entry = await this.#requireEntry(id);
    if (entry.status !== "flagged" && entry.status !== "proposed") {
      throw new MemoryReviewError(
        id,
        entry.status,
        `cannot reject entry "${id}" — status is "${entry.status}", expected flagged|proposed`,
      );
    }
    if (!this.#isTier1Writer(entry.lane, reviewer)) {
      throw new MemoryAuthorityError(reviewer, entry.lane, 1, "reviewer_not_tier_1");
    }
    const now = new Date((this.#opts.now ?? Date.now)()).toISOString();
    const updated: MemoryEntry = { ...entry, status: "deprecated", updated_at: now };
    await this.#opts.store.update(updated);

    if (this.#opts.decisionLog) {
      await this.#opts.decisionLog.emit({
        type: "memory_write_rejected",
        description: `Reviewer "${reviewer}" rejected entry "${id}"`,
        metadata: {
          entry_id: id,
          reviewer_identity: reviewer,
          reason,
        },
      });
    }
    if (this.#opts.hooks) {
      await this.#opts.hooks.fire("memory_write_rejected", {
        entry_id: id,
        reviewer_identity: reviewer,
        reason,
      });
    }
    return updated;
  }

  /**
   * Agent-visible list. Filter is parse-validated so flagged/proposed/
   * deprecated are unrepresentable in `statuses`. When `statuses` is
   * omitted, defaults to confirmed | permanent (the agent-safe set).
   */
  async list(filter: MemoryQueryFilter = {}): Promise<ReadonlyArray<MemoryEntry>> {
    const validated = MemoryQueryFilterSchema.parse(filter) as MemoryQueryFilter;
    const statuses = validated.statuses ?? (["confirmed", "permanent"] as const);
    const entries = await this.#opts.store.list({
      ...(validated.types !== undefined ? { types: validated.types } : {}),
      ...(validated.lanes !== undefined ? { lanes: validated.lanes } : {}),
      statuses,
    });

    if (this.#opts.decisionLog) {
      await this.#opts.decisionLog.emit({
        type: "memory_read",
        description: `list(${entries.length})`,
        metadata: {
          count: entries.length,
          types: validated.types,
          lanes: validated.lanes,
          statuses,
        },
      });
    }
    return entries;
  }

  /**
   * Read a single entry. Agents only see confirmed | permanent — other
   * statuses raise MemoryNotFoundError to keep visibility uniform.
   */
  async read(id: string): Promise<MemoryEntry> {
    const entry = await this.#opts.store.get(id);
    if (!entry || (entry.status !== "confirmed" && entry.status !== "permanent")) {
      throw new MemoryNotFoundError(id);
    }
    if (this.#opts.decisionLog) {
      await this.#opts.decisionLog.emit({
        type: "memory_read",
        description: `read("${id}")`,
        metadata: {
          entry_id: id,
          tier: entry.tier,
          lane: entry.lane,
          status: entry.status,
          source_identity: entry.source_identity,
        },
      });
    }
    return entry;
  }

  // ─── Internals ──────────────────────────────────────────────────────

  async #requireEntry(id: string): Promise<MemoryEntry> {
    const e = await this.#opts.store.get(id);
    if (!e) throw new MemoryNotFoundError(id);
    return e;
  }

  #isTier1Writer(lane: string, identity: string): boolean {
    for (const row of this.#opts.authority) {
      if (row.tier === 1 && row.lane === lane && row.writers.includes(identity)) {
        return true;
      }
    }
    return false;
  }

  #tier1ReviewersFor(lane: string): ReadonlyArray<string> {
    const seen = new Set<string>();
    for (const row of this.#opts.authority) {
      if (row.tier === 1 && row.lane === lane) {
        for (const w of row.writers) seen.add(w);
      }
    }
    return [...seen];
  }

  /**
   * Derive a stable kebab-case id from the request. If the client supplied
   * one, use it (validated by Zod earlier). Otherwise derive from title.
   * Collisions throw — pipeline retries with a disambiguator.
   */
  async #assignId(req: AttestedMemoryWriteRequest): Promise<string> {
    if (req.id) return req.id;
    const base = slugify(req.content.title) || "entry";
    if (!(await this.#opts.store.has(base))) return base;
    // Suffix with timestamp microsecond to disambiguate; collisions beyond that
    // are vanishingly unlikely and surfaced via store.put() throwing.
    const stamp = (this.#opts.now ?? Date.now)().toString(36);
    return `${base}-${stamp}`;
  }
}

// ─── Slugify ──────────────────────────────────────────────────────────

/**
 * Lowercase, replace runs of non-alphanumeric with a single hyphen, trim
 * leading hyphens (and any leading digits — the schema requires the slug
 * to start with a-z), drop trailing hyphens. Returns "" for inputs that
 * have no usable letters; the caller fills in a default.
 */
function slugify(input: string): string {
  const lower = input.toLowerCase();
  let out = "";
  let lastDash = true;
  for (const ch of lower) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
      out += ch;
      lastDash = false;
    } else if (!lastDash) {
      out += "-";
      lastDash = true;
    }
  }
  // Trim trailing hyphens
  while (out.endsWith("-")) out = out.slice(0, -1);
  // Strip leading digits/hyphens — slug must start with a-z
  while (out.length > 0) {
    const first = out[0]!;
    if (first >= "a" && first <= "z") break;
    out = out.slice(1);
  }
  return out;
}
