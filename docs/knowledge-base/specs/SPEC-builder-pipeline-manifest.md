# SPEC: Builder Pipeline Manifest Emission + Conformance Gate

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[004-api-reference]] | [[SPEC-agent-creation-lifecycle]]

## Status

implemented

## Summary

The agent builder now derives a v1-conformant `pipeline-manifest.json`
from each completed `ArchitecturePlan` and writes it to the agent's
workspace alongside `architecture.json`. The Ship stage validates that
manifest against the OpenClaw v1 spec via `POST /api/conformance/check`
before deploy, blocking on substrate-level errors.

**Path A (shipped)** — single-agent pipelines: `len(agents) === 1`,
trivial orchestrator, one Tier-1 memory_authority row in a generic
`main` lane.

**Path B Slice 1 (shipped)** — multi-agent fleet emission: when
`plan.subAgents` is populated, the manifest grows into a fleet shape —
`agents[]` carries the main orchestrator plus one entry per sub-agent,
`routing.rules` are derived from each sub-agent's trigger,
`failure_policy` defaults to `retry-then-escalate` per sub-agent, and
`memory_authority` gets one Tier-1 row per sub-agent (lane = sub-agent
id, operator as the writer). Empty `subAgents` preserves the Path A
single-agent shape exactly.

Path B Slice 2 (architect's Plan instruction extended to elicit fleets),
Slice 3 (Build pipeline decomposed across sub-agents), and Slice 4
(real per-role memory authority captured in Think/Plan) follow as
separate PRs.

## Related Notes

- [[008-agent-builder-ui]] — Plan stage event flow + Ship stage UI
- [[004-api-reference]] — `POST /api/conformance/check` endpoint
- [[SPEC-agent-creation-lifecycle]] — full 7-stage lifecycle reference
- [[SPEC-agent-creation-v3-build-pipeline]] — Plan stage architecture.json contract
- The runtime substrate package (`packages/openclaw-runtime/`) — owns
  the canonical `PipelineManifest` shape and `runConformance()`

## Specification

### Manifest derivation

`agent-builder-ui/lib/openclaw/pipeline-manifest-builder.ts` exports:

```ts
export function buildPipelineManifest(
  args: BuildPipelineManifestArgs,
): unknown;
```

Pure function. No I/O, no LLM calls. Inputs:

| Field | Source |
|---|---|
| `agentName`, `agentDescription` | copilot store `name` + `description` |
| `plan` | `ArchitecturePlan` from copilot store |
| `operatorIdentity` | optional; defaults to `'operator'` |
| `llmProvider` + `llmModel` | optional; populate `runtime.llm_providers[0]` when both supplied. **When omitted, the builder defaults to a single `{ provider: "anthropic", model: "claude-opus-4-7", via: "tenant-proxy" }` entry** to keep the manifest schema-valid (the substrate's `RuntimeRequirements.llm_providers` requires a non-empty array). Path B replaces this default with the real per-agent selection once the agent record carries provider/model through to Plan-complete. |
| `tenancy`, `egress` | optional; default `'dedicated'` / `'open'` |
| `devStage` | optional; default `'drafted'` |

Output is a JSON object that matches the substrate's `PipelineManifest`
schema (`packages/openclaw-runtime/src/pipeline-manifest/types.ts`).

### Path A shape (single-agent — `plan.subAgents` empty)

- `agents`: exactly one entry — `{ id: 'main', path: 'agents/main/', role: 'Single-agent pipeline', is_orchestrator: true }`
- `orchestrator.skills`: mirrors `plan.skills[].id`
- `routing`: `{ rules: [], fallback: 'main' }`
- `memory_authority`: `[{ tier: 1, lane: 'main', writers: [operator] }]`
- `runtime.required_integrations`: derived from `plan.integrations[].toolId`; omitted when empty
- `dashboard`: stub reference to `dashboard/manifest.json` — Path B emits the actual manifest
- `hooks`, `custom_hooks`, `config_docs`, `imports`, `merge_policy`: empty
- `failure_policy`: `{}`
- `output_validator`: minimum substrate-acceptable shape with `layers: ['marker']`
- `checksum`: `sha256:<64 zeros>` placeholder; deploy recomputes the real digest

### Path B Slice 1 shape (fleet — `plan.subAgents` non-empty)

When the architect populates `plan.subAgents`, the manifest grows from
the Path A shape:

- **`agents`** = `[main, ...subAgents]`:
  - main flips its role from `'Single-agent pipeline'` to `'Pipeline orchestrator'`; `is_orchestrator: true` stays.
  - Each sub-agent contributes one entry: `{ id: sa.id, path: 'agents/<sa.id>/', version, role: sa.description || sa.name }`.
  - Sub-agents NEVER carry `is_orchestrator: true` — the substrate pins exactly one orchestrator per pipeline; main owns it.
- **`routing.rules`**: one rule per sub-agent with a non-empty `trigger`:
  ```json
  { "match": { "stage": "<sa.trigger>" }, "specialist": "<sa.id>" }
  ```
  Sub-agents with empty triggers fall through to `routing.fallback` (`'main'`).
- **`failure_policy`**: `{ <sa.id>: 'retry-then-escalate' }` per sub-agent. Path B Slice 2 will let the architect override per-agent.
- **`memory_authority`**: `[{tier:1, lane:'main', writers:[operator]}, ...{tier:1, lane:'<sa.id>', writers:[operator]}]`. Each sub-agent gets its own lane so writes from one specialist don't overwrite another's. Operator stays the only writer until Path B Slice 4 captures real per-role identity.

`plan.subAgents` is parsed by [`plan-formatter.ts`](../../../agent-builder-ui/lib/openclaw/plan-formatter.ts) as `SubAgentConfig[]` — id, name, description, type, skills, trigger, autonomy. Today the architect's Plan instruction does not yet elicit them; Path B Slice 2 lands the prompt change that makes the architect actually emit fleets when scope demands it.

### Path B Slice 1 caveat

The emitted manifest is structurally valid for fleets, but the
per-sub-agent file trees the manifest references (`agents/intake/`,
`agents/takeoff/`, etc.) are NOT generated until Path B Slice 3 lands
the build-pipeline decomposition. Today the manifest can be validated
end-to-end through `runConformance()` (and is, in tests), but a real
multi-agent build still produces a single-agent file tree. Don't ship a
fleet pipeline through the Ship gate until Slice 3.

### Emission point

`agent-builder-ui/lib/openclaw/ag-ui/event-consumer-map.ts ::
consumePlanComplete` calls `emitPipelineManifest()` after the
`ArchitecturePlan` is loaded into the copilot store (whether from the
incremental markers or recovered from disk). The manifest is written to
`.openclaw/plan/pipeline-manifest.json` in the **copilot workspace**.
The existing `mergeWorkspaceCopilotToMain()` step in `ruh-backend`'s
build pipeline copies it into the main agent workspace alongside
`architecture.json`.

Failures in manifest emission are logged as
`plan_complete:pipeline_manifest_write_failed` traces but never throw —
the plan is still usable for Build, and the Ship-stage conformance
gate surfaces a missing/invalid manifest loudly.

### Ship-stage conformance gate

`StageShip` in
`agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`
calls `runDeployConformanceCheck()` (from
`agent-builder-ui/lib/openclaw/ship-conformance-check.ts`) as the first
action in `handleDeploy`, before the Save step. The gate returns a
discriminated outcome:

- `{ status: "ok" }` — manifest validates, deploy proceeds
- `{ status: "skipped" }` — manifest absent in workspace (Path A
  soft-skip; Path B will harden into a block)
- `{ status: "blocked", reasons: string[] }` — deploy MUST NOT proceed.
  Used both for substrate-reported errors AND for any infrastructure
  failure that prevented validation from running.

Internally the gate:

1. Reads `.openclaw/plan/pipeline-manifest.json` via
   `strictReadWorkspaceFile()` — copilot workspace first, falling back to
   main workspace
2. POSTs to `/api/conformance/check` with `{ pipelineManifest }`
3. Filters out the substrate's `dashboard-manifest-required` finding
   (Path A doesn't emit a dashboard manifest yet — Path B will)
4. Returns the remaining error messages

The gate **fails closed** on every infrastructure failure path:

| Failure | Outcome |
|---|---|
| Workspace read returns 404 in copilot AND main | `skipped` (legit absence) |
| Workspace read returns 401/403 (auth dropped) | `blocked` |
| Workspace read returns 5xx | `blocked` |
| Workspace returns 200 with non-JSON body | `blocked` |
| Workspace returns 200 with no `content` field | `blocked` |
| Manifest JSON parse fails | `blocked` |
| `/api/conformance/check` network failure | `blocked` |
| `/api/conformance/check` returns non-OK status | `blocked` |
| Conformance response not JSON / missing `report.findings[]` | `blocked` |
| Substrate reports any error finding (excl. `dashboard-manifest-required`) | `blocked` |

The gate intentionally does NOT use the shared
`workspace-writer.ts::readWorkspaceFile` helper. That helper collapses
every error to `null` so UI display callers can render a uniform "no
content" state. Reusing it here would let a 401 or 5xx mid-deploy
silently look like a missing manifest, which the gate would then treat
as a soft-skip — bypassing conformance without the operator ever
knowing.

### Authoring contract

This contract is intentionally narrow:

- The architect's prompts are unchanged. The manifest is derived, not
  emitted by the LLM.
- The substrate is the authority on what's valid. The builder does not
  re-implement validation rules — it calls `runConformance()` through
  the existing `/api/conformance/check` HTTP boundary.
- Path B work — multi-agent `agents[]`, real memory authority
  elicitation, dashboard manifest emission, removing the soft-skip
  semantics of the gate — replaces parts of this spec rather than
  extending it. Each Path B PR is expected to update this note.

## Tests

- `agent-builder-ui/lib/openclaw/pipeline-manifest-builder.test.ts`:

  Substrate conformance + derivation rules:
  - canonical (single-agent) shape passes `runConformance()` with no fatal findings
  - id derivation (kebab-case from agent name, fallback to `'pipeline'`)
  - `orchestrator.skills` mirrors `plan.skills[].id`
  - exactly one Tier-1 memory_authority row with the operator identity (single-agent)
  - operator identity defaults to `'operator'` when not supplied
  - integrations become `runtime.required_integrations`; omitted when empty
  - `llm_providers` defaults to `[{anthropic, claude-opus-4-7, tenant-proxy}]` when provider/model not supplied (substrate requires non-empty array)
  - default-emit (no llm args) round-trips through `runConformance()` with no fatal findings
  - tenancy/egress/dev_stage defaults + overrides
  - checksum carries `sha256:<64-hex>` placeholder
  - generated_at is stable when supplied

  Single-agent shape (Path A preserved):
  - empty `subAgents` → exactly one agent with role `'Single-agent pipeline'`
  - empty `subAgents` → empty `routing.rules`, empty `failure_policy`, single memory row in `'main'` lane
  - hooks / custom_hooks / config_docs / imports / merge_policy empty

  Multi-agent fleet (Path B Slice 1):
  - `agents[]` = main orchestrator + one entry per sub-agent (declaration order preserved)
  - main role flips from `'Single-agent pipeline'` to `'Pipeline orchestrator'` when fleet emerges
  - sub-agents NEVER carry `is_orchestrator: true`
  - `routing.rules` emitted only for sub-agents with non-empty trigger; rest fall through to fallback
  - `failure_policy` carries one entry per sub-agent (default `retry-then-escalate`)
  - `memory_authority` carries one row per agent (main + each sub-agent), operator as writer in every row
  - multi-agent manifest passes `runConformance()` with no fatal findings (regression pin for fleet emission)

## Out of scope (Path B Slices 2-4 and beyond)

- **Slice 2** — Architect's Plan instruction extended to elicit fleets. Today the architect leaves `plan.subAgents` empty; this module emits the right manifest IF subAgents are populated.
- **Slice 3** — Build pipeline decomposed across sub-agents. The emitted manifest references per-sub-agent file trees (`agents/intake/`, etc.) that don't exist until Slice 3 lands the per-specialist sub-builds.
- **Slice 4** — Real per-role memory authority captured in Think/Plan (Darrow → estimating, Matt → business, etc.). Today every authority row has the operator as the writer.
- Dashboard manifest emission so `runConformance()` validates the pair
- Routing rules richer than stage-match (sequential `specialists`, `fan_out`, `then` chains)
- `merge_policy` rules when fleets actually need cross-specialist merging
- Backend-side conformance gate at `POST /api/agents/:id/ship` (today the gate is frontend-only)
- Real checksum computation at deploy time over the resolved pipeline state (placeholder for now)
