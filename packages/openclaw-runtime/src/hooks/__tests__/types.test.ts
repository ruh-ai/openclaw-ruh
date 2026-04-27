import { describe, expect, test } from "bun:test";
import {
  CANONICAL_HOOK_NAMES,
  HOOK_CAPABILITY_KINDS,
  VETO,
  VETOABLE_HOOK_NAMES,
  isCanonicalHookName,
  isCustomHookName,
  isVetoResult,
  isVetoableHook,
} from "../types";

describe("CANONICAL_HOOK_NAMES + isCanonicalHookName", () => {
  test("includes all spec hook points", () => {
    // Sanity: at least a handful of representatives.
    expect(CANONICAL_HOOK_NAMES).toContain("session_start");
    expect(CANONICAL_HOOK_NAMES).toContain("post_tool_execution");
    expect(CANONICAL_HOOK_NAMES).toContain("memory_write_review_required");
    expect(CANONICAL_HOOK_NAMES).toContain("checkpoint_drift_detected");
  });

  test("isCanonicalHookName matches every name in the array", () => {
    for (const n of CANONICAL_HOOK_NAMES) expect(isCanonicalHookName(n)).toBe(true);
  });

  test("isCanonicalHookName rejects unknown names", () => {
    expect(isCanonicalHookName("session_warble")).toBe(false);
    expect(isCanonicalHookName("custom:foo:bar")).toBe(false);
  });

  test("the canonical list contains no duplicates", () => {
    expect(new Set(CANONICAL_HOOK_NAMES).size).toBe(CANONICAL_HOOK_NAMES.length);
  });
});

describe("isCustomHookName", () => {
  test("accepts custom:<ns>:<event>", () => {
    expect(isCustomHookName("custom:ecc:rfq-shipped")).toBe(true);
  });

  test("rejects further-namespaced custom hooks (spec requires exactly 3 segments)", () => {
    expect(isCustomHookName("custom:ecc:rfq:shipped")).toBe(false);
  });

  test("rejects uppercase namespace or event (regression — spec requires lowercase kebab)", () => {
    expect(isCustomHookName("custom:ECC:rfq-shipped")).toBe(false);
    expect(isCustomHookName("custom:ecc:RFQ_Shipped")).toBe(false);
  });

  test("rejects underscores in segments (kebab-case only)", () => {
    expect(isCustomHookName("custom:ecc:rfq_shipped")).toBe(false);
  });

  test("rejects custom: with no namespace", () => {
    expect(isCustomHookName("custom::rfq")).toBe(false);
  });

  test("rejects bare `custom:` prefix without segments", () => {
    expect(isCustomHookName("custom:")).toBe(false);
  });

  test("rejects custom:<ns> without an event", () => {
    expect(isCustomHookName("custom:ecc")).toBe(false);
  });

  test("rejects names that don't start with custom:", () => {
    expect(isCustomHookName("ecc:custom:rfq")).toBe(false);
  });
});

describe("VETOABLE_HOOK_NAMES + isVetoableHook", () => {
  test("contains the three veto-able hooks per spec", () => {
    expect(VETOABLE_HOOK_NAMES).toEqual([
      "pre_tool_execution",
      "tool_approval_required",
      "memory_write_review_required",
    ]);
  });

  test("isVetoableHook returns true for each", () => {
    for (const n of VETOABLE_HOOK_NAMES) expect(isVetoableHook(n)).toBe(true);
  });

  test("isVetoableHook returns false for non-veto hooks", () => {
    expect(isVetoableHook("post_tool_execution")).toBe(false);
    expect(isVetoableHook("config_commit")).toBe(false);
    expect(isVetoableHook("custom:ecc:rfq")).toBe(false);
  });
});

describe("VETO sentinel", () => {
  test("VETO() returns a recognised veto result", () => {
    const v = VETO({ reason: "banned" });
    expect(isVetoResult(v)).toBe(true);
    expect(v.reason).toBe("banned");
  });

  test("isVetoResult rejects ordinary objects", () => {
    expect(isVetoResult(undefined)).toBe(false);
    expect(isVetoResult(null)).toBe(false);
    expect(isVetoResult({ reason: "spoof" })).toBe(false);
    expect(isVetoResult({ veto: true })).toBe(false);
  });
});

describe("HOOK_CAPABILITY_KINDS", () => {
  test("contains the seven capability kinds from the spec", () => {
    expect(HOOK_CAPABILITY_KINDS).toEqual([
      "decision_log_emit",
      "egress_http",
      "send_email",
      "send_teams_card",
      "publish_metric",
      "external_approval_gate",
      "read_decision_log",
    ]);
  });
});
