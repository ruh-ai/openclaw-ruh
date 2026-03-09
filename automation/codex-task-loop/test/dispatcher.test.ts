import test from "node:test";
import assert from "node:assert/strict";

import { dispatchTick } from "../src/dispatcher.js";
import type { TaskLease } from "../src/lease-store.js";
import type { LinearIssueSummary } from "../src/linear.js";

function issue(overrides: Partial<LinearIssueSummary> = {}): LinearIssueSummary {
  return {
    id: "RUH-208",
    title: "Publish V1 boundary ADR and non-goals",
    description: "Create one decision note.",
    priority: 1,
    state: "Todo",
    labels: ["codex"],
    blockedBy: [],
    ...overrides,
  };
}

function lease(overrides: Partial<TaskLease> = {}): TaskLease {
  return {
    issueId: "RUH-208",
    branchName: "codex/ruh-208",
    runId: "run-1",
    hostname: "vm-1",
    startedAt: "2026-03-10T00:00:00.000Z",
    heartbeatAt: "2026-03-10T00:05:00.000Z",
    retryCount: 0,
    ...overrides,
  };
}

test("returns idle when there are no actionable issues", async () => {
  const result = await dispatchTick({
    now: "2026-03-10T00:10:00.000Z",
    leaseStore: { read: async () => null, write: async () => {}, renew: async () => {}, release: async () => {} },
    linearAdapter: {
      listEligibleIssues: async () => [],
      transitionIssue: async () => {},
      commentOnIssue: async () => {},
    },
    codexExecutor: async () => ({ status: "noop", summary: "nothing", verification: [] }),
    gitPrAdapter: {
      findMergedPullRequest: async () => false,
      openOrUpdatePullRequest: async () => null,
    },
    branchFactory: () => "codex/ruh-208",
    runIdFactory: () => "run-1",
    hostname: "vm-1",
  });

  assert.equal(result.status, "idle");
});

test("picks an issue, starts it, and records a lease", async () => {
  let writtenLease: TaskLease | null = null;
  const transitions: string[] = [];

  const result = await dispatchTick({
    now: "2026-03-10T00:10:00.000Z",
    leaseStore: {
      read: async () => null,
      write: async (value: TaskLease) => {
        writtenLease = value;
      },
      renew: async () => {},
      release: async () => {},
    },
    linearAdapter: {
      listEligibleIssues: async () => [issue()],
      transitionIssue: async (issueId: string, state: string) => {
        transitions.push(`${issueId}:${state}`);
      },
      commentOnIssue: async () => {},
    },
    codexExecutor: async () => ({ status: "noop", summary: "nothing", verification: [] }),
    gitPrAdapter: {
      findMergedPullRequest: async () => false,
      openOrUpdatePullRequest: async () => null,
    },
    branchFactory: () => "codex/ruh-208",
    runIdFactory: () => "run-1",
    hostname: "vm-1",
  });

  assert.equal(result.status, "started");
  assert.equal(transitions[0], "RUH-208:Started");
  assert.ok(writtenLease !== null);
  assert.equal((writtenLease as TaskLease).issueId, "RUH-208");
});

test("resumes an active lease and moves to in review when a pr exists", async () => {
  const transitions: string[] = [];
  let released = false;

  const result = await dispatchTick({
    now: "2026-03-10T00:10:00.000Z",
    leaseStore: {
      read: async () => lease(),
      write: async () => {},
      renew: async () => {},
      release: async () => {
        released = true;
      },
    },
    linearAdapter: {
      listEligibleIssues: async () => [issue({ state: "Started" })],
      transitionIssue: async (issueId: string, state: string) => {
        transitions.push(`${issueId}:${state}`);
      },
      commentOnIssue: async () => {},
    },
    codexExecutor: async () => ({ status: "completed", summary: "done", verification: ["npm test"], commitSha: "abc123" }),
    gitPrAdapter: {
      findMergedPullRequest: async () => false,
      openOrUpdatePullRequest: async () => "https://github.com/ruh-ai/openclaw-ruh/pull/1",
    },
    branchFactory: () => "codex/ruh-208",
    runIdFactory: () => "run-1",
    hostname: "vm-1",
  });

  assert.equal(result.status, "in_review");
  assert.equal(transitions[0], "RUH-208:In Review");
  assert.equal(released, false);
});

test("marks the issue done and releases the lease when the pr is already merged", async () => {
  const transitions: string[] = [];
  let released = false;

  const result = await dispatchTick({
    now: "2026-03-10T00:10:00.000Z",
    leaseStore: {
      read: async () => lease(),
      write: async () => {},
      renew: async () => {},
      release: async () => {
        released = true;
      },
    },
    linearAdapter: {
      listEligibleIssues: async () => [issue({ state: "In Review" })],
      transitionIssue: async (issueId: string, state: string) => {
        transitions.push(`${issueId}:${state}`);
      },
      commentOnIssue: async () => {},
    },
    codexExecutor: async () => ({ status: "noop", summary: "noop", verification: [] }),
    gitPrAdapter: {
      findMergedPullRequest: async () => true,
      openOrUpdatePullRequest: async () => null,
    },
    branchFactory: () => "codex/ruh-208",
    runIdFactory: () => "run-1",
    hostname: "vm-1",
  });

  assert.equal(result.status, "done");
  assert.equal(transitions[0], "RUH-208:Done");
  assert.equal(released, true);
});

test("blocks the issue when retry budget is exhausted", async () => {
  const transitions: string[] = [];
  let released = false;

  const result = await dispatchTick({
    now: "2026-03-10T00:10:00.000Z",
    leaseStore: {
      read: async () => lease({ retryCount: 2 }),
      write: async () => {},
      renew: async () => {},
      release: async () => {
        released = true;
      },
    },
    linearAdapter: {
      listEligibleIssues: async () => [issue({ state: "Started" })],
      transitionIssue: async (issueId: string, state: string) => {
        transitions.push(`${issueId}:${state}`);
      },
      commentOnIssue: async () => {},
    },
    codexExecutor: async () => ({ status: "retryable_failure", summary: "test failure", verification: [] }),
    gitPrAdapter: {
      findMergedPullRequest: async () => false,
      openOrUpdatePullRequest: async () => null,
    },
    branchFactory: () => "codex/ruh-208",
    runIdFactory: () => "run-1",
    hostname: "vm-1",
    maxRetries: 2,
  });

  assert.equal(result.status, "blocked");
  assert.equal(transitions[0], "RUH-208:Blocked");
  assert.equal(released, true);
});

test("increments retry count when a retryable failure stays within budget", async () => {
  let writtenRetryCount = -1;
  let writtenHeartbeatAt = "";

  const result = await dispatchTick({
    now: "2026-03-10T00:10:00.000Z",
    leaseStore: {
      read: async () => lease({ retryCount: 0 }),
      write: async (value: TaskLease) => {
        writtenRetryCount = value.retryCount;
        writtenHeartbeatAt = value.heartbeatAt;
      },
      renew: async () => {},
      release: async () => {},
    },
    linearAdapter: {
      listEligibleIssues: async () => [issue({ state: "Started" })],
      transitionIssue: async () => {},
      commentOnIssue: async () => {},
    },
    codexExecutor: async () => ({ status: "retryable_failure", summary: "temporary failure", verification: [] }),
    gitPrAdapter: {
      findMergedPullRequest: async () => false,
      openOrUpdatePullRequest: async () => null,
    },
    branchFactory: () => "codex/ruh-208",
    runIdFactory: () => "run-1",
    hostname: "vm-1",
    maxRetries: 2,
  });

  assert.equal(result.status, "started");
  assert.equal(writtenRetryCount, 1);
  assert.equal(writtenHeartbeatAt, "2026-03-10T00:10:00.000Z");
});

test("moves the issue to blocked when codex reports a terminal blocker", async () => {
  const transitions: string[] = [];
  let released = false;

  const result = await dispatchTick({
    now: "2026-03-10T00:10:00.000Z",
    leaseStore: {
      read: async () => lease(),
      write: async () => {},
      renew: async () => {},
      release: async () => {
        released = true;
      },
    },
    linearAdapter: {
      listEligibleIssues: async () => [issue({ state: "Started" })],
      transitionIssue: async (issueId: string, state: string) => {
        transitions.push(`${issueId}:${state}`);
      },
      commentOnIssue: async () => {},
    },
    codexExecutor: async () => ({ status: "blocked", summary: "Needs missing spec", verification: [] }),
    gitPrAdapter: {
      findMergedPullRequest: async () => false,
      openOrUpdatePullRequest: async () => null,
    },
    branchFactory: () => "codex/ruh-208",
    runIdFactory: () => "run-1",
    hostname: "vm-1",
  });

  assert.equal(result.status, "blocked");
  assert.equal(transitions[0], "RUH-208:Blocked");
  assert.equal(released, true);
});
