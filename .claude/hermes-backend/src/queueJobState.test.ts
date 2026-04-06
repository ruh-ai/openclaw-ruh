import { describe, expect, it } from "bun:test";
import { getEffectiveQueueJobStatus } from "./queueJobState";

describe("getEffectiveQueueJobStatus", () => {
  it("keeps raw queue status when the task is still pending work", () => {
    expect(getEffectiveQueueJobStatus("active", "running")).toBe("active");
    expect(getEffectiveQueueJobStatus("waiting", "pending")).toBe("waiting");
  });

  it("marks active queue jobs completed when the task already completed", () => {
    expect(getEffectiveQueueJobStatus("active", "completed")).toBe("completed");
  });

  it("marks waiting or active queue jobs failed when the task already failed", () => {
    expect(getEffectiveQueueJobStatus("active", "failed")).toBe("failed");
    expect(getEffectiveQueueJobStatus("waiting", "failed")).toBe("failed");
  });
});
