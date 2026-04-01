# AG-UI Live Agent Info And Draft Autosave Design

Date: 2026-03-26
Status: approved for implementation planning

## Goal

Make `/agents/create` update agent information live from AG-UI while the architect is working, and automatically persist that information to a backend draft agent record without waiting for the explicit final save/deploy action.

This applies to both:

- new agents created from `/agents/create`
- existing agents reopened in improve mode

## Why

The current create flow already uses AG-UI for live chat, steps, browser/task state, and builder-to-UI signaling, but builder metadata is still split across:

- AG-UI custom events
- `coPilotStore`
- page-local `builderState`
- final save logic in `CreateAgentPage`

That means the UI can look live while the real agent record is still missing or stale until the operator explicitly completes the flow. It also means the AG-UI path is not yet the canonical runtime contract for builder metadata.

## Chosen Approach

Use a hybrid AG-UI source-of-truth model:

- AG-UI becomes the canonical live source for builder metadata
- the existing Co-Pilot store remains temporarily as a derived compatibility layer for the current Config/stepper UI
- `useAgentChat` owns debounced autosave of a backend draft agent record

This intentionally avoids a full one-shot cutover away from all legacy builder state in the same slice.

## User-Facing Behavior

### New agent flow

1. User opens `/agents/create`
2. User sends a prompt to the architect
3. As the architect infers agent details, the UI updates live from AG-UI
   - name
   - description
   - system name
   - skill graph
   - workflow
   - agent rules
   - tool/trigger hints where available
4. Once the live metadata crosses a minimum persistence threshold, the frontend automatically creates a backend draft agent
5. As more AG-UI metadata arrives, the frontend autosaves updates to that same draft
6. The UI surfaces draft save status such as `Saving draft…`, `Draft saved`, or `Draft save failed`
7. Review/configure/deploy continue from that persisted draft instead of first materializing the agent only at the end

### Existing agent improve flow

1. User opens `/agents/create?agentId=...`
2. Existing agent data seeds the builder UI
3. New AG-UI metadata updates the visible fields live
4. Autosave updates the existing backend draft record instead of creating a new one

## State Model

Extend the AG-UI builder metadata model to carry persistence-aware draft state.

### Canonical live metadata fields

- `draftAgentId: string | null`
- `name: string`
- `description: string`
- `systemName: string | null`
- `skillGraph: SkillGraphNode[] | null`
- `workflow: WorkflowDefinition | null`
- `agentRules: string[]`
- `toolConnectionHints: string[] | structured hint payload`
- `triggerHints: string[] | structured hint payload`
- `draftSaveStatus: "idle" | "saving" | "saved" | "error"`
- `lastSavedAt: string | null`
- `lastSavedHash: string | null`

### Compatibility rule

`coPilotStore` may continue to back the current wizard/configure controls, but it must be updated from AG-UI-driven metadata rather than being treated as the primary owner of builder truth.

## Event Contract

### AG-UI output from `BuilderAgent`

`BuilderAgent` should emit AG-UI metadata updates as soon as useful information is known.

Expected sources:

- conversational inference can emit `name` / `description` / `systemName`
- `ready_for_review` emits the full `skillGraph` / `workflow` / `agentRules`
- wizard/tool/trigger directives emit tool and trigger hints

### Event shape

Use AG-UI events as the live source for metadata changes. In the near-term slice, custom events are acceptable if they update the canonical AG-UI-backed builder metadata state inside `useAgentChat`.

That means the implementation may continue to use AG-UI `CUSTOM` events in the short term, but the receiving side must write into one canonical builder metadata state object rather than splintering updates across page-local state first.

## Autosave Contract

Autosave is a side effect of AG-UI metadata updates, not a replacement for final review/deploy actions.

### Create threshold for brand-new drafts

If no `draftAgentId` exists yet, create a backend draft record once either of these becomes true:

- `name` or `systemName` is non-empty
- `skillGraph` becomes non-empty

### Autosaved fields

Only safe, non-secret draft fields are autosaved:

- `name`
- `description`
- `skillGraph`
- `workflow`
- `agentRules`
- `toolConnections` metadata only
- `triggers`

### Explicit non-goals for this slice

- no autosave of credential secrets inferred from chat
- no secure credential persistence through conversational text
- no replacement of the dedicated credential-entry flow

## Save Semantics

`useAgentChat` owns debounced autosave.

### Debounce

Use a short debounce window such as `600-1000ms` after the most recent metadata change.

### Change detection

Before saving:

1. build a normalized draft payload
2. hash it
3. skip save if hash matches `lastSavedHash`

### Race handling

Use last-write-wins semantics on the client:

- if a newer save starts before an older save completes, ignore the stale completion
- stale success responses must not overwrite newer `draftSaveStatus` or `lastSavedAt`

## Backend Contract

### New draft creation

For brand-new agents, the frontend is allowed to create a backend draft automatically before the user explicitly presses save or deploy.

### Existing updates

Once a draft exists:

- new-agent flow updates that created draft
- improve flow updates the existing `agentId`

### Assumption

Current backend save/update APIs are sufficient for incremental draft writes, or can be used with a bounded adaptation layer in the frontend store.

If current APIs are too coarse or destructive for safe incremental updates, the implementation plan should call out the smallest backend change required.

## UI Contract

Surface save state in the create UI near the builder header/computer panel so the operator can tell whether the draft is current.

Suggested states:

- `Saving draft…`
- `Draft saved`
- `Draft save failed`

The UI should remain interactive even while autosave is in progress.

## Component Responsibilities

### `BuilderAgent`

- emit AG-UI metadata updates for builder information as it becomes known

### `useAgentChat`

- subscribe to AG-UI metadata updates
- maintain canonical live builder metadata state
- mirror compatible fields into `coPilotStore`
- debounce and perform draft create/update writes
- track save status and stale-request suppression

### `CreateAgentPage`

- stop acting like final save is the first time builder metadata becomes real
- treat final save/deploy as completion of an already-persisted draft

### `useAgentsStore`

- expose the minimal create/update draft operations needed by autosave
- preserve existing explicit save/deploy flows

## Likely Files

- `agent-builder-ui/lib/openclaw/ag-ui/types.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts`
- `agent-builder-ui/app/(platform)/agents/create/page.tsx`
- `agent-builder-ui/lib/openclaw/copilot-state.ts`
- `agent-builder-ui/hooks/use-agents-store.ts`
- possibly backend/API files only if incremental draft persistence needs a bounded contract change

## Risks

### Duplicate state drift

As long as `coPilotStore` remains, there is still risk of drift. The mitigation is to treat it strictly as a projection of AG-UI builder metadata, not an independent owner.

### Over-eager draft creation

If persistence threshold is too low, the system may create drafts for weak exploratory prompts. The chosen threshold intentionally requires either identity or skill graph evidence.

### Autosave churn

Without normalization and hashing, repeated event emissions could spam updates. Debounce plus payload hashing is required.

### Partial architect outputs

Some architect replies will still be conversational clarifications without enough structured metadata to save. That is acceptable; autosave should wait until threshold is reached.

## Testing Strategy

### Unit tests

- AG-UI metadata events update canonical builder metadata state
- autosave creates a draft once threshold is crossed
- unchanged payloads do not resave
- stale save completions do not overwrite newer state
- improve mode updates existing `agentId` instead of creating a new one

### Integration / component tests

- `/agents/create` header/config panel updates live while AG-UI events stream
- draft save status renders correctly
- Co-Pilot configure/review components reflect AG-UI-driven updates through the compatibility store

### Browser / E2E tests

- new-agent flow creates a draft automatically after architect metadata arrives
- subsequent architect updates autosave into the same draft
- reloading/reopening improve mode reflects the already-persisted draft data

## Done When

- `/agents/create` visibly updates live agent info from AG-UI while the architect is working
- a brand-new builder session automatically creates a backend draft once useful metadata exists
- later AG-UI metadata updates autosave into that same draft
- improve mode updates the existing draft instead of creating a new record
- save status is visible in the UI
- no secret credential values are autosaved from conversation metadata
- review/configure/deploy operate on the persisted draft instead of a final-only in-memory snapshot
