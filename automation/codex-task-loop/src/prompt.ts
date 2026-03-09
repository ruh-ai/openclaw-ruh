export interface TaskPromptInput {
  issueId: string;
  title: string;
  description: string;
  branchName: string;
  verificationCommands: string[];
}

export function buildTaskPrompt(input: TaskPromptInput): string {
  const checks = input.verificationCommands.map((command) => `- ${command}`).join("\n");

  return [
    `Issue: ${input.issueId}`,
    `Title: ${input.title}`,
    `Branch: ${input.branchName}`,
    "",
    "Task description:",
    input.description,
    "",
    "Verification commands:",
    checks || "- none provided",
    "",
    "Use the branch named above. If it does not exist, create and switch to it in the target repository before making changes.",
    "Update only the files required for this task. Commit and push only after the relevant verification commands pass.",
    "If the work is reviewable, open or update a pull request with GitHub CLI and return the PR URL.",
    "Use one of these status values: completed, blocked, retryable_failure, or noop.",
    'Return JSON only with keys: status, summary, verification, commitSha, prUrl.',
  ].join("\n");
}
