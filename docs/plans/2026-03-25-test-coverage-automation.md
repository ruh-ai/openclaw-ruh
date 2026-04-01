# Test Coverage Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the placeholder `tester-template` automation with a repo-specific automation that finds one safe test gap, adds tests, validates them, and records continuity state.

**Architecture:** The implementation is documentation-first because this repo treats automation behavior as part of the operating model. The automation contract is defined in the KB and repo instructions, then instantiated in `tester-template/automation.toml` and initialized with `memory.md`.

**Tech Stack:** Markdown knowledge base, TOML automation config, Codex automation memory files

---

### Task 1: Document the automation behavior

**Files:**
- Create: `docs/knowledge-base/specs/SPEC-test-coverage-automation.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/012-automation-architecture.md`
- Modify: `docs/knowledge-base/001-architecture.md`
- Modify: `docs/knowledge-base/010-deployment.md`

**Step 1: Write the spec content**

Describe the automation’s single-run loop, target selection heuristics, safety boundaries, fallback behavior, and output requirements.

**Step 2: Link the KB graph**

Add the new spec to the index and add backlinks from the touched automation notes.

**Step 3: Add the canonical prompt**

Store the prompt text in `012-automation-architecture.md` so future agents reuse it instead of inventing a new version.

**Step 4: Verify note consistency**

Confirm the new spec and backlinks are consistent with the repo’s automation rules.

**Step 5: Commit**

```bash
git add docs/knowledge-base/000-INDEX.md docs/knowledge-base/001-architecture.md docs/knowledge-base/010-deployment.md docs/knowledge-base/012-automation-architecture.md docs/knowledge-base/specs/SPEC-test-coverage-automation.md
git commit -m "docs: define test coverage automation contract"
```

### Task 2: Update repo instructions and work log

**Files:**
- Modify: `CLAUDE.md`
- Modify: `TODOS.md`

**Step 1: Update the automation guidance**

Add an instruction telling future agents to reuse the canonical test-coverage prompt from `012-automation-architecture.md`.

**Step 2: Record the work in `TODOS.md`**

Add a completed entry that captures what changed, why it matters, and what the next run should verify.

**Step 3: Commit**

```bash
git add CLAUDE.md TODOS.md
git commit -m "docs: record test automation setup"
```

### Task 3: Instantiate the automation

**Files:**
- Modify: `/Users/prasanjitdey/.codex/automations/tester-template/automation.toml`
- Create: `/Users/prasanjitdey/.codex/automations/tester-template/memory.md`

**Step 1: Replace the placeholder prompt**

Write the repo-specific analyze-patch-verify prompt into `automation.toml` and keep the existing id and schedule.

**Step 2: Initialize automation memory**

Create `memory.md` with the purpose of the automation, initial run policy, and a concise setup summary.

**Step 3: Verify the files**

Read the two files back to confirm the prompt text and memory state are present.

**Step 4: Commit**

```bash
git add /Users/prasanjitdey/.codex/automations/tester-template/automation.toml /Users/prasanjitdey/.codex/automations/tester-template/memory.md
git commit -m "chore: configure test coverage automation"
```
