import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LoopIssueState = "Todo" | "Backlog" | "Started" | "In Review" | "Done" | "Blocked";

export interface LinearListOptions {
  project: string;
  label: string;
  states: LoopIssueState[];
}

export interface LinearTransitionOptions {
  issueId: string;
  state: LoopIssueState;
  comment?: string;
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
  apiKey?: string;
}

export interface LinearIssueSummary {
  id: string;
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
}

export function mapIssueState(state: LoopIssueState): string {
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
    command.push("--state", mapIssueState(state));
  }

  return command;
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
  const command = `npm run linear -- issue update ${shellEscape(options.issueId)} --state ${shellEscape(mapIssueState(options.state))}`;

  if (!options.comment) {
    return ["sh", "-lc", command];
  }

  const graphql = "mutation($issueId:String!,$body:String!){ commentCreate(input:{ issueId:$issueId, body:$body }){ success } }";
  const commentCommand = [
    "npm run linear -- api",
    shellSingleQuote(graphql),
    "--var",
    `issueId=${options.issueId}`,
    "--var",
    `body=${shellDoubleQuote(options.comment)}`,
  ].join(" ");

  return ["sh", "-lc", `${command} && ${commentCommand}`];
}

function shellEscape(value: string): string {
  return value.replace(/(["\s'$`\\])/g, "\\$1");
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shellDoubleQuote(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}
