# Co-Pilot Config Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the create-flow Co-Pilot controls into the `Agent's Computer` `Config` tab and make builder activity auto-focus the most relevant workspace tab or config substep.

**Architecture:** Keep `/agents/create` on the existing `TabChat` + `ComputerView` foundation, but remove the standalone Co-Pilot rail and render the active Co-Pilot phase inside the builder-only `Config` tab. Extend builder-mode state so `ComputerView` can treat Co-Pilot phase changes as first-class focus events while preserving the current code/browser/terminal auto-switching behavior.

**Tech Stack:** Next.js 15, React 19, Zustand, Playwright

---

### Task 1: Document the builder workspace contract

**Files:**
- Create: `docs/knowledge-base/specs/SPEC-copilot-config-workspace.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/011-key-flows.md`

**Step 1: Write the spec**

- Describe the single-workspace builder model, Config-tab stepper, and focus rules.

**Step 2: Link the KB**

- Add backlinks from the builder notes and index entry.

**Step 3: Review the KB graph**

Run: `rg -n "SPEC-copilot-config-workspace" docs/knowledge-base -g '*.md'`
Expected: the new spec is referenced from the index and related builder notes.

### Task 2: Write failing create-flow UI coverage

**Files:**
- Modify: `agent-builder-ui/e2e/create-agent.spec.ts`

**Step 1: Add failing assertions**

- Add a test that mocks the architect response, opens `/agents/create`, and verifies:
  - the old standalone Co-Pilot rail is gone
  - the `Config` tab contains the Co-Pilot stepper/content
  - a builder response can focus `Config`

**Step 2: Run the targeted test and confirm it fails**

Run: `cd agent-builder-ui && npx playwright test e2e/create-agent.spec.ts --grep "renders Co-Pilot inside Config tab"`
Expected: FAIL because the old layout still renders the separate wizard rail.

### Task 3: Merge the Co-Pilot rail into the Config tab

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/AgentConfigPanel.tsx`

**Step 1: Remove the standalone right rail from `CoPilotLayout`**

- Keep chat + computer view only.

**Step 2: Make `WizardStepRenderer` embeddable**

- Add builder-config embedding support so it can render inside the existing `Config` tab without duplicate outer chrome.

**Step 3: Extend `AgentConfigPanel`**

- Render compact config summary plus optional embedded Co-Pilot stepper/content in builder mode.

### Task 4: Add builder-aware workspace focus rules

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`

**Step 1: Add builder-only focus inputs**

- Pass Co-Pilot phase/state into `ComputerView`.

**Step 2: Update auto-switch logic**

- Explicit Co-Pilot phase changes should switch to `config`.
- Generic tool-based switching for terminal/code/browser should remain.
- Manual tab clicks should still suppress generic auto-switching briefly.

**Step 3: Verify the targeted test now passes**

Run: `cd agent-builder-ui && npx playwright test e2e/create-agent.spec.ts --grep "renders Co-Pilot inside Config tab"`
Expected: PASS

### Task 5: Regression verification and docs

**Files:**
- Modify: `TODOS.md`
- Modify: `docs/journal/2026-03-26.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/011-key-flows.md`

**Step 1: Run focused browser tests**

Run: `cd agent-builder-ui && npx playwright test e2e/create-agent.spec.ts --grep "Co-Pilot|full create agent workflow"`
Expected: builder create-flow tests pass or any remaining failures are clearly unrelated.

**Step 2: Update repo docs**

- Mark the TODO complete, append the journal entry, and update KB notes to describe the new builder workspace model.

**Step 3: Final review**

Run: `git diff --stat`
Expected: only the intended create-flow UI, test, and docs files changed.
