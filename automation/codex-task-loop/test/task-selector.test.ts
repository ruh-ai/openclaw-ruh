import test from "node:test";
import assert from "node:assert/strict";

import { selectTask } from "../src/task-selector.js";
import type { TaskLease } from "../src/lease-store.js";

const baseIssues = [
  {
    id: "RUH-208",
    title: "Publish V1 boundary ADR and non-goals",
    description: "Create one decision note.",
    priority: 1,
    state: "Todo",
    labels: ["codex", "platform"],
    blockedBy: [],
  },
  {
    id: "RUH-212",
    title: "Decide monorepo topology and package boundaries",
    description: "Lock the package layout.",
    priority: 1,
    state: "Todo",
    labels: ["platform"],
    blockedBy: [],
  },
  {
    id: "RUH-213",
    title: "Scaffold workspace tooling and CI baseline",
    description: "Set up tooling.",
    priority: 1,
    state: "Todo",
    labels: ["codex", "platform"],
    blockedBy: ["RUH-212"],
  },
  {
    id: "RUH-266",
    title: "Stand up authentication controls",
    description: "Implement auth baselines.",
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
        title: "Scaffold workspace tooling and CI baseline",
        description: "Set up tooling.",
        priority: 1,
        state: "Todo",
        labels: ["codex", "platform"],
        blockedBy: ["RUH-212"],
      },
      {
        id: "RUH-266",
        title: "Stand up authentication controls",
        description: "Implement auth baselines.",
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
        title: "Already in progress task",
        description: "This task has started.",
        priority: 1,
        state: "Started",
        labels: ["codex"],
        blockedBy: [],
      },
      {
        id: "RUH-321",
        title: "Non-codex planning task",
        description: "Not eligible for automation.",
        priority: 1,
        state: "Todo",
        labels: ["platform"],
        blockedBy: [],
      },
    ],
  });

  assert.equal(selected, null);
});
