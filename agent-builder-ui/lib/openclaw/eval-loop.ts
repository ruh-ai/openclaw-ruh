/**
 * eval-loop.ts — Reinforcement loop for iterative agent skill improvement.
 *
 * Orchestrates the GEPA-inspired cycle:
 *   Run eval → Score traces → Reflect on failures → Mutate skills → Re-run
 *
 * The loop continues until:
 *   - All scenarios pass
 *   - Max iterations reached (default: 5)
 *   - Score degraded 2 consecutive rounds (reverts last mutation)
 *   - Budget exhausted (max LLM calls)
 *   - User aborts
 *
 * Typical cost: ~$1-5 per full loop (5 iterations, 8 scenarios).
 */

import type { EvalTask, EvalCostEstimate, EvalLoopState, SkillGraphNode, SkillMutation } from "./types";
import { runEvalSuite, type EvalRunnerConfig, type EvalRunnerStore } from "./eval-runner";
import { reflectOnFailures } from "./eval-reflector";
import { applySkillMutations, revertMutations } from "./eval-mutator";

// ── Configuration ───────────────────────────────────────────────────────────

export interface EvalLoopConfig {
  maxIterations: number;
  maxConsecutiveDegradations: number;
  /** Pause between iterations for container to reload skills (ms). */
  reloadPauseMs: number;
}

const DEFAULT_LOOP_CONFIG: EvalLoopConfig = {
  maxIterations: 5,
  maxConsecutiveDegradations: 2,
  reloadPauseMs: 2000,
};

// ── Loop store interface ────────────────────────────────────────────────────

export interface EvalLoopStore extends EvalRunnerStore {
  setEvalLoopState: (partial: Partial<EvalLoopState>) => void;
  /** Read the current eval loop state. */
  getEvalLoopState: () => EvalLoopState;
}

// ── Progress callback ───────────────────────────────────────────────────────

export interface EvalLoopProgress {
  iteration: number;
  maxIterations: number;
  phase: "running" | "scoring" | "reflecting" | "mutating" | "reloading";
  passRate: number;
  avgScore: number;
  message: string;
}

// ── Main loop ───────────────────────────────────────────────────────────────

export interface EvalLoopRunConfig {
  tasks: EvalTask[];
  evalRunnerConfig: EvalRunnerConfig;
  loopConfig?: Partial<EvalLoopConfig>;
  loopStore: EvalLoopStore;
  skillGraph: SkillGraphNode[];
  sessionId: string;
  sandboxId: string;
  signal?: AbortSignal;
  onLoopProgress?: (progress: EvalLoopProgress) => void;
}

/**
 * Run the reinforcement loop: eval → reflect → mutate → re-run.
 *
 * Returns the final EvalLoopState with all scores and mutations tracked.
 */
export async function runEvalLoop(config: EvalLoopRunConfig): Promise<EvalLoopState> {
  const loopConfig = { ...DEFAULT_LOOP_CONFIG, ...config.loopConfig };
  const { loopStore, skillGraph, sessionId, sandboxId, signal } = config;

  // Initialize loop state
  loopStore.setEvalLoopState({
    iteration: 0,
    maxIterations: loopConfig.maxIterations,
    scores: [],
    mutations: [],
    status: "running",
    stopReason: undefined,
  });

  let consecutiveDegradations = 0;
  let previousAvgScore = -1;
  let lastIterationMutations: SkillMutation[] = [];

  // Cost tracking
  const cost: EvalCostEstimate = {
    agentCalls: 0,
    judgeCalls: 0,
    reflectorCalls: 0,
    totalLlmCalls: 0,
    estimatedCostUsd: 0,
  };

  for (let iteration = 1; iteration <= loopConfig.maxIterations; iteration++) {
    if (signal?.aborted) {
      updateCost(loopStore, cost);
      return finishLoop(loopStore, "aborted");
    }

    loopStore.setEvalLoopState({ iteration });

    // ── Phase 1: Run all eval tasks ────────────────────────────────────────

    config.onLoopProgress?.({
      iteration,
      maxIterations: loopConfig.maxIterations,
      phase: "running",
      passRate: 0,
      avgScore: 0,
      message: `Iteration ${iteration}/${loopConfig.maxIterations} — running eval suite...`,
    });

    // On iterations > 1, only re-run tasks that failed in the previous round
    const tasksToRun = iteration === 1
      ? config.tasks
      : config.tasks.filter((t) => t.status !== "pass");

    const results = await runEvalSuite(tasksToRun, {
      ...config.evalRunnerConfig,
      agentSandboxId: sandboxId,
      signal,
    });

    // Track cost: each task = 1 agent call + 1 judge call (if real container)
    cost.agentCalls += tasksToRun.length;
    cost.judgeCalls += tasksToRun.length;

    if (signal?.aborted) {
      updateCost(loopStore, cost);
      return finishLoop(loopStore, "aborted");
    }

    // Merge results back into the full task list
    for (const result of results) {
      const idx = config.tasks.findIndex((t) => t.id === result.id);
      if (idx >= 0) {
        config.tasks[idx] = { ...result, iteration };
      }
    }

    // ── Phase 2: Calculate scores ──────────────────────────────────────────

    const allTasks = config.tasks;
    const passed = allTasks.filter((t) => t.status === "pass").length;
    const passRate = passed / allTasks.length;
    const avgScore = allTasks.reduce((sum, t) => sum + (t.confidence ?? 0), 0) / allTasks.length;

    const scoreEntry = { iteration, passRate, avgScore };
    loopStore.setEvalLoopState({
      scores: [...(loopStore.getEvalLoopState().scores), scoreEntry],
    });

    config.onLoopProgress?.({
      iteration,
      maxIterations: loopConfig.maxIterations,
      phase: "scoring",
      passRate,
      avgScore,
      message: `Iteration ${iteration} — ${passed}/${allTasks.length} passing (avg score: ${avgScore.toFixed(2)})`,
    });

    // ── Check stopping criteria ────────────────────────────────────────────

    // All passed — done!
    if (passRate === 1.0) {
      // Mark last mutations as accepted
      markMutationsAccepted(loopStore, lastIterationMutations);
      updateCost(loopStore, cost);
      return finishLoop(loopStore, "all_passed");
    }

    // Check for degradation
    if (iteration > 1 && avgScore < previousAvgScore) {
      consecutiveDegradations++;
      if (consecutiveDegradations >= loopConfig.maxConsecutiveDegradations) {
        // Revert last mutations since they made things worse
        config.onLoopProgress?.({
          iteration,
          maxIterations: loopConfig.maxIterations,
          phase: "mutating",
          passRate,
          avgScore,
          message: `Score degraded ${consecutiveDegradations}x — reverting last mutations...`,
        });

        await revertMutations(lastIterationMutations, sandboxId, sessionId, skillGraph);
        updateCost(loopStore, cost);
        return finishLoop(loopStore, "degraded");
      }
    } else {
      consecutiveDegradations = 0;
      // Previous mutations helped — mark them as accepted
      if (iteration > 1) {
        markMutationsAccepted(loopStore, lastIterationMutations);
      }
    }

    previousAvgScore = avgScore;

    // Last iteration — no point reflecting if we can't act on it
    if (iteration === loopConfig.maxIterations) {
      break;
    }

    // ── Phase 3: Reflect on failures ───────────────────────────────────────

    const failedTasks = allTasks.filter((t) => t.status === "fail" || t.status === "manual");

    config.onLoopProgress?.({
      iteration,
      maxIterations: loopConfig.maxIterations,
      phase: "reflecting",
      passRate,
      avgScore,
      message: `Reflecting on ${failedTasks.length} failure(s)...`,
    });

    const reflection = await reflectOnFailures(
      failedTasks,
      skillGraph,
      sessionId,
      { signal },
    );
    cost.reflectorCalls += 1;

    if (signal?.aborted) {
      updateCost(loopStore, cost);
      return finishLoop(loopStore, "aborted");
    }

    if (reflection.rewrites.length === 0) {
      // Reflector found no actionable changes — stop the loop
      updateCost(loopStore, cost);
      return finishLoop(loopStore, "no_actionable_changes");
    }

    // ── Phase 4: Apply mutations ───────────────────────────────────────────

    config.onLoopProgress?.({
      iteration,
      maxIterations: loopConfig.maxIterations,
      phase: "mutating",
      passRate,
      avgScore,
      message: `Applying ${reflection.rewrites.length} skill mutation(s)...`,
    });

    const mutationResult = await applySkillMutations(
      reflection.rewrites,
      sandboxId,
      sessionId,
      skillGraph,
      iteration,
    );

    lastIterationMutations = mutationResult.applied;

    // Track mutations in loop state
    loopStore.setEvalLoopState({
      mutations: [
        ...loopStore.getEvalLoopState().mutations,
        ...mutationResult.applied,
      ],
    });

    if (mutationResult.applied.length === 0) {
      updateCost(loopStore, cost);
      return finishLoop(loopStore, "mutation_failed");
    }

    // ── Pause for container to reload ──────────────────────────────────────

    config.onLoopProgress?.({
      iteration,
      maxIterations: loopConfig.maxIterations,
      phase: "reloading",
      passRate,
      avgScore,
      message: "Waiting for agent to reload skills...",
    });

    await sleep(loopConfig.reloadPauseMs);
  }

  updateCost(loopStore, cost);
  return finishLoop(loopStore, "max_iterations");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Estimate cost based on call counts. ~$0.01-0.05 per LLM call average. */
function updateCost(store: EvalLoopStore, cost: EvalCostEstimate): void {
  cost.totalLlmCalls = cost.agentCalls + cost.judgeCalls + cost.reflectorCalls;
  // Rough estimate: agent calls ~$0.02, judge calls ~$0.01, reflector ~$0.03
  cost.estimatedCostUsd = parseFloat(
    (cost.agentCalls * 0.02 + cost.judgeCalls * 0.01 + cost.reflectorCalls * 0.03).toFixed(2),
  );
  store.setEvalLoopState({ cost });
}

function finishLoop(
  store: EvalLoopStore,
  stopReason: string,
): EvalLoopState {
  const finalStatus = stopReason === "all_passed" ? "completed" as const
    : stopReason === "degraded" ? "degraded" as const
    : "completed" as const;

  store.setEvalLoopState({ status: finalStatus, stopReason });
  store.setEvalStatus("done");
  return store.getEvalLoopState();
}

function markMutationsAccepted(store: EvalLoopStore, mutations: SkillMutation[]): void {
  const state = store.getEvalLoopState();
  const updatedMutations = state.mutations.map((m) => {
    if (mutations.some((lm) => lm.skillId === m.skillId && lm.iteration === m.iteration)) {
      return { ...m, accepted: true };
    }
    return m;
  });
  store.setEvalLoopState({ mutations: updatedMutations });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
