/**
 * eval-runner.ts — Executes evaluation tasks against the agent.
 *
 * Two modes:
 *   1. **Real agent** (when agentSandboxId is set): routes to the agent's own
 *      container via forge-chat, captures execution traces, scores with LLM judge.
 *   2. **Fallback** (no container): routes to the shared architect with a soul
 *      override, scores with keyword matching. This is the legacy path.
 */

import type { EvalTask, ExecutionTrace, SkillGraphNode } from "./types";
import { sendToArchitectStreaming } from "./api";
import { scoreEvalResponse } from "./eval-scorer";
import { collectExecutionTrace } from "./eval-trace-collector";
import { scoreExecutionTrace } from "./eval-trace-scorer";
import type { MockContext } from "./eval-mock-generator";

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

// ── Legacy fallback: soul override for shared architect ─────────────────────

function buildSoulOverride(
  agentRules: string[],
  skillGraph: SkillGraphNode[],
  mode: EvalMode,
  mockContext?: MockContext | null,
): string {
  const skillNames = skillGraph.map((s) => s.name).join(", ");
  const rules = agentRules.length > 0
    ? agentRules.map((r) => `- ${r}`).join("\n")
    : "No specific rules defined.";

  let base = `You are an AI agent being evaluated. Respond as the agent would in production.

Your available skills: ${skillNames}

Your rules:
${rules}

Respond naturally to the user's message. Use your skills when appropriate. If the request is outside your capabilities, say so politely.`;

  if (mode === "mock" && mockContext && mockContext.services.length > 0) {
    const { buildMockModeInstruction } = require("./eval-mock-generator") as typeof import("./eval-mock-generator");
    base += "\n\n" + buildMockModeInstruction(mockContext);
  }

  return base;
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

// ── Run a single task via shared architect fallback ─────────────────────────

async function runFallbackTask(
  task: EvalTask,
  config: EvalRunnerConfig,
): Promise<Partial<EvalTask>> {
  const startTime = Date.now();
  let accumulated = "";

  try {
    const response = await sendToArchitectStreaming(
      config.sessionId,
      task.input || "(empty input)",
      {
        onDelta: (text) => {
          accumulated += text;
        },
      },
      {
        mode: "test",
        soulOverride: buildSoulOverride(config.agentRules, config.skillGraph, config.mode, config.mockContext),
        signal: config.signal,
      },
    );

    const content = response.content || accumulated;
    const duration = Date.now() - startTime;

    const score = scoreEvalResponse(content, task.expectedBehavior, {
      skillGraph: config.skillGraph,
      agentRules: config.agentRules,
    });

    return {
      status: score.passed ? "pass" : score.confidence >= 0.3 ? "manual" : "fail",
      response: content,
      duration,
      confidence: score.confidence,
      reasons: score.reasons,
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
  // Use real agent container when available, fall back to shared architect
  if (config.agentSandboxId) {
    return runRealAgentTask(task, config);
  }
  return runFallbackTask(task, config);
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
