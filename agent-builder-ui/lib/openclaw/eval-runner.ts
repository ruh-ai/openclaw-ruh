/**
 * eval-runner.ts — Executes evaluation tasks against the agent's own sandbox.
 *
 * When the dedicated sandbox is not ready yet, tasks stay pending with an
 * explicit container-not-ready reason. The Test stage never falls back to the
 * shared architect route.
 */

import type { EvalTask, SkillGraphNode } from "./types";
import { collectExecutionTrace } from "./eval-trace-collector";
import { scoreExecutionTrace } from "./eval-trace-scorer";
import type { MockContext } from "./eval-mock-generator";
import { TEST_STAGE_CONTAINER_NOT_READY_REASON } from "./test-stage-readiness";

export type EvalMode = "mock" | "live";

export interface EvalRunnerStore {
  updateEvalTask: (taskId: string, partial: Partial<EvalTask>) => void;
  setEvalStatus: (status: "idle" | "running" | "ready" | "done") => void;
}

export interface EvalRunnerConfig {
  sessionId: string;
  store: EvalRunnerStore;
  skillGraph: SkillGraphNode[];
  agentRules: string[];
  mode: EvalMode;
  mockContext?: MockContext | null;
  signal?: AbortSignal;
  onProgress?: (current: number, total: number, taskTitle: string) => void;
  /** Agent's own sandbox container ID. When set, eval runs against the real agent. */
  agentSandboxId?: string | null;
}

// ── Mock mode system instruction for real agent container ───────────────────

function buildMockSystemInstruction(
  mockContext: MockContext | null | undefined,
): string | undefined {
  if (!mockContext || mockContext.services.length === 0) return undefined;
  const { buildMockModeInstruction } = require("./eval-mock-generator") as typeof import("./eval-mock-generator");
  return buildMockModeInstruction(mockContext);
}

// ── Run a single task against the real agent container ──────────────────────

async function runRealAgentTask(
  task: EvalTask,
  config: EvalRunnerConfig,
): Promise<Partial<EvalTask>> {
  const startTime = Date.now();

  try {
    const trace = await collectExecutionTrace({
      sandboxId: config.agentSandboxId!,
      sessionId: config.sessionId,
      message: task.input || "(empty input)",
      skillGraph: config.skillGraph,
      signal: config.signal,
      systemInstruction: buildMockSystemInstruction(config.mockContext),
    });

    const duration = Date.now() - startTime;

    // Score with LLM trace judge
    const traceScore = await scoreExecutionTrace(
      trace,
      task.expectedBehavior,
      config.skillGraph,
      config.sessionId,
      { signal: config.signal },
    );

    return {
      status: traceScore.passed ? "pass" : traceScore.score >= 0.3 ? "manual" : "fail",
      response: trace.response,
      trace,
      traceScore,
      toolsUsed: trace.toolCalls.map((tc) => tc.toolName),
      duration,
      confidence: traceScore.score,
      reasons: [
        traceScore.feedback,
        ...traceScore.skillDiagnosis
          .filter((d) => d.issue)
          .map((d) => `${d.skillId}: ${d.issue}`),
      ],
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    if (config.signal?.aborted) {
      return { status: "pending", duration };
    }
    return {
      status: "fail",
      response: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      duration,
      confidence: 0,
      reasons: ["Execution failed — agent did not respond"],
    };
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

async function runSingleTask(
  task: EvalTask,
  config: EvalRunnerConfig,
): Promise<Partial<EvalTask>> {
  if (!config.agentSandboxId) {
    return {
      status: "pending",
      duration: 0,
      confidence: 0,
      response: TEST_STAGE_CONTAINER_NOT_READY_REASON,
      reasons: [TEST_STAGE_CONTAINER_NOT_READY_REASON],
    };
  }

  return runRealAgentTask(task, config);
}

export async function runEvalSuite(
  tasks: EvalTask[],
  config: EvalRunnerConfig,
): Promise<EvalTask[]> {
  config.store.setEvalStatus("running");
  const results: EvalTask[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    if (config.signal?.aborted) {
      config.store.setEvalStatus("idle");
      return results;
    }

    config.onProgress?.(i + 1, tasks.length, task.title);
    config.store.updateEvalTask(task.id, { status: "running" });

    const result = await runSingleTask(task, config);
    config.store.updateEvalTask(task.id, result);
    results.push({ ...task, ...result } as EvalTask);
  }

  config.store.setEvalStatus("done");
  return results;
}
