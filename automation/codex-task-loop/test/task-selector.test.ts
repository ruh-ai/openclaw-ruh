import test from "node:test";
import assert from "node:assert/strict";

import { selectTask } from "../src/task-selector.js";
import type { TaskLease } from "../src/lease-store.js";

const baseIssues = [
  {
    id: "RUH-208",
    priority: 1,
    state: "Todo",
    labels: ["codex", "platform"],
    blockedBy: [],
  },
  {
    id: "RUH-212",
    priority: 1,
    state: "Todo",
    labels: ["platform"],
    blockedBy: [],
  },
  {
    id: "RUH-213",
    priority: 1,
    state: "Todo",
    labels: ["codex", "platform"],
    blockedBy: ["RUH-212"],
  },
  {
    id: "RUH-266",
    priority: 2,
    state: "Backlog",
    labels: ["codex", "security"],
    blockedBy: [],
  },
] as const;

test("filters to codex labeled todo or backlog issues and picks the highest priority", () => {
  const selected = selectTask({
    issues: baseIssues,
  });

  assert.equal(selected?.id, "RUH-208");
});

test("resumes the currently leased issue before picking a new one", () => {
  const lease: TaskLease = {
    issueId: "RUH-266",
    branchName: "codex/ruh-266",
    runId: "run-266",
    hostname: "vm-1",
    startedAt: "2026-03-10T00:00:00.000Z",
    heartbeatAt: "2026-03-10T00:05:00.000Z",
    retryCount: 0,
  };

  const selected = selectTask({
    issues: baseIssues,
    activeLease: lease,
  });

  assert.equal(selected?.id, "RUH-266");
});

test("skips issues with unresolved blockers", () => {
  const selected = selectTask({
    issues: [
      {
        id: "RUH-213",
        priority: 1,
        state: "Todo",
        labels: ["codex", "platform"],
        blockedBy: ["RUH-212"],
      },
      {
        id: "RUH-266",
        priority: 2,
        state: "Backlog",
        labels: ["codex", "security"],
        blockedBy: [],
      },
    ],
  });

  assert.equal(selected?.id, "RUH-266");
});

test("returns null when there are no actionable issues", () => {
  const selected = selectTask({
    issues: [
      {
        id: "RUH-320",
        priority: 1,
        state: "Started",
        labels: ["codex"],
        blockedBy: [],
      },
      {
        id: "RUH-321",
        priority: 1,
        state: "Todo",
        labels: ["platform"],
        blockedBy: [],
      },
    ],
  });

  assert.equal(selected, null);
});
