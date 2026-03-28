import type { EvalTask, SkillGraphNode } from "./types";
import { sendToArchitectStreaming } from "./api";
import { scoreEvalResponse } from "./eval-scorer";

export interface EvalRunnerStore {
  updateEvalTask: (taskId: string, partial: Partial<EvalTask>) => void;
  setEvalStatus: (status: "idle" | "running" | "ready" | "done") => void;
}

export interface EvalRunnerConfig {
  sessionId: string;
  store: EvalRunnerStore;
  skillGraph: SkillGraphNode[];
  agentRules: string[];
  signal?: AbortSignal;
  onProgress?: (current: number, total: number, taskTitle: string) => void;
}

function buildSoulOverride(agentRules: string[], skillGraph: SkillGraphNode[]): string {
  const skillNames = skillGraph.map((s) => s.name).join(", ");
  const rules = agentRules.length > 0
    ? agentRules.map((r) => `- ${r}`).join("\n")
    : "No specific rules defined.";

  return `You are an AI agent being evaluated. Respond as the agent would in production.

Your available skills: ${skillNames}

Your rules:
${rules}

Respond naturally to the user's message. Use your skills when appropriate. If the request is outside your capabilities, say so politely.`;
}

async function runSingleTask(
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
        soulOverride: buildSoulOverride(config.agentRules, config.skillGraph),
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

export async function runEvalSuite(
  tasks: EvalTask[],
  config: EvalRunnerConfig,
): Promise<void> {
  config.store.setEvalStatus("running");

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    if (config.signal?.aborted) {
      config.store.setEvalStatus("idle");
      return;
    }

    config.onProgress?.(i + 1, tasks.length, task.title);
    config.store.updateEvalTask(task.id, { status: "running" });

    const result = await runSingleTask(task, config);
    config.store.updateEvalTask(task.id, result);
  }

  config.store.setEvalStatus("done");
}
