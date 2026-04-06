/**
 * skill-test-runner.ts — Executes skill smoke tests against the agent sandbox.
 *
 * Sends each test's input as a chat message to the agent container,
 * waits for the response (with timeout), applies the skill-specific
 * validation function, and falls back to heuristic validation.
 *
 * Integrates with the existing eval infrastructure: uses collectExecutionTrace
 * for real agent containers and skips explicitly until the sandbox is ready.
 */

import type { SkillTestCase } from "./skill-test-generator";
import type { SkillGraphNode } from "./types";
import { collectExecutionTrace } from "./eval-trace-collector";
import { TEST_STAGE_CONTAINER_NOT_READY_REASON } from "./test-stage-readiness";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SkillTestResult {
  testId: string;
  skillId: string;
  status: "pass" | "fail" | "skip" | "timeout";
  duration: number;
  response?: string;
  error?: string;
  reason: string;
}

export interface SkillTestRunnerConfig {
  /** The agent's sandbox container ID. When set, tests run against the real agent. */
  sandboxId: string | null;
  /** Session ID for chat routing. */
  sessionId: string;
  /** Skill graph for trace collection context. */
  skillGraph: SkillGraphNode[];
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

// ── Heuristic validation (fallback when no validateFn) ─────────────────────

function heuristicValidation(
  response: string,
  test: SkillTestCase,
): { pass: boolean; reason: string } {
  const lower = response.toLowerCase();

  // Fail on obvious errors
  const errorPatterns = [
    "internal server error",
    "something went wrong",
    "unhandled exception",
    "cannot read properties of",
    "typeerror:",
    "referenceerror:",
  ];
  for (const pattern of errorPatterns) {
    if (lower.includes(pattern)) {
      return { pass: false, reason: `Response contains error: "${pattern}"` };
    }
  }

  // Check minimum response length
  if (response.trim().length < 50) {
    return {
      pass: false,
      reason: `Response too short (${response.trim().length} chars) — expected at least 50 characters of substantive content`,
    };
  }

  // Check that it's not a generic refusal
  const refusalPatterns = [
    "i cannot help with that",
    "i'm not able to",
    "that's outside my capabilities",
    "i don't have access to",
  ];
  const isRefusal = refusalPatterns.some((p) => lower.includes(p));

  // A refusal is valid when the skill needs unconfigured env vars
  if (isRefusal && test.needsConfig) {
    return {
      pass: true,
      reason: "Agent correctly indicates missing configuration for this skill",
    };
  }

  if (isRefusal) {
    return {
      pass: false,
      reason: "Agent refused the request — skill may not be properly activated",
    };
  }

  // Extract keywords from the expected behavior for loose matching
  const expectedWords = test.expectedBehavior
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4);
  const matchedWords = expectedWords.filter((w) => lower.includes(w));
  const matchRatio = expectedWords.length > 0
    ? matchedWords.length / expectedWords.length
    : 0;

  if (matchRatio > 0.2) {
    return {
      pass: true,
      reason: `Response matches ${matchedWords.length}/${expectedWords.length} expected keywords`,
    };
  }

  // Substantive non-error response is a pass for smoke tests
  if (response.trim().length > 100) {
    return {
      pass: true,
      reason: "Response is substantive (100+ chars, no errors detected)",
    };
  }

  return {
    pass: false,
    reason: "Response did not meet smoke test expectations — too short or missing expected content",
  };
}

// ── Single test execution ──────────────────────────────────────────────────

/**
 * Run a single skill test against the agent sandbox.
 */
export async function runSkillTest(
  test: SkillTestCase,
  config: SkillTestRunnerConfig,
): Promise<SkillTestResult> {
  if (!config.sandboxId) {
    return {
      testId: test.id,
      skillId: test.skillId,
      status: "skip",
      duration: 0,
      reason: TEST_STAGE_CONTAINER_NOT_READY_REASON,
    };
  }

  // Skip tests that need configuration the environment doesn't have
  if (test.needsConfig && test.missingEnv?.length) {
    return {
      testId: test.id,
      skillId: test.skillId,
      status: "skip",
      duration: 0,
      reason: `Skipped — requires environment variables: ${test.missingEnv.join(", ")}`,
    };
  }

  const startTime = Date.now();

  try {
    const trace = await collectExecutionTrace({
      sandboxId: config.sandboxId,
      sessionId: config.sessionId,
      message: test.input,
      skillGraph: config.skillGraph,
      signal: config.signal,
    });
    const response = trace.response;

    const duration = Date.now() - startTime;

    // Check for timeout (response came back but took too long)
    if (duration > test.timeout) {
      return {
        testId: test.id,
        skillId: test.skillId,
        status: "timeout",
        duration,
        response,
        reason: `Response took ${Math.round(duration / 1000)}s — exceeds ${Math.round(test.timeout / 1000)}s timeout`,
      };
    }

    // Apply skill-specific validator if provided, fall back to heuristics
    const validation = test.validateFn
      ? test.validateFn(response)
      : heuristicValidation(response, test);

    return {
      testId: test.id,
      skillId: test.skillId,
      status: validation.pass ? "pass" : "fail",
      duration,
      response,
      reason: validation.reason,
    };
  } catch (err) {
    const duration = Date.now() - startTime;

    // Cancelled via abort signal
    if (config.signal?.aborted) {
      return {
        testId: test.id,
        skillId: test.skillId,
        status: "skip",
        duration,
        reason: "Test cancelled",
      };
    }

    // Timeout via fetch/network
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" ||
        err.message.includes("timeout") ||
        err.message.includes("TIMEOUT"));

    if (isTimeout) {
      return {
        testId: test.id,
        skillId: test.skillId,
        status: "timeout",
        duration,
        error: err instanceof Error ? err.message : "Timeout",
        reason: `Request timed out after ${Math.round(duration / 1000)}s`,
      };
    }

    return {
      testId: test.id,
      skillId: test.skillId,
      status: "fail",
      duration,
      error: err instanceof Error ? err.message : "Unknown error",
      reason: `Execution error: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ── Batch test execution ───────────────────────────────────────────────────

/**
 * Run all skill tests sequentially, reporting progress after each.
 */
export async function runAllSkillTests(
  tests: SkillTestCase[],
  config: SkillTestRunnerConfig,
  onProgress?: (result: SkillTestResult, index: number, total: number) => void,
): Promise<SkillTestResult[]> {
  const results: SkillTestResult[] = [];

  for (let i = 0; i < tests.length; i++) {
    if (config.signal?.aborted) break;

    const result = await runSkillTest(tests[i], config);
    results.push(result);
    onProgress?.(result, i, tests.length);
  }

  return results;
}

// ── Summary helpers ────────────────────────────────────────────────────────

export interface SkillTestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  passRate: number;
  avgDuration: number;
}

export function summarizeSkillTests(results: SkillTestResult[]): SkillTestSummary {
  const total = results.length;
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const timedOut = results.filter((r) => r.status === "timeout").length;
  const executedResults = results.filter((r) => r.status !== "skip");
  const avgDuration = executedResults.length > 0
    ? executedResults.reduce((sum, r) => sum + r.duration, 0) / executedResults.length
    : 0;
  const scorable = total - skipped;

  return {
    total,
    passed,
    failed,
    skipped,
    timedOut,
    passRate: scorable > 0 ? passed / scorable : 0,
    avgDuration: Math.round(avgDuration),
  };
}
