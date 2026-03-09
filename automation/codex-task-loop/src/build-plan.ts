import { readFile } from "node:fs/promises";

import type { LinearIssueSummary } from "./linear.js";

const CLOSED_STATES = new Set(["Done", "Completed", "Canceled", "Cancelled"]);

export async function readActiveCycleIssueOrder(buildPlanPath: string): Promise<string[]> {
  const raw = await readFile(buildPlanPath, "utf8");
  return parseActiveCycleIssueOrder(raw);
}

export function parseActiveCycleIssueOrder(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const issueIds: string[] = [];
  let inActiveCycle = false;

  for (const line of lines) {
    if (line.trim() === "Active cycle") {
      inActiveCycle = true;
      continue;
    }

    if (inActiveCycle && line.trim() === "Next cycle runway") {
      break;
    }

    if (!inActiveCycle) {
      continue;
    }

    const match = line.match(/^- `([A-Z]+-\d+)` /);
    if (match) {
      issueIds.push(match[1]);
    }
  }

  return issueIds;
}

export function selectNextPlannedIssue(
  issueOrder: readonly string[],
  issues: readonly LinearIssueSummary[],
): LinearIssueSummary | null {
  const issuesById = new Map(issues.map((issue) => [issue.id, issue]));

  for (const issueId of issueOrder) {
    const issue = issuesById.get(issueId);
    if (issue && !CLOSED_STATES.has(issue.state)) {
      return issue;
    }
  }

  return null;
}
