import { describe, expect, test } from "bun:test";
import { defaultCapabilityKindsFor } from "../default-capabilities";
import {
  HookCapabilitySchema,
  HookManifestEntrySchema,
  HookNameSchema,
} from "../schemas";

describe("HookNameSchema", () => {
  test("accepts canonical names", () => {
    expect(HookNameSchema.safeParse("session_start").success).toBe(true);
    expect(HookNameSchema.safeParse("checkpoint_resumed").success).toBe(true);
  });

  test("accepts custom:<ns>:<event>", () => {
    expect(HookNameSchema.safeParse("custom:ecc:rfq-shipped").success).toBe(true);
  });

  test("rejects unknown canonical-shaped names", () => {
    expect(HookNameSchema.safeParse("session_warble").success).toBe(false);
  });

  test("rejects malformed custom names", () => {
    expect(HookNameSchema.safeParse("custom:ecc").success).toBe(false);
  });
});

describe("HookCapabilitySchema", () => {
  test("decision_log_emit takes no params", () => {
    expect(
      HookCapabilitySchema.safeParse({ kind: "decision_log_emit" }).success,
    ).toBe(true);
    // No extra props
    expect(
      HookCapabilitySchema.safeParse({
        kind: "decision_log_emit",
        extra: 1,
      }).success,
    ).toBe(false);
  });

  test("egress_http requires non-empty allowed_hosts", () => {
    expect(
      HookCapabilitySchema.safeParse({
        kind: "egress_http",
        allowed_hosts: ["api.example.com"],
      }).success,
    ).toBe(true);
    expect(
      HookCapabilitySchema.safeParse({
        kind: "egress_http",
        allowed_hosts: [],
      }).success,
    ).toBe(false);
  });

  test("send_email requires from + to_pattern", () => {
    expect(
      HookCapabilitySchema.safeParse({
        kind: "send_email",
        from: "x@y",
        to_pattern: "*@y",
      }).success,
    ).toBe(true);
    expect(
      HookCapabilitySchema.safeParse({
        kind: "send_email",
        from: "x@y",
      }).success,
    ).toBe(false);
  });

  test("send_teams_card requires channel", () => {
    expect(
      HookCapabilitySchema.safeParse({
        kind: "send_teams_card",
        channel: "alerts",
      }).success,
    ).toBe(true);
    expect(HookCapabilitySchema.safeParse({ kind: "send_teams_card" }).success).toBe(false);
  });

  test("publish_metric namespace must match kebab-or-dot pattern", () => {
    expect(
      HookCapabilitySchema.safeParse({
        kind: "publish_metric",
        namespace: "ecc.estimating",
      }).success,
    ).toBe(true);
    expect(
      HookCapabilitySchema.safeParse({
        kind: "publish_metric",
        namespace: "ECC",
      }).success,
    ).toBe(false);
  });

  test("external_approval_gate requires request_id_prefix", () => {
    expect(
      HookCapabilitySchema.safeParse({
        kind: "external_approval_gate",
        request_id_prefix: "ecc-approval-",
      }).success,
    ).toBe(true);
  });

  test("read_decision_log scope must be session|pipeline", () => {
    expect(
      HookCapabilitySchema.safeParse({
        kind: "read_decision_log",
        scope: "session",
      }).success,
    ).toBe(true);
    expect(
      HookCapabilitySchema.safeParse({
        kind: "read_decision_log",
        scope: "global",
      }).success,
    ).toBe(false);
  });

  test("rejects unknown kind", () => {
    expect(
      HookCapabilitySchema.safeParse({ kind: "free_pizza" }).success,
    ).toBe(false);
  });
});

describe("HookManifestEntrySchema", () => {
  test("valid entry passes", () => {
    expect(
      HookManifestEntrySchema.safeParse({
        name: "memory_write_review_required",
        handler: "hooks/route.ts",
        fire_mode: "sync",
        capabilities: [{ kind: "decision_log_emit" }],
      }).success,
    ).toBe(true);
  });

  test("fire_mode optional, defaults applied at runner level", () => {
    expect(
      HookManifestEntrySchema.safeParse({
        name: "session_start",
        handler: "hooks/log.ts",
      }).success,
    ).toBe(true);
  });

  test("rejects extra fields", () => {
    expect(
      HookManifestEntrySchema.safeParse({
        name: "session_start",
        handler: "hooks/log.ts",
        priority: 1,
      }).success,
    ).toBe(false);
  });
});

describe("defaultCapabilityKindsFor", () => {
  test("error_classified gets decision_log_emit + publish_metric", () => {
    expect(defaultCapabilityKindsFor("error_classified")).toEqual([
      "decision_log_emit",
      "publish_metric",
    ]);
  });

  test("tool_approval_required gets the human-review trio", () => {
    expect(defaultCapabilityKindsFor("tool_approval_required")).toEqual([
      "send_email",
      "send_teams_card",
      "external_approval_gate",
    ]);
  });

  test("eval_iteration_complete gets telemetry caps", () => {
    expect(defaultCapabilityKindsFor("eval_iteration_complete")).toEqual([
      "egress_http",
      "publish_metric",
    ]);
  });

  test("unspecified hook falls back to decision_log_emit only", () => {
    expect(defaultCapabilityKindsFor("session_start")).toEqual(["decision_log_emit"]);
    expect(defaultCapabilityKindsFor("checkpoint_created")).toEqual([
      "decision_log_emit",
    ]);
  });
});
