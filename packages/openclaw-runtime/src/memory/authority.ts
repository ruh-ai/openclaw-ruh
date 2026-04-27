/**
 * Memory authority — effective-tier resolution.
 *
 * Implements: docs/spec/openclaw-v1/004-memory-model.md §write-authority
 *
 * Pure function. No side effects. Deterministic. Given a manifest's
 * memory_authority + an attested identity + a (lane, requested_tier),
 * return whether the write is allowed and at what effective tier — or
 * reject with a machine-readable reason.
 *
 * The auto-downgrade rule (canonical):
 *   1. Match at declared tier?  → use it.
 *   2. Match at a LOWER tier in the same lane? → downgrade to highest match.
 *   3. No match at any tier in the lane? → reject.
 *
 * Tier policy → status:
 *   1 → confirmed   (lands immediately)
 *   2 → flagged     (routed to the lane's Tier-1 for confirmation)
 *   3 → proposed    (routed up as a proposal)
 */

import type {
  AuthorityResolution,
  MemoryAuthority,
  MemoryStatus,
  MemoryTier,
} from "./types";

// ─── Tier policy: effective tier → resulting status ───────────────────

const TIER_STATUS: Record<MemoryTier, Extract<MemoryStatus, "confirmed" | "flagged" | "proposed">> = {
  1: "confirmed",
  2: "flagged",
  3: "proposed",
};

// ─── Public resolver ──────────────────────────────────────────────────

export interface ResolveInput {
  readonly authority: MemoryAuthority;
  readonly identity: string;
  readonly lane: string;
  readonly requestedTier: MemoryTier;
}

/**
 * Apply the canonical resolution rule. Pure function — no I/O, no clocks.
 */
export function resolveEffectiveTier(input: ResolveInput): AuthorityResolution {
  const { authority, identity, lane, requestedTier } = input;

  // Step 1 — match at the declared tier?
  if (writerListed(authority, requestedTier, lane, identity)) {
    return {
      outcome: "allow",
      effective_tier: requestedTier,
      status: TIER_STATUS[requestedTier],
      downgraded: false,
      reason: "matched_at_requested_tier",
    };
  }

  // Step 2 — find the highest LOWER tier in the same lane that has the writer.
  // Tiers below requested mean numerically GREATER than requested
  // (Tier 1 = strongest, Tier 3 = weakest). So "lower authority" = higher number.
  // We scan Tier requestedTier+1 .. 3 and pick the FIRST match — that's the
  // strongest tier ≤ requested that the writer holds.
  for (let t = (requestedTier + 1) as MemoryTier; t <= 3; t = (t + 1) as MemoryTier) {
    if (writerListed(authority, t, lane, identity)) {
      return {
        outcome: "allow",
        effective_tier: t,
        status: TIER_STATUS[t],
        requested_tier: requestedTier,
        downgraded: true,
        reason: `no_match_at_requested_tier;match_at_lower_tier_${t}`,
      };
    }
  }

  // Step 3 — no path at any tier in the lane.
  return {
    outcome: "reject",
    reason: "no_authority_in_lane",
    requested_tier: requestedTier,
  };
}

// ─── Internals ────────────────────────────────────────────────────────

function writerListed(
  authority: MemoryAuthority,
  tier: MemoryTier,
  lane: string,
  identity: string,
): boolean {
  for (const row of authority) {
    if (row.tier === tier && row.lane === lane && row.writers.includes(identity)) {
      return true;
    }
  }
  return false;
}

/**
 * Helper: list every (tier, lane) the identity is authorised to write at.
 * Useful for diagnostics + UI rendering ("Scott can write Tier-1 operations,
 * Tier-2 estimating"). Order: tier asc, lane asc.
 */
export function listAuthorityFor(
  authority: MemoryAuthority,
  identity: string,
): ReadonlyArray<{ tier: MemoryTier; lane: string }> {
  const matches: Array<{ tier: MemoryTier; lane: string }> = [];
  for (const row of authority) {
    if (row.writers.includes(identity)) {
      matches.push({ tier: row.tier, lane: row.lane });
    }
  }
  matches.sort((a, b) => (a.tier - b.tier) || a.lane.localeCompare(b.lane));
  return matches;
}
