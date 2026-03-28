# Tool Integration Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a real `/tools` workspace, reuse it in `/agents/create`, and make credential-backed tool connections fail closed instead of pretending to be configured.

**Architecture:** Add a frontend-only tool-research contract on top of the existing architect bridge, render it in a new `/tools` page plus the create-flow connect sidebar, and sequence new-agent credential commits through the existing backend credential API after the first agent save. Keep credentials ephemeral until the secure backend store exists for a real saved agent id.

**Tech Stack:** Next.js 15 app router, React client components, Zustand, Bun tests, existing `/api/openclaw` bridge, existing backend credential endpoints.

---

### Task 1: Document the contract before runtime edits

**Files:**
- Modify: `TODOS.md`
- Create: `docs/knowledge-base/specs/SPEC-tool-integration-workspace.md`
- Create: `docs/plans/2026-03-26-tool-integration-workspace.md`

**Step 1: Update TODO tracking**

Record the feature package, affected areas, and fail-closed outcome in `TODOS.md`.

**Step 2: Write the feature spec**

Document the `/tools` workspace, the dedicated tool-research response type, and the pre-save credential handoff contract.

**Step 3: Save the implementation plan**

Keep the plan scoped to frontend and existing credential APIs. Do not add new persistence layers.

### Task 2: Add failing tests for the missing contract

**Files:**
- Create: `agent-builder-ui/lib/tools/tool-research.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/api.test.ts`
- Modify: `agent-builder-ui/hooks/use-agents-store.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/agent-config.test.ts`

**Step 1: Write a failing tool-research normalization test**

Assert that a structured `tool_recommendation` response is normalized into a stable UI model with method, steps, alternatives, and sources.

**Step 2: Write a failing architect bridge parser test**

Assert that the bridge client accepts the new response type instead of downgrading it to generic assistant prose.

**Step 3: Write a failing credential-commit sequencing test**

Assert that a new-agent save path can create an agent, commit pending credentials, and leave a connector `missing_secret` when credential commit fails.

**Step 4: Write a failing config-apply typing test**

Assert that `pushAgentConfig()` preserves `mcp` step results.

### Task 3: Implement the tool-research contract and `/tools` page

**Files:**
- Create: `agent-builder-ui/lib/tools/tool-research.ts`
- Create: `agent-builder-ui/app/(platform)/tools/page.tsx`
- Create: `agent-builder-ui/app/(platform)/tools/_components/ToolResearchWorkspace.tsx`
- Modify: `agent-builder-ui/lib/openclaw/types.ts`
- Modify: `agent-builder-ui/app/api/openclaw/route.ts`

**Step 1: Add typed tool-research models and prompt builder**

Define the structured response shape and a helper that asks the architect to choose between `mcp`, `api`, and `cli`.

**Step 2: Extend bridge normalization**

Treat `tool_recommendation` as a known architect response type.

**Step 3: Build the reusable workspace UI**

Render the research form, result cards, alternatives, sources, and one-click support state.

**Step 4: Mount the real `/tools` page**

Replace the broken nav target with the new workspace page.

### Task 4: Reuse the research flow inside `StepConnectTools`

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepConnectTools.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConfigureAgent.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/configure/types.ts`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts`

**Step 1: Add richer tool state helpers**

Track status, auth kind, config summary, and pending credential drafts instead of a bare `connected` boolean.

**Step 2: Show research in the connect sidebar**

Display the shared recommendation summary before the credential form, and render truthful unsupported/manual states.

**Step 3: Add pending credential draft plumbing**

Return ephemeral credential drafts from `ConfigureAgent` without persisting them outside the current create session.

### Task 5: Make new-agent credential commits fail closed

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/page.tsx`
- Modify: `agent-builder-ui/hooks/use-agents-store.ts`
- Modify: `agent-builder-ui/lib/openclaw/agent-config.ts`

**Step 1: Create the agent record first**

Save the new agent before attempting to store credentials.

**Step 2: Commit pending credentials**

Call the existing credential API for each pending tool draft after the new agent id exists.

**Step 3: Patch final tool status**

Mark tools `configured` only after credential commit succeeds; otherwise keep them `missing_secret`.

**Step 4: Surface failures without fake success**

Keep the user in the configure flow when credential commit fails so they can retry with the real saved agent id.

### Task 6: Update docs and verify

**Files:**
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/011-key-flows.md`
- Modify: `docs/journal/2026-03-26.md`

**Step 1: Update KB backlinks**

Reference the new spec from the affected notes.

**Step 2: Append the journal entry**

Capture the shipped workspace, fail-closed connector behavior, and any validation caveats.

**Step 3: Run targeted tests**

Run the Bun/frontend test files for the new helpers plus the updated store and config helpers.
