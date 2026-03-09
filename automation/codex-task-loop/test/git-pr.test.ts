import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBranchName,
  buildCommitMessage,
  createPullRequestCommand,
  detectMergeState,
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

test("detects merged pull requests from gh json output", () => {
  assert.equal(detectMergeState('{"state":"MERGED"}'), true);
  assert.equal(detectMergeState('{"state":"OPEN"}'), false);
});
