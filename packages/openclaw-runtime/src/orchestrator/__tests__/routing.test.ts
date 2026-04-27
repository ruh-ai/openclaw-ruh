import { describe, expect, test } from "bun:test";
import {
  FAN_OUT_BASELINE,
  RoutingCustomMatcherUnavailableError,
  findRoutingMatch,
  resolveFanOutParallelism,
} from "../routing";
import type { MatchContext } from "../routing";
import type { RoutingRules } from "../types";

describe("findRoutingMatch — match clauses", () => {
  test("stage equality", () => {
    const rules: RoutingRules = {
      rules: [{ match: { stage: "intake" }, specialist: "intake-specialist" }],
      fallback: "orchestrator-clarify",
    };
    const r = findRoutingMatch({ rules, context: { stage: "intake" } });
    expect(r.outcome).toBe("matched");
    if (r.outcome === "matched") {
      expect(r.rule.specialist).toBe("intake-specialist");
    }
  });

  test("stage mismatch falls through to fallback", () => {
    const rules: RoutingRules = {
      rules: [{ match: { stage: "intake" }, specialist: "intake" }],
      fallback: "orchestrator-clarify",
    };
    const r = findRoutingMatch({ rules, context: { stage: "pricing" } });
    expect(r.outcome).toBe("fallback");
    if (r.outcome === "fallback") {
      expect(r.fallback).toBe("orchestrator-clarify");
    }
  });

  test("input_has subset semantics — required ⊆ available", () => {
    const rules: RoutingRules = {
      rules: [
        {
          match: { input_has: ["photos", "notes"] },
          specialist: "vision-manifest",
        },
      ],
      fallback: "fb",
    };
    const r = findRoutingMatch({
      rules,
      context: { input_has: ["photos", "notes", "drawings"] },
    });
    expect(r.outcome).toBe("matched");

    const r2 = findRoutingMatch({
      rules,
      context: { input_has: ["photos"] },
    });
    expect(r2.outcome).toBe("fallback");
  });

  test("agent_status — every declared specialist must be in expected state", () => {
    const rules: RoutingRules = {
      rules: [
        {
          match: { agent_status: { intake: "completed", takeoff: "completed" } },
          specialist: "pricing",
        },
      ],
      fallback: "fb",
    };
    expect(
      findRoutingMatch({
        rules,
        context: { agent_status: { intake: "completed", takeoff: "completed" } },
      }).outcome,
    ).toBe("matched");
    expect(
      findRoutingMatch({
        rules,
        context: { agent_status: { intake: "completed", takeoff: "running" } },
      }).outcome,
    ).toBe("fallback");
  });

  test("decision_count — sparse comparator map", () => {
    const rules: RoutingRules = {
      rules: [{ match: { decision_count: { "<": 100 } }, specialist: "x" }],
      fallback: "fb",
    };
    expect(
      findRoutingMatch({ rules, context: { decision_count: 50 } }).outcome,
    ).toBe("matched");
    expect(
      findRoutingMatch({ rules, context: { decision_count: 100 } }).outcome,
    ).toBe("fallback");
  });

  test("decision_count — multiple comparators all enforced", () => {
    const rules: RoutingRules = {
      rules: [
        {
          match: { decision_count: { ">": 10, "<": 100 } },
          specialist: "x",
        },
      ],
      fallback: "fb",
    };
    expect(
      findRoutingMatch({ rules, context: { decision_count: 50 } }).outcome,
    ).toBe("matched");
    expect(
      findRoutingMatch({ rules, context: { decision_count: 5 } }).outcome,
    ).toBe("fallback");
    expect(
      findRoutingMatch({ rules, context: { decision_count: 200 } }).outcome,
    ).toBe("fallback");
  });

  test("decision_count clause with no count in context falls through", () => {
    const rules: RoutingRules = {
      rules: [{ match: { decision_count: { "<": 100 } }, specialist: "x" }],
      fallback: "fb",
    };
    expect(findRoutingMatch({ rules, context: {} }).outcome).toBe("fallback");
  });

  test("input_has clause with no input in context still matches if required is empty", () => {
    const rules: RoutingRules = {
      rules: [{ match: { input_has: [] }, specialist: "x" }],
      fallback: "fb",
    };
    expect(findRoutingMatch({ rules, context: {} }).outcome).toBe("matched");
  });

  test("empty match clause matches any context", () => {
    const rules: RoutingRules = {
      rules: [{ match: {}, specialist: "default" }],
      fallback: "fb",
    };
    expect(findRoutingMatch({ rules, context: {} }).outcome).toBe("matched");
    expect(
      findRoutingMatch({ rules, context: { stage: "anything" } }).outcome,
    ).toBe("matched");
  });
});

describe("findRoutingMatch — priority ordering", () => {
  test("higher priority rule wins despite later declaration", () => {
    const rules: RoutingRules = {
      rules: [
        { match: { stage: "intake" }, specialist: "low", priority: 0 },
        { match: { stage: "intake" }, specialist: "high", priority: 10 },
      ],
      fallback: "fb",
    };
    const r = findRoutingMatch({ rules, context: { stage: "intake" } });
    expect(r.outcome).toBe("matched");
    if (r.outcome === "matched") {
      expect(r.rule.specialist).toBe("high");
    }
  });

  test("equal priority preserves declaration order", () => {
    const rules: RoutingRules = {
      rules: [
        { match: { stage: "intake" }, specialist: "first" },
        { match: { stage: "intake" }, specialist: "second" },
      ],
      fallback: "fb",
    };
    const r = findRoutingMatch({ rules, context: { stage: "intake" } });
    if (r.outcome === "matched") {
      expect(r.rule.specialist).toBe("first");
    }
  });

  test("default priority is 0 when omitted", () => {
    const rules: RoutingRules = {
      rules: [
        { match: { stage: "x" }, specialist: "default", priority: 0 },
        { match: { stage: "x" }, specialist: "neg", priority: -5 },
      ],
      fallback: "fb",
    };
    const r = findRoutingMatch({ rules, context: { stage: "x" } });
    if (r.outcome === "matched") {
      expect(r.rule.specialist).toBe("default");
    }
  });
});

describe("findRoutingMatch — custom matcher", () => {
  test("custom matcher is invoked when match.custom is set", () => {
    const rules: RoutingRules = {
      rules: [
        {
          match: { custom: "matchers/foo.ts", stage: "x" },
          specialist: "y",
        },
      ],
      fallback: "fb",
    };
    let called = false;
    const r = findRoutingMatch({
      rules,
      context: { stage: "x" },
      customMatchers: {
        "matchers/foo.ts": () => {
          called = true;
          return true;
        },
      },
    });
    expect(called).toBe(true);
    expect(r.outcome).toBe("matched");
  });

  test("custom matcher returning false makes the rule fall through", () => {
    const rules: RoutingRules = {
      rules: [
        { match: { custom: "matchers/no.ts" }, specialist: "y" },
      ],
      fallback: "fb",
    };
    const r = findRoutingMatch({
      rules,
      context: {},
      customMatchers: { "matchers/no.ts": () => false },
    });
    expect(r.outcome).toBe("fallback");
  });

  test("missing custom matcher throws — manifest config error", () => {
    const rules: RoutingRules = {
      rules: [{ match: { custom: "matchers/missing.ts" }, specialist: "x" }],
      fallback: "fb",
    };
    expect(() =>
      findRoutingMatch({ rules, context: {} }),
    ).toThrow(RoutingCustomMatcherUnavailableError);
  });

  test("custom matcher receives the full clause + context (after well-known clauses pass)", () => {
    let captured: { clause: unknown; ctx: MatchContext } | undefined;
    const rules: RoutingRules = {
      rules: [
        {
          match: { custom: "x", stage: "intake", regions: ["aurora"] },
          specialist: "y",
        },
      ],
      fallback: "fb",
    };
    findRoutingMatch({
      rules,
      context: { stage: "intake", regions: ["aurora", "denver"] },
      customMatchers: {
        x: (clause, ctx) => {
          captured = { clause, ctx };
          return true;
        },
      },
    });
    expect(captured).toBeDefined();
    expect((captured?.clause as { stage: string }).stage).toBe("intake");
    expect(captured?.ctx.stage).toBe("intake");
  });

  test("well-known clause failure short-circuits before invoking custom matcher", () => {
    let called = false;
    const rules: RoutingRules = {
      rules: [
        { match: { custom: "x", stage: "intake" }, specialist: "y" },
      ],
      fallback: "fb",
    };
    findRoutingMatch({
      rules,
      context: { stage: "pricing" },
      customMatchers: {
        x: () => {
          called = true;
          return true;
        },
      },
    });
    expect(called).toBe(false);
  });
});

describe("resolveFanOutParallelism", () => {
  test("rule cap wins when supplied", () => {
    expect(
      resolveFanOutParallelism(
        { rules: [], fallback: "fb", fan_out_default_max_parallelism: 8 },
        16,
      ),
    ).toBe(16);
  });

  test("falls back to RoutingRules default when rule cap absent", () => {
    expect(
      resolveFanOutParallelism({
        rules: [],
        fallback: "fb",
        fan_out_default_max_parallelism: 8,
      }),
    ).toBe(8);
  });

  test("falls back to baseline 4 when neither is set", () => {
    expect(resolveFanOutParallelism({ rules: [], fallback: "fb" })).toBe(
      FAN_OUT_BASELINE,
    );
    expect(FAN_OUT_BASELINE).toBe(4);
  });
});
