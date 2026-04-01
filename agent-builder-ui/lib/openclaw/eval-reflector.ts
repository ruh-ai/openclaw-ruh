/**
 * eval-reflector.ts — Diagnoses evaluation failures and proposes SKILL.md rewrites.
 *
 * Inspired by GEPA's reflection phase: instead of collapsing failures into a
 * scalar reward, the reflector reads full execution traces and diagnoses WHY
 * skills failed. It then proposes concrete SKILL.md rewrites that target the
 * root causes.
 *
 * This is the "text-optimization analogue of a gradient" — natural language
 * diagnostics that tell the mutator exactly what to fix.
 */

import type { EvalTask, SkillGraphNode, SkillDiagnosis } from "./types";
import { sendToArchitectStreaming } from "./api";

export interface SkillRewrite {
  skillId: string;
  newContent: string;
  rationale: string;
}

export interface ReflectionResult {
  rewrites: SkillRewrite[];
  summary: string;
}

/**
 * Build the reflector prompt from failed tasks and current skill files.
 */
function buildReflectorPrompt(
  failedTasks: EvalTask[],
  skillGraph: SkillGraphNode[],
): string {
  // Collect all skills that were diagnosed as partial or broken
  const problematicSkills = new Set<string>();
  for (const task of failedTasks) {
    if (task.traceScore?.skillDiagnosis) {
      for (const d of task.traceScore.skillDiagnosis) {
        if (d.verdict === "partial" || d.verdict === "broken") {
          problematicSkills.add(d.skillId);
        }
      }
    }
  }

  // If no specific skills were diagnosed, include all skills that were supposed to be used
  if (problematicSkills.size === 0) {
    for (const task of failedTasks) {
      if (task.trace?.skillsActivated) {
        for (const id of task.trace.skillsActivated) {
          problematicSkills.add(id);
        }
      }
    }
  }

  // Format failed tasks
  const failedTaskBlocks = failedTasks.map((task, i) => {
    const parts: string[] = [];
    parts.push(`### Failed Task ${i + 1}: ${task.title}`);
    parts.push(`**Input:** ${task.input}`);
    parts.push(`**Expected:** ${task.expectedBehavior}`);

    if (task.trace) {
      parts.push(`**Agent Response:** ${task.trace.response.slice(0, 1000)}`);
      if (task.trace.toolCalls.length > 0) {
        parts.push("**Tool Calls:**");
        for (const tc of task.trace.toolCalls) {
          parts.push(`- ${tc.toolName}: ${tc.input.slice(0, 300)}`);
          if (tc.output) parts.push(`  → ${tc.output.slice(0, 300)}`);
        }
      }
      if (task.trace.errors.length > 0) {
        parts.push(`**Errors:** ${task.trace.errors.join("; ")}`);
      }
    } else if (task.response) {
      parts.push(`**Agent Response:** ${task.response.slice(0, 1000)}`);
    }

    if (task.traceScore) {
      parts.push(`**Judge Feedback:** ${task.traceScore.feedback}`);
      parts.push(`**Score:** ${task.traceScore.score}`);
      const issues = task.traceScore.skillDiagnosis
        .filter((d: SkillDiagnosis) => d.issue)
        .map((d: SkillDiagnosis) => `${d.skillId}: ${d.verdict} — ${d.issue}`);
      if (issues.length > 0) {
        parts.push(`**Skill Issues:** ${issues.join("; ")}`);
      }
      if (task.traceScore.suggestedFixes.length > 0) {
        parts.push(`**Suggested Fixes:** ${task.traceScore.suggestedFixes.join("; ")}`);
      }
    }

    return parts.join("\n");
  }).join("\n\n");

  // Format current skill files
  const skillBlocks = skillGraph
    .filter((s) => problematicSkills.has(s.skill_id) || problematicSkills.size === 0)
    .map((s) => {
      const content = s.skill_md || "(no SKILL.md content — skill has not been built yet)";
      return `### ${s.name} (${s.skill_id})\n\`\`\`markdown\n${content}\n\`\`\``;
    })
    .join("\n\n");

  return `You are an AI agent skill optimizer. Your job is to analyze evaluation failures and propose concrete SKILL.md rewrites that fix the root causes.

## Failed Evaluation Tasks
${failedTaskBlocks}

## Current Skill Files (candidates for improvement)
${skillBlocks}

## Instructions

Analyze the failures above. For each skill that needs improvement:

1. **Diagnose** the root cause — why did the skill fail? Was it:
   - Missing a step in the process?
   - Using wrong tool arguments?
   - Not handling an edge case?
   - Missing error handling?
   - Producing output in the wrong format?

2. **Propose** a rewritten SKILL.md that fixes the issue. Rules:
   - Preserve the YAML frontmatter (name, version, description)
   - Keep the skill's purpose and API connections unchanged
   - Focus on fixing the **process steps**, **error handling**, or **output format**
   - Be specific — don't make vague improvements, fix the exact failure
   - Keep skills under 15KB

3. Only modify skills that were diagnosed as broken or partial. Do NOT rewrite skills that are working correctly.

Return a JSON array of rewrites:
\`\`\`json
[
  {
    "skillId": "the-skill-id",
    "newContent": "full rewritten SKILL.md content",
    "rationale": "1-2 sentence explanation of what changed and why"
  }
]
\`\`\`

If no skill changes are needed (the failures are caused by something other than skill quality), return an empty array: \`[]\`

Return ONLY the JSON array.`;
}

/**
 * Parse the reflector LLM response into skill rewrites.
 */
function parseReflectorResponse(content: string): SkillRewrite[] {
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: Record<string, unknown>) =>
        item.skillId && typeof item.newContent === "string" && item.newContent.length > 0,
      )
      .map((item: Record<string, unknown>) => ({
        skillId: String(item.skillId),
        newContent: String(item.newContent),
        rationale: String(item.rationale || "No rationale provided"),
      }));
  } catch {
    return [];
  }
}

/**
 * Analyze failed evaluation tasks and propose SKILL.md rewrites.
 *
 * Reads full execution traces from failed tasks and the current skill files,
 * then uses an LLM to diagnose root causes and propose targeted fixes.
 */
export async function reflectOnFailures(
  failedTasks: EvalTask[],
  skillGraph: SkillGraphNode[],
  sessionId: string,
  options?: { signal?: AbortSignal },
): Promise<ReflectionResult> {
  if (failedTasks.length === 0) {
    return { rewrites: [], summary: "No failures to reflect on." };
  }

  const prompt = buildReflectorPrompt(failedTasks, skillGraph);
  let accumulated = "";

  try {
    const response = await sendToArchitectStreaming(
      sessionId,
      prompt,
      { onDelta: (text) => { accumulated += text; } },
      { mode: "test", signal: options?.signal },
    );

    const content = response.content || accumulated;
    const rewrites = parseReflectorResponse(content);

    const summary = rewrites.length > 0
      ? `Proposed ${rewrites.length} skill rewrite(s): ${rewrites.map((r) => `${r.skillId} — ${r.rationale}`).join("; ")}`
      : "No skill changes proposed — failures may be caused by external factors.";

    return { rewrites, summary };
  } catch (err) {
    return {
      rewrites: [],
      summary: `Reflection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
