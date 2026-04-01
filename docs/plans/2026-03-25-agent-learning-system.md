# Agent Learning System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repo-wide learning and journaling contract for all agents and align the live automation prompts with it.

**Architecture:** Keep `TODOS.md` as the task-state layer, add `docs/journal/YYYY-MM-DD.md` as the mandatory chronological run log, and add `docs/knowledge-base/learnings/LEARNING-YYYY-MM-DD-<task-slug>.md` as the durable-learning layer. Document the contract in the KB and repo instructions, then update role definitions and active automation prompts so runtime behavior matches the written policy.

**Tech Stack:** Markdown, Obsidian-compatible wikilinks, TOML automation config, Codex automation memory files

---

### Task 1: Record The Work And Planning Artifacts

**Files:**
- Modify: `TODOS.md`
- Create: `docs/plans/2026-03-25-agent-learning-system-design.md`
- Create: `docs/plans/2026-03-25-agent-learning-system.md`

**Step 1: Add the scoped TODO entry**

Write a new active task describing the repo-wide learning and daily-journal contract work.

**Step 2: Save the design note**

Capture the artifact model, durable-learning rule, and rollout guardrails.

**Step 3: Save the implementation plan**

List the exact repo docs, KB notes, role files, and automation configs that must be aligned.

### Task 2: Add The KB System Note, Spec, And Seed Artifacts

**Files:**
- Create: `docs/knowledge-base/013-agent-learning-system.md`
- Create: `docs/knowledge-base/specs/SPEC-agent-learning-and-journal.md`
- Create: `docs/knowledge-base/learnings/LEARNING-2026-03-25-agent-learning-system.md`
- Create: `docs/journal/README.md`
- Create: `docs/journal/2026-03-25.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/001-architecture.md`
- Modify: `docs/knowledge-base/010-deployment.md`
- Modify: `docs/knowledge-base/012-automation-architecture.md`
- Modify: `docs/knowledge-base/specs/SPEC-automation-agent-roles.md`

**Step 1: Create the KB system note**

Document the artifact types, workflow, durable-learning decision rule, and linking rules.

**Step 2: Create the feature spec**

Capture the repo contract for journals, learnings, and automation behavior.

**Step 3: Seed the first learning note and daily journal**

Create a rollout learning note and a dated journal entry that demonstrate the new system.

**Step 4: Update the related KB notes**

Add the new note/spec to the index, related architecture/deployment/automation notes, and the automation-role spec.

### Task 3: Update Shared Instructions And Role Contracts

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `agents.md`
- Modify: `agents/README.md`
- Modify: `agents/analyst-1.md`
- Modify: `agents/worker-1.md`
- Modify: `agents/tester-1.md`
- Modify: `.agents/agents/README.md`
- Modify: `.agents/agents/analyst-1.md`
- Modify: `.agents/agents/worker-1.md`
- Modify: `.agents/agents/tester-1.md`

**Step 1: Update the repo instruction files**

Add the journal and durable-learning workflow, the learning-note indexing exception, and the requirement that automations follow the same contract.

**Step 2: Update the human-readable role catalog**

Make journal output mandatory for all three roles and learning notes conditional on durable insight.

**Step 3: Update the tool-facing role mirror**

Align the operating contracts so local agent tooling enforces the same workflow.

### Task 4: Align Live Automation Prompts And Memory

**Files:**
- Modify: `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml`
- Modify: `/Users/prasanjitdey/.codex/automations/analyst-1/memory.md`
- Modify: `/Users/prasanjitdey/.codex/automations/worker-1/automation.toml`
- Modify: `/Users/prasanjitdey/.codex/automations/worker-1/memory.md`
- Modify: `/Users/prasanjitdey/.codex/automations/tester-1/automation.toml`
- Modify: `/Users/prasanjitdey/.codex/automations/tester-1/memory.md`
- Modify: `/Users/prasanjitdey/.codex/automations/feature-add-automation/automation.toml`
- Modify: `/Users/prasanjitdey/.codex/automations/feature-add-automation/memory.md`
- Modify: `/Users/prasanjitdey/.codex/automations/automated-worker/automation.toml`
- Modify: `/Users/prasanjitdey/.codex/automations/automated-worker/memory.md`
- Modify: `/Users/prasanjitdey/.codex/automations/tester-template/automation.toml`
- Modify: `/Users/prasanjitdey/.codex/automations/tester-template/memory.md`

**Step 1: Fix the role drift**

Replace the incorrect worker prompt that still behaves like an analyst and update the active analyst/tester prompts to require journals and durable learnings.

**Step 2: Align legacy templates**

Update the feature-add, automated-worker, and tester-template prompts so they follow the same repo contract.

**Step 3: Append memory notes**

Record that the prompt contract now requires `docs/journal/` entries and conditional KB learning notes.

### Task 5: Verify And Close Out

**Files:**
- Modify: `TODOS.md`

**Step 1: Verify file presence and references**

Confirm the new KB note, spec, journal files, and learning note exist and that the shared instructions point to them.

**Step 2: Verify the automation contract**

Check that the updated automation prompts mention `docs/journal/YYYY-MM-DD.md` and `docs/knowledge-base/learnings/`.

**Step 3: Mark the TODO entry complete**

Update the task log with the final areas changed and the best next-step guidance.
