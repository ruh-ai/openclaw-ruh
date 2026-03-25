# Analyst Project Focus Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repo-visible `Project Focus` artifact and update `Analyst-1` so it derives the next missing requirement from that focus before falling back to autonomous backlog analysis.

**Architecture:** This is a repo-process change, not product runtime code. The implementation adds a human-owned `docs/project-focus.md` steering document, defines the behavior in a KB spec, then aligns the analyst role files, KB/instruction notes, and live `analyst-1` automation prompt so they all enforce the same focus-first fallback contract.

**Tech Stack:** Markdown, Obsidian wikilinks, TOML automation config

---

### Task 1: Add the focus artifact and canonical spec

**Files:**
- Create: `docs/project-focus.md`
- Create: `docs/knowledge-base/specs/SPEC-analyst-project-focus.md`
- Modify: `docs/knowledge-base/000-INDEX.md`

**Step 1: Write the artifact and spec content**

- Add a `docs/project-focus.md` template with `Status`, `Current Focus Areas`, and operator instructions.
- Write `SPEC-analyst-project-focus.md` describing the artifact, the analyst selection order, and the fallback rules.
- Add the new spec to `docs/knowledge-base/000-INDEX.md` and add a Quick Navigation row for the focus-aware analyst workflow.

**Step 2: Verify the spec is discoverable**

Run: `rg -n "SPEC-analyst-project-focus|project-focus.md" docs/knowledge-base/000-INDEX.md docs/knowledge-base/specs/SPEC-analyst-project-focus.md docs/project-focus.md`

Expected: matches in all three files.

### Task 2: Align KB notes and shared instruction files

**Files:**
- Modify: `docs/knowledge-base/001-architecture.md`
- Modify: `docs/knowledge-base/012-automation-architecture.md`
- Modify: `docs/knowledge-base/013-agent-learning-system.md`
- Modify: `docs/knowledge-base/specs/SPEC-agent-learning-and-journal.md`
- Modify: `docs/knowledge-base/specs/SPEC-automation-agent-roles.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `agents.md`

**Step 1: Update the docs**

- Add the project-focus workflow to the automation architecture note, including the human-owned document rule.
- Add backlinks to the new spec from affected KB notes/specs.
- Update the shared instruction mirrors so automation-contract changes mention the project-focus document.

**Step 2: Verify link coverage**

Run: `rg -n "SPEC-analyst-project-focus|docs/project-focus.md|Project Focus" docs/knowledge-base/001-architecture.md docs/knowledge-base/012-automation-architecture.md docs/knowledge-base/013-agent-learning-system.md docs/knowledge-base/specs/SPEC-agent-learning-and-journal.md docs/knowledge-base/specs/SPEC-automation-agent-roles.md CLAUDE.md AGENTS.md agents.md`

Expected: each file contains the new workflow or backlink reference it needs.

### Task 3: Update the analyst role and live automation prompt

**Files:**
- Modify: `agents/README.md`
- Modify: `agents/analyst-1.md`
- Modify: `.agents/agents/analyst-1.md`
- Modify: `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml`
- Modify: `/Users/prasanjitdey/.codex/automations/analyst-1/memory.md`

**Step 1: Update the role contract**

- Change the analyst mission from generic backlog discovery to focus-first backlog discovery with fallback.
- Add `docs/project-focus.md` to the analyst inputs and guardrails.
- Update the live automation prompt so it reads the focus document and applies the same fallback behavior.

**Step 2: Verify the prompt and role mirror stay aligned**

Run: `rg -n "project-focus|fall back|Current Focus Areas|human-owned" agents/README.md agents/analyst-1.md .agents/agents/analyst-1.md /Users/prasanjitdey/.codex/automations/analyst-1/automation.toml /Users/prasanjitdey/.codex/automations/analyst-1/memory.md`

Expected: focus-first language appears in the role docs and automation prompt; memory records the contract update.

### Task 4: Final validation and handoff

**Files:**
- Modify: `TODOS.md`
- Modify: `docs/journal/2026-03-25.md`

**Step 1: Record completion**

- Update the active TODO entry with the final status/summary/next step.
- Append a journal entry describing the new project-focus workflow and verification.

**Step 2: Run final verification**

Run: `git diff --check`

Expected: exit code 0.

Run: `python3 - <<'PY'\nimport tomllib\nfrom pathlib import Path\npath = Path('/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml')\nwith path.open('rb') as f:\n    data = tomllib.load(f)\nassert 'docs/project-focus.md' in data['prompt']\nprint('ok')\nPY`

Expected: prints `ok`.
