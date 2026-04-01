/**
 * eval-mutator.ts — Applies SKILL.md mutations to the agent container.
 *
 * After the reflector proposes skill rewrites, the mutator:
 * 1. Reads the current SKILL.md from the container
 * 2. Writes the new content
 * 3. Triggers a skill reload so the agent picks up changes
 *
 * All mutations are tracked with before/after content so they can be
 * reverted if the score degrades.
 */

import type { SkillGraphNode, SkillMutation } from "./types";
import type { SkillRewrite } from "./eval-reflector";
import { sendToForgeSandboxChat } from "./api";

export interface MutationResult {
  applied: SkillMutation[];
  failed: Array<{ skillId: string; error: string }>;
}

/**
 * Read a SKILL.md file from the agent container.
 *
 * Uses the forge-chat endpoint to ask the agent to cat the file.
 * Returns the file content, or null if the file doesn't exist.
 */
async function readSkillFromContainer(
  sandboxId: string,
  sessionId: string,
  skillId: string,
): Promise<string | null> {
  try {
    const response = await sendToForgeSandboxChat(
      sandboxId,
      sessionId,
      `Please run: cat ~/.openclaw/workspace/skills/${skillId}/SKILL.md`,
      undefined,
      {
        systemInstruction:
          "You are a file reader utility. Execute the cat command and return ONLY the raw file contents. " +
          "Do not add any commentary, formatting, or markdown code blocks. " +
          "If the file does not exist, respond with exactly: FILE_NOT_FOUND",
      },
    );

    const content = response.content || "";
    if (content.includes("FILE_NOT_FOUND") || content.includes("No such file")) {
      return null;
    }
    return content.trim();
  } catch {
    return null;
  }
}

/**
 * Write a SKILL.md file to the agent container.
 *
 * Uses the forge-chat endpoint to instruct the agent to write the file.
 */
async function writeSkillToContainer(
  sandboxId: string,
  sessionId: string,
  skillId: string,
  content: string,
): Promise<boolean> {
  try {
    await sendToForgeSandboxChat(
      sandboxId,
      sessionId,
      `Please write the following content to ~/.openclaw/workspace/skills/${skillId}/SKILL.md, creating the directory if needed. Write EXACTLY this content, no modifications:\n\n${content}`,
      undefined,
      {
        systemInstruction:
          "You are a file writer utility. Create the directory structure if needed " +
          "(mkdir -p) and write the exact content provided to the specified path. " +
          "Do not modify the content in any way. Respond with 'WRITTEN' when done.",
      },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a set of skill rewrites to the agent container.
 *
 * For each rewrite:
 * 1. Read the current SKILL.md (for before/after tracking)
 * 2. Write the new content
 * 3. Record the mutation
 *
 * Also updates the skill_md field on the skillGraph nodes in memory.
 */
export async function applySkillMutations(
  rewrites: SkillRewrite[],
  sandboxId: string,
  sessionId: string,
  skillGraph: SkillGraphNode[],
  iteration: number,
): Promise<MutationResult> {
  const applied: SkillMutation[] = [];
  const failed: Array<{ skillId: string; error: string }> = [];

  for (const rewrite of rewrites) {
    // Validate the skill exists in the graph
    const skill = skillGraph.find((s) => s.skill_id === rewrite.skillId);
    if (!skill) {
      failed.push({ skillId: rewrite.skillId, error: "Skill not found in skill graph" });
      continue;
    }

    // Read current content for before/after tracking
    const currentContent = await readSkillFromContainer(
      sandboxId,
      sessionId,
      rewrite.skillId,
    );

    const before = currentContent || skill.skill_md || "";

    // Write new content
    const success = await writeSkillToContainer(
      sandboxId,
      sessionId,
      rewrite.skillId,
      rewrite.newContent,
    );

    if (success) {
      applied.push({
        iteration,
        skillId: rewrite.skillId,
        before,
        after: rewrite.newContent,
        rationale: rewrite.rationale,
        accepted: false, // Will be set to true if score improves
      });

      // Update the in-memory skill graph
      skill.skill_md = rewrite.newContent;
    } else {
      failed.push({ skillId: rewrite.skillId, error: "Failed to write SKILL.md to container" });
    }
  }

  return { applied, failed };
}

/**
 * Revert a set of mutations by writing the "before" content back.
 */
export async function revertMutations(
  mutations: SkillMutation[],
  sandboxId: string,
  sessionId: string,
  skillGraph: SkillGraphNode[],
): Promise<void> {
  for (const mutation of mutations) {
    await writeSkillToContainer(
      sandboxId,
      sessionId,
      mutation.skillId,
      mutation.before,
    );

    // Restore in-memory skill graph
    const skill = skillGraph.find((s) => s.skill_id === mutation.skillId);
    if (skill) {
      skill.skill_md = mutation.before;
    }
  }
}
