import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexCommand,
  executeCodex,
  parseCodexOutcome,
} from "../src/codex.js";
import { buildTaskPrompt } from "../src/prompt.js";

test("builds a task prompt with issue context and verification commands", () => {
  const prompt = buildTaskPrompt({
    issueId: "RUH-208",
    title: "Publish V1 boundary ADR and non-goals",
    description: "Use the current docs to publish the boundary ADR.",
    branchName: "codex/ruh-208-boundary-adr",
    verificationCommands: ["npm test", "npm run build"],
  });

  assert.match(prompt, /RUH-208/);
  assert.match(prompt, /Publish V1 boundary ADR and non-goals/);
  assert.match(prompt, /codex\/ruh-208-boundary-adr/);
  assert.match(prompt, /npm test/);
  assert.match(prompt, /Return JSON only/);
});

test("builds a codex exec command with model and cwd wiring", () => {
  const command = buildCodexCommand({
    model: "gpt-5.4",
    cwd: "/srv/openclaw-ruh",
    prompt: "Solve RUH-208",
  });

  assert.deepEqual(command, [
    "codex",
    "exec",
    "--model",
    "gpt-5.4",
    "--cd",
    "/srv/openclaw-ruh",
    "--dangerously-bypass-approvals-and-sandbox",
    "Solve RUH-208",
  ]);
});

test("parses a structured completed outcome", () => {
  const outcome = parseCodexOutcome(
    '{"status":"completed","summary":"Created ADR","verification":["npm test"],"commitSha":"abc123","prUrl":"https://github.com/ruh-ai/openclaw-ruh/pull/1"}',
  );

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.commitSha, "abc123");
});

test("downgrades invalid output to retryable failure", () => {
  const outcome = parseCodexOutcome("not json");

  assert.equal(outcome.status, "retryable_failure");
  assert.match(outcome.summary, /Failed to parse/);
});

test("returns a timeout outcome when the executor exceeds the deadline", async () => {
  const outcome = await executeCodex(
    {
      model: "gpt-5.4",
      cwd: "/srv/openclaw-ruh",
      prompt: "Solve RUH-208",
      timeoutMs: 10,
    },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { stdout: '{"status":"completed","summary":"late"}', stderr: "" };
    },
  );

  assert.equal(outcome.status, "retryable_failure");
  assert.match(outcome.summary, /timed out/i);
});
