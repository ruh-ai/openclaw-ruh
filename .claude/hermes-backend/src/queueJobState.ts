export function getEffectiveQueueJobStatus(queueStatus: string, taskStatus?: string | null): string {
  if ((queueStatus === "waiting" || queueStatus === "active") && taskStatus === "completed") {
    return "completed";
  }

  if ((queueStatus === "waiting" || queueStatus === "active") && taskStatus === "failed") {
    return "failed";
  }

  return queueStatus;
}
