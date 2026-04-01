# Repo Automation Agents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add mirrored repo-local agent definitions for `Analyst-1`, `Worker-1`, and `Tester-1`, and document the convention in the knowledge base.

**Architecture:** Keep `agents/` as the human-readable catalog and mirror each role into `.agents/agents/` for agent-tooling compatibility. Record the convention in a KB spec and update the automation architecture notes so future agents know where these role contracts live and how to keep them synchronized.

**Tech Stack:** Markdown, repo knowledge base, repo task log

---

### Task 1: Record The Work And Design

**Files:**
- Modify: `TODOS.md`
- Create: `docs/plans/2026-03-25-repo-automation-agents-design.md`
- Create: `docs/plans/2026-03-25-repo-automation-agents.md`

**Step 1: Add a scoped TODO entry**

Write a new active task that explains the mirrored `agents/` and `.agents/agents/` work.

**Step 2: Save the design note**

Write the design rationale, role list, and sync rule.

**Step 3: Save this implementation plan**

Capture the exact artifacts and verification steps for the agent-folder work.

### Task 2: Add The Human-Readable Agent Catalog

**Files:**
- Create: `agents/README.md`
- Create: `agents/analyst-1.md`
- Create: `agents/worker-1.md`
- Create: `agents/tester-1.md`

**Step 1: Write the catalog README**

Document why the directory exists, what the three agents do, and that `.agents/agents/` is a mirror.

**Step 2: Define `Analyst-1`**

Describe its mission, inputs, outputs, guardrails, and success criteria.

**Step 3: Define `Worker-1`**

Describe its delivery contract for executing one unblocked task at a time.

**Step 4: Define `Tester-1`**

Describe its bounded analyze-patch-verify responsibility for test coverage.

### Task 3: Add The Tool-Facing Mirror

**Files:**
- Create: `.agents/agents/README.md`
- Create: `.agents/agents/analyst-1.md`
- Create: `.agents/agents/worker-1.md`
- Create: `.agents/agents/tester-1.md`

**Step 1: Create the mirror README**

Explain that the hidden directory mirrors `agents/` and must stay aligned.

**Step 2: Create the three agent contracts**

Use concise frontmatter plus operating instructions that local agent tooling can consume.

### Task 4: Update KB Notes And Spec

**Files:**
- Create: `docs/knowledge-base/specs/SPEC-automation-agent-roles.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/001-architecture.md`
- Modify: `docs/knowledge-base/012-automation-architecture.md`

**Step 1: Create the spec**

Document the mirrored folder layout, sync rule, and three initial role contracts.

**Step 2: Update the index**

Add the spec and ensure the KB points at the repo-local skill path that actually exists.

**Step 3: Update related notes**

Add backlinks and short explanatory text where the automation/operator layer is discussed.

### Task 5: Verify And Close Out

**Files:**
- Modify: `TODOS.md`

**Step 1: Verify file presence and consistency**

Check that both directories contain the expected files and that KB links resolve.

**Step 2: Mark the TODO entry complete**

Update the task log with the final areas and next-step guidance.
