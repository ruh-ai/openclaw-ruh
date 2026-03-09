import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIssuesQueryCommand,
  commentOnIssueCommand,
  formatLeaseComment,
  labelIssueCommand,
  listIssuesCommand,
  mapIssueState,
  parseIssuesResponse,
  projectIssuesQueryCommand,
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
    "--silent",
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

test("builds the graphql issue query command", () => {
  const command = buildIssuesQueryCommand("openclaw-ruh", "codex");

  assert.deepEqual(command, [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "api",
    "query EligibleIssues($project:String!,$label:String!){ issues(filter:{ project:{ name:{ eq:$project } }, labels:{ some:{ name:{ eq:$label } } } }, first:100){ nodes { identifier title description priority state { name } labels { nodes { name } } } } }",
    "--variables-json",
    "{\"project\":\"openclaw-ruh\",\"label\":\"codex\"}",
  ]);
});

test("maps loop states to linear cli states", () => {
  assert.equal(mapIssueState("Todo"), "Todo");
  assert.equal(mapIssueState("Backlog"), "Backlog");
  assert.equal(mapIssueState("Started"), "In Development");
  assert.equal(mapIssueState("In Review"), "CODE REVIEW");
  assert.equal(mapIssueState("Done"), "Done");
  assert.equal(mapIssueState("Blocked"), "ON HOLD");
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

test("builds a project issue query without a codex label filter", () => {
  const command = projectIssuesQueryCommand("openclaw-ruh");

  assert.deepEqual(command, [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "api",
    "query ProjectIssues($project:String!){ issues(filter:{ project:{ name:{ eq:$project } } }, first:100){ nodes { identifier title description priority state { name } labels { nodes { name } } } } }",
    "--variables-json",
    "{\"project\":\"openclaw-ruh\"}",
  ]);
});

test("builds an issue transition command", () => {
  const command = transitionIssueCommand({
    issueId: "RUH-208",
    state: "In Review",
  });

  assert.deepEqual(command, [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "issue",
    "update",
    "RUH-208",
    "--state",
    "CODE REVIEW",
  ]);
});

test("builds an issue comment command", () => {
  const command = commentOnIssueCommand("RUH-208", "PR created: https://github.com/example/pull/1");

  assert.deepEqual(command, [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "issue",
    "comment",
    "add",
    "RUH-208",
    "--body",
    "PR created: https://github.com/example/pull/1",
  ]);
});

test("builds an issue label command", () => {
  const command = labelIssueCommand("RUH-208", "codex");

  assert.deepEqual(command, [
    "npm",
    "run",
    "--silent",
    "linear",
    "--",
    "issue",
    "update",
    "RUH-208",
    "--label",
    "codex",
  ]);
});

test("parses graphql issues into loop summaries", () => {
  const issues = parseIssuesResponse(
    '{"data":{"issues":{"nodes":[{"identifier":"RUH-208","title":"Publish V1 boundary ADR and non-goals","description":"Create one decision note.","priority":1,"state":{"name":"Todo"},"labels":{"nodes":[{"name":"codex"},{"name":"platform"}]}}]}}}',
  );

  assert.deepEqual(issues, [
    {
      id: "RUH-208",
      title: "Publish V1 boundary ADR and non-goals",
      description: "Create one decision note.",
      priority: 1,
      state: "Todo",
      labels: ["codex", "platform"],
      blockedBy: [],
    },
  ]);
});
