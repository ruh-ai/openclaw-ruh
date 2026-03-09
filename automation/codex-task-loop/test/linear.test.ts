import test from "node:test";
import assert from "node:assert/strict";

import {
  formatLeaseComment,
  listIssuesCommand,
  mapIssueState,
  transitionIssueCommand,
} from "../src/linear.js";

test("builds the list issues command with codex label and state filters", () => {
  const command = listIssuesCommand({
    project: "openclaw-ruh",
    label: "codex",
    states: ["Todo", "Backlog"],
  });

  assert.deepEqual(command, [
    "npm",
    "run",
    "linear",
    "--",
    "issue",
    "list",
    "--project",
    "openclaw-ruh",
    "--all-assignees",
    "--sort",
    "priority",
    "--no-pager",
    "--label",
    "codex",
    "--state",
    "unstarted",
    "--state",
    "backlog",
  ]);
});

test("maps loop states to linear cli states", () => {
  assert.equal(mapIssueState("Todo"), "unstarted");
  assert.equal(mapIssueState("Backlog"), "backlog");
  assert.equal(mapIssueState("Started"), "started");
  assert.equal(mapIssueState("In Review"), "started");
  assert.equal(mapIssueState("Done"), "completed");
  assert.equal(mapIssueState("Blocked"), "triage");
});

test("formats a structured lease comment", () => {
  const comment = formatLeaseComment({
    issueId: "RUH-208",
    runId: "run-123",
    branchName: "codex/ruh-208-boundary-adr",
    hostname: "vm-1",
    startedAt: "2026-03-10T00:00:00.000Z",
  });

  assert.match(comment, /OpenClaw Codex lease/);
  assert.match(comment, /RUH-208/);
  assert.match(comment, /run-123/);
  assert.match(comment, /codex\/ruh-208-boundary-adr/);
  assert.match(comment, /vm-1/);
});

test("builds an issue transition command with a comment payload", () => {
  const command = transitionIssueCommand({
    issueId: "RUH-208",
    state: "In Review",
    comment: "PR created: https://github.com/example/pull/1",
  });

  assert.deepEqual(command, [
    "sh",
    "-lc",
    "npm run linear -- issue update RUH-208 --state started && npm run linear -- api 'mutation($issueId:String!,$body:String!){ commentCreate(input:{ issueId:$issueId, body:$body }){ success } }' --var issueId=RUH-208 --var body=\"PR created: https://github.com/example/pull/1\"",
  ]);
});
