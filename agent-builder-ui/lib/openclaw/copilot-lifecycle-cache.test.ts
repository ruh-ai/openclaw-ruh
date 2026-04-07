import { describe, expect, test, beforeEach } from "bun:test";

// Mock window + localStorage for Node/Bun environment
const storage = new Map<string, string>();
if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = globalThis;
}
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
  writable: true,
});

import {
  saveCoPilotLifecycleToCache,
  loadCoPilotLifecycleFromCache,
  clearCoPilotLifecycleCache,
} from "./copilot-lifecycle-cache";

const makeMockState = (overrides = {}) =>
  ({
    devStage: "review",
    maxUnlockedDevStage: "review",
    thinkStatus: "approved",
    userTriggeredThink: false,
    thinkRunId: "think-run-123",
    lastDispatchedThinkRunId: "think-run-123",
    planStatus: "approved",
    userTriggeredPlan: false,
    planRunId: "plan-run-456",
    lastDispatchedPlanRunId: "plan-run-456",
    buildStatus: "done",
    userTriggeredBuild: false,
    evalStatus: "idle",
    deployStatus: "idle",
    architecturePlan: null,
    buildReport: null,
    evalTasks: [],
    ...overrides,
  }) as any;

describe("copilot-lifecycle-cache", () => {
  beforeEach(() => {
    storage.clear();
  });

  test("save and load round-trips lifecycle fields", () => {
    saveCoPilotLifecycleToCache("agent-1", makeMockState());
    const loaded = loadCoPilotLifecycleFromCache("agent-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.devStage).toBe("review");
    expect(loaded!.maxUnlockedDevStage).toBe("review");
    expect(loaded!.buildStatus).toBe("done");
    expect(loaded!.thinkStatus).toBe("approved");
    expect(loaded!.lastDispatchedThinkRunId).toBe("think-run-123");
    expect(loaded!.lastDispatchedPlanRunId).toBe("plan-run-456");
  });

  test("returns null for unknown agent ID", () => {
    expect(loadCoPilotLifecycleFromCache("nonexistent")).toBeNull();
  });

  test("clear removes the entry", () => {
    saveCoPilotLifecycleToCache("agent-2", makeMockState());
    expect(loadCoPilotLifecycleFromCache("agent-2")).not.toBeNull();
    clearCoPilotLifecycleCache("agent-2");
    expect(loadCoPilotLifecycleFromCache("agent-2")).toBeNull();
  });

  test("expired entries (>2h) return null", () => {
    // Manually write an expired entry
    const entry = {
      version: 2,
      timestamp: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
      data: { devStage: "ship" },
    };
    storage.set("openclaw-copilot-lifecycle-agent-3", JSON.stringify(entry));
    expect(loadCoPilotLifecycleFromCache("agent-3")).toBeNull();
  });

  test("invalid JSON returns null", () => {
    storage.set("openclaw-copilot-lifecycle-agent-4", "not-json");
    expect(loadCoPilotLifecycleFromCache("agent-4")).toBeNull();
  });

  test("wrong version returns null", () => {
    const entry = {
      version: 999,
      timestamp: Date.now(),
      data: { devStage: "review" },
    };
    storage.set("openclaw-copilot-lifecycle-agent-5", JSON.stringify(entry));
    expect(loadCoPilotLifecycleFromCache("agent-5")).toBeNull();
  });

  test("sanitizes stale think trigger when think stage is not active", () => {
    const entry = {
      version: 4,
      timestamp: Date.now(),
      data: {
        ...makeMockState(),
        devStage: "plan",
        thinkStatus: "generating",
        userTriggeredThink: true,
        thinkRunId: "think-run-stale",
        lastDispatchedThinkRunId: null,
      },
    };
    storage.set("openclaw-copilot-lifecycle-agent-6", JSON.stringify(entry));

    const loaded = loadCoPilotLifecycleFromCache("agent-6");
    expect(loaded?.userTriggeredThink).toBe(false);
    expect(loaded?.thinkRunId).toBeNull();
  });

  test("sanitizes stale think trigger when already dispatched", () => {
    const entry = {
      version: 4,
      timestamp: Date.now(),
      data: {
        ...makeMockState(),
        devStage: "think",
        thinkStatus: "generating",
        userTriggeredThink: true,
        thinkRunId: "think-run-123",
        lastDispatchedThinkRunId: "think-run-123",
      },
    };
    storage.set("openclaw-copilot-lifecycle-agent-7", JSON.stringify(entry));

    const loaded = loadCoPilotLifecycleFromCache("agent-7");
    expect(loaded?.userTriggeredThink).toBe(false);
    expect(loaded?.thinkRunId).toBeNull();
  });

  test("keeps userTriggeredPlan only when plan stage is actively generating and undispatched", () => {
    // The sanitizer resets ANY "generating" status to "failed" on restore because
    // the SSE/WS connection is gone — an interrupted generation shows a retry button.
    // So even a valid undispatched plan trigger gets cleared.
    const entry = {
      version: 4,
      timestamp: Date.now(),
      data: {
        ...makeMockState(),
        devStage: "plan",
        thinkStatus: "done",
        planStatus: "generating",
        userTriggeredPlan: true,
        planRunId: "plan-run-456",
        lastDispatchedPlanRunId: null,
      },
    };
    storage.set("openclaw-copilot-lifecycle-agent-8", JSON.stringify(entry));

    const loaded = loadCoPilotLifecycleFromCache("agent-8");
    expect(loaded?.planStatus).toBe("failed");
    expect(loaded?.userTriggeredPlan).toBe(false);
    expect(loaded?.planRunId).toBeNull();
  });
});
