# 013 — Lifecycle Hooks

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/hooks.schema.json`](schemas/hooks.schema.json)

Hooks are **named extension points** the runtime fires at well-defined moments. Pipelines (and the runtime itself) attach handlers to hooks for telemetry export, alerting, human-review routing, integration with external systems, and custom dashboard updates — without forking the runtime or modifying core spec sections.

---

## Purpose

The runtime cannot anticipate every integration a pipeline will need. A telemetry pipeline pushes events to Datadog. ECC's pipeline pushes Tier-2 memory writes to a Teams adaptive card. A future customer pushes eval-loop completions to PagerDuty for on-call review. Hooks let these integrations attach without changes to the core runtime.

The constraints:

- Hook handlers **never modify** runtime state. They observe, they emit, they trigger external systems. They do not change the agent's behavior.
- Hook handler failures **never crash** the calling pipeline. Failures are caught, logged, surfaced as `hook_failed` decisions, and the runtime continues.
- Hook firing is **synchronous** by default (the calling pipeline awaits all handlers) but handlers may opt into **fire-and-forget** mode for slow integrations.

## The hook points

The runtime fires hooks at these named moments. The list is closed in v1 — adding new hook points requires a [versioning](100-versioning.md) bump.

### Session lifecycle

| Hook name | Fired when | Payload |
|---|---|---|
| `session_start` | A new session begins | `{ pipeline_id, agent_id, session_id, mode, dev_stage, resumed_from? }` |
| `session_end` | A session closes | `{ pipeline_id, agent_id, session_id, status, duration_ms, decision_count }` |

### Stage transitions

| Hook name | Fired when | Payload |
|---|---|---|
| `stage_transition` | An agent transitions dev stages | `{ from, to, reason }` |

### Tool execution

| Hook name | Fired when | Payload |
|---|---|---|
| `pre_tool_execution` | Before a tool runs (after permission check) | `{ tool_name, input, ctx }` |
| `post_tool_execution` | After a tool completes (success or error) | `{ tool_name, input, result, latency_ms }` |
| `tool_approval_required` | A tool needs human approval | `{ tool_name, reason, requires_approval, ctx }` |

### Memory and config

| Hook name | Fired when | Payload |
|---|---|---|
| `memory_write_review_required` | A Tier-2 or Tier-3 memory write needs review | `{ pending_entry, routed_to, channel }` |
| `memory_write_confirmed` | A reviewer confirmed | `{ entry_id, reviewer_identity }` |
| `memory_write_rejected` | A reviewer rejected | `{ entry_id, reviewer_identity, reason }` |
| `config_review_required` | A programmatic config edit needs review | `{ doc_id, proposed_diff, owner }` |
| `config_commit` | A config doc was committed | `{ doc_id, version, committed_by }` |
| `compaction_ran` | Memory or context compaction completed | `{ scope, strategy, entries_affected, tokens_saved }` |

### Sub-agents and orchestration

| Hook name | Fired when | Payload |
|---|---|---|
| `sub_agent_spawn` | The orchestrator spawned a specialist | `{ specialist, parent_session_id, sub_session_id, workspace_scope }` |
| `sub_agent_complete` | A specialist finished | `{ specialist, sub_session_id, success, files_written }` |
| `result_merge` | The orchestrator merged sub-agent outputs | `{ specialists, total_files, conflicts }` |

### Verification and eval

| Hook name | Fired when | Payload |
|---|---|---|
| `verification_check` | A convergence-loop check ran | `{ check_id, command, success }` |
| `verification_iteration_complete` | A convergence-loop iteration finished | `{ iteration, remaining }` |
| `eval_task_complete` | An eval task finished | `{ task_id, status, confidence }` |
| `eval_iteration_complete` | A reinforcement-loop iteration completed | `{ iteration, pass_rate, avg_score, mutations_count }` |

### Errors and recovery

| Hook name | Fired when | Payload |
|---|---|---|
| `error_classified` | An error was classified | `{ category, retryable, original_message_redacted, user_message }` |
| `retry_decided` | `withRetry()` made a decision | `{ category, attempt, max_attempts, will_retry }` |
| `recovery_applied` | A recovery action shaped next attempt | `{ category, recovery_type, modifications }` |

### Output validation

| Hook name | Fired when | Payload |
|---|---|---|
| `output_validation_passed` | A marker validated | `{ marker_name, schema, layer }` |
| `output_validation_failed` | A marker failed validation | `{ marker_name, schema, error }` |

### Checkpoint

| Hook name | Fired when | Payload |
|---|---|---|
| `checkpoint_created` | A checkpoint was written | `{ checkpoint_id, reason }` |
| `checkpoint_resumed` | A session resumed from a checkpoint | `{ checkpoint_id, session_id }` |
| `checkpoint_drift_detected` | Resume found workspace drift | `{ checkpoint_id, divergent_files }` |

### Custom

| Hook name | Fired when | Payload |
|---|---|---|
| `custom:<namespace>:<event>` | A pipeline-specific event | `{ namespace, event, payload }` — payload schema declared by pipeline |

Custom hook names use a colon-separated namespace to prevent collision. ECC's pipeline might fire `custom:ecc:rfq-packet-shipped` when a deliverable goes out.

## Handler contract

```ts
type HookHandler = (payload: HookPayload, ctx: HookContext) => void | Promise<void>;

interface HookContext {
  pipeline_id: string;
  agent_id?: string;
  session_id?: string;
  fire_mode: "sync" | "fire_and_forget";
  decision_log: DecisionLogHandle;  // for emitting structured events
  // Note: NO workspace handle, NO memory handle, NO config write API.
  // Handlers observe and integrate; they do not mutate runtime state.
}
```

### Sync vs fire-and-forget

Handlers register with a fire mode:

- **`sync` (default)** — the calling pipeline awaits this handler. Use for handlers that affect downstream behavior (e.g., a memory-review router that *must* complete before the runtime considers the write filed).
- **`fire_and_forget`** — the runtime invokes the handler but does not await it. Use for telemetry pushes, dashboard updates, and other observability where latency would slow the pipeline.

A `fire_and_forget` handler that throws is logged but does not affect the pipeline. A `sync` handler that throws is logged AND emits a `hook_failed` decision; the calling pipeline continues but with a warning surfaced to the dashboard.

### Handler return value

Handlers return `void` (or `Promise<void>`). They do not return data. **Hooks are not query points.** When the runtime needs data from a handler (e.g., "did the human approve?"), the integration is built using a separate request/response channel, not hook return values.

## Registration

Hooks register at three scopes:

### Runtime-global

The OpenClaw runtime registers default handlers (e.g., the canonical `error_classified` → decision-log writer). These cannot be removed by pipelines; they are constitutive of the runtime.

### Pipeline-scoped

A pipeline manifest declares hook handlers in `pipeline-manifest.json`:

```json
{
  "hooks": [
    {
      "name": "memory_write_review_required",
      "handler": "hooks/route-via-email.ts",
      "fire_mode": "sync"
    },
    {
      "name": "eval_iteration_complete",
      "handler": "hooks/push-to-datadog.ts",
      "fire_mode": "fire_and_forget"
    },
    {
      "name": "custom:ecc:rfq-packet-shipped",
      "handler": "hooks/notify-procurement.ts",
      "fire_mode": "fire_and_forget"
    }
  ]
}
```

The runtime loads handlers from the pipeline workspace at startup. Handlers must be:

- **Pure**: no global state; everything they need comes from `payload` + `ctx`
- **Side-effect-bounded**: only external systems (HTTP, message bus, email API), never workspace mutation
- **Fast** (for sync mode): aim for <100ms; longer = use fire-and-forget

### Session-scoped

Hooks may register dynamically within a session via `ctx.hooks.register(name, handler, fire_mode)`. These are auto-removed at session end. Used for transient integrations (e.g., a one-shot human-review handler bound to a specific approval flow).

## Multiple handlers per hook

Multiple handlers may register for the same hook name. The runtime fires them in registration order:

1. Runtime-global handlers (always first)
2. Pipeline-scoped handlers (in manifest declaration order)
3. Session-scoped handlers (in registration order)

All handlers fire even if earlier ones throw. The runtime aggregates results:

```ts
{
  type: "hook_fired",
  hook_name: "memory_write_review_required",
  metadata: {
    handler_count: 3,
    succeeded: 2,
    failed: 1,
    failures: [{ handler: "hooks/route-via-email.ts", error: "..." }]
  }
}
```

A handler that needs to run *before* others should register at runtime-global scope (i.e., be part of the platform). Pipeline-scoped handlers cannot influence each other's order beyond manifest declaration order; runtime-global ones always come first.

In v1 there is **no priority field** on handlers. The harness branch's lack of priority is preserved; if v1.1 introduces priorities it'll be additive.

## Veto handlers

A small set of hooks support **veto**: a handler can return a special sentinel that aborts the calling pipeline operation.

| Hook | Veto effect |
|---|---|
| `pre_tool_execution` | Aborts the tool call with `permission_denied` (treated as if `checkPermissions` had returned `allowed: false`) |
| `tool_approval_required` | Replaces the human approval flow with the handler's decision (used when pipelines integrate external approval systems) |
| `memory_write_review_required` | Replaces the default review routing with the handler's decision |

Vetos are explicit. A handler returning anything other than the sentinel is treated as observation-only.

```ts
import { VETO } from "openclaw/hooks";

async function preToolHandler(payload, ctx) {
  if (payload.tool_name === "sandbox-exec" && containsBannedCommand(payload.input.command)) {
    return VETO({ reason: "Banned command pattern" });
  }
  // implicit return undefined → no veto
}
```

## Custom hooks

Pipelines may fire custom hooks under their own namespace. The runtime does not validate the payload schema for custom hooks; the pipeline declares the schema in `pipeline-manifest.json`:

```json
{
  "custom_hooks": [
    {
      "name": "custom:ecc:rfq-packet-shipped",
      "payload_schema": "schemas/rfq-shipped-payload.schema.json"
    }
  ]
}
```

The runtime validates the custom payload against the declared schema before firing. Custom hooks not declared in the manifest are rejected.

## Anti-example — common defects

**Handler with side effects on workspace:**

```ts
async function preToolHandler(payload, ctx) {
  await fs.writeFile("./debug.log", JSON.stringify(payload));  // ❌ mutating workspace
}
```

Handlers do not mutate workspace, memory, config, or any pipeline-internal state. The conformance suite asserts no workspace diffs from handlers (snapshot before/after).

**Slow sync handler:**

```ts
{ name: "post_tool_execution", handler: "...", fire_mode: "sync" }
// handler does HTTP to external system, takes 8 seconds
// ❌ every tool call now adds 8s of latency
```

External integrations are `fire_and_forget` unless the pipeline genuinely needs the result before continuing. The conformance suite warns when a sync handler exceeds 100ms p95.

**Handler that throws on bad input:**

```ts
async function handler(payload) {
  if (!payload.foo) throw new Error("Required field missing");  // ❌ assumes shape
}
```

Handlers receive validated payloads; they should not re-validate. If a payload field looks missing, the runtime's schema validation is broken — file a spec issue. Handlers that throw on perceived shape issues create noise in the `hook_failed` decision stream.

**Veto on non-veto-able hook:**

```ts
async function handler(payload, ctx) {
  return VETO({ reason: "..." });  // hook is `post_tool_execution` — VETO has no effect
}
```

The runtime ignores VETO returns from non-veto hooks and emits a warning. Handlers should know which hooks support veto (the documented list above).

## Cross-references

- [[002-agent-manifest]] — `stage_transition` hook fires on agent state transitions
- [[003-tool-contract]] — `pre_tool_execution`, `post_tool_execution`, `tool_approval_required`
- [[004-memory-model]] — `memory_write_review_required` and related
- [[005-decision-log]] — every hook fires a `hook_fired` decision
- [[007-sub-agent]] — sub-agent lifecycle hooks
- [[008-eval-task]] — eval-iteration hooks
- [[009-config-substrate]] — `config_review_required`, `config_commit`
- [[011-pipeline-manifest]] — where pipeline-scoped hooks are declared
- [[012-checkpoint]] — checkpoint lifecycle hooks
- [[014-error-taxonomy]] — `error_classified`, `retry_decided`, `recovery_applied`
- [[015-output-validator]] — `output_validation_passed/failed`
- [[101-conformance]] — handler-purity tests

## Open questions for ECC pipeline

- ECC's `memory_write_review_required` for Tier-2 (Scott) flows to Darrow via email-card. The handler must wait for Darrow's response — that's potentially hours/days. Sync mode would block; fire-and-forget loses the eventual decision. **Tentative**: a third mode `awaitable_async` that registers a callback the runtime waits on (with timeout), surfaced in v1.1; for v1 the handler kicks off the email and returns immediately, and Darrow's reply triggers a *separate* hook (`memory_write_confirmed` / `memory_write_rejected`) that flips the entry's status.
- Should `custom:ecc:*` hooks be allowed to fire from inside skill code (not just orchestrator), or only from registered transition points? **Tentative**: allowed from skill code via `ctx.hooks.fire(name, payload)`, but the pipeline must declare the firing point in the manifest for auditability.
