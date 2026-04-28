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

This is **Path A** of the multi-step plan to make the builder produce
v1-conformant artifacts. Path A scope is **single-agent pipelines only**
— `len(agents) === 1`, trivial orchestrator, one Tier-1 memory_authority
row in a generic `main` lane. Multi-agent fleets (Path B) extend the
`agents[]` shape and elicit role-based memory authority; tracked
separately.

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

### Path A shape (single-agent)

- `agents`: exactly one entry — `{ id: 'main', path: 'agents/main/', is_orchestrator: true }`
- `orchestrator.skills`: mirrors `plan.skills[].id`
- `routing`: `{ rules: [], fallback: 'main' }`
- `memory_authority`: `[{ tier: 1, lane: 'main', writers: [operator] }]`
- `runtime.required_integrations`: derived from `plan.integrations[].toolId`; omitted when empty
- `dashboard`: stub reference to `dashboard/manifest.json` — Path B emits the actual manifest
- `hooks`, `custom_hooks`, `config_docs`, `imports`, `merge_policy`: empty
- `failure_policy`: `{}`
- `output_validator`: minimum substrate-acceptable shape with `layers: ['marker']`
- `checksum`: `sha256:<64 zeros>` placeholder; deploy recomputes the real digest

`plan.subAgents` is intentionally ignored in Path A — the manifest stays
single-agent. A regression test pins this so Path B's lift into
`agents[]` lands as a deliberate change.

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
  - canonical shape passes `runConformance()` with no fatal findings
  - id derivation (kebab-case from agent name, fallback to `'pipeline'`)
  - `orchestrator.skills` mirrors `plan.skills[].id`
  - exactly one Tier-1 memory_authority row with the operator identity
  - operator identity defaults to `'operator'` when not supplied
  - integrations become `runtime.required_integrations`; omitted when empty
  - `llm_providers` defaults to `[{anthropic, claude-opus-4-7, tenant-proxy}]` when provider/model not supplied (substrate requires non-empty array)
  - default-emit (no llm args) round-trips through `runConformance()` with no fatal findings — regression pin for the P1 review finding
  - tenancy/egress/dev_stage defaults + overrides
  - `subAgents` ignored — Path A still emits single-agent (regression pin)
  - hooks / custom_hooks / config_docs / imports / merge_policy empty
  - checksum carries `sha256:<64-hex>` placeholder
  - generated_at is stable when supplied

## Out of scope (Path B and beyond)

- Multi-agent `agents[]` extension when `plan.subAgents.length > 0`
- Memory model elicitation (per-role authority captured in Think/Plan)
- Dashboard manifest emission so `runConformance()` validates the pair
- Routing rules, merge policy, failure policy when fleets need them
- Backend-side conformance gate at `POST /api/agents/:id/ship` (today
  the gate is frontend-only)
- Real checksum computation at deploy time over the resolved pipeline
  state (placeholder for now)
