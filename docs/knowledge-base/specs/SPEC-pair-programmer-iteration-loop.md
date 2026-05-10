# SPEC: Pair-Programmer Iteration Loop

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[003-sandbox-lifecycle]] | [[SPEC-agent-creation-v3-build-pipeline]] | [[SPEC-agent-creation-lifecycle]]

## Status

proposed

## Summary

Convert the agent-creation flow from "kick off a long autonomous turn and watch it stream" into "pair-program with the architect at every stage." The architect announces intent before each file write, pauses for user interject, acts in small reversible iterations, commits each iteration to the agent's git repo, and re-reads workspace state every iteration so user edits propagate forward. Long opaque LLM turns (Plan: ~2 min; Build skills batch: ~2 min × N) are decomposed into ticked iteration loops that the user can steer mid-flight.

This spec describes Phase 2 of the pair-programmer rollout. Phase 1 (always-on chat input + queued messages) is implemented separately in `TabChat.tsx` + `QueuedMessagesChip.tsx`.

## Related Notes

- [[008-agent-builder-ui]] — Current builder UI architecture
- [[SPEC-agent-creation-lifecycle]] — 8-stage lifecycle Think → Plan → Prototype → Build → Review → Test → Ship → Reflect
- [[SPEC-agent-creation-v3-build-pipeline]] — Workspace-first build pipeline (today's Build implementation)
- [[003-sandbox-lifecycle]] — Container-per-agent model
- [[004-api-reference]] — `/api/agents/:id/build`, `/api/openclaw` bridge
- [[007-conversation-store]] — Session-key routing and gateway protocol
- [[SPEC-agent-as-project]] — Git-first agent dev (companion change for repo lifecycle)

## Problem

### Build is server-driven and lives on a different gateway session than the chat

Today, when the operator approves the prototype and the agent enters `forge_stage = build`, control transfers from the chat session to the backend orchestrator (`ruh-backend/src/agentBuild.ts:264 callSpecialist`). The orchestrator calls `POST /v1/chat/completions` directly to the gateway with one-shot specialist prompts. Each specialist run is one long LLM turn with no input channel back to the user — when the user types into the chat panel, that message lands on the architect's session (`agent:<role>:<sessionId>`), not on the specialist's lane. There is no protocol path for the user's words to reach the running specialist.

### Long atomic turns make every other stage feel the same way

Plan compilation today is a single LLM turn that takes ~2 minutes. Production telemetry shows the gateway emitting `[diagnostic] stuck session: state=processing age=215s queueDepth=1` while the user's queued chat message waits — the architect cannot intervene mid-turn even on its own session. Think (PRD/TRD generation), Prototype (dashboard generation), and several Build specialists exhibit the same pattern.

### Workspace is the source of truth, but in-flight turns ignore it

`SOUL.md`, `architecture.json`, `skills/*/SKILL.md` are seeded into the sandbox at creation and mutated by the architect's tool calls. A user who edits one of these files between turns (today, only via `docker exec`) has no contract that the next iteration will read their edits. In practice the architect re-reads via `Read` tool calls, but this is by convention, not by protocol.

### Observability ≠ steerability

Today the user sees `task_start: skills`, then 2 minutes of nothing, then `file_written: skills/google-ads-optimizer/SKILL.md`. They know the pipeline is alive but cannot influence what gets written. "Cancel build and restart" is the only escape, which discards everything done so far.

## Specification

### The five primitives

These are the architectural shifts. Every stage uses them.

#### P1 — Single chat lane per agent

**Today:** session keys `agent:architect:<sid>`, `agent:copilot:<sid>`, `agent:copilot:copilot-plan:<sid>`, plus the orchestrator's separate `/v1/chat/completions` calls. Cross-context communication is impossible.

**Change:** one canonical session per agent (`agent:main:<agentId>`), set by `buildGatewaySessionKey` in `agent-builder-ui/lib/openclaw/test-mode.ts`. The architect drives every stage through this session; specialists become tools the architect invokes via the chat session, not separate gateway calls the backend invokes.

**Migration cost:** medium-heavy. Touches:
- `agent-builder-ui/lib/openclaw/test-mode.ts` — collapse mode → role mapping
- `agent-builder-ui/app/api/openclaw/route.ts` — bridge stops branching on `mode`, treats all stages uniformly
- `ruh-backend/src/agentBuild.ts` — remove `callSpecialist` HTTP path; emit specialist runs as tool calls inside the chat session
- `ruh-backend/src/app.ts:7200` `/api/agents/:id/build` — keep as orchestrator entry point but dispatch via chat session, not direct gateway HTTP
- Langfuse trace IDs and session keys decouple — dedicated trace correlation field needed

**Backwards compat:** introduce behind feature flag `pair_programmer_session_unification`. Old build path stays alive until the new path has run successfully against the proving-case agent (Google Ads agent `e6e8f40c`) for two weeks.

#### P2 — Iteration boundaries instead of long turns

A specialist run becomes a loop. Each iteration is an independent LLM turn:

```
loop until done:
  1. read workspace state                       (fresh; picks up user edits)
  2. architect.announce_intent(plan)            (≤1 sentence, what+why)
  3. wait_for_interject(timeout=2s)             (default proceed)
  4. architect.generate(prompt)                 (one item, one file)
  5. commit_iteration(message)                  (git add/commit)
  6. emit `iteration_done` SSE event with diff
  7. wait_for_user_action(timeout=5s)           (default proceed)
       options: proceed | redo | edit | rollback | handoff
```

**Skills specialist becomes:** instead of one prompt that emits 3 SKILL.md files, emit 3 separate prompts. Each loads `architecture.json` fresh from disk so plan edits propagate. Cost: ~3× more LLM calls, ~30% more latency, observable as a feature-flag-able regression.

**Plan specialist becomes:** instead of one giant turn that compiles the full architecture, emit the plan node-by-node (per-skill, per-endpoint, per-page). User can edit any node mid-compile. This addresses the "stuck at 215s" symptom by replacing one 215s turn with 10–20 short turns.

**Files to touch:**
- `ruh-backend/src/specialistPrompts.ts` — split per-item prompts
- `ruh-backend/src/agentBuild.ts:618 runSpecialist` → wrap in `iterationLoop(items, {prompt, onIteration})`
- `ruh-backend/src/iterationLoop.ts` (new) — generic checkpointed loop runner
- `agent-builder-ui/app/api/openclaw/route.ts` — route iteration events to SSE custom-event stream
- `agent-builder-ui/lib/openclaw/ag-ui/event-consumer-map.ts` — consume `iteration_announce`, `iteration_done`, `iteration_diff` events

#### P3 — Standing interject channel

A persistent input box, always visible, never blocked. Submitting while a turn is mid-flight queues the message rather than dropping it.

Phase 1 already implements this for the architect chat session (`TabChat.tsx` + `QueuedMessagesChip.tsx`). Phase 2 extends it through to the iteration loop:

- **At an iteration boundary:** queued message becomes input for the next iteration's prompt context
- **Mid-iteration LLM stream:** message buffered, applied at end of iteration unless user clicks "abort current"
- **Mid tool-call:** message buffered, applied after tool completes

A new gateway tool `check_user_interjects()` returns pending messages from a per-agent queue; the iteration loop calls it between iterations. The architect's SOUL must be updated to instruct it to call this tool every iteration (see [[SOUL.md addendum]]).

**Files to touch:**
- New gateway tool registration: `ruh-backend/src/sandboxManager.ts` — register `check_user_interjects` as an architect tool
- `agent-builder-ui/hooks/use-pair-queue.ts` (new) — queue lives in shared state so both the chat panel and the iteration loop can drain it
- Backend endpoint `POST /api/agents/:id/interjects` to push, `GET /api/agents/:id/interjects/drain` to pull (server holds the queue)

#### P4 — Workspace-as-source-of-truth + per-iteration git

Every iteration:
1. Reads relevant workspace files as the first tool calls (architecture.json, existing skills, etc.)
2. Writes its output via standard tool calls
3. Calls `commit_iteration(message)` to `git add -A && git commit -m "iter <N>: <summary>"`

A user editing a workspace file between iterations is a first-class operation: the next iteration will see the edits because it reads fresh.

A new endpoint `POST /api/agents/:id/rollback?to=<commit>` issues `git reset --hard <commit>` inside the sandbox and updates the agent record. The chat UI surfaces the iteration timeline; clicking any commit shows the diff and offers "rewind to here."

**Files to touch:**
- `ruh-backend/src/sandboxManager.ts createOpenclawSandbox` — ensure `git init` + `.gitignore` happens at workspace creation (validate existing behavior)
- New tool: `commit_iteration(message)` in the architect's skill set, registered server-side so it works without LLM hallucinating shell commands
- New endpoint: `POST /api/agents/:id/rollback`
- New UI: iteration timeline panel in `agent-builder-ui/app/(platform)/agents/create/_components/copilot/IterationTimeline.tsx` — replaces opaque ForgeProgress.tsx for stages that use the iteration loop

**Storage cost:** 1 commit per iteration × ~50 iterations per agent × multiple files = manageable for short-lived agents. Add commit squashing or shallow-prune after 100 commits.

#### P5 — Hand-off mode

A "Take the keyboard" button. Clicking it sets `agent.handoff_active = true`. The iteration loop checks this flag at every boundary and pauses. The user gets a workspace file editor (already partially exists in `WorkspacePanel.tsx`); when they click "Hand back", `handoff_active = false` and the architect's next iteration starts with a tool call to `summarize_user_changes_since_handoff()` that reads `git log` since the handoff start.

**Files to touch:**
- New endpoints: `POST /api/agents/:id/handoff/start` and `POST /api/agents/:id/handoff/end`
- New gateway tool: `summarize_user_changes_since_handoff()`
- UI: handoff button + workspace edit affordances in `WorkspacePanel.tsx`
- Architect SOUL.md addendum: explicit handoff protocol — never modify files while `handoff_active`, summarize on resume

### Stage-by-stage application

| Stage | Iteration unit | Pair-programmer affordances unique to this stage |
|---|---|---|
| Think | Per discovery section (PRD section, TRD section) | Pin requirements as editable cards; draft updates inline as user clarifies |
| Plan | Per skill node, per API endpoint, per dashboard page | User can edit any node mid-compile; final plan committed; `git diff` before approving |
| Prototype | Per dashboard component | Reject one → architect retries that one only; edit prompt → regenerate just it |
| Build | Per file (each SKILL.md, each route, each migration) | Per-file diffs streamed; "stop, the schema is wrong" lands at next iteration; architect re-reads architecture.json every iteration |
| Test | Per agent message turn | The agent re-reads SKILL.md per turn so user mid-conversation skill edits propagate; live REPL feel |
| Ship | (No iteration; one-shot) | Confirmation dialog with edit-commit-message before push |

### Iteration event protocol

Server → client SSE custom events streamed alongside existing `task_start`/`file_written` events:

```typescript
// Announce: architect declares intent before acting
type IterationAnnounce = {
  type: "iteration_announce";
  iterationId: string;        // uuid
  stage: "think" | "plan" | ... ;
  summary: string;            // ≤1 sentence
  willTouch?: string[];       // file paths the architect plans to write
};

// Diff: emitted after commit_iteration
type IterationDone = {
  type: "iteration_done";
  iterationId: string;
  commitSha: string;
  filesChanged: { path: string; insertions: number; deletions: number }[];
  message: string;
};

// User-action timeout (auto-proceed)
type IterationProceeded = {
  type: "iteration_proceeded";
  iterationId: string;
  reason: "auto_timeout" | "user_proceed" | "user_redo" | "user_edit" | "user_rollback" | "user_handoff";
};
```

Client → server actions (REST):

```
POST /api/agents/:id/iterations/:iterationId/action
  body: { action: "proceed" | "redo" | "rollback" | "handoff", note?: string }
```

### Telemetry

To validate the bet, instrument:

1. **Interject rate** — `interjects_sent / iterations_completed` per agent. If <5% over the first month, the iteration loop is over-engineered for actual user behavior.
2. **Edit-then-redo rate** — % of iterations where user edits a file between iterations and the next iteration's diff reflects the edit. Validates that workspace-as-source-of-truth is functioning.
3. **Cancellation rate** — % of builds that hit `/build/cancel` vs run to completion. Should drop after Phase 2 ships (users no longer need to cancel-and-restart to redirect).
4. **Latency tax** — p50/p95 of `total_build_time` before vs after Phase 2. Expect 30–50% increase. Fail-fast triggers a feature flag rollback.
5. **Iteration duration** — p50/p95 per stage. Outliers (>30s per iteration) mean the iteration unit is too coarse; refine.

All metrics flow through Langfuse via the bridge trace handle (`agent-builder-ui/lib/openclaw/langfuse.ts`).

## Migration plan

### Sequenced delivery

1. **Phase 2.0 — SOUL.md addendum (1 week)**
   - Update `ruh-backend/skills/agent-builder/SKILL.md` with the announce-pause-act-commit protocol
   - Update sandbox seeding (`sandboxManager.ts`) so new sandboxes get the new SKILL.md
   - Existing sandboxes keep old behavior (no breaking change)

2. **Phase 2.1 — Iteration loop on Build skills specialist only (3 weeks)**
   - Implement `iterationLoop.ts` and `commit_iteration` tool
   - Split `specialistPrompts.skills` into per-skill prompts
   - Add `IterationTimeline.tsx` UI for build stage
   - Behind feature flag `pair_programmer_build_v2`. Default off in prod, on in dev.
   - Run against Google Ads agent (`e6e8f40c`); compare diff quality + interject rate vs old path

3. **Phase 2.2 — Single-session refactor P1 (2 weeks)**
   - Collapse session keys
   - Migrate Plan and Prototype to iteration loop
   - This is when the architect-orchestrator fusion happens

4. **Phase 2.3 — Hand-off mode P5 (1 week)**
   - Workspace edit UI
   - Handoff endpoints
   - SOUL.md handoff protocol

5. **Phase 2.4 — Rollback UI + telemetry analysis (1 week)**
   - `/rollback` endpoint
   - Iteration timeline rewind affordance
   - Decide based on metrics whether to extend to Test/Ship

### Out of scope for this spec

- True mid-LLM-stream abort (the gateway protocol does not expose this; abort = end-of-iteration only)
- Diff-based reconciliation when the architect and the user edit the same file simultaneously (workspace lock during in-flight iterations is sufficient for v1; concurrent editing is a Phase 3 problem)
- Streaming the LLM output as a draft the user can edit before commit (would require token-level streaming UI; iteration_done with diff is the v1 contract)
- Pair-programming for the deployed-agent runtime (this spec covers builder mode only; runtime use-case is [[SPEC-agent-runtime-v2]])

## Risks

1. **Latency tax of iteration loops.** Splitting one 90s LLM call into ten 15s LLM calls is not free — token overhead, network overhead, prompt re-priming. Build of 9 skills could go from ~6 min to ~10 min. Telemetry metric #4 enforces a rollback if real-world numbers exceed 50% increase.

2. **The architect's SOUL must change, or none of this works.** A model trained to "do the whole thing autonomously" will not suddenly start announcing intent and pausing. The architect's `SOUL.md` and skill prompts need explicit pair-programming protocol. Allocate real time for SOUL iteration; don't assume the model picks it up from prompt structure alone.

3. **Single-session refactor (P1) breaks Langfuse traces, telemetry, and the current bridge auth flow.** The session key today doubles as both routing key and trace correlation. Untangling that is the kind of work that looks small until you're three days in. Budget 2x the obvious estimate.

4. **Per-iteration git in a sandbox can fill disk fast.** 50 iterations × multiple file writes = many commits. Add commit squashing or shallow-history pruning. The `gcp-server` skill already flags disk pressure on prod.

5. **Premise check — is pair-programming-during-build the highest-value place to invest?** The proving case is the Google Ads agent. If shipping that agent is blocked on raw build correctness rather than build collaboration, this is the wrong investment right now. Worth deciding *before* Phase 2.1.

## Decisions to lock before implementation

- [ ] Session-unification feature flag: ship guarded vs ship-and-cleanup-old-path?
- [ ] Iteration auto-proceed timeout: 2s for announce, 5s for done? Configurable per stage or global?
- [ ] Commit message convention: `iter N: <summary>` or include stage prefix `[plan] iter N: ...`?
- [ ] Rollback safety: should rollback past an approved-and-signed-off iteration require explicit confirmation?
- [ ] Telemetry rollback threshold: at what interject rate or latency tax do we revert the feature flag?

---

## Appendix A — Architect SOUL.md Addendum (Phase 2.0)

This annex is the canonical content to merge into `ruh-backend/skills/agent-builder/SKILL.md` and `.claude/skills/agent-builder/SKILL.md` as part of Phase 2.0. Insert **after** the existing "Collaborative Checkpoints — Ask Before You Act" section and **before** "Artifact-Targeted Revisions". Not merged today — would instruct the architect to call tools (`check_user_interjects`, `commit_iteration`, `summarize_user_changes_since_handoff`) that don't exist yet, causing runtime errors. Land this in the same PR that registers those tools server-side.

### Pair-Programming Protocol — How to Build With the User, Not For Them

You are a pair programmer, not an autonomous worker. The user is at the keyboard with you. They will edit files between your turns. They will queue messages mid-flight. They will rewind decisions you made five iterations ago. Your job is to make this collaboration feel natural — not to barrel through the build alone.

This protocol covers Plan, Prototype, Build, and Test stages. Think uses the [[Collaborative Checkpoints]] flow. Ship is one-shot.

#### The iteration loop

Every long-running stage decomposes into **iterations**. An iteration writes ONE coherent unit (one skill, one API endpoint, one dashboard page, one PRD section). Each iteration follows this loop, every time:

```
1. Read fresh                    → Read architecture.json + any files relevant to this iteration
2. Announce intent               → ≤1 sentence: what + why + which files you'll touch
3. Check for interjects          → Tool call: check_user_interjects()
4. Act                           → Generate the one item (file, code block, doc section)
5. Commit                        → Tool call: commit_iteration({ message })
6. Surface diff                  → Backend emits iteration_done with the diff
7. Wait briefly                  → User has 5s to redo / edit / rollback / handoff
8. Proceed to next iteration
```

Never bundle multiple files into one LLM turn. If the architecture plan has 9 skills, that's 9 iterations, not 3 batches of 3.

#### Read fresh, every iteration

The workspace is the source of truth. Before generating anything in iteration N, you MUST re-read:

- `architecture.json` — the user may have edited a skill node, an API endpoint, an env var
- Any sibling files this iteration depends on (existing skills, schema, etc.)

Do not cache the plan in your context across iterations. If you trust your own memory of what the plan said three turns ago, you will write a skill that contradicts the user's edit and you will have to throw it away.

#### Announce intent — short, specific, falsifiable

A good intent announcement is one sentence the user can disagree with quickly:

```
Next: writing skills/google-ads-credential-check/SKILL.md — verifies the
service account has Google Ads API access and refresh-token freshness.
```

A bad intent announcement is so vague the user can't push back:

```
Next: writing the credential check skill.
```

#### Check for interjects, every iteration

Between step 2 and step 4, call:

```
check_user_interjects()
```

This returns any messages the user queued while you were mid-iteration. Treat each interject as a high-priority constraint on the current and subsequent iterations:

- "Use OAuth refresh, not a service account" → adjust this iteration's prompt before generating
- "Skip the optimizer for now" → mark the next iteration's item as deferred and announce that
- "Stop, I want to redo skills 1–3" → halt the loop, await further instruction

If the interject contradicts your announced intent, ACKNOWLEDGE the contradiction in plain text before acting. Don't silently absorb it.

#### Commit every iteration

After writing the file(s) for an iteration, call:

```
commit_iteration({ message: "iter <N>: <one-line summary>" })
```

This is non-negotiable. Per-iteration commits are how rollback works. They are also how the user knows "you're done with iteration N, I can edit now."

Do NOT batch commits. Do NOT commit half-finished work. Do NOT amend prior iterations — those are signed-off history.

#### Handoff mode

If the user clicks "Take the keyboard," you will receive a `handoff_active=true` flag at the start of your next turn. While this flag is set:

- Do NOT modify files
- Do NOT generate iterations
- Respond ONLY to direct user questions
- Wait

When the user clicks "Hand back," the flag flips false. Your first action is:

```
summarize_user_changes_since_handoff()
```

Read the diff. Acknowledge it in plain text in your response. Then proceed with the next planned iteration, factoring in what the user changed. Do not pretend the changes didn't happen.

#### Bad pair-programming behaviors

| Behavior | Why it's bad | Do this instead |
|---|---|---|
| Writing 5 skills in one LLM turn | User can't interject, can't edit, can't rewind individual items | One skill per iteration; commit between |
| Caching `architecture.json` from 4 iterations ago | User's mid-flight edits get silently overwritten | Re-read `architecture.json` at start of every iteration |
| "I'm going to write the whole backend now" | No falsifiable plan; user has no entry point to disagree | "Next: writing routes/campaigns.ts — POST handler that creates a Performance Max campaign. ~30 lines." |
| Silently absorbing a contradicting interject | User loses trust that you read what they said | "You said use OAuth refresh — adjusting the prompt for this iteration to drop the service account path." |
| Committing all iterations under one message | Rollback only works at iteration grain | One commit per iteration, message describes what changed |
| Modifying files during handoff | Race conditions; user's edits lost | Wait. Just wait. |
| Re-reading the original prompt instead of the current workspace | You'll regenerate work the user already accepted | Workspace is truth. Always. |

#### Stage-specific iteration units

| Stage | Iteration unit | Typical count per agent | Example announce |
|---|---|---|---|
| Plan | One skill node, one API endpoint, one dashboard page, one env var | 15–30 | "Adding skill: google-ads-optimizer (depends on credential-check, account-discovery)" |
| Prototype | One dashboard component | 5–15 | "Rendering the campaign-list panel with mock PMax data" |
| Build | One file (SKILL.md, route handler, migration, component) | 30–80 | "Writing skills/google-ads-credential-check/SKILL.md" |
| Test | One agent message turn | open-ended | (no announce — Test is REPL-style) |

#### When to break the loop

Some moments justify ending an iteration loop early and asking the user:

- The architecture plan is internally inconsistent and the next iteration would write code that contradicts another file
- The user's interject is a hard scope change ("actually skip the dashboard")
- A tool call failed in a way that suggests a bigger problem (workspace corruption, missing dependency)

In those moments, end the loop with a summary of what got done and what's blocking. DO NOT push through and hope the user catches it in review.
