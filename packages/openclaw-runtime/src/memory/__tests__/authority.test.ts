import { describe, expect, test } from "bun:test";
import { listAuthorityFor, resolveEffectiveTier } from "../authority";
import type { MemoryAuthority } from "../types";

// ECC's canonical manifest from spec §write-authority.
const ECC_AUTHORITY: MemoryAuthority = [
  { tier: 1, lane: "estimating", writers: ["darrow@ecc.com"] },
  { tier: 1, lane: "business", writers: ["matt@ecc.com"] },
  { tier: 1, lane: "operations", writers: ["scott@ecc.com"] },
  { tier: 2, lane: "estimating", writers: ["scott@ecc.com", "matt@ecc.com"] },
  {
    tier: 3,
    lane: "estimating",
    writers: ["amelia@ecc.com", "jim@ecc.com", "ramirez@ecc.com"],
  },
];

describe("resolveEffectiveTier — match at requested tier", () => {
  test("Darrow writing Tier-1 estimating lands at Tier 1 confirmed", () => {
    const r = resolveEffectiveTier({
      authority: ECC_AUTHORITY,
      identity: "darrow@ecc.com",
      lane: "estimating",
      requestedTier: 1,
    });
    expect(r.outcome).toBe("allow");
    if (r.outcome !== "allow") return;
    expect(r.effective_tier).toBe(1);
    expect(r.status).toBe("confirmed");
    expect(r.downgraded).toBe(false);
    expect(r.reason).toBe("matched_at_requested_tier");
  });

  test("Scott writing Tier-1 operations lands at Tier 1 confirmed", () => {
    const r = resolveEffectiveTier({
      authority: ECC_AUTHORITY,
      identity: "scott@ecc.com",
      lane: "operations",
      requestedTier: 1,
    });
    expect(r.outcome).toBe("allow");
    if (r.outcome !== "allow") return;
    expect(r.effective_tier).toBe(1);
    expect(r.status).toBe("confirmed");
  });

  test("Tier-2 writer requesting Tier-2 stays at Tier 2 (status flagged)", () => {
    const r = resolveEffectiveTier({
      authority: ECC_AUTHORITY,
      identity: "scott@ecc.com",
      lane: "estimating",
      requestedTier: 2,
    });
    expect(r.outcome).toBe("allow");
    if (r.outcome !== "allow") return;
    expect(r.effective_tier).toBe(2);
    expect(r.status).toBe("flagged");
    expect(r.downgraded).toBe(false);
  });

  test("Tier-3 writer requesting Tier-3 stays at Tier 3 (status proposed)", () => {
    const r = resolveEffectiveTier({
      authority: ECC_AUTHORITY,
      identity: "jim@ecc.com",
      lane: "estimating",
      requestedTier: 3,
    });
    expect(r.outcome).toBe("allow");
    if (r.outcome !== "allow") return;
    expect(r.effective_tier).toBe(3);
    expect(r.status).toBe("proposed");
  });
});

describe("resolveEffectiveTier — auto-downgrade", () => {
  test("Matt's Tier-1 estimating write downgrades to Tier-2 (he's Tier-2 there)", () => {
    const r = resolveEffectiveTier({
      authority: ECC_AUTHORITY,
      identity: "matt@ecc.com",
      lane: "estimating",
      requestedTier: 1,
    });
    expect(r.outcome).toBe("allow");
    if (r.outcome !== "allow") return;
    expect(r.effective_tier).toBe(2);
    expect(r.status).toBe("flagged");
    expect(r.downgraded).toBe(true);
    expect(r.requested_tier).toBe(1);
    expect(r.reason).toContain("no_match_at_requested_tier");
    expect(r.reason).toContain("match_at_lower_tier_2");
  });

  test("downgrade picks the strongest available tier (Tier-2 over Tier-3)", () => {
    const r = resolveEffectiveTier({
      authority: ECC_AUTHORITY,
      identity: "scott@ecc.com", // Tier-2 estimating, not in Tier-3
      lane: "estimating",
      requestedTier: 1,
    });
    expect(r.outcome).toBe("allow");
    if (r.outcome !== "allow") return;
    expect(r.effective_tier).toBe(2);
  });

  test("Tier-2 → Tier-3 downgrade also fires", () => {
    const auth: MemoryAuthority = [
      { tier: 1, lane: "x", writers: ["a"] },
      { tier: 3, lane: "x", writers: ["b"] },
    ];
    const r = resolveEffectiveTier({
      authority: auth,
      identity: "b",
      lane: "x",
      requestedTier: 2,
    });
    expect(r.outcome).toBe("allow");
    if (r.outcome !== "allow") return;
    expect(r.effective_tier).toBe(3);
    expect(r.status).toBe("proposed");
    expect(r.downgraded).toBe(true);
  });
});

describe("resolveEffectiveTier — reject", () => {
  test("identity unknown to the lane is rejected", () => {
    const r = resolveEffectiveTier({
      authority: ECC_AUTHORITY,
      identity: "newhire@ecc.com",
      lane: "estimating",
      requestedTier: 3,
    });
    expect(r.outcome).toBe("reject");
    if (r.outcome !== "reject") return;
    expect(r.reason).toBe("no_authority_in_lane");
    expect(r.requested_tier).toBe(3);
  });

  test("identity known in OTHER lanes but not the requested one is rejected", () => {
    const r = resolveEffectiveTier({
      authority: ECC_AUTHORITY,
      identity: "scott@ecc.com", // tier-1 ops, tier-2 estimating; nothing on business
      lane: "business",
      requestedTier: 1,
    });
    expect(r.outcome).toBe("reject");
  });

  test("identity at HIGHER tier (numerically lower) than requested in same lane: not used", () => {
    // Auto-downgrade only walks DOWNWARD (numerically up). A Tier-1 writer
    // requesting Tier-3 should not be lifted to Tier-3 by this function —
    // they should be allowed at Tier-3 because Tier-1 implies Tier-3 authority?
    // The spec is explicit: writers are listed at exactly the tiers they hold;
    // there's no implicit upward grant. So a writer listed only at Tier-1 of
    // a lane requesting Tier-3 of that lane gets... no match at Tier-3 (their
    // declared tier), no match at any LOWER tier (there is no tier below 3),
    // therefore reject.
    const auth: MemoryAuthority = [{ tier: 1, lane: "x", writers: ["a"] }];
    const r = resolveEffectiveTier({
      authority: auth,
      identity: "a",
      lane: "x",
      requestedTier: 3,
    });
    expect(r.outcome).toBe("reject");
  });
});

describe("listAuthorityFor", () => {
  test("returns all (tier, lane) pairs for an identity, sorted", () => {
    const list = listAuthorityFor(ECC_AUTHORITY, "scott@ecc.com");
    expect(list).toEqual([
      { tier: 1, lane: "operations" },
      { tier: 2, lane: "estimating" },
    ]);
  });

  test("unknown identity returns empty", () => {
    expect(listAuthorityFor(ECC_AUTHORITY, "nobody@ecc.com")).toEqual([]);
  });

  test("identity in multiple lanes at same tier is listed once per lane, sorted", () => {
    const auth: MemoryAuthority = [
      { tier: 2, lane: "z-lane", writers: ["a"] },
      { tier: 2, lane: "a-lane", writers: ["a"] },
      { tier: 1, lane: "m-lane", writers: ["a"] },
    ];
    expect(listAuthorityFor(auth, "a")).toEqual([
      { tier: 1, lane: "m-lane" },
      { tier: 2, lane: "a-lane" },
      { tier: 2, lane: "z-lane" },
    ]);
  });
});
