import { describe, expect, test } from "bun:test";
import { DecisionLog, InMemoryDecisionStore } from "../../decision-log";
import { HookRegistry, HookRunner, VETO } from "../../hooks";
import { InMemoryMemoryStore } from "../in-memory-store";
import {
  Memory,
  MemoryAuthorityError,
  MemoryNotFoundError,
  MemoryReviewError,
} from "../memory";
import type { MemoryAuthority, MemoryEntry } from "../types";

const SPEC = "1.0.0-rc.1";

const ECC_AUTHORITY: MemoryAuthority = [
  { tier: 1, lane: "estimating", writers: ["darrow@ecc.com"] },
  { tier: 1, lane: "business", writers: ["matt@ecc.com"] },
  { tier: 1, lane: "operations", writers: ["scott@ecc.com"] },
  { tier: 2, lane: "estimating", writers: ["scott@ecc.com", "matt@ecc.com"] },
  {
    tier: 3,
    lane: "estimating",
    writers: ["amelia@ecc.com", "jim@ecc.com"],
  },
];

function build() {
  const store = new InMemoryMemoryStore();
  const decisionStore = new InMemoryDecisionStore();
  const decisionLog = new DecisionLog({
    pipeline_id: "pipe-1",
    agent_id: "agent-1",
    session_id: "ses-1",
    spec_version: SPEC,
    store: decisionStore,
  });
  const memory = new Memory({
    pipelineId: "pipe-1",
    agentId: "agent-1",
    authority: ECC_AUTHORITY,
    store,
    specVersion: SPEC,
    now: () => 1_700_000_000_000,
    decisionLog,
  });
  return { memory, store, decisionStore, decisionLog };
}

const validContent = {
  type: "feedback" as const,
  title: "LOXON masonry",
  description: "Use LOXON family on brick clubhouses",
  body: "Tier-2 finding from Scott...",
};

describe("Memory.acceptClient (attestation)", () => {
  test("attaches identity and channel; strips client-supplied source_identity at parse", () => {
    const { memory } = build();
    expect(() =>
      memory.acceptClient(
        {
          tier: 2,
          lane: "estimating",
          content: validContent,
          source_identity: "spoof@evil.com",
        },
        "scott@ecc.com",
        "email",
      ),
    ).toThrow();
  });

  test("returns the attested form with identity attached", () => {
    const { memory } = build();
    const attested = memory.acceptClient(
      { tier: 2, lane: "estimating", content: validContent },
      "scott@ecc.com",
      "email",
    );
    expect(attested.source_identity).toBe("scott@ecc.com");
    expect(attested.source_channel).toBe("email");
    expect(attested.tier).toBe(2);
    expect(attested.lane).toBe("estimating");
  });
});

describe("Memory.propose — happy paths", () => {
  test("Tier-1 write lands at confirmed status immediately", async () => {
    const { memory, store } = build();
    const entry = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(entry.tier).toBe(1);
    expect(entry.status).toBe("confirmed");
    expect(entry.requested_tier).toBeUndefined();
    expect(await store.has(entry.id)).toBe(true);
  });

  test("Tier-2 write lands at flagged status", async () => {
    const { memory } = build();
    const entry = await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(entry.tier).toBe(2);
    expect(entry.status).toBe("flagged");
  });

  test("Tier-3 write lands at proposed status", async () => {
    const { memory } = build();
    const entry = await memory.propose({
      tier: 3,
      lane: "estimating",
      source_identity: "jim@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(entry.tier).toBe(3);
    expect(entry.status).toBe("proposed");
  });

  test("derives kebab-case slug from title when no id supplied", async () => {
    const { memory } = build();
    const entry = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: { ...validContent, title: "ECC labor — Aurora 2026 Q2!" },
    });
    expect(entry.id).toBe("ecc-labor-aurora-2026-q2");
  });

  test("collision: second entry gets a timestamp suffix", async () => {
    const { memory } = build();
    const first = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    const second = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(first.id).toBe("loxon-masonry");
    expect(second.id).not.toBe("loxon-masonry");
    expect(second.id.startsWith("loxon-masonry-")).toBe(true);
  });

  test("client-supplied id is honoured when valid", async () => {
    const { memory } = build();
    const entry = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
      id: "labor-aurora-2026q2",
    });
    expect(entry.id).toBe("labor-aurora-2026q2");
  });
});

describe("Memory.propose — auto-downgrade", () => {
  test("Matt's Tier-1 estimating write downgrades to Tier-2 with requested_tier preserved", async () => {
    const { memory } = build();
    const entry = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "matt@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(entry.tier).toBe(2);
    expect(entry.requested_tier).toBe(1);
    expect(entry.status).toBe("flagged");
  });
});

describe("Memory.propose — reject path", () => {
  test("unauthorised identity throws MemoryAuthorityError", async () => {
    const { memory, store } = build();
    let err: unknown;
    try {
      await memory.propose({
        tier: 3,
        lane: "estimating",
        source_identity: "newhire@ecc.com",
        source_channel: "email",
        content: validContent,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MemoryAuthorityError);
    if (err instanceof MemoryAuthorityError) {
      expect(err.category).toBe("permission_denied");
      expect(err.lane).toBe("estimating");
      expect(err.requestedTier).toBe(3);
      expect(err.reason).toBe("no_authority_in_lane");
    }
    // No entry persisted
    expect(await store.has("loxon-masonry")).toBe(false);
  });
});

describe("Memory.propose — decision-log emission", () => {
  test("Tier-1 write emits memory_write_proposed only (no routing needed)", async () => {
    const { memory, decisionStore } = build();
    await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const types = r.entries.map((e) => e.type);
    expect(types).toContain("memory_write_proposed");
    expect(types).not.toContain("memory_write_routed");
  });

  test("Tier-2 write emits memory_write_proposed AND memory_write_routed (with reviewer list)", async () => {
    const { memory, decisionStore } = build();
    await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const proposed = r.entries.find((e) => e.type === "memory_write_proposed");
    const routed = r.entries.find((e) => e.type === "memory_write_routed");
    expect(proposed).toBeDefined();
    expect(routed).toBeDefined();
    expect((routed?.metadata as { routed_to: string[] }).routed_to).toEqual([
      "darrow@ecc.com",
    ]);
  });

  test("auto-downgrade emits memory_write_proposed with downgrade_reason + requested/effective tiers", async () => {
    const { memory, decisionStore } = build();
    await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "matt@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const proposed = r.entries.find((e) => e.type === "memory_write_proposed");
    const md = proposed?.metadata as {
      requested_tier: number;
      effective_tier: number;
      downgrade_reason?: string;
    };
    expect(md.requested_tier).toBe(1);
    expect(md.effective_tier).toBe(2);
    expect(md.downgrade_reason).toContain("match_at_lower_tier_2");
  });

  test("reject emits memory_write_proposed (status_assigned: rejected) AND memory_write_rejected", async () => {
    const { memory, decisionStore } = build();
    try {
      await memory.propose({
        tier: 3,
        lane: "estimating",
        source_identity: "newhire@ecc.com",
        source_channel: "email",
        content: validContent,
      });
    } catch {
      // expected
    }
    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const types = r.entries.map((e) => e.type);
    expect(types).toContain("memory_write_proposed");
    expect(types).toContain("memory_write_rejected");
    const proposed = r.entries.find((e) => e.type === "memory_write_proposed");
    expect((proposed?.metadata as { status_assigned: string }).status_assigned).toBe(
      "rejected",
    );
  });
});

describe("Memory.confirm / Memory.reject", () => {
  test("Tier-1 reviewer flips flagged → confirmed", async () => {
    const { memory } = build();
    const e = await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    const confirmed = await memory.confirm(e.id, "darrow@ecc.com");
    expect(confirmed.status).toBe("confirmed");
  });

  test("Tier-1 reviewer flips proposed → confirmed", async () => {
    const { memory } = build();
    const e = await memory.propose({
      tier: 3,
      lane: "estimating",
      source_identity: "jim@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    const confirmed = await memory.confirm(e.id, "darrow@ecc.com");
    expect(confirmed.status).toBe("confirmed");
  });

  test("non-Tier-1 reviewer is rejected", async () => {
    const { memory } = build();
    const e = await memory.propose({
      tier: 3,
      lane: "estimating",
      source_identity: "jim@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    await expect(memory.confirm(e.id, "scott@ecc.com")).rejects.toBeInstanceOf(
      MemoryAuthorityError,
    );
  });

  test("confirm on confirmed entry throws MemoryReviewError", async () => {
    const { memory } = build();
    const e = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    await expect(memory.confirm(e.id, "darrow@ecc.com")).rejects.toBeInstanceOf(
      MemoryReviewError,
    );
  });

  test("reject flips flagged → deprecated and emits memory_write_rejected", async () => {
    const { memory, decisionStore } = build();
    const e = await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    const rejected = await memory.reject(e.id, "darrow@ecc.com", "out-of-date");
    expect(rejected.status).toBe("deprecated");

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const decision = r.entries.find(
      (entry) => entry.type === "memory_write_rejected",
    );
    expect(decision).toBeDefined();
    expect((decision?.metadata as { reason: string }).reason).toBe("out-of-date");
  });

  test("confirm on missing id throws MemoryNotFoundError", async () => {
    const { memory } = build();
    await expect(memory.confirm("ghost", "darrow@ecc.com")).rejects.toBeInstanceOf(
      MemoryNotFoundError,
    );
  });
});

describe("Memory.list / Memory.read — visibility", () => {
  test("list defaults to confirmed | permanent only", async () => {
    const { memory } = build();
    await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: { ...validContent, title: "different one" },
    });
    const visible = await memory.list({});
    expect(visible.map((e) => e.status)).toEqual(["confirmed"]);
  });

  test("list rejects flagged in statuses (parse-time guard)", async () => {
    const { memory } = build();
    // @ts-expect-error testing runtime guard
    await expect(memory.list({ statuses: ["flagged"] })).rejects.toThrow();
  });

  test("read returns confirmed entry", async () => {
    const { memory } = build();
    const e = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    const got = await memory.read(e.id);
    expect(got.id).toBe(e.id);
  });

  test("read on flagged entry throws MemoryNotFoundError (visibility-uniform)", async () => {
    const { memory } = build();
    const e = await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    await expect(memory.read(e.id)).rejects.toBeInstanceOf(MemoryNotFoundError);
  });

  test("read on deprecated entry throws MemoryNotFoundError", async () => {
    const { memory } = build();
    const e = await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    await memory.reject(e.id, "darrow@ecc.com", "x");
    await expect(memory.read(e.id)).rejects.toBeInstanceOf(MemoryNotFoundError);
  });
});

describe("Memory — decision-log emission for reads", () => {
  test("list emits a single memory_read with count + filter shape", async () => {
    const { memory, decisionStore } = build();
    await memory.list({ types: ["feedback"] });
    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const reads = r.entries.filter((e) => e.type === "memory_read");
    expect(reads.length).toBe(1);
    expect((reads[0]?.metadata as { count: number }).count).toBe(0);
    expect((reads[0]?.metadata as { types: string[] }).types).toEqual(["feedback"]);
  });

  test("read emits memory_read with entry_id + tier + lane", async () => {
    const { memory, decisionStore } = build();
    const e = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    await memory.read(e.id);
    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const reads = r.entries.filter((entry) => entry.type === "memory_read");
    expect(reads.length).toBe(1);
    const md = reads[0]?.metadata as {
      entry_id: string;
      tier: number;
      lane: string;
    };
    expect(md.entry_id).toBe(e.id);
    expect(md.tier).toBe(1);
    expect(md.lane).toBe("estimating");
  });
});

describe("Memory — works without decisionLog (optional handle)", () => {
  test("propose succeeds without decisionLog", async () => {
    const store = new InMemoryMemoryStore();
    const memory = new Memory({
      pipelineId: "pipe-1",
      agentId: "agent-1",
      authority: ECC_AUTHORITY,
      store,
      specVersion: SPEC,
    });
    const entry = await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(entry.tier).toBe(1);
  });
});

describe("Memory — memory_write_review_required hook (regression)", () => {
  function buildWithHooks() {
    const store = new InMemoryMemoryStore();
    const decisionStore = new InMemoryDecisionStore();
    const decisionLog = new DecisionLog({
      pipeline_id: "pipe-1",
      agent_id: "agent-1",
      session_id: "ses-1",
      spec_version: SPEC,
      store: decisionStore,
    });
    const registry = new HookRegistry();
    const hooks = new HookRunner({
      pipelineId: "pipe-1",
      agentId: "agent-1",
      sessionId: "ses-1",
      registry,
      decisionLog,
    });
    const memory = new Memory({
      pipelineId: "pipe-1",
      agentId: "agent-1",
      authority: ECC_AUTHORITY,
      store,
      specVersion: SPEC,
      now: () => 1_700_000_000_000,
      decisionLog,
      hooks,
    });
    return { memory, registry, decisionStore };
  }

  test("Tier-2 propose fires memory_write_review_required with pending_entry + routed_to + channel", async () => {
    const { memory, registry } = buildWithHooks();
    const calls: Array<{
      pending_entry: MemoryEntry;
      routed_to: ReadonlyArray<string>;
      channel: string;
    }> = [];
    registry.register({
      name: "memory_write_review_required",
      handler: (payload) => {
        calls.push(
          payload as {
            pending_entry: MemoryEntry;
            routed_to: ReadonlyArray<string>;
            channel: string;
          },
        );
      },
    });

    const entry = await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.pending_entry.id).toBe(entry.id);
    expect(calls[0]?.routed_to).toEqual(["darrow@ecc.com"]);
    expect(calls[0]?.channel).toBe("email");
  });

  test("Tier-3 propose also fires memory_write_review_required", async () => {
    const { memory, registry } = buildWithHooks();
    let fired = false;
    registry.register({
      name: "memory_write_review_required",
      handler: () => {
        fired = true;
      },
    });
    await memory.propose({
      tier: 3,
      lane: "estimating",
      source_identity: "jim@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(fired).toBe(true);
  });

  test("Tier-1 propose does NOT fire the review hook", async () => {
    const { memory, registry } = buildWithHooks();
    let fired = false;
    registry.register({
      name: "memory_write_review_required",
      handler: () => {
        fired = true;
      },
    });
    await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "darrow@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(fired).toBe(false);
  });

  test("auto-downgrade to Tier-2 still fires the review hook", async () => {
    const { memory, registry } = buildWithHooks();
    let fired = false;
    registry.register({
      name: "memory_write_review_required",
      handler: () => {
        fired = true;
      },
    });
    // Matt is only Tier-2 in estimating; Tier-1 declared → auto-downgrade.
    await memory.propose({
      tier: 1,
      lane: "estimating",
      source_identity: "matt@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(fired).toBe(true);
  });

  test("confirm fires memory_write_confirmed", async () => {
    const { memory, registry } = buildWithHooks();
    const calls: Array<{ entry_id: string; reviewer_identity: string }> = [];
    registry.register({
      name: "memory_write_confirmed",
      handler: (p) =>
        void calls.push(p as { entry_id: string; reviewer_identity: string }),
    });
    const e = await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    await memory.confirm(e.id, "darrow@ecc.com");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.entry_id).toBe(e.id);
    expect(calls[0]?.reviewer_identity).toBe("darrow@ecc.com");
  });

  test("reject fires memory_write_rejected with reason", async () => {
    const { memory, registry } = buildWithHooks();
    const calls: Array<{ reason: string }> = [];
    registry.register({
      name: "memory_write_rejected",
      handler: (p) => void calls.push(p as { reason: string }),
    });
    const e = await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    await memory.reject(e.id, "darrow@ecc.com", "out-of-date");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.reason).toBe("out-of-date");
  });
});

describe("Memory — memory_write_review_required VETO (regression)", () => {
  function buildWithHooks() {
    const store = new InMemoryMemoryStore();
    const decisionStore = new InMemoryDecisionStore();
    const decisionLog = new DecisionLog({
      pipeline_id: "pipe-1",
      agent_id: "agent-1",
      session_id: "ses-1",
      spec_version: SPEC,
      store: decisionStore,
    });
    const registry = new HookRegistry();
    const hooks = new HookRunner({
      pipelineId: "pipe-1",
      agentId: "agent-1",
      sessionId: "ses-1",
      registry,
      decisionLog,
    });
    const memory = new Memory({
      pipelineId: "pipe-1",
      agentId: "agent-1",
      authority: ECC_AUTHORITY,
      store,
      specVersion: SPEC,
      now: () => 1_700_000_000_000,
      decisionLog,
      hooks,
    });
    return { memory, registry, decisionStore };
  }

  test("VETO from memory_write_review_required suppresses default memory_write_routed", async () => {
    const { memory, registry, decisionStore } = buildWithHooks();
    registry.register({
      name: "memory_write_review_required",
      handler: () => VETO({ reason: "external router took over" }),
      label: "external-router",
    });

    await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const routed = r.entries.find((e) => e.type === "memory_write_routed");
    expect(routed).toBeDefined();
    const md = routed?.metadata as {
      route_strategy: string;
      routed_to?: string[];
      vetoed_by_hook_handler?: string;
      veto_reason?: string;
    };
    // Default routing was overridden — no routed_to/channel emitted.
    expect(md.route_strategy).toBe("hook_replaced");
    expect(md.routed_to).toBeUndefined();
    expect(md.veto_reason).toBe("external router took over");
    expect(md.vetoed_by_hook_handler).toBeDefined();
  });

  test("VETO does not affect persistence — entry is still flagged", async () => {
    const { memory, registry } = buildWithHooks();
    registry.register({
      name: "memory_write_review_required",
      handler: () => VETO({ reason: "x" }),
    });
    const entry = await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(entry.status).toBe("flagged");
  });

  test("no VETO: default routing emits routed_to + channel", async () => {
    const { memory, registry, decisionStore } = buildWithHooks();
    registry.register({
      name: "memory_write_review_required",
      handler: () => {
        // Observation-only — no veto.
      },
    });

    await memory.propose({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const routed = r.entries.find((e) => e.type === "memory_write_routed");
    const md = routed?.metadata as {
      route_strategy: string;
      routed_to?: string[];
      channel?: string;
    };
    expect(md.route_strategy).toBe("default");
    expect(md.routed_to).toEqual(["darrow@ecc.com"]);
    expect(md.channel).toBe("email");
  });

  test("VETO on Tier-3 (proposed) also suppresses default routing", async () => {
    const { memory, registry, decisionStore } = buildWithHooks();
    registry.register({
      name: "memory_write_review_required",
      handler: () => VETO({ reason: "router took over" }),
    });
    await memory.propose({
      tier: 3,
      lane: "estimating",
      source_identity: "jim@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const routed = r.entries.find((e) => e.type === "memory_write_routed");
    expect(
      (routed?.metadata as { route_strategy: string }).route_strategy,
    ).toBe("hook_replaced");
  });
});
