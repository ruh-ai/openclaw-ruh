# AG-UI Live Agent Info And Draft Autosave Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/agents/create` update agent information live from AG-UI while the architect is working, and automatically create/update a backend draft agent record before the operator explicitly saves or deploys.

**Architecture:** Extend the AG-UI builder metadata contract so `useAgentChat` owns canonical live builder fields plus draft-persistence state. Mirror those AG-UI-driven updates into the existing Co-Pilot store for UI compatibility, and add debounced autosave that creates a new backend draft once the builder has enough identity or skill information. Final save/review/deploy then operate on an already-persisted draft instead of a final-only in-memory snapshot.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zustand, existing AG-UI client/core integration, browser fetch against `ruh-backend` agent endpoints.

---

### Task 1: Introduce canonical AG-UI builder metadata types

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/types.ts`
- Test: `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-metadata.test.ts` or the nearest existing AG-UI unit test file

**Step 1: Write the failing test**

Add a focused unit test covering the new builder metadata shape:

```ts
it("creates initial builder metadata state with no draft agent and idle save status", () => {
  const state = createInitialBuilderMetadataState();

  expect(state.draftAgentId).toBeNull();
  expect(state.name).toBe("");
  expect(state.description).toBe("");
  expect(state.skillGraph).toBeNull();
  expect(state.draftSaveStatus).toBe("idle");
  expect(state.lastSavedHash).toBeNull();
});
```

**Step 2: Run test to verify it fails**

Run: `cd agent-builder-ui && bun test <new-or-updated-test-file>`

Expected: FAIL because the builder metadata state helper/types do not exist yet.

**Step 3: Write minimal implementation**

In `agent-builder-ui/lib/openclaw/ag-ui/types.ts`:

- Add a dedicated AG-UI builder metadata interface, for example:
  - `draftAgentId: string | null`
  - `name: string`
  - `description: string`
  - `systemName: string | null`
  - `skillGraph: SkillGraphNode[] | null`
  - `workflow: WorkflowDefinition | null`
  - `agentRules: string[]`
  - `toolConnectionHints: string[]`
  - `triggerHints: string[]`
  - `draftSaveStatus: "idle" | "saving" | "saved" | "error"`
  - `lastSavedAt: string | null`
  - `lastSavedHash: string | null`
- Add `createInitialBuilderMetadataState()`.

Keep the state narrow. Do not add persistence logic here.

**Step 4: Run test to verify it passes**

Run: `cd agent-builder-ui && bun test <new-or-updated-test-file>`

Expected: PASS.

**Step 5: Commit**

```bash
git add agent-builder-ui/lib/openclaw/ag-ui/types.ts <test-file>
git commit -m "feat: add ag-ui builder metadata state"
```

### Task 2: Make `BuilderAgent` emit richer AG-UI builder metadata updates

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts`
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/types.ts`
- Test: `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts` or nearest existing builder-agent test file

**Step 1: Write the failing test**

Add a unit test proving builder metadata updates are emitted before final save/deploy:

```ts
it("emits builder metadata updates when ready_for_review arrives", async () => {
  const events = await collectBuilderEvents(mockReadyForReviewResponse);

  expect(events).toContainEqual(
    expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.SKILL_GRAPH_READY,
    }),
  );

  expect(events).toContainEqual(
    expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.WIZARD_UPDATE_FIELDS,
    }),
  );
});
```

If no builder-agent tests exist, create a minimal one and mock `sendToArchitectStreaming`.

**Step 2: Run test to verify it fails**

Run: `cd agent-builder-ui && bun test <builder-agent-test-file>`

Expected: FAIL because the event set/payload is incomplete or not yet normalized as needed.

**Step 3: Write minimal implementation**

In `builder-agent.ts`:

- Ensure `ready_for_review` emits all builder metadata needed by autosave:
  - identity fields
  - description if available
  - `systemName`
  - `skillGraph`
  - `workflow`
  - `agentRules`
  - tool/trigger hints if available from wizard directives
- Keep event emission AG-UI-native.
- Avoid creating backend records here. This file only emits metadata events.

If needed, add or refine custom payload types in `ag-ui/types.ts`.

**Step 4: Run test to verify it passes**

Run: `cd agent-builder-ui && bun test <builder-agent-test-file>`

Expected: PASS.

**Step 5: Commit**

```bash
git add agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts agent-builder-ui/lib/openclaw/ag-ui/types.ts <builder-agent-test-file>
git commit -m "feat: emit ag-ui builder metadata updates"
```

### Task 3: Add debounced draft autosave helpers to the agents store layer

**Files:**
- Modify: `agent-builder-ui/hooks/use-agents-store.ts`
- Test: `agent-builder-ui/hooks/use-agents-store.test.ts`

**Step 1: Write the failing test**

Add focused store tests for incremental draft persistence:

```ts
it("creates a draft agent with builder metadata", async () => {
  const id = await store.getState().saveAgentDraft({
    name: "Google Ads Manager",
    description: "Optimizes campaigns",
    skillGraph: [skillNode],
    workflow,
    agentRules: ["Communicate in a concise tone"],
    toolConnections: [],
    triggers: [],
  });

  expect(id).toBe("agent-123");
});

it("updates an existing draft agent config incrementally", async () => {
  const updated = await store.getState().saveAgentDraft({
    agentId: "agent-123",
    name: "Google Ads Manager",
    description: "Updated description",
    skillGraph: [skillNode],
    workflow,
    agentRules: [],
    toolConnections: [],
    triggers: [],
  });

  expect(updated.id).toBe("agent-123");
});
```

**Step 2: Run test to verify it fails**

Run: `cd agent-builder-ui && bun test agent-builder-ui/hooks/use-agents-store.test.ts`

Expected: FAIL because the draft-save helper does not exist.

**Step 3: Write minimal implementation**

In `use-agents-store.ts`:

- Add one bounded helper for draft persistence, for example `saveAgentDraft(...)`.
- For a new draft:
  - use existing `saveAgent(...)` with `status: "draft"`
- For an existing draft:
  - use the existing update helpers instead of inventing duplicate fetch logic
- Keep payload mapping limited to safe metadata fields:
  - `name`
  - `description`
  - `skills`
  - `triggerLabel`
  - `skillGraph`
  - `workflow`
  - `agentRules`
  - `toolConnections`
  - `triggers`

Do not include credential secrets.

**Step 4: Run test to verify it passes**

Run: `cd agent-builder-ui && bun test agent-builder-ui/hooks/use-agents-store.test.ts`

Expected: PASS for the new draft-save tests.

**Step 5: Commit**

```bash
git add agent-builder-ui/hooks/use-agents-store.ts agent-builder-ui/hooks/use-agents-store.test.ts
git commit -m "feat: add draft agent persistence helper"
```

### Task 4: Add AG-UI builder metadata state + autosave logic to `useAgentChat`

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts`
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/types.ts`
- Test: `agent-builder-ui/hooks/use-openclaw-chat.test.ts` or a new `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.test.ts`

**Step 1: Write the failing test**

Add tests covering:

```ts
it("creates a new backend draft when builder metadata crosses the save threshold", async () => {
  // simulate AG-UI builder metadata update with name + skill graph
  // assert saveAgentDraft called once for create
});

it("debounces repeated builder metadata changes into one save", async () => {
  // simulate rapid successive updates
  // assert saveAgentDraft called once after debounce
});

it("does not autosave unchanged normalized payloads", async () => {
  // emit same metadata twice
  // assert second save is skipped
});

it("updates an existing agent draft instead of creating a new one in improve mode", async () => {
  // provide existing agent id
  // assert update path is used
});
```

**Step 2: Run test to verify it fails**

Run: `cd agent-builder-ui && bun test <use-agent-chat-test-file>`

Expected: FAIL because the autosave effect and builder metadata state do not exist.

**Step 3: Write minimal implementation**

In `useAgentChat.ts`:

- Add canonical builder metadata state using the AG-UI type from Task 1.
- On AG-UI builder metadata events, update that state first.
- Mirror compatible fields into `coPilotStore` as a projection.
- Add a debounced autosave effect:
  - compute normalized draft payload
  - require threshold: non-empty `name` / `systemName` or non-empty `skillGraph`
  - hash payload
  - skip unchanged payloads
  - create draft if `draftAgentId` is null
  - update draft otherwise
- Track:
  - `draftSaveStatus`
  - `lastSavedAt`
  - `lastSavedHash`
- Use stale-request suppression so older save completions do not overwrite newer state.

Keep credential persistence out of this slice.

**Step 4: Run test to verify it passes**

Run: `cd agent-builder-ui && bun test <use-agent-chat-test-file>`

Expected: PASS.

**Step 5: Commit**

```bash
git add agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts agent-builder-ui/lib/openclaw/ag-ui/types.ts <use-agent-chat-test-file>
git commit -m "feat: autosave ag-ui builder metadata drafts"
```

### Task 5: Wire `/agents/create` to the AG-UI-backed draft state

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/page.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`
- Modify: `agent-builder-ui/lib/openclaw/copilot-state.ts`
- Test: `agent-builder-ui/e2e/create-agent.spec.ts`

**Step 1: Write the failing test**

Add a browser-level or component-level regression that proves the UI updates live and shows draft-save state:

```ts
test("co-pilot builder shows draft save status and live agent info updates", async ({ page }) => {
  // mock builder response stream/events
  // assert name/config panel updates
  // assert draft save status appears
});
```

**Step 2: Run test to verify it fails**

Run: `cd agent-builder-ui && npx playwright test e2e/create-agent.spec.ts --grep "draft save status"`

Expected: FAIL because no draft-save status is rendered yet.

**Step 3: Write minimal implementation**

In `page.tsx` and `TabChat.tsx`:

- read live builder metadata and draft-save status from `useAgentChat` / AG-UI-backed state rather than assuming final-only page-local truth
- show save state in the create UI header or builder workspace chrome
- ensure review/configure/deploy consume the persisted/AG-UI-backed fields consistently

In `copilot-state.ts`:

- keep it as a compatibility projection only
- do not reintroduce ownership of canonical draft state there

**Step 4: Run test to verify it passes**

Run: `cd agent-builder-ui && npx playwright test e2e/create-agent.spec.ts --grep "draft save status"`

Expected: PASS.

**Step 5: Commit**

```bash
git add agent-builder-ui/app/(platform)/agents/create/page.tsx agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx agent-builder-ui/lib/openclaw/copilot-state.ts agent-builder-ui/e2e/create-agent.spec.ts
git commit -m "feat: surface live ag-ui draft state in create flow"
```

### Task 6: Update KB, journal, and TODOs after implementation

**Files:**
- Modify: `TODOS.md`
- Modify: `docs/journal/2026-03-26.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/011-key-flows.md`
- Modify: `docs/knowledge-base/specs/SPEC-agui-protocol-adoption.md`
- Modify: `docs/knowledge-base/specs/SPEC-copilot-config-workspace.md`
- Optional create/update: `docs/knowledge-base/specs/SPEC-agui-live-agent-info-autosave.md` if the implementation grows beyond current spec coverage

**Step 1: Write the KB/spec updates**

Document:

- AG-UI now drives live builder metadata updates in `/agents/create`
- backend draft agents can be auto-created during architect work
- autosave only covers safe metadata, not secrets

**Step 2: Verify links and note status**

Run targeted KB checks with `rg`:

```bash
rg -n "AG-UI|draft save|autosave|/agents/create" docs/knowledge-base docs/journal/2026-03-26.md TODOS.md
```

Expected: updated docs reflect the shipped contract.

**Step 3: Run final verification**

Run:

```bash
cd agent-builder-ui && bun test <targeted-store-and-hook-tests>
cd agent-builder-ui && npx eslint app/(platform)/agents/create/page.tsx app/(platform)/agents/[id]/chat/_components/TabChat.tsx lib/openclaw/ag-ui/use-agent-chat.ts hooks/use-agents-store.ts
cd agent-builder-ui && npx playwright test e2e/create-agent.spec.ts --grep "draft save status|live agent info"
```

Expected:

- targeted unit tests pass
- eslint passes on touched files
- create-flow browser regression passes

If full `tsc --noEmit` is still blocked by unrelated existing repo errors, record that explicitly and list the blocking files.

**Step 4: Commit**

```bash
git add TODOS.md docs/journal/2026-03-26.md docs/knowledge-base/008-agent-builder-ui.md docs/knowledge-base/011-key-flows.md docs/knowledge-base/specs/*.md
git commit -m "docs: record ag-ui live draft autosave contract"
```

## Notes For Execution

- Keep this slice metadata-only. Do not fold secure connector credential persistence into this implementation.
- Prefer updating existing store/helpers over adding parallel draft-save code paths.
- Be careful not to regress the already-shipped Co-Pilot Config-tab workspace merge.
- When TDDing the autosave effect, keep the debounce test deterministic by mocking timers.

Plan complete and saved to `docs/plans/2026-03-26-agui-live-agent-info-autosave.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
