import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CodexOutcome } from "./codex.js";
import type { LinearIssueSummary } from "./linear.js";

const execFileAsync = promisify(execFile);

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

export interface PullRequestSummary {
  number: number;
  url: string;
  state: string;
}

export interface PullRequestUrlSummary {
  number: number;
  url: string;
}

export interface GitPrClientOptions {
  repoPath: string;
  baseBranch: string;
  dryRun?: boolean;
}

export class GitPrClient {
  constructor(private readonly options: GitPrClientOptions) {}

  async openOrUpdatePullRequest(issue: LinearIssueSummary, outcome: CodexOutcome): Promise<string | null> {
    const branchName = buildBranchName(issue.id, issue.title);

    if (outcome.prUrl) {
      const parsed = parsePullRequestUrl(outcome.prUrl);
      if (parsed) {
        await this.addAutomationLabels(parsed.number);
      }
      return outcome.prUrl;
    }

    const existingPullRequest = await this.findPullRequestByHead(branchName);
    const title = `${issue.id}: ${issue.title}`;
    const body = buildPullRequestBody(issue, outcome);

    if (existingPullRequest) {
      if (existingPullRequest.state === "OPEN" && !this.options.dryRun) {
        await this.run(updatePullRequestCommand({ prNumber: existingPullRequest.number, title, body }));
      }
      await this.addAutomationLabels(existingPullRequest.number);
      return existingPullRequest.url;
    }

    if (this.options.dryRun) {
      return `dry-run://pull-request/${branchName}`;
    }

    const created = await this.run(
      createPullRequestCommand({
        base: this.options.baseBranch,
        head: branchName,
        title,
        body,
      }),
    );
    const url = parsePullRequestCreateOutput(created.stdout);
    if (!url) {
      return null;
    }

    const parsed = parsePullRequestUrl(url);
    if (parsed) {
      await this.addAutomationLabels(parsed.number);
    }

    return url;
  }

  async findMergedPullRequest(issueId: string): Promise<boolean> {
    const result = await this.run(findMergedPullRequestCommand(issueId));
    return detectMergeState(result.stdout);
  }

  private async findPullRequestByHead(headBranch: string): Promise<PullRequestSummary | null> {
    const result = await this.run(findPullRequestByHeadCommand(headBranch));
    return parsePullRequestList(result.stdout);
  }

  private async addAutomationLabels(prNumber: number): Promise<void> {
    if (this.options.dryRun) {
      return;
    }

    try {
      await this.run(addPullRequestLabelsCommand(prNumber));
    } catch {
      // The repo may not define these labels yet; keep the PR flow moving.
    }
  }

  private async run(command: string[]): Promise<{ stdout: string; stderr: string }> {
    const [file, ...args] = command;
    return execFileAsync(file, args, {
      cwd: this.options.repoPath,
      env: process.env,
    });
  }
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

export function findPullRequestByHeadCommand(head: string): string[] {
  return [
    "gh",
    "pr",
    "list",
    "--head",
    head,
    "--state",
    "all",
    "--limit",
    "1",
    "--json",
    "number,url,state",
  ];
}

export function findMergedPullRequestCommand(issueId: string): string[] {
  return [
    "gh",
    "pr",
    "list",
    "--search",
    `${issueId} in:title`,
    "--state",
    "merged",
    "--limit",
    "1",
    "--json",
    "number,url,state",
  ];
}

export function addPullRequestLabelsCommand(prNumber: number): string[] {
  return [
    "gh",
    "pr",
    "edit",
    String(prNumber),
    "--add-label",
    "codex",
    "--add-label",
    "codex-automation",
  ];
}

export function parsePullRequestList(rawJson: string): PullRequestSummary | null {
  const parsed = JSON.parse(rawJson) as Array<Partial<PullRequestSummary>>;
  const first = parsed[0];
  if (!first || typeof first.number !== "number" || typeof first.url !== "string" || typeof first.state !== "string") {
    return null;
  }

  return {
    number: first.number,
    url: first.url,
    state: first.state,
  };
}

export function parsePullRequestUrl(url: string): PullRequestUrlSummary | null {
  const match = url.match(/\/pull\/(\d+)(?:\/|$)/);
  if (!match) {
    return null;
  }

  return {
    number: Number.parseInt(match[1], 10),
    url,
  };
}

export function detectMergeState(rawJson: string): boolean {
  const parsed = JSON.parse(rawJson) as { state?: string } | Array<{ state?: string }>;
  if (Array.isArray(parsed)) {
    return parsed.some((item) => item.state === "MERGED");
  }

  return parsed.state === "MERGED";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function buildPullRequestBody(issue: LinearIssueSummary, outcome: CodexOutcome): string {
  const verification = outcome.verification.length > 0
    ? outcome.verification.map((item) => `- ${item}`).join("\n")
    : "- No verification commands reported";

  return [
    `Automated implementation for ${issue.id}.`,
    "",
    "Summary:",
    outcome.summary,
    "",
    "Verification:",
    verification,
  ].join("\n");
}

function parsePullRequestCreateOutput(raw: string): string | null {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^https:\/\/github\.com\/.+\/pull\/\d+$/.test(line)) ?? null;
}
