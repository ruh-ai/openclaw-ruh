# 005 — Decision Log

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/decision-log.schema.json`](schemas/decision-log.schema.json)

The decision log is the **structured audit trail** for every meaningful action the runtime takes on behalf of the agent — tool calls, error classifications, memory writes, recovery actions, sub-agent spawns, compaction events, verification checks, eval scores, and human review interventions.

It is **not** a debug log. Per [001 principle 4](001-overview.md#4-every-decision-is-logged), the decision log is a **deliverable** — humans read it to understand *why* an agent did what it did, coding agents read prior logs as reference context, and customers (in pipelines like ECC's) receive it as part of every produced estimate.

---

## Purpose

Three jobs:

1. **Audit and explainability.** A reviewer asks "why did the agent pick LOXON for the brick clubhouse?" The decision log answers: which memory entry attested it, which skill made the selection, which tool returned which output, which recovery action shaped the next attempt.

2. **Reference context for future agent runs.** When the same situation recurs (or a similar one in another pipeline), prior decision-log entries can be loaded as in-context examples — accelerating convergence and reducing rediscovery.

3. **Telemetry that's queryable, not free-text.** Every entry is typed. Dashboards aggregate by type, lane, source, latency, success rate. Coding agents authoring new pipelines read aggregated logs to understand which patterns work.

If an agent's behavior cannot be reconstructed from the decision log alone, the log is incomplete and must be extended.

## Storage

Decision log entries are persisted server-side (Postgres in the canonical implementation), keyed by `(pipeline_id, agent_id, session_id, timestamp)`. They are **not** stored in the workspace `.openclaw/decisions/` directory by default — workspace storage is for portability of the agent definition; the live log is operational data.

A pipeline may opt into workspace export of recent decisions (rolling 30-day window, redacted) for the bespoke dashboard's "decision log explorer" panel. ECC's manifest opts in for full audit transparency.

## Entry shape

Every decision is a typed event:

```ts
interface Decision {
  id: string;                          // ULID, sortable + globally unique
  pipeline_id: string;                 // which pipeline this is part of
  agent_id: string;                    // which agent in the pipeline
  session_id: string;                  // gateway session this decision belongs to
  parent_id?: string;                  // parent decision (for nested events: tool inside skill inside turn)
  type: DecisionType;                  // typed category (see below)
  timestamp: string;                   // ISO-8601 UTC
  description: string;                 // one-line human-readable summary
  metadata: Record<string, unknown>;   // type-specific, schema-validated per type
  spec_version: string;
}
```

`parent_id` builds the hierarchy: a session contains turns, a turn contains skill executions, a skill contains tool calls, a tool call may contain sub-agent spawns. The dashboard renders this as a tree.

## Decision types (canonical)

Every type has a fixed schema for `metadata`. The runtime validates `metadata` on write; a malformed entry is rejected (same severity as a manifest validation failure).

### Lifecycle

| Type | When | Metadata shape |
|---|---|---|
| `session_start` | New gateway session opens | `{ trigger_id, mode, dev_stage }` |
| `session_end` | Session closes | `{ duration_ms, decisions_count, status: "completed" \| "errored" \| "aborted" }` |
| `stage_transition` | Agent moves between dev stages (drafted → validated, etc.) | `{ from, to, reason }` |
| `turn_start` | New turn within a session | `{ user_message_excerpt, input_tokens }` |
| `turn_end` | Turn completes | `{ output_tokens, total_latency_ms }` |

### Tool execution

| Type | When | Metadata shape |
|---|---|---|
| `tool_selection` | Agent chose which tool to call | `{ tool_name, candidates_considered, reason }` |
| `tool_execution_start` | Pipeline began executing | `{ tool_name, input_summary, execution_id }` |
| `tool_execution_end` | Pipeline completed (success or error) | `{ tool_name, execution_id, success, error?, latency_ms, events_emitted }` |
| `permission_denied` | Pipeline blocked a tool call | `{ tool_name, reason, requires_approval }` |
| `permission_approved` | Human approved a permission request | `{ tool_name, reviewer_identity, latency_to_approval_ms }` |

### Errors and recovery

| Type | When | Metadata shape |
|---|---|---|
| `error_classified` | Runtime classified a raw error | `{ category, retryable, original_message_redacted, user_message }` |
| `retry_decided` | `withRetry()` decided whether to retry | `{ category, attempt, max_attempts, delay_ms, will_retry }` |
| `recovery_applied` | Recovery action shaped next attempt | `{ category, recovery_type, modifications }` |

### Memory

| Type | When | Metadata shape |
|---|---|---|
| `memory_read` | Agent loaded a memory entry | `{ entry_id, tier, lane, status, source_identity }` |
| `memory_write_proposed` | A write was attempted | `{ entry_id, requested_tier, effective_tier, lane, source_identity, source_channel, status_assigned, downgrade_reason? }` |
| `memory_write_routed` | Tier-2/3 write surfaced for review | `{ entry_id, routed_to: string[], channel }` |
| `memory_write_confirmed` | Tier-1 reviewer approved | `{ entry_id, reviewer_identity, latency_to_confirmation_ms }` |
| `memory_write_rejected` | Reviewer rejected | `{ entry_id, reviewer_identity, reason }` |
| `compaction` | Memory or context compaction ran | `{ scope: "memory" \| "context", strategy: "auto" \| "reactive" \| "snip", entries_affected, tokens_saved }` |

### Composition

| Type | When | Metadata shape |
|---|---|---|
| `sub_agent_spawn` | Orchestrator spawned a specialist | `{ specialist, parent_session_id, sub_agent_session_id, workspace_scope }` |
| `sub_agent_complete` | Specialist finished | `{ specialist, sub_agent_session_id, success, files_written, latency_ms }` |
| `result_merge` | Orchestrator merged results | `{ specialists: string[], total_files, conflicts: FileConflict[] }` |
| `orchestrator_handoff` | Orchestrator routed input to a specialist | `{ from: "orchestrator" \| <agent_id>, to: <agent_id>, context_size_tokens }` |

### Output validation

| Type | When | Metadata shape |
|---|---|---|
| `output_validation_passed` | A marker validated against its schema | `{ marker_name, schema, layer }` |
| `output_validation_failed` | Validation failed | `{ marker_name, schema, error, raw_redacted, layer }` |
| `parser_fallback` | Layer 3 (heuristic) was used | `{ raw_excerpt, extracted, confidence }` |

### Verification and eval

| Type | When | Metadata shape |
|---|---|---|
| `verification_check_run` | A `runConvergenceLoop` check executed | `{ check_id, command, success, error?, attempt, max_attempts }` |
| `verification_fix_attempted` | A fixer ran on a failing check | `{ check_id, attempt, fix_applied?, fixed: boolean }` |
| `eval_task_run` | An eval task executed | `{ task_id, status: "pass" \| "fail" \| "manual", confidence, deltas }` |
| `eval_iteration` | Reinforcement loop iteration completed | `{ iteration, max_iterations, pass_rate, avg_score, mutations_count, status }` |

### Hooks and custom

| Type | When | Metadata shape |
|---|---|---|
| `hook_fired` | A lifecycle hook fired | `{ hook_name, handler_count, all_succeeded }` |
| `custom` | Pipeline-specific event | `{ namespace, event, payload }` — payload schema defined by pipeline |

## Pipeline-bound metadata schemas

Per [011 pipeline-manifest](011-pipeline-manifest.md), pipelines may declare per-type metadata JSON Schemas via the `decision_metadata_schemas[]` field. When present, the runtime validates each decision's `metadata` against the bound schema at write time. Without a binding, `metadata` is accepted as any object.

**Recommended for production pipelines.** Without bindings, two runtimes may emit decisions of the same type with incompatible metadata shapes — making cross-pipeline tooling and dashboard panels brittle. The binding pattern:

```json
{
  "decision_metadata_schemas": [
    { "type": "tool_execution_end", "schema_ref": "openclaw-v1:ToolExecutionEndMetadata" },
    { "type": "memory_write_proposed", "schema_ref": "openclaw-v1:MemoryWriteProposedMetadata" },
    { "type": "custom", "schema_ref": "schemas/ecc-custom-decision-metadata.schema.json" }
  ]
}
```

ECC's pipeline declares bindings for every decision type it emits. The conformance suite ([101](101-conformance.md)) checks for missing bindings on canonical types and warns when production pipelines ship without typed metadata for `tool_execution_end`, `memory_write_proposed`, and any custom types declared.

## Metrics

Alongside discrete decisions, the runtime emits scalar metrics for dashboarding:

```ts
interface DecisionMetric {
  pipeline_id: string;
  agent_id: string;
  session_id?: string;
  name: string;          // e.g., "tool_execution.latency_ms"
  value: number;
  unit: string;          // e.g., "ms", "tokens", "usd", "count"
  timestamp: string;
  labels?: Record<string, string>;  // e.g., { tool_name: "sandbox-exec" }
}
```

Canonical metrics (every pipeline emits):

- `decision_log.entry_count` — entries per session
- `tool_execution.latency_ms` — labeled by tool_name
- `error_classification.count` — labeled by category
- `retry.count` — labeled by category
- `memory_write.review_latency_ms` — time from proposed to confirmed
- `eval.pass_rate` — fraction of eval tasks passing per iteration
- `compaction.tokens_saved` — labeled by strategy
- `unknown_error.count` — early-warning signal for spec evolution

Dashboards (see [010](010-dashboard-panels.md)) consume metrics via a registered panel type.

## Querying the log

The runtime exposes a query API:

```ts
interface DecisionLogQuery {
  pipeline_id: string;
  agent_id?: string;
  session_id?: string;
  types?: DecisionType[];
  since?: string;             // ISO-8601 inclusive lower bound
  until?: string;             // ISO-8601 exclusive upper bound
  parent_id?: string;          // returns only direct children
  limit?: number;              // default 100, max 10000
  cursor?: string;             // for pagination
}

interface DecisionLogResult {
  entries: Decision[];
  next_cursor?: string;
  total_count: number;         // exact for limit < total
}
```

Used by:

- The dashboard's decision-log panel (live tail by type)
- The conformance test suite (asserts certain types appear / don't appear)
- The reflection tools in the eval loop (load failures from prior runs)
- Coding agents loading prior-decision context for similar tasks

## Redaction

Some metadata fields are sensitive: `original_message_redacted`, `raw_redacted`, `user_message_excerpt`. The runtime applies redaction rules **at write time**, not at read time:

- API keys, tokens, credentials → replaced with `<REDACTED:credential>`
- Email addresses outside the pipeline's authority list → replaced with `<REDACTED:email>`
- Workspace paths starting with `~/` or `/Users/` → replaced with `<REDACTED:home>`
- Anything matching configured patterns (per pipeline) → replaced with `<REDACTED:custom>`

Redaction is one-way. The unredacted version is never stored. **Pipelines do not have a "show me the unredacted version" mode** — if a redaction rule is wrong, fix the rule and the corrected version applies to future writes.

## Becomes a deliverable

For pipelines that ship the decision log to customers (ECC opts in), the runtime exports a slice on demand:

```
GET /api/pipelines/<id>/agents/<agent-id>/decisions/export?
  since=<iso>&until=<iso>&format=json|markdown|pdf
```

The markdown export renders each entry as:

```markdown
### 2026-04-27T14:32:01Z — tool_execution_end
- **agent**: takeoff-specialist
- **tool**: workspace-write
- **success**: true
- **latency**: 142 ms
- **summary**: wrote `.openclaw/deliverables/master-package.md`
```

The PDF export wraps the markdown with the pipeline's brand template (see [010](010-dashboard-panels.md)).

## Anti-example — common defects

**Free-text logging instead of typed events:**

```ts
log.info("Tool call failed because of rate limit");  // ❌ unstructured
```

This breaks aggregation, breaks the conformance test suite, and the dashboard cannot render it. Use:

```ts
decisionLog.write({
  type: "error_classified",
  description: "Rate limit on tool call",
  metadata: { category: "rate_limit", retryable: true, ... },
});
```

**Logging credentials:**

```ts
metadata: { command: "openclaw login --api-key=sk_xxx" }  // ❌ sensitive
```

The runtime's redaction catches this — the entry is rewritten with `<REDACTED:credential>` before persistence — but the *correct* fix is for the upstream code to never include credentials in metadata in the first place. Redaction is a safety net, not a primary defense.

**Missing parent_id:**

```ts
// inside a tool execution, but no parent_id linking back to the turn
decisionLog.write({ type: "memory_read", agent_id: ..., metadata: ... });
// ❌ orphans the entry — the dashboard can't reconstruct the call tree
```

The runtime fills in `parent_id` via execution context. Tools that call `decisionLog.write` directly (rare, discouraged) MUST pass the current parent_id.

## Cross-references

- [[002-agent-manifest]] — agent state transitions emit `stage_transition` entries
- [[003-tool-contract]] — every tool execution produces `tool_execution_start` + `tool_execution_end`
- [[004-memory-model]] — every memory state transition is logged
- [[007-sub-agent]] — sub-agent lifecycle entries
- [[008-eval-task]] — `eval_task_run` and `eval_iteration` entries
- [[010-dashboard-panels]] — the decision-log explorer panel reads via the query API
- [[013-hooks]] — `hook_fired` entries; hooks may also emit custom decision entries
- [[014-error-taxonomy]] — `error_classified` and related entries
- [[015-output-validator]] — `output_validation_failed` and `parser_fallback`

## Open questions for ECC pipeline

- Does the ECC PDF export need a per-deliverable section breakdown, or one chronological timeline? **Tentative**: per-deliverable, since reviewers traverse by deliverable not by time.
- Retention: ECC requests "all decisions for the entire engagement". Postgres bloat is a concern at fleet scale. **Tentative**: 90-day full retention + indefinite aggregated metrics + per-customer S3 export for archival.
- Multi-tenant query isolation — when the same Postgres instance hosts multiple customer pipelines, every query MUST scope to `pipeline_id`. **Tentative**: enforced at the query API layer; raw SQL access is forbidden in production.
