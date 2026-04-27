import { describe, expect, test } from "bun:test";
import {
  consecutiveDegradations,
  decideContinue,
  estimateCost,
  withinBudget,
} from "../convergence";
import type {
  ConvergenceLoopConfig,
  EvalIterationScore,
  EvalLoopState,
} from "../types";

const baseConfig: ConvergenceLoopConfig = {
  max_iterations: 5,
  max_consecutive_degradations: 2,
  reload_pause_ms: 0,
  pass_rate_threshold: 1.0,
  budget: { max_llm_calls: 10_000, max_cost_usd: 1000 },
};

function mkState(over: Partial<EvalLoopState>): EvalLoopState {
  return {
    iteration: 1,
    max_iterations: 5,
    scores: [],
    mutations: [],
    status: "running",
    ...over,
  };
}

describe("decideContinue — order of stop reasons", () => {
  test("aborted wins over everything", () => {
    const r = decideContinue({
      state: mkState({}),
      config: baseConfig,
      aborted: true,
    });
    expect(r).toEqual({ action: "stop", reason: "aborted" });
  });

  test("all_passed when latest pass_rate ≥ threshold", () => {
    const r = decideContinue({
      state: mkState({
        scores: [{ iteration: 1, pass_rate: 1, avg_score: 9 }],
      }),
      config: baseConfig,
    });
    expect(r).toEqual({ action: "stop", reason: "all_passed" });
  });

  test("budget_exhausted wins over mutation_failed when both apply", () => {
    const r = decideContinue({
      state: mkState({
        cost: {
          agent_calls: 9999,
          judge_calls: 1,
          reflector_calls: 0,
          total_llm_calls: 10_000,
          estimated_cost_usd: 0,
        },
      }),
      config: baseConfig,
      mutationApplicationFailed: true,
    });
    expect(r).toEqual({ action: "stop", reason: "budget_exhausted" });
  });

  test("mutation_failed when caller signals", () => {
    const r = decideContinue({
      state: mkState({}),
      config: baseConfig,
      mutationApplicationFailed: true,
    });
    expect(r).toEqual({ action: "stop", reason: "mutation_failed" });
  });

  test("no_actionable_changes when reflector returned zero", () => {
    const r = decideContinue({
      state: mkState({}),
      config: baseConfig,
      reflectorReturnedZero: true,
    });
    expect(r).toEqual({ action: "stop", reason: "no_actionable_changes" });
  });

  test("degraded after consecutive drops ≥ max_consecutive_degradations", () => {
    const scores: EvalIterationScore[] = [
      { iteration: 1, pass_rate: 0.8, avg_score: 8 },
      { iteration: 2, pass_rate: 0.6, avg_score: 6 },
      { iteration: 3, pass_rate: 0.5, avg_score: 5 },
    ];
    const r = decideContinue({
      state: mkState({ iteration: 3, scores }),
      config: { ...baseConfig, max_consecutive_degradations: 2 },
    });
    expect(r).toEqual({ action: "stop", reason: "degraded" });
  });

  test("max_iterations when iteration ≥ cap and no other condition fires", () => {
    const r = decideContinue({
      state: mkState({
        iteration: 5,
        scores: [{ iteration: 5, pass_rate: 0.4, avg_score: 4 }],
      }),
      config: baseConfig,
    });
    expect(r).toEqual({ action: "stop", reason: "max_iterations" });
  });

  test("continue when no condition fires", () => {
    const r = decideContinue({
      state: mkState({
        iteration: 2,
        scores: [
          { iteration: 1, pass_rate: 0.4, avg_score: 4 },
          { iteration: 2, pass_rate: 0.6, avg_score: 6 },
        ],
      }),
      config: baseConfig,
    });
    expect(r).toEqual({ action: "continue" });
  });
});

describe("consecutiveDegradations", () => {
  test("zero scores → 0", () => {
    expect(consecutiveDegradations([])).toBe(0);
  });
  test("one score → 0", () => {
    expect(consecutiveDegradations([{ iteration: 1, pass_rate: 0.5, avg_score: 5 }])).toBe(0);
  });
  test("two equal scores → 0 (no degradation)", () => {
    expect(
      consecutiveDegradations([
        { iteration: 1, pass_rate: 0.5, avg_score: 5 },
        { iteration: 2, pass_rate: 0.5, avg_score: 5 },
      ]),
    ).toBe(0);
  });
  test("two consecutive drops → 2", () => {
    expect(
      consecutiveDegradations([
        { iteration: 1, pass_rate: 0.8, avg_score: 8 },
        { iteration: 2, pass_rate: 0.7, avg_score: 7 },
        { iteration: 3, pass_rate: 0.5, avg_score: 5 },
      ]),
    ).toBe(2);
  });
  test("recovery resets the count (only LATEST run of drops counted)", () => {
    expect(
      consecutiveDegradations([
        { iteration: 1, pass_rate: 0.6, avg_score: 6 }, // dropped from earlier? no prior, ignored
        { iteration: 2, pass_rate: 0.5, avg_score: 5 }, // drop
        { iteration: 3, pass_rate: 0.7, avg_score: 7 }, // recovery — resets the count
        { iteration: 4, pass_rate: 0.6, avg_score: 6 }, // drop again
      ]),
    ).toBe(1);
  });
});

describe("estimateCost + withinBudget", () => {
  test("baseline 10 tasks × 5 iterations × 3 specialists @ $0.05/call", () => {
    const c = estimateCost({
      tasks: 10,
      iterations: 5,
      specialists_per_run: 3,
      cost_per_call_usd: 0.05,
    });
    expect(c.agent_calls).toBe(150); // 10×5×3
    expect(c.judge_calls).toBe(50); // 10×5
    expect(c.reflector_calls).toBe(4); // iterations - 1
    expect(c.total_llm_calls).toBe(204);
    expect(c.estimated_cost_usd).toBeCloseTo(204 * 0.05, 5);
  });

  test("zero specialists clamps to 1 (defensive)", () => {
    const c = estimateCost({
      tasks: 1,
      iterations: 1,
      specialists_per_run: 0,
      cost_per_call_usd: 1,
    });
    expect(c.agent_calls).toBe(1);
  });

  test("withinBudget true when call count + cost both fit", () => {
    expect(
      withinBudget(
        {
          agent_calls: 0,
          judge_calls: 0,
          reflector_calls: 0,
          total_llm_calls: 100,
          estimated_cost_usd: 50,
        },
        { max_llm_calls: 1000, max_cost_usd: 100 },
      ),
    ).toBe(true);
  });

  test("withinBudget false when call count over", () => {
    expect(
      withinBudget(
        {
          agent_calls: 0,
          judge_calls: 0,
          reflector_calls: 0,
          total_llm_calls: 1000,
          estimated_cost_usd: 0,
        },
        { max_llm_calls: 1000, max_cost_usd: 100 },
      ),
    ).toBe(false);
  });

  test("withinBudget false when cost over", () => {
    expect(
      withinBudget(
        {
          agent_calls: 0,
          judge_calls: 0,
          reflector_calls: 0,
          total_llm_calls: 1,
          estimated_cost_usd: 100,
        },
        { max_llm_calls: 1000, max_cost_usd: 100 },
      ),
    ).toBe(false);
  });
});
