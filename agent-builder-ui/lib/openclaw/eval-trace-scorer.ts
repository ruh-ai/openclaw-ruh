/**
 * eval-trace-scorer.ts — LLM-based execution trace scorer.
 *
 * Replaces the keyword-matching scorer (`eval-scorer.ts`) when real execution
 * traces are available. Sends the full trace (response + tool calls + errors)
 * to an LLM judge that evaluates whether the agent behaved correctly.
 *
 * Inspired by Hermes Agent's GEPA approach: the scorer reads full execution
 * traces and returns actionable feedback (not just pass/fail), which feeds
 * the reflector for skill improvement.
 */

import type { ExecutionTrace, SkillGraphNode, TraceScore } from "./types";
import { sendToArchitectStreaming } from "./api";

/**
 * Format a trace into a human-readable block for the LLM judge prompt.
 */
function formatTrace(trace: ExecutionTrace): string {
  const parts: string[] = [];

  parts.push("### Agent Response");
  parts.push(trace.response || "(no response)");

  if (trace.toolCalls.length > 0) {
    parts.push("\n### Tool Calls Made");
    for (let i = 0; i < trace.toolCalls.length; i++) {
      const tc = trace.toolCalls[i];
      parts.push(`${i + 1}. **${tc.toolName}** (${tc.durationMs}ms)`);
      if (tc.input) parts.push(`   Input: ${tc.input.slice(0, 500)}`);
      if (tc.output) parts.push(`   Output: ${tc.output.slice(0, 500)}`);
    }
  } else {
    parts.push("\n### Tool Calls Made");
    parts.push("(none — agent responded without using any tools)");
  }

  if (trace.skillsActivated.length > 0) {
    parts.push(`\n### Skills Activated: ${trace.skillsActivated.join(", ")}`);
  }

  if (trace.errors.length > 0) {
    parts.push("\n### Errors");
    for (const err of trace.errors) {
      parts.push(`- ${err}`);
    }
  }

  parts.push(`\n### Timing: ${trace.totalDurationMs}ms total`);

  return parts.join("\n");
}

/**
 * Build the judge prompt for scoring an execution trace.
 */
function buildJudgePrompt(
  trace: ExecutionTrace,
  expectedBehavior: string,
  skillGraph: SkillGraphNode[],
): string {
  const skillList = skillGraph
    .map((s) => `- **${s.name}** (${s.skill_id}): ${s.description ?? "no description"}`)
    .join("\n");

  return `You are an evaluation judge for an AI agent. Your job is to determine whether the agent correctly handled a task by examining its full execution trace — not just its text output, but what tools it called, what data it processed, and whether it made errors.

## Expected Behavior
${expectedBehavior}

## Execution Trace
${formatTrace(trace)}

## Agent's Available Skills
${skillList}

## Scoring Instructions

Evaluate the execution against the expected behavior. Consider:

1. **Output correctness** — Does the response contain the right information/action?
2. **Tool usage** — Did the agent call the right tools with correct arguments? Were there unnecessary or missing tool calls?
3. **Skill activation** — Were the expected skills used? Were any skills that should have been used left unused?
4. **Error handling** — If errors occurred, did the agent handle them gracefully?
5. **Completeness** — Did the agent fully complete the task or only partially?

For each skill in the agent's skill list, provide a diagnosis:
- "working" — skill performed correctly
- "partial" — skill was used but didn't fully work (explain why)
- "broken" — skill failed or produced wrong results (explain what broke)
- "unused" — skill wasn't relevant to this task

Return your evaluation as a JSON object:
\`\`\`json
{
  "passed": true/false,
  "score": 0.0-1.0,
  "feedback": "1-3 sentence explanation of why this passed or failed",
  "skillDiagnosis": [
    { "skillId": "skill-id", "verdict": "working|partial|broken|unused", "issue": "optional explanation" }
  ],
  "suggestedFixes": ["concrete fix 1", "concrete fix 2"]
}
\`\`\`

Return ONLY the JSON object.`;
}

/**
 * Parse the LLM judge response into a TraceScore.
 */
function parseJudgeResponse(content: string, skillGraph: SkillGraphNode[]): TraceScore {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        passed: Boolean(parsed.passed),
        score: typeof parsed.score === "number" ? Math.max(0, Math.min(1, parsed.score)) : 0,
        feedback: String(parsed.feedback || "No feedback provided"),
        skillDiagnosis: Array.isArray(parsed.skillDiagnosis)
          ? (parsed.skillDiagnosis as Array<Record<string, unknown>>).map((d) => ({
              skillId: String(d.skillId || d.skill_id || "unknown"),
              verdict: (["working", "partial", "broken", "unused"].includes(String(d.verdict))
                ? String(d.verdict)
                : "unused") as "working" | "partial" | "broken" | "unused",
              issue: d.issue ? String(d.issue) : undefined,
            }))
          : skillGraph.map((s) => ({ skillId: s.skill_id, verdict: "unused" as const })),
        suggestedFixes: Array.isArray(parsed.suggestedFixes)
          ? (parsed.suggestedFixes as unknown[]).map(String)
          : [],
      };
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: couldn't parse structured response
  return {
    passed: false,
    score: 0.3,
    feedback: "Judge response could not be parsed — manual review recommended.",
    skillDiagnosis: skillGraph.map((s) => ({ skillId: s.skill_id, verdict: "unused" as const })),
    suggestedFixes: [],
  };
}

/**
 * Score an execution trace using an LLM judge.
 *
 * Sends the full trace to the architect LLM with a structured evaluation prompt.
 * Returns a TraceScore with pass/fail, score, feedback, and per-skill diagnosis.
 */
export async function scoreExecutionTrace(
  trace: ExecutionTrace,
  expectedBehavior: string,
  skillGraph: SkillGraphNode[],
  sessionId: string,
  options?: { signal?: AbortSignal },
): Promise<TraceScore> {
  const prompt = buildJudgePrompt(trace, expectedBehavior, skillGraph);
  let accumulated = "";

  try {
    const response = await sendToArchitectStreaming(
      sessionId,
      prompt,
      { onDelta: (text) => { accumulated += text; } },
      { mode: "test", signal: options?.signal },
    );

    const content = response.content || accumulated;
    return parseJudgeResponse(content, skillGraph);
  } catch (err) {
    // If scoring fails, return a conservative "manual" result
    return {
      passed: false,
      score: 0.3,
      feedback: `Scoring failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      skillDiagnosis: skillGraph.map((s) => ({ skillId: s.skill_id, verdict: "unused" as const })),
      suggestedFixes: [],
    };
  }
}
