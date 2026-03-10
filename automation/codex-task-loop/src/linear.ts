import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { readActiveCycleIssueOrder, selectNextPlannedIssue } from "./build-plan.js";

const execFileAsync = promisify(execFile);
const NON_BLOCKING_CODEX_STATES = new Set(["Done", "Completed", "Canceled", "Cancelled", "ON HOLD"]);

export type LoopIssueState = "Todo" | "Backlog" | "Started" | "In Review" | "Done" | "Blocked";

export interface LinearListOptions {
  project: string;
  label: string;
  states: LoopIssueState[];
}

export interface LinearTransitionOptions {
  issueId: string;
  state: LoopIssueState;
}

export interface LeaseCommentInput {
  issueId: string;
  runId: string;
  branchName: string;
  hostname: string;
  startedAt: string;
}

export interface LinearClientOptions {
  repoPath: string;
  projectName: string;
  labelName: string;
  buildPlanPath: string;
  dryRun?: boolean;
  apiKey?: string;
}

export interface LinearIssueSummary {
  id: string;
  title: string;
  description: string;
  priority: number;
  state: string;
  labels: readonly string[];
  blockedBy: readonly string[];
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export class LinearClient {
  constructor(private readonly options: LinearClientOptions) {}

  async listEligibleIssues(): Promise<LinearIssueSummary[]> {
    const codexIssues = await this.query(buildIssuesQueryCommand(this.options.projectName, this.options.labelName));
    const activeCodexIssues = codexIssues.filter((issue) => !NON_BLOCKING_CODEX_STATES.has(issue.state));
    if (activeCodexIssues.length > 0) {
      return activeCodexIssues;
    }

    const allIssues = await this.query(projectIssuesQueryCommand(this.options.projectName));
    const issueOrder = await readActiveCycleIssueOrder(this.options.buildPlanPath);
    const nextIssue = selectNextPlannedIssue(issueOrder, allIssues);
    if (!nextIssue) {
      return [];
    }

    await this.labelIssue(nextIssue.id, this.options.labelName);
    return [
      {
        ...nextIssue,
        labels: [...new Set([...nextIssue.labels, this.options.labelName])],
      },
    ];
  }

  async transitionIssue(issueId: string, state: LoopIssueState): Promise<void> {
    if (this.options.dryRun) {
      return;
    }

    await this.run(transitionIssueCommand({ issueId, state }));
  }

  async commentOnIssue(issueId: string, body: string): Promise<void> {
    if (this.options.dryRun) {
      return;
    }

    await this.run(commentOnIssueCommand(issueId, body));
  }

  async labelIssue(issueId: string, label: string): Promise<void> {
    if (this.options.dryRun) {
      return;
    }

    await this.run(labelIssueCommand(issueId, label));
  }

  async run(command: string[]): Promise<CommandResult> {
    const [file, ...args] = command;
    const env = this.options.apiKey
      ? { ...process.env, LINEAR_API_KEY: this.options.apiKey }
      : process.env;

    return execFileAsync(file, args, {
      cwd: this.options.repoPath,
      env,
    });
  }

  private async query(command: string[]): Promise<LinearIssueSummary[]> {
    const result = await this.run(command);
    return parseIssuesResponse(result.stdout);
  }
}

export function mapIssueState(state: LoopIssueState): string {
  switch (state) {
    case "Todo":
      return "Todo";
    case "Backlog":
      return "Backlog";
    case "Started":
      return "In Development";
    case "In Review":
      return "CODE REVIEW";
    case "Done":
      return "Done";
    case "Blocked":
      return "ON HOLD";
  }
}

function mapIssueStateFilter(state: LoopIssueState): string {
  switch (state) {
    case "Todo":
      return "unstarted";
    case "Backlog":
      return "backlog";
    case "Started":
      return "started";
    case "In Review":
      return "started";
    case "Done":
      return "completed";
    case "Blocked":
      return "triage";
  }
}

export function listIssuesCommand(options: LinearListOptions): string[] {
  const command = [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "issue",
    "list",
    "--project",
    options.project,
    "--all-assignees",
    "--sort",
    "priority",
    "--no-pager",
    "--label",
    options.label,
  ];

  for (const state of options.states) {
    command.push("--state", mapIssueStateFilter(state));
  }

  return command;
}

export function buildIssuesQueryCommand(project: string, label: string): string[] {
  return [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "api",
    "query EligibleIssues($project:String!,$label:String!){ issues(filter:{ project:{ name:{ eq:$project } }, labels:{ some:{ name:{ eq:$label } } } }, first:100){ nodes { identifier title description priority state { name } labels { nodes { name } } } } }",
    "--variables-json",
    JSON.stringify({ project, label }),
  ];
}

export function projectIssuesQueryCommand(project: string): string[] {
  return [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "api",
    "query ProjectIssues($project:String!){ issues(filter:{ project:{ name:{ eq:$project } } }, first:100){ nodes { identifier title description priority state { name } labels { nodes { name } } } } }",
    "--variables-json",
    JSON.stringify({ project }),
  ];
}

export function parseIssuesResponse(raw: string): LinearIssueSummary[] {
  const parsed = JSON.parse(raw) as {
    data?: {
      issues?: {
        nodes?: Array<{
          identifier: string;
          title?: string;
          description?: string | null;
          priority?: number | null;
          state?: { name?: string | null } | null;
          labels?: { nodes?: Array<{ name?: string | null }> } | null;
        }>;
      };
    };
  };

  return (parsed.data?.issues?.nodes ?? []).map((issue) => ({
    id: issue.identifier,
    title: issue.title ?? issue.identifier,
    description: issue.description ?? "",
    priority: issue.priority ?? 4,
    state: issue.state?.name ?? "Todo",
    labels: (issue.labels?.nodes ?? [])
      .map((label) => label.name)
      .filter((label): label is string => Boolean(label)),
    blockedBy: [],
  }));
}

export function formatLeaseComment(input: LeaseCommentInput): string {
  return [
    "## OpenClaw Codex lease",
    `- Issue: \`${input.issueId}\``,
    `- Run ID: \`${input.runId}\``,
    `- Branch: \`${input.branchName}\``,
    `- Host: \`${input.hostname}\``,
    `- Started: \`${input.startedAt}\``,
  ].join("\n");
}

export function transitionIssueCommand(options: LinearTransitionOptions): string[] {
  return [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "issue",
    "update",
    options.issueId,
    "--state",
    mapIssueState(options.state),
  ];
}

export function commentOnIssueCommand(issueId: string, body: string): string[] {
  return [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "issue",
    "comment",
    "add",
    issueId,
    "--body",
    body,
  ];
}

export function labelIssueCommand(issueId: string, label: string): string[] {
  return [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "issue",
    "update",
    issueId,
    "--label",
    label,
  ];
}
