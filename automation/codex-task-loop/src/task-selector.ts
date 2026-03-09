import type { TaskLease } from "./lease-store.js";
import type { LinearIssueSummary } from "./linear.js";

export interface TaskSelectionInput {
  issues: readonly LinearIssueSummary[];
  activeLease?: TaskLease;
}

const ACTIONABLE_STATES = new Set(["Todo", "Backlog"]);

export function selectTask(input: TaskSelectionInput): LinearIssueSummary | null {
  if (input.activeLease) {
    const leasedIssue = input.issues.find((issue) => issue.id === input.activeLease?.issueId);
    if (leasedIssue) {
      return leasedIssue;
    }
  }

  const eligibleIssues = input.issues
    .filter((issue) => issue.labels.includes("codex"))
    .filter((issue) => ACTIONABLE_STATES.has(issue.state))
    .filter((issue) => issue.blockedBy.length === 0)
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.id.localeCompare(right.id);
    });

  return eligibleIssues[0] ?? null;
}
