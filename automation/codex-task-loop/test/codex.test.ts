import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

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
    "-c",
    'mcp_servers={}',
    "-c",
    'model_reasoning_effort=\"high\"',
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

test("normalizes a success outcome to completed", () => {
  const outcome = parseCodexOutcome(
    '{"status":"success","summary":"Created ADR","verification":["npm test"],"commitSha":"abc123","prUrl":"https://github.com/ruh-ai/openclaw-ruh/pull/1"}',
  );

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.prUrl, "https://github.com/ruh-ai/openclaw-ruh/pull/1");
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

test("reads the final codex message from the output file instead of stdout logs", async () => {
  const outcome = await executeCodex(
    {
      model: "gpt-5.4",
      cwd: "/srv/openclaw-ruh",
      prompt: "Solve RUH-208",
      timeoutMs: 1000,
    },
    async (command) => {
      const outputPathIndex = command.indexOf("--output-last-message");
      assert.notEqual(outputPathIndex, -1);
      const outputPath = command[outputPathIndex + 1];
      assert.ok(outputPath);
      await writeFile(
        outputPath,
        '{"status":"completed","summary":"Created ADR","verification":["npm test"],"commitSha":"abc123","prUrl":"https://github.com/ruh-ai/openclaw-ruh/pull/2"}',
      );

      return {
        stdout: '[2026-03-09T23:08:51] noisy codex logs\n{"status":"success"}',
        stderr: "",
      };
    },
  );

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.commitSha, "abc123");
  assert.equal(outcome.prUrl, "https://github.com/ruh-ai/openclaw-ruh/pull/2");
});
