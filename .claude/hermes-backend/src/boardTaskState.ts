export type BoardTaskStatus = "todo" | "in_progress" | "blocked" | "done";

export function normalizeBoardTaskFingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function taskLogStatusToBoardStatus(status: string): BoardTaskStatus {
  switch (status) {
    case "pending":
    case "running":
      return "in_progress";
    case "completed":
      return "done";
    case "failed":
      return "blocked";
    default:
      return "todo";
  }
}

export function boardPriorityToQueuePriority(priority: string): number {
  switch (priority) {
    case "critical":
      return 1;
    case "high":
      return 3;
    case "low":
      return 7;
    default:
      return 5;
  }
}
