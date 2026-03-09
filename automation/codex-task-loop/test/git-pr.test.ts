import test from "node:test";
import assert from "node:assert/strict";

import {
  addPullRequestLabelsCommand,
  buildBranchName,
  buildCommitMessage,
  createPullRequestCommand,
  detectMergeState,
  findMergedPullRequestCommand,
  findPullRequestByHeadCommand,
  parsePullRequestList,
  parsePullRequestUrl,
  pushBranchCommand,
  updatePullRequestCommand,
} from "../src/git-pr.js";

test("builds a stable branch name from the issue id and title", () => {
  assert.equal(
    buildBranchName("RUH-208", "Publish V1 boundary ADR and non-goals"),
    "codex/ruh-208-publish-v1-boundary-adr-and-non-goals",
  );
});

test("builds a scoped commit message", () => {
  assert.equal(
    buildCommitMessage("RUH-208", "Publish V1 boundary ADR and non-goals"),
    "feat(ruh-208): publish v1 boundary adr and non-goals",
  );
});

test("builds the branch push command", () => {
  assert.deepEqual(pushBranchCommand("codex/ruh-208-boundary"), [
    "git",
    "push",
    "--set-upstream",
    "origin",
    "codex/ruh-208-boundary",
  ]);
});

test("builds the pull request creation command", () => {
  assert.deepEqual(
    createPullRequestCommand({
      base: "main",
      head: "codex/ruh-208-boundary",
      title: "RUH-208: Publish V1 boundary ADR and non-goals",
      body: "Automated implementation for RUH-208",
    }),
    [
      "gh",
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      "codex/ruh-208-boundary",
      "--title",
      "RUH-208: Publish V1 boundary ADR and non-goals",
      "--body",
      "Automated implementation for RUH-208",
    ],
  );
});

test("builds the pull request update command", () => {
  assert.deepEqual(
    updatePullRequestCommand({
      prNumber: 12,
      title: "RUH-208: Publish V1 boundary ADR and non-goals",
      body: "Updated automation output",
    }),
    [
      "gh",
      "pr",
      "edit",
      "12",
      "--title",
      "RUH-208: Publish V1 boundary ADR and non-goals",
      "--body",
      "Updated automation output",
    ],
  );
});

test("builds the pull request lookup command by head branch", () => {
  assert.deepEqual(findPullRequestByHeadCommand("codex/ruh-208-boundary"), [
    "gh",
    "pr",
    "list",
    "--head",
    "codex/ruh-208-boundary",
    "--state",
    "all",
    "--limit",
    "1",
    "--json",
    "number,url,state",
  ]);
});

test("builds the merged pull request lookup command by issue id", () => {
  assert.deepEqual(findMergedPullRequestCommand("RUH-208"), [
    "gh",
    "pr",
    "list",
    "--search",
    "RUH-208 in:title",
    "--state",
    "merged",
    "--limit",
    "1",
    "--json",
    "number,url,state",
  ]);
});

test("builds the automation label command for pull requests", () => {
  assert.deepEqual(addPullRequestLabelsCommand(12), [
    "gh",
    "pr",
    "edit",
    "12",
    "--add-label",
    "codex",
    "--add-label",
    "codex-automation",
  ]);
});

test("parses the first pull request from gh json output", () => {
  assert.deepEqual(
    parsePullRequestList('[{"number":12,"url":"https://github.com/ruh-ai/openclaw-ruh/pull/12","state":"OPEN"}]'),
    {
      number: 12,
      url: "https://github.com/ruh-ai/openclaw-ruh/pull/12",
      state: "OPEN",
    },
  );
});

test("parses a pull request number from a pr url", () => {
  assert.equal(
    parsePullRequestUrl("https://github.com/ruh-ai/openclaw-ruh/pull/12")?.number,
    12,
  );
});

test("detects merged pull requests from gh json output", () => {
  assert.equal(detectMergeState('{"state":"MERGED"}'), true);
  assert.equal(detectMergeState('{"state":"OPEN"}'), false);
});
