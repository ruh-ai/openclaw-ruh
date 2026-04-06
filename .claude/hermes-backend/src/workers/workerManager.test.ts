import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockGetScheduledTaskByName = mock(async (_name: string) => null);

mock.module("../stores/scheduledTaskStore", () => ({
  getScheduledTaskByName: mockGetScheduledTaskByName,
}));

const { shouldRunBuiltInSchedule } = await import("./workerManager");

beforeEach(() => {
  mockGetScheduledTaskByName.mockReset();
});

describe("shouldRunBuiltInSchedule", () => {
  it("returns false when the persisted built-in schedule is disabled", async () => {
    mockGetScheduledTaskByName.mockResolvedValue({
      id: "sched-1",
      name: "strategist-assessment",
      description: "Assess system health",
      cronExpression: "0 */8 * * *",
      agentName: "strategist",
      priority: 5,
      timeoutMs: 600000,
      enabled: false,
      lastRunAt: null,
      nextRunAt: null,
      runCount: 0,
      createdAt: "2026-04-03T00:00:00.000Z",
    } as any);

    await expect(shouldRunBuiltInSchedule("strategist-assessment")).resolves.toBe(false);
    expect(mockGetScheduledTaskByName).toHaveBeenCalledWith("strategist-assessment");
  });

  it("defaults to true when the built-in schedule row does not exist", async () => {
    mockGetScheduledTaskByName.mockResolvedValue(null);

    await expect(shouldRunBuiltInSchedule("analyst-sweep")).resolves.toBe(true);
    expect(mockGetScheduledTaskByName).toHaveBeenCalledWith("analyst-sweep");
  });
});
