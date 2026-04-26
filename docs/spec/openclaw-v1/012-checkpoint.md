# 012 — Checkpoint and Resume

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/checkpoint.schema.json`](schemas/checkpoint.schema.json)

A checkpoint is a typed snapshot of an in-flight pipeline run, persisted server-side, that lets the runtime resume work after interruption — model rate-limit windows, gateway disconnects, scheduled maintenance, or simply work spanning multiple sessions. Without checkpointing, multi-hour pipeline work (ECC's 200-project training loop, large estimates) can't survive Anthropic's 5-hour token reset.

---

## Purpose

Three concrete failure modes the checkpoint system handles:

1. **Anthropic's 5-hour rate window.** A long-running estimate that consumes the window must resume mid-flight after the reset, not start over.
2. **Sandbox interruption.** A container restart, gateway reconnect, or transient `sandbox_unavailable` should not lose progress.
3. **Multi-session work.** A pipeline that spans days or weeks (ECC's 200-project loop) needs to pick up where it left off across sessions, even across operators.

Without checkpointing, the runtime has no persistent state between sessions and the agent re-derives everything every time. With it, work is incremental and survival-of-interruption is automatic.

## What goes in a checkpoint

A checkpoint snapshots **just enough** state to resume. Everything else is reconstructable from the workspace + decision log.

```ts
interface Checkpoint {
  // ── Identity ─────────────────────────────────────────
  id: string;                              // ULID
  spec_version: string;                    // for forward compat
  pipeline_id: string;
  agent_id: string;
  session_id: string;                      // session this checkpoint belongs to
  parent_checkpoint_id?: string;           // for chained snapshots within one session

  // ── Lifecycle ────────────────────────────────────────
  dev_stage: AgentDevStage;                // which stage this run is in
  created_at: string;                      // ISO-8601
  expires_at: string;                      // default created_at + 4h, configurable per pipeline

  // ── Copilot / orchestrator state ─────────────────────
  copilot_state: Record<string, unknown>;  // serialized partial CoPilotStore (essential fields)
  build_manifest: Array<{
    id: string;
    specialist: string;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    started_at?: string;
    completed_at?: string;
    error?: string;
  }>;

  // ── Conversation context ─────────────────────────────
  conversation_summary: string;            // compacted history (per 004-memory-model compaction)
  conversation_tokens_estimate: number;
  active_skill_id?: string;                // which skill was in flight
  active_tool_execution_id?: string;       // which tool was mid-call

  // ── Workspace state ──────────────────────────────────
  files_written: string[];                  // paths produced so far this session
  files_pending: string[];                   // paths the agent declared it would produce but hasn't yet
  workspace_checksum: string;               // sha256 of resolved workspace (excludes .openclaw/checkpoints/)

  // ── Sub-agents (if orchestrator-driven) ──────────────
  sub_agents: Array<{
    id: string;
    specialist: string;
    status: "pending" | "running" | "completed" | "failed" | "stopped";
    sub_session_id?: string;
    workspace_scope: string;
  }>;

  // ── Verification + eval ──────────────────────────────
  verification_progress?: {
    checks_passed: string[];
    checks_failed: string[];
    iteration: number;
  };
  eval_loop_progress?: {
    iteration: number;
    pass_rate: number;
    avg_score: number;
  };

  // ── Cause ────────────────────────────────────────────
  reason: CheckpointReason;
}

type CheckpointReason =
  | "scheduled_interval"      // periodic (every N minutes during a long run)
  | "rate_limit_imminent"      // saw Anthropic 429 → snapshot before retry-after window
  | "before_destructive_op"    // before a permission-approved destructive tool call
  | "sub_agent_handoff"        // before passing control to a specialist
  | "session_pause"            // human paused via dashboard
  | "manual"                   // explicit checkpoint via tool call
  | "stage_transition";         // before moving between dev stages
```

What's **not** included:

- The full conversation history (kept in the gateway/session log, summarized in `conversation_summary`)
- Memory entries (memory is persistent; checkpoints reference it by version, not embed it)
- Config docs (same — checkpoints reference the version that was current at snapshot time)
- Decision log entries (queryable separately by `(pipeline_id, agent_id, session_id)`)
- Tool implementations or skill source (workspace files + version are referenced)

The checkpoint is small (typically 5-50 KB) because it's a *coordinate* in state space, not the state itself.

## Storage

### Production (canonical)

Postgres table:

```sql
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  parent_checkpoint_id TEXT REFERENCES checkpoints(id),
  spec_version TEXT NOT NULL,
  dev_stage TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  workspace_checksum TEXT NOT NULL,
  retired_at TIMESTAMPTZ
);

CREATE INDEX checkpoints_pipeline_session ON checkpoints(pipeline_id, session_id);
CREATE INDEX checkpoints_expires ON checkpoints(expires_at) WHERE retired_at IS NULL;
```

Indexed for `(pipeline_id, session_id)` lookup (most common: "give me the latest checkpoint for this session") and for expiry sweeps.

### Workspace fallback

For environments without Postgres (early-stage prototyping, tests), a checkpoint may live at:

```
.openclaw/checkpoints/<id>.json
```

The runtime treats workspace checkpoints the same as Postgres-backed ones — same schema, same lifecycle, same query API. Pipelines may opt into workspace storage via manifest config; otherwise Postgres is used.

**The browser-only `localStorage` mode from the harness branch is removed in v1.** Browser sessions read checkpoints from the server through the gateway, never from the local browser. Browser-local state would mean checkpoints can't survive cross-device, can't be reviewed, and can't be queried — all unacceptable for production.

## Lifecycle

### Create

The runtime creates checkpoints automatically:

- **Periodically** during long runs (default every 10 minutes, configurable per pipeline)
- **Before destructive operations** that require human approval (snapshot-then-approve, so denial doesn't destroy progress)
- **Before sub-agent handoff** so the orchestrator can recover if a specialist fails
- **On stage transitions** (drafted → validated → tested → shipped)
- **On rate-limit imminent** (a 429 from the LLM provider triggers a defensive snapshot before backoff)
- **On explicit tool call** — agents can request `checkpoint(reason="manual")` (rare; usually unnecessary)
- **On session pause** when a human pauses the agent via the dashboard

### Resume

Resume happens at session start when the runtime detects:

- A previous session for the same `(pipeline_id, agent_id)` has an unretired checkpoint with `expires_at > now`
- The workspace's current checksum matches `workspace_checksum` (no out-of-band modifications)
- The pipeline's current spec version is compatible with the checkpoint's spec version (per [100 versioning](100-versioning.md))

If all three pass, the runtime:

1. Loads the latest checkpoint
2. Restores `copilot_state`, `build_manifest`, `conversation_summary`, `active_skill_id`, etc.
3. Marks `files_pending` as "to-do"
4. Resumes from the active skill / tool / sub-agent
5. Logs a `session_start` decision with `metadata.resumed_from = checkpoint_id`

If any check fails:

- **Workspace drift** → the runtime refuses to resume, surfaces a `MANIFEST_DRIFT` error pointing at the divergent files, and the human/architect must reconcile (regenerate `architecture.json` or revert workspace changes)
- **Spec version drift** → the runtime tries forward-compatibility per [100](100-versioning.md); if not compatible, marks the checkpoint stale and starts fresh
- **Expired checkpoint** → marked retired and a fresh session starts

### Retire

A checkpoint retires when:

- A successor checkpoint supersedes it (chained snapshots — the parent is retired)
- It expires (default 4 hours; configurable per pipeline up to 7 days)
- The session it belongs to closes successfully (final cleanup)
- It's explicitly retired via the dashboard (rare)

Retired checkpoints are kept in the table for 30 days for audit, then hard-deleted. The retention window is configurable per pipeline.

## Resume contract

When the runtime resumes, the agent sees these guarantees:

1. **`copilot_state` is the partial state from snapshot time.** The agent does not see "everything as if the run never paused" — it sees the snapshot, and resumes from it.

2. **`files_written` is authoritative.** The agent does not re-derive these. Skills that produced these files are marked `completed` in `build_manifest` and are not re-run.

3. **`active_skill_id` and `active_tool_execution_id` indicate where work was interrupted.** The runtime reconstructs the skill's context and resumes execution. If the tool execution was atomic-incomplete, the runtime treats it as never-having-started and re-executes with the same input.

4. **Decision log entries between snapshot time and resume are preserved.** They were written before the snapshot (during the in-flight session); the resumed session sees them as historical.

5. **Memory entries are loaded fresh.** A memory entry confirmed *during* the interruption window (e.g., a Tier-2 write Darrow approved while the rate window was waiting) is visible to the resumed session.

6. **Config is loaded fresh at the version current at resume time, not at snapshot time.** If labor rates updated during the interruption, the resumed run uses the new rates. (Time-travel reads against `at_version()` are explicit; default is current.)

The contract is: **resumption is forward-progress, not exact-replay.** The agent picks up where it left off but operates against the current world. This matches how a human would resume after a coffee break — same task, but you check the latest news first.

## Idempotency requirement

Skills that may be re-run on resume (because the runtime re-runs an interrupted-atomically tool or skill) MUST be idempotent. The conformance suite (see [101](101-conformance.md)) checks this:

- Tools marked `isConcurrencySafe: true` are required-idempotent (since they could run multiple times in parallel anyway)
- Skills produce well-known output paths and check existence before re-writing (the runtime helps with `if (await ctx.workspace.exists(path)) skip`)
- Side-effecting tools (`sandbox-exec` with destructive commands) are guarded by checkpoint-then-approve so a repeated execution requires fresh approval

A non-idempotent skill that re-runs may corrupt workspace state. The conformance suite includes a chaos test that interrupts random skills and asserts re-run produces the same final state.

## API

### Create

```ts
ctx.checkpoint.create({
  reason: CheckpointReason,
  metadata?: Record<string, unknown>
}): Promise<Checkpoint>
```

The runtime fills in `id`, `spec_version`, `pipeline_id`, `agent_id`, `session_id`, `created_at`, `expires_at`, and gathers state from current execution context. Skills don't construct the checkpoint themselves; they just declare intent.

### Resume detection

The runtime detects resume on session start; agents don't query for checkpoints. If a skill needs to know "was this resumed?", it reads `ctx.session.resumed_from` (set when applicable).

### Query (for dashboard / audit)

```ts
GET /api/pipelines/<id>/agents/<agent-id>/checkpoints?
  session_id=<id>&since=<iso>&limit=N
```

Returns the checkpoint list (newest first). Used by the dashboard's "session history" panel.

### Manual cleanup

```ts
DELETE /api/pipelines/<id>/agents/<agent-id>/checkpoints/<checkpoint-id>
```

Authorized by the pipeline owner. Soft-deletes (sets `retired_at`) until the 30-day audit window passes.

## Anti-example — common defects

**Snapshotting too much:**

```ts
checkpoint.payload.full_conversation_history = lastNTurns(10000);
// ❌ checkpoint becomes huge; cleanup becomes expensive
```

The checkpoint is a *coordinate*, not a backup. Conversation summary lives in `conversation_summary` (≤2k tokens). Full history is reconstructable from the gateway log + decision entries.

**Snapshotting too little:**

```ts
checkpoint.payload = { last_user_message: "..." };
// ❌ resume can't reconstruct which skill was running, what files were produced, etc.
```

The schema enforces required fields. The runtime rejects snapshots missing them.

**Resuming with stale workspace:**

```ts
// Human edited a skill file mid-pause; checksum mismatch on resume
// runtime "fixes" the mismatch by overwriting workspace from checkpoint
// ❌ destroys human edits
```

The runtime never overwrites workspace from a checkpoint. Drift = surface to human, refuse to resume. The human reconciles.

**Treating resume as exact replay:**

```ts
// Skill that emitted a side effect (sent an email) before the interruption
// On resume, skill re-runs from start, sends the email twice
// ❌ idempotency violation
```

Skills with side effects must check "did I already do this?" before acting. The runtime helps via `ctx.checkpoint.was_completed("send-email-X")` — a per-checkpoint deduplication ledger that tracks completed sub-steps.

## Cross-references

- [[002-agent-manifest]] — `dev_stage` transitions snapshot before transition
- [[003-tool-contract]] — destructive tool calls are bracketed by checkpoint-approve-execute
- [[004-memory-model]] — checkpoints reference current memory by version; resume reads fresh
- [[005-decision-log]] — `session_start` carries `resumed_from`
- [[007-sub-agent]] — sub-agent handoff snapshots first
- [[008-eval-task]] — eval loop snapshots between iterations so a failed iteration can roll back
- [[009-config-substrate]] — checkpoints reference current config by version; resume reads fresh
- [[014-error-taxonomy]] — `rate_limit` triggers `rate_limit_imminent` snapshot
- [[100-versioning]] — checkpoint forward-compatibility across spec minor versions
- [[101-conformance]] — chaos test for idempotency

## Open questions for ECC pipeline

- ECC's 200-project training loop spans weeks. Is 7 days the right max TTL, or do training loops need indefinite checkpoint retention until iteration completes? **Tentative**: per-pipeline override; ECC manifest sets training-loop checkpoints to 30 days; regular session checkpoints stay at 4 hours.
- For Lenovo-on-prem deployment, Postgres lives on the same box. Disk pressure from many checkpoints — sweep cadence? **Tentative**: hourly cron sweeps expired-but-unretired entries; nightly hard-delete sweep for retired entries past audit window.
- Multi-day estimates with intermediate human reviews — the human approves a deliverable, then the agent continues. Does each approval create a checkpoint? **Tentative**: yes, with `reason: stage_transition` so the audit trail shows each approval gate clearly.
