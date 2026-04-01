# Feature-At-A-Time Automation Contract Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change the repo automation contract so `Analyst-1` creates one complete feature package at a time and `Worker-1` completes one whole feature at a time.

**Architecture:** Keep the existing repo-maintainer automation model, but redefine the unit of work from one isolated task to one feature package. Align the change across the KB/spec layer, repo-local role definitions, live automation prompts, and operator-visible artifacts so runtime behavior and written policy stay synchronized.

**Tech Stack:** Markdown docs, TOML automation config, repo-local agent role files

---

### Task 1: Record the design and task tracking entry

**Files:**
- Modify: `TODOS.md`
- Modify: `docs/plans/2026-03-25-feature-at-a-time-automation-contract-design.md`
- Create: `docs/plans/2026-03-25-feature-at-a-time-automation-contract.md`

**Step 1: Update the active TODO log**

Add a new active task entry that states the repo is moving from task-at-a-time maintainer automations to feature-at-a-time automations, including affected files, why the change matters, and the concrete next step.

**Step 2: Save the design note**

Ensure the design note captures the recommended feature-package approach and the files that must remain aligned.

**Step 3: Save this implementation plan**

Keep the plan as the execution artifact for the repo workflow.

**Step 4: Verify the docs exist**

Run: `rg -n "Feature-At-A-Time Automation Contract" docs/plans TODOS.md`

Expected: matches in the new plan/design docs and the new TODO entry.

### Task 2: Create or update the KB spec and operating notes

**Files:**
- Create: `docs/knowledge-base/specs/SPEC-feature-at-a-time-automation-contract.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/001-architecture.md`
- Modify: `docs/knowledge-base/012-automation-architecture.md`
- Modify: `docs/knowledge-base/013-agent-learning-system.md`
- Modify: `docs/knowledge-base/specs/SPEC-automation-agent-roles.md`
- Modify: `docs/knowledge-base/specs/SPEC-analyst-project-focus.md`
- Modify: `docs/knowledge-base/specs/SPEC-agent-learning-and-journal.md`

**Step 1: Write the spec**

Define the new feature-package contract, the analyst and worker responsibilities, the TODO expectations, and the runtime alignment rule.

**Step 2: Add backlinks and index entries**

Update the KB index and the affected notes/specs so the new spec is bidirectionally linked.

**Step 3: Update the canonical automation prompt note**

Replace the single-task language in `012-automation-architecture.md` with feature-oriented prompts and guidance.

**Step 4: Verify link coverage**

Run: `rg -n "SPEC-feature-at-a-time-automation-contract|feature package|feature-at-a-time" docs/knowledge-base`

Expected: the new spec and the affected notes/specs all reference the contract.

### Task 3: Update repo instructions and role contracts

**Files:**
- Modify: `CLAUDE.md`
- Modify: `agents.md`
- Modify: `agents/README.md`
- Modify: `agents/analyst-1.md`
- Modify: `agents/worker-1.md`
- Modify: `.agents/agents/README.md`
- Modify: `.agents/agents/analyst-1.md`
- Modify: `.agents/agents/worker-1.md`
- Modify: `docs/project-focus.md`

**Step 1: Update the human-readable contract**

Adjust the repo instruction files and human agent catalog so they describe feature packages instead of isolated tasks.

**Step 2: Update the execution mirror**

Adjust the mirrored `.agents/agents/` files so tooling sees the same contract.

**Step 3: Update project-focus wording**

Ensure the focus document now steers feature-package selection rather than single missing requirements.

**Step 4: Verify the wording**

Run: `rg -n "one task at a time|one unblocked task|single highest-value missing requirement|feature package|complete feature" CLAUDE.md agents.md agents .agents/agents docs/project-focus.md`

Expected: the old single-task language is gone from the Analyst/Worker contract, and feature-package language is present.

### Task 4: Patch live automation configs and state artifacts

**Files:**
- Modify: `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml`
- Modify: `/Users/prasanjitdey/.codex/automations/worker-1/automation.toml`
- Modify: `/Users/prasanjitdey/.codex/automations/analyst-1/memory.md`
- Modify: `/Users/prasanjitdey/.codex/automations/worker-1/memory.md`
- Modify: `docs/journal/2026-03-25.md`

**Step 1: Update the live prompts**

Replace the single-task prompts with feature-oriented prompts that instruct the automations to operate on one complete feature package per run.

**Step 2: Update automation memory**

Record the contract shift so the next scheduled run does not continue using the old task-at-a-time assumptions.

**Step 3: Append the journal entry**

Describe the contract change, affected artifacts, and verification.

**Step 4: Verify the TOML files**

Run: `python - <<'PY'\nimport pathlib, tomllib\nfor path in [pathlib.Path('/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml'), pathlib.Path('/Users/prasanjitdey/.codex/automations/worker-1/automation.toml')]:\n    with path.open('rb') as fh:\n        data = tomllib.load(fh)\n    print(path.name, data['id'], data['status'])\nPY`

Expected: both TOMLs parse and print the expected automation ids/status values.

### Task 5: Final consistency verification

**Files:**
- Modify: none

**Step 1: Check formatting and references**

Run: `git diff --check -- TODOS.md docs/plans docs/knowledge-base CLAUDE.md agents.md agents .agents/agents /Users/prasanjitdey/.codex/automations/analyst-1/automation.toml /Users/prasanjitdey/.codex/automations/worker-1/automation.toml /Users/prasanjitdey/.codex/automations/analyst-1/memory.md /Users/prasanjitdey/.codex/automations/worker-1/memory.md docs/journal/2026-03-25.md`

Expected: no diff-check errors.

**Step 2: Spot-check the new contract**

Run: `rg -n "feature package|complete feature|user-testable outcome|single-task" TODOS.md docs/knowledge-base CLAUDE.md agents.md agents .agents/agents /Users/prasanjitdey/.codex/automations/analyst-1/automation.toml /Users/prasanjitdey/.codex/automations/worker-1/automation.toml`

Expected: feature-oriented language appears in the updated contract, and stale single-task language no longer governs `Analyst-1` and `Worker-1`.
