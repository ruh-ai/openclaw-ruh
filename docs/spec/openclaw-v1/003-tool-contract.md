# 003 — Tool Contract

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/tool.schema.json`](schemas/tool.schema.json)

A **tool** is the unit of capability an agent reaches out with. Tools read or write files, run shell commands, fetch data, validate plans, render images, query databases, send messages — anything the agent does *to the outside world* (or to its own workspace) is a tool call. This section defines the contract every conformant tool satisfies.

---

## Purpose

Replace implicit, prompt-encoded "the agent can do X" with a formal, schema-validated, permission-gated, concurrency-aware contract. Every tool declares:

- **A typed input schema** (Zod-checked at runtime, JSON Schema declared at build time)
- **A typed output shape**
- **Permission semantics** (read-only? destructive? concurrency-safe?)
- **Stage availability** (which lifecycle stages may invoke it)
- **Mode rules** (auto-allowed in agent mode, requires approval in build mode, etc.)
- **Lifecycle event emission** (start / end / error / progress)

The runtime executes tools through a fixed pipeline (validate → check stage → check permissions → execute → emit events). Tools cannot bypass the pipeline. Coding agents that produce conformant tools get composability for free; coding agents that cut corners produce tools that other pipelines refuse to load.

## The contract

Every tool implements this interface (TypeScript shown for clarity; the spec is language-agnostic):

```ts
interface OpenClawTool<Input, Output> {
  // ── Identity ───────────────────────────────────────
  readonly name: string;                    // kebab-case, globally unique
  readonly description: string;              // one-line, used in tool listings
  readonly version: string;                  // semver
  readonly spec_version: string;             // OpenClaw spec version this tool targets

  // ── Schema ─────────────────────────────────────────
  readonly inputSchema: ZodSchema<Input>;     // runtime validation
  readonly outputSchema?: ZodSchema<Output>;  // optional but recommended

  // ── Availability ───────────────────────────────────
  readonly availableStages: AgentDevStage[] | null;  // null = all stages
  readonly availableModes: ExecutionMode[] | null;   // null = all modes

  // ── Permission flags ───────────────────────────────
  readonly isReadOnly: boolean;
  readonly isDestructive: boolean;
  readonly isConcurrencySafe: boolean;

  // ── Execution ──────────────────────────────────────
  call(input: Input, ctx: ToolContext): Promise<ToolResult<Output>>;
  checkPermissions(input: Input, ctx: ToolContext): PermissionDecision;
}
```

These flags drive runtime behavior:

| Flag | Effect |
|---|---|
| `isReadOnly: true` | Auto-allowed in build mode without human approval |
| `isReadOnly: false` and `isDestructive: false` | Requires approval in build mode; auto-allowed in copilot mode |
| `isDestructive: true` | Always requires approval, regardless of mode (unless `availableModes` excludes destructive contexts) |
| `isConcurrencySafe: true` | The pipeline may run multiple invocations in parallel |
| `isConcurrencySafe: false` | The pipeline serializes invocations of this tool |

A tool that lies about these flags (e.g. flags `isReadOnly: true` but writes files) is a security/correctness defect. Conformance tests (see [101](101-conformance.md)) include a fuzzer that asserts read-only tools don't mutate workspace state.

## `ToolContext` — what the runtime passes in

```ts
interface ToolContext {
  sandboxId: string;        // the container/tenant boundary
  sessionId: string;        // the gateway session
  agentId: string;          // which agent in the pipeline is calling
  pipelineId: string;       // which pipeline this is part of
  mode: ExecutionMode;      // "agent" | "copilot" | "build" | "test" | "ship"
  devStage: AgentDevStage;  // "drafted" | "validated" | "tested" | "shipped" | "running"
  decision_log: DecisionLogHandle;  // for emitting structured events
  memory: MemoryHandle;             // for tier/lane-aware reads/writes
  config: ConfigHandle;             // for hot-swappable config reads
  checkpoint: CheckpointHandle;     // for state persistence
}
```

Tools receive a context object — they do not reach into globals or singletons. This makes tools testable in isolation and composable across pipelines.

## `ToolResult` — what the tool returns

```ts
interface ToolResult<Output> {
  success: boolean;
  output: Output;
  error?: string;                     // populated when success === false
  contextModifier?: Partial<ToolContext>;  // shape future calls in this turn
  events?: AgUiEvent[];                // emitted to the live decision log + dashboard
}
```

`contextModifier` lets a tool (rarely) shift downstream behavior — e.g., a workspace-mode tool that switches from "build" to "test" stage. The modifier is applied serially; concurrent-safe tools cannot use it.

`events` are AG-UI custom events that the runtime forwards to the dashboard and decision log. Standard events (start, end, error, progress) are emitted by the pipeline automatically; tools emit additional events for surface-relevant signals (e.g., `FILE_WRITTEN` when a workspace tool succeeds).

> **AG-UI** (Agent-UI Protocol) is the streaming event protocol the runtime uses to push agent-side state changes to the dashboard. An `AgUiEvent` has shape `{ type: EventType, name?: string, value?: unknown }` where `EventType` is one of the canonical kinds (`CUSTOM`, `MESSAGE_DELTA`, `TOOL_EXECUTION_START`, etc.) defined by the AG-UI client library. Custom events use `type: "CUSTOM"` and a pipeline-defined `name` from the marker registry (see [015](015-output-validator.md)). The dashboard subscribes via SSE; the decision log records every emitted event. Tools producing custom events should use the `name` constants from `CustomEventName` in the runtime, not arbitrary strings, so dashboards can route events to typed panels.

## Permission decisions

```ts
type PermissionDecision =
  | { allowed: true }
  | { allowed: false; reason: string; requiresApproval: boolean };
```

- **`allowed: true`** — pipeline proceeds straight to execution.
- **`allowed: false; requiresApproval: false`** — pipeline blocks and surfaces the reason. The agent cannot retry without changing input or mode.
- **`allowed: false; requiresApproval: true`** — pipeline pauses, fires a hook (see [013](013-hooks.md)) for the human-review surface, awaits approval. On approval, execution proceeds. On denial, the pipeline records `permission_denied` and the agent gets a structured error.

Permission decisions are checked **before** input validation (cheap to compute, prevents leaking validation details to denied callers).

## The execution pipeline

The runtime executes every tool call through this fixed pipeline. Tools cannot skip steps.

```
┌────────────────────────────────────────────────────────────┐
│ 1. Lookup    — find tool in registry                        │
│              — fail: not_found                              │
├────────────────────────────────────────────────────────────┤
│ 2. Stage     — check availableStages includes ctx.devStage  │
│              — fail: unavailable                             │
├────────────────────────────────────────────────────────────┤
│ 3. Mode      — check availableModes includes ctx.mode       │
│              — fail: unavailable                             │
├────────────────────────────────────────────────────────────┤
│ 4. Validate  — run inputSchema.safeParse(rawInput)          │
│              — fail: validation_error                        │
├────────────────────────────────────────────────────────────┤
│ 5. Permit    — call tool.checkPermissions(input, ctx)       │
│              — denied + requiresApproval → pause for human   │
│              — denied + !requiresApproval → permission_denied│
├────────────────────────────────────────────────────────────┤
│ 6. Emit      — TOOL_EXECUTION_START event                    │
├────────────────────────────────────────────────────────────┤
│ 7. Execute   — await tool.call(input, ctx)                  │
│              — exception → execution_error (recorded)        │
├────────────────────────────────────────────────────────────┤
│ 8. Validate  — if outputSchema present, validate output      │
│              — fail: malformed_response (recoverable)        │
├────────────────────────────────────────────────────────────┤
│ 9. Modify    — apply result.contextModifier (sequential only)│
├────────────────────────────────────────────────────────────┤
│10. Forward   — append result.events to AG-UI stream          │
├────────────────────────────────────────────────────────────┤
│11. Emit      — TOOL_EXECUTION_END event with success/error   │
├────────────────────────────────────────────────────────────┤
│12. Log       — write decision-log entry (see 005)            │
└────────────────────────────────────────────────────────────┘
```

Each step is observable. The decision log captures the path through the pipeline (which step failed, which step succeeded, total latency, retry attempts). See [005 decision log](005-decision-log.md).

### Concurrent execution

When the orchestrator queues multiple tool calls in one turn:

- Tools with `isConcurrencySafe: true` run in parallel via `Promise.all`-style fan-out.
- Tools with `isConcurrencySafe: false` run sequentially in the order queued.
- A `contextModifier` from a non-concurrent tool propagates to subsequent calls in the queue; concurrent tools cannot return modifiers.

## Built-in tool kinds

The runtime ships a fixed set of tool kinds. Custom tools extend these but must declare their kind for permission policy.

| `tool_kind` | Read/Write | Destructive | Concurrent | Default permission |
|---|---|---|---|---|
| `workspace-read` | Read | No | Yes | Auto-allowed |
| `workspace-write` | Write | No | No | Build mode requires approval; agent mode auto-allowed |
| `sandbox-exec` | Write | Yes (commands can do anything) | No | Always requires approval unless command matches `isCopilotSafeRequest` allowlist |
| `research` | Read (external) | No | Yes | Auto-allowed; rate-limited per session |
| `plan-validate` | Read | No | Yes | Auto-allowed |
| Custom (`<id>`) | Declared by author | Declared | Declared | Inherits from declared flags |

Custom tool kinds register with the runtime at startup. A pipeline that references a custom kind must include the registration; otherwise validation fails with `tool_kind_unknown`.

### `workspace-read`

Reads files from the agent's sandbox workspace. Input: `{ path: string }`. Output: `{ content: string, encoding: "utf8" | "base64" }`. Errors include `file_not_found`, `path_outside_workspace` (the runtime rejects path traversal).

### `workspace-write`

Writes one or more files. Input: `{ path: string, content: string }` or `{ files: Array<{path, content}> }`. Output: `{ written: Array<{path, ok, error?}> }`. Atomic per-file; the batch form is best-effort (one failure does not roll back others, but each failure is reported).

### `sandbox-exec`

Executes shell commands inside the container. Input: `{ command: string, timeoutMs: number }`. Output: `{ exitCode: number, stdout: string, stderr: string }`. The most powerful tool; permission policy is correspondingly strict. Long-running commands surface progress via emitted events.

### `research`

Reads external sources (URLs, APIs, MCP connectors). Input depends on connector. Output is structured. Always read-only, always concurrency-safe. The runtime applies per-session rate limits to prevent runaway agents from hammering external services.

### `plan-validate`

Reads the agent's `architecture.json` (or a passed-in plan) and validates against a target schema. Input: `{ plan?: object }` (defaults to reading from workspace). Output: `{ valid: boolean, issues: ValidationIssue[], skillCount: number }`.

Used by the build/review stages to catch malformed plans before downstream work depends on them.

## Tool registry

The runtime maintains a global tool registry (`ToolRegistry`). Every tool the runtime knows about is registered here, addressable by `name`.

Operations:

- `register(tool: OpenClawTool): void` — fails if `tool.name` is already registered
- `get(name: string): OpenClawTool | undefined`
- `list(): OpenClawTool[]`
- `listForStage(stage: AgentDevStage): OpenClawTool[]`
- `has(name: string): boolean`

The registry is consulted at three times:

1. **Manifest validation** — at agent load, every `tool_kind` referenced in the agent's `tools/<id>.json` files must exist in the registry.
2. **Pipeline execution** — every tool call resolves through the registry.
3. **Listing for the architect** — the architect queries `listForStage` to know which tools are valid in the current stage when authoring a skill.

## How tools integrate with other spec sections

### Errors → [014](014-error-taxonomy.md)

Tool failures flow through the error taxonomy. A `sandbox-exec` timeout becomes `category: gateway_timeout`; a malformed JSON output becomes `category: malformed_response`; an LLM-side rate limit while a tool is making downstream LLM calls becomes `category: rate_limit`. The pipeline's retry strategy handles each per-category.

### Decision log → [005](005-decision-log.md)

Every tool call writes one decision-log entry of type `tool_selection`, plus zero or more entries of type `tool_execution`, `permission_denied`, or `error_classified` depending on outcome. Tools never write directly; the runtime owns the log entries.

### Memory → [004](004-memory-model.md)

Tools that read/write memory use `ctx.memory`. Memory writes carry tier/lane attestation; tools cannot bypass the tier model. A tool that "writes to memory directly" is a defect.

### Config → [009](009-config-substrate.md)

Tools that need configuration (labor rates, jurisdictions, paint bands) read via `ctx.config`. Configuration is not passed in `input`; it's looked up at execution time from the pipeline's config substrate, so config changes propagate without requiring tool re-deployment.

### Hooks → [013](013-hooks.md)

The runtime fires `pre_tool_execution` and `post_tool_execution` hooks. Hooks can observe (always) or veto (if registered as a guard). Hook handlers cannot mutate the tool result, only observe it; mutating responses go through `contextModifier` instead.

## Errors a tool can return

Beyond raw exceptions, a conformant tool returns structured failures via `ToolResult`:

```ts
return {
  success: false,
  output: <empty/default-shape Output>,
  error: "<message safe to surface>",
  events: [
    { type: "CUSTOM", name: "TOOL_FAILURE", value: { reason, recoverable } }
  ]
};
```

The `error` string is shown to humans in the dashboard's decision-log feed and (with caller's permission) to the agent for self-correction. **Tools never include credentials, internal paths, or stack traces in `error`.** The full error context is logged server-side in the decision log; the user-facing string is sanitized.

## Minimal valid tool

```ts
class HelloTool implements OpenClawTool<{ name?: string }, { greeting: string }> {
  readonly name = "hello";
  readonly description = "Returns a greeting.";
  readonly version = "0.1.0";
  readonly spec_version = "1.0.0";
  readonly inputSchema = z.object({ name: z.string().optional() });
  readonly outputSchema = z.object({ greeting: z.string() });
  readonly availableStages = null;
  readonly availableModes = null;
  readonly isReadOnly = true;
  readonly isDestructive = false;
  readonly isConcurrencySafe = true;

  async call(input, ctx) {
    return { success: true, output: { greeting: `Hi ${input.name ?? "there"}` } };
  }

  checkPermissions() { return { allowed: true }; }
}
```

This tool is conformant. It declares no stages/modes (available everywhere), is read-only, is concurrency-safe, validates input via Zod, and returns structured output.

## Anti-example — common defects

**Lying about flags:**

```ts
readonly isReadOnly = true;       // ❌ but the tool writes files
async call(input, ctx) {
  await fs.writeFile(input.path, "...");
  return { success: true, output: { ok: true } };
}
```

The conformance fuzzer (see [101](101-conformance.md)) catches this by snapshotting the workspace before/after read-only tool calls and rejecting any tool that produces diffs.

**Untyped output:**

```ts
async call(input, ctx) {
  return { success: true, output: "ok" };  // ❌ not an object, cannot be schema-validated
}
```

`output` MUST be an object so downstream consumers can rely on shape. Use `{ message: "ok" }` instead of `"ok"`.

**Bypassing the pipeline:**

```ts
async call(input, ctx) {
  ctx.memory.write({ ... });   // ❌ should go through a memory tool
  return { ... };
}
```

Tools that have side effects on memory/config/state outside their declared role are not portable across pipelines. Use a dedicated memory tool, or emit an event the orchestrator hooks on.

## Cross-references

- [[002-agent-manifest]] — agents reference tools via `tools/<tool-id>.json`
- [[004-memory-model]] — tools that touch memory go through `ctx.memory`
- [[005-decision-log]] — every tool call produces decision log entries
- [[009-config-substrate]] — tools read config via `ctx.config`
- [[013-hooks]] — `pre_tool_execution` and `post_tool_execution` lifecycle events
- [[014-error-taxonomy]] — how tool failures are classified and retried
- [[015-output-validator]] — how outputs are validated before being trusted
- [[101-conformance]] — the fuzzer that verifies tools don't lie about their flags

## Open questions for ECC pipeline

- Should `research` distinguish between "MCP-connector calls" and "raw URL fetches" at the kind level, or is one kind with config sufficient? **Tentative**: one kind, kind-specific config object.
- For `sandbox-exec` in ECC's tenant-bounded deployment, is the allowlist for auto-approval the same as in copilot mode? **Tentative**: yes, but ECC's pipeline manifest can override.
