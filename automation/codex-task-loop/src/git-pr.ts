export interface PullRequestInput {
  base: string;
  head: string;
  title: string;
  body: string;
}

export interface PullRequestUpdateInput {
  prNumber: number;
  title: string;
  body: string;
}

export function buildBranchName(issueId: string, title: string): string {
  return `codex/${issueId.toLowerCase()}-${slugify(title)}`;
}

export function buildCommitMessage(issueId: string, title: string): string {
  return `feat(${issueId.toLowerCase()}): ${title.toLowerCase()}`;
}

export function pushBranchCommand(branchName: string): string[] {
  return ["git", "push", "--set-upstream", "origin", branchName];
}

export function createPullRequestCommand(input: PullRequestInput): string[] {
  return [
    "gh",
    "pr",
    "create",
    "--base",
    input.base,
    "--head",
    input.head,
    "--title",
    input.title,
    "--body",
    input.body,
  ];
}

export function updatePullRequestCommand(input: PullRequestUpdateInput): string[] {
  return [
    "gh",
    "pr",
    "edit",
    String(input.prNumber),
    "--title",
    input.title,
    "--body",
    input.body,
  ];
}

export function detectMergeState(rawJson: string): boolean {
  const parsed = JSON.parse(rawJson) as { state?: string };
  return parsed.state === "MERGED";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}
