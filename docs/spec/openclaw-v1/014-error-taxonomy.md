# 014 — Error Taxonomy and Retry Strategy

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/error.schema.json`](schemas/error.schema.json)

Every error a pipeline produces — LLM call failures, tool execution failures, gateway disconnects, sandbox crashes, malformed model output, rate limits — maps to a fixed category with a known retry policy and recovery action. **There is no "untyped error" in OpenClaw.** Anything that escapes typed handling is a defect to fix in the next spec patch.

---

## Purpose

Two pipelines built against the same spec must classify the same error the same way. Without a fixed taxonomy, each pipeline reinvents retry logic and the platform fragments. With it:

- The runtime applies one retry policy across every tool, every LLM call, every sub-agent call
- The decision log captures structured error events that are queryable across pipelines
- Coding agents authoring new tools/skills don't reinvent error handling — they declare which categories their tool can produce
- Humans reviewing failures see consistent error messaging in the dashboard regardless of where the error originated

## The taxonomy

Every error classifies into exactly one of these categories:

| Category | What it means | Retryable | Recovery action |
|---|---|---|---|
| `context_too_long` | Prompt exceeds the model's context window | Yes | Compact context (auto → reactive → snip) |
| `rate_limit` | LLM provider returned 429 / quota exceeded | Yes | Wait + retry with backoff |
| `auth_error` | LLM provider rejected credentials | No | Surface to human; no retry |
| `gateway_timeout` | Sandbox gateway didn't respond within deadline | Yes | Extend timeout, retry |
| `malformed_response` | Model returned unparseable output (invalid JSON, broken markers) | Yes | Simplify prompt, retry |
| `tool_execution_failure` | A tool's `call()` threw or returned `success: false` | Yes (limited) | Provide error context to next attempt |
| `sandbox_unavailable` | Container down, gateway unreachable, 502/503 | Yes | Wait for recovery, retry |
| `model_refusal` | Provider's content filter or "could not generate" response | Yes (limited) | Simplify prompt, retry |
| `network_error` | DNS, ECONNRESET, fetch failed | Yes | Wait + retry |
| `manifest_invalid` | Agent manifest fails schema or drift check | No | Surface to architect for regeneration |
| `permission_denied` | Tool permission check failed (no approval path) | No | Surface to human; agent must change approach |
| `eval_failure` | Eval task scored below acceptance threshold | No | Trigger reflection (see eval loop) |
| `unknown` | None of the above; pattern matchers found no signature | Yes (cautious) | Provide error context to next attempt; flag for spec evolution |

### Why these and not others

The categories are derived from real failure modes observed in the OpenClaw runtime over months of production use. New categories require a [versioning](100-versioning.md) bump (minor); they cannot be silently added by individual tool authors.

`unknown` is the trapdoor. When it fires often in production, that's a signal a new category is missing. The decision log surfaces `unknown` rate as a metric (see [005](005-decision-log.md)).

## Classification

The runtime classifies errors via pattern matching against the error message. Each category declares one or more patterns:

```ts
interface PatternRule {
  patterns: string[];          // case-insensitive substring matches
  category: ErrorCategory;
  retryable: boolean;
  userMessage(original: string): string;  // human-friendly explanation
}
```

Patterns are checked in declaration order; the first match wins. The runtime ships with the canonical pattern set; pipelines may extend it via [hooks](013-hooks.md), but only additively (new patterns for `unknown`-currently or for new categories).

### Pattern set (canonical)

| Category | Patterns (lowercase substring) |
|---|---|
| `auth_error` | `authentication_error`, `failed to authenticate`, `api error: 401`, `invalid x-api-key`, `invalid api key`, `invalid_api_key`, `unauthorized` |
| `context_too_long` | `context_length`, `prompt is too long`, `maximum context length`, `token limit` |
| `rate_limit` | `rate_limit`, `rate limit`, `429`, `too many requests`, `quota exceeded` |
| `model_refusal` | `failed_generation`, `failed to call a function`, `content_filter`, `model refused` |
| `gateway_timeout` | `timeout`, `timed out`, `econnreset`, `socket hang up`, `gateway timeout` |
| `sandbox_unavailable` | `sandbox not found`, `container not running`, `no such container`, `sandbox unavailable`, `502`, `503`, `service unavailable` |
| `malformed_response` | `json`, `parse error`, `unexpected token`, `malformed`, `invalid json` |
| `network_error` | `econnrefused`, `enotfound`, `network`, `fetch failed`, `dns` |
| `manifest_invalid` | `manifest`, `schema validation failed`, `manifest drift`, `tool_kind unknown` |
| `permission_denied` | `permission denied`, `requires approval`, `not allowed in build mode` |

### Tool errors

When a tool throws or returns `success: false`, the classifier first runs the standard pattern set. If no match, the error is reclassified as `tool_execution_failure` with the tool name preserved in the user message. This lets retry policy distinguish "tool hit a rate limit downstream" (retryable as `rate_limit`) from "tool's logic failed" (retryable a few times as `tool_execution_failure`, then escalate).

## `ClassifiedError`

```ts
interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  originalMessage: string;     // raw error, kept for debugging
  userMessage: string;         // safe to show in dashboard / surface to agent
  toolName?: string;           // populated when classification was via classifyToolError
  recovery?: RecoveryAction;   // attached after recovery resolution
}
```

The runtime emits a `ClassifiedError` to the decision log every time it classifies (success or failure path). The agent receives `userMessage` for self-correction; humans see both in the dashboard.

## Retry strategy

Each category has retry parameters. The runtime applies them automatically through `withRetry()`:

```ts
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;       // exponential backoff multiplier per attempt
}
```

### Default retry config (canonical)

| Category | maxAttempts | baseDelayMs | maxDelayMs | backoffFactor |
|---|---:|---:|---:|---:|
| `context_too_long` | 2 | 0 | 0 | 1 |
| `rate_limit` | 4 | 2000 | 30000 | 2 |
| `auth_error` | 1 | 0 | 0 | 1 |
| `gateway_timeout` | 3 | 3000 | 15000 | 1.5 |
| `malformed_response` | 2 | 500 | 2000 | 1 |
| `tool_execution_failure` | 2 | 1000 | 5000 | 1.5 |
| `sandbox_unavailable` | 3 | 5000 | 20000 | 2 |
| `model_refusal` | 2 | 1000 | 5000 | 1 |
| `network_error` | 3 | 2000 | 10000 | 2 |
| `manifest_invalid` | 1 | 0 | 0 | 1 |
| `permission_denied` | 1 | 0 | 0 | 1 |
| `eval_failure` | 1 | 0 | 0 | 1 |
| `unknown` | 2 | 1000 | 5000 | 1.5 |

Backoff includes 0-25% jitter to prevent thundering-herd retries from many parallel tool calls.

### `withRetry()` contract

```ts
async function withRetry<T>(
  fn: () => Promise<T>,
  classify: (error: unknown) => { category: ErrorCategory; retryable: boolean },
  onRetry?: (decision: RetryDecision, category: ErrorCategory, error: unknown) => void,
): Promise<T>
```

- Re-throws non-retryable errors immediately
- Retries retryable errors up to `maxAttempts`, applying computed delay between attempts
- Calls `onRetry` between attempts so the runtime can write decision-log entries and update dashboard state
- Throws the last error if all attempts exhaust

### Pipeline-level overrides

A pipeline manifest may override retry config per category for the whole pipeline (rare, but ECC's 5-hour Anthropic token reset window may justify a longer `rate_limit` cap). Overrides are declared in `pipeline-manifest.json`:

```json
{
  "retry_overrides": {
    "rate_limit": { "maxAttempts": 6, "maxDelayMs": 60000 }
  }
}
```

Tool-level overrides are not allowed in v1 — every tool inherits pipeline-level config.

## Recovery actions

A `ClassifiedError` carries an action telling the runtime how to prepare the next attempt:

```ts
type RecoveryActionType =
  | "compact_context"
  | "simplify_prompt"
  | "extend_timeout"
  | "wait_and_retry"
  | "provide_error_context"
  | "none";

interface RecoveryAction {
  type: RecoveryActionType;
  description: string;        // human-readable
  modifications: {
    maxPromptTokens?: number;        // for compact_context
    timeoutMultiplier?: number;      // for extend_timeout
    appendToPrompt?: string;         // for provide_error_context
    simplifyInstruction?: boolean;   // for simplify_prompt
  };
}
```

### Recovery map (canonical)

| Category | Recovery type | Modification |
|---|---|---|
| `context_too_long` | `compact_context` | `maxPromptTokens: 80_000` |
| `rate_limit` | `wait_and_retry` | (handled by retry delay) |
| `auth_error` | `none` | — (surface to human) |
| `gateway_timeout` | `extend_timeout` | `timeoutMultiplier: 1.5` |
| `malformed_response` | `simplify_prompt` | `simplifyInstruction: true` |
| `tool_execution_failure` | `provide_error_context` | append `[PREVIOUS ERROR] <message>` to next prompt |
| `sandbox_unavailable` | `wait_and_retry` | (handled by retry delay) |
| `model_refusal` | `simplify_prompt` | `simplifyInstruction: true` |
| `network_error` | `wait_and_retry` | (handled by retry delay) |
| `manifest_invalid` | `none` | — |
| `permission_denied` | `none` | — |
| `eval_failure` | `none` | — (handled by eval loop, see [008](008-eval-task.md)) |
| `unknown` | `provide_error_context` | append raw error to next prompt |

`compact_context` integrates with [004 memory model](004-memory-model.md) and the auto/reactive/snip compaction strategies.

## Integration with other sections

### Decision log

Every classification, retry decision, and recovery action emits a typed entry to the decision log:

- `error_classified` — when a raw error is classified
- `retry_decided` — when `withRetry` decides to retry (or not)
- `recovery_applied` — when a recovery modification shapes the next attempt

These let humans reconstruct the agent's failure path from the log alone. See [005](005-decision-log.md).

### Tools

Tools should not classify their own errors — they return `ToolResult { success: false, error }` and the pipeline classifies. This keeps classification consistent across all tools. Tools may, however, *constrain* the categories their failures could produce (e.g., a `workspace-read` tool documents that it never produces `auth_error`); the conformance suite (see [101](101-conformance.md)) verifies these constraints by fuzzing.

### Hooks

`error_classified` and `retry_decided` are firable hook points (see [013](013-hooks.md)). Pipelines can attach handlers for telemetry export, alerting, or human-review escalation.

## When to extend the taxonomy

If a real production failure consistently classifies to `unknown`, the spec needs a new category. The process:

1. Open an issue with sample error messages
2. Propose a new category + patterns + retry config + recovery action in a spec PR
3. The spec version bumps minor (additive change)
4. Pipelines targeting older spec versions classify those errors as `unknown` (backwards-compatible)

Categories are never removed or renamed. They're only added or marked deprecated (still accepted by the runtime, no longer recommended).

## Anti-example — common defects

**Tool that classifies its own errors:**

```ts
async call(input, ctx) {
  try {
    // ...
  } catch (err) {
    return {
      success: false,
      output: ...,
      error: "rate_limit",   // ❌ tool is asserting a category
    };
  }
}
```

The pipeline classifier loses information by trusting the tool's claim. Always return the raw error message; the pipeline classifies.

**Catch-all fallback that hides real errors:**

```ts
catch (err) {
  return { success: false, output: ..., error: "Something went wrong." };  // ❌
}
```

The runtime's classifier needs the original message to match patterns. Generic messages always classify as `unknown` and lose retry signal.

**Pipeline that bypasses `withRetry`:**

```ts
for (let attempt = 0; attempt < 5; attempt++) {
  try { return await someToolCall(); } catch (e) { /* swallow */ }
}
// ❌ ignores classifier, ignores retry config, no decision log entries
```

The runtime's retry pipeline is mandatory. Pipelines that roll their own retry are non-conformant.

## Cross-references

- [[003-tool-contract]] — how tool failures flow through classification
- [[004-memory-model]] — context-too-long triggers compaction strategies defined there
- [[005-decision-log]] — every classification, retry, recovery is logged
- [[008-eval-task]] — eval failures use the `eval_failure` category
- [[013-hooks]] — `error_classified`, `retry_decided` are hookable
- [[101-conformance]] — fuzzer that asserts tools don't classify their own errors

## Open questions for ECC pipeline

- ECC's Anthropic Premium has a 5-hour token-window reset. The `rate_limit` retry cap of 30s × 4 = 2 min isn't enough for a worst-case window. **Tentative**: ECC's pipeline manifest sets `rate_limit.maxDelayMs: 18000000` (5h cap), so a single retry can survive the window.
- Photos batch failures (Leawood: 74/500 examined) — should there be a dedicated `partial_completion` category, or does this stay as a tool-internal concern (the vision-manifest tool returns `success: true` with a `coverage: 0.15` field)? **Tentative**: tool-internal — partial completion isn't an error, it's a quality metric the eval loop catches.
