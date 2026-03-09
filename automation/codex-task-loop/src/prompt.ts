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
    "Update only the files required for this task. Commit and push only after the verification commands pass.",
    'Return JSON only with keys: status, summary, verification, commitSha, prUrl.',
  ].join("\n");
}
