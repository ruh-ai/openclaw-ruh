# TODOS Work Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the root `TODOS.md` the canonical record of current and recent agent work in this repository.

**Architecture:** Keep `CLAUDE.md` as the single source of truth for agent instructions and let `agents.md` inherit the policy via symlink. Bootstrap `TODOS.md` itself with a stable entry format and an example completed task so future agents know how to use it.

**Tech Stack:** Markdown documentation, repo instruction files, symlinked agent docs

---

### Task 1: Document the repo-level policy

**Files:**
- Modify: `CLAUDE.md`
- Read through symlink: `agents.md`

**Step 1: Add the `TODOS.md` policy**

Describe `TODOS.md` as the canonical agent work log and require agents to read/update it for non-trivial work.

**Step 2: Reinforce the workflow**

Add a short reminder in the development-process section that `TODOS.md` must stay current during active work.

**Step 3: Verify inheritance**

Run: `readlink agents.md`
Expected: `CLAUDE.md`

### Task 2: Bootstrap the canonical work log

**Files:**
- Modify: `TODOS.md`

**Step 1: Add a reusable entry template**

Define the required fields so future entries are consistent and readable.

**Step 2: Add a concrete example entry**

Record the current task as a completed entry so future agents can see the intended format and the reason for the policy change.

**Step 3: Preserve backlog items**

Keep existing deferred work under a backlog section instead of dropping it.

### Task 3: Verify the result

**Files:**
- Verify: `CLAUDE.md`
- Verify: `agents.md`
- Verify: `TODOS.md`

**Step 1: Confirm the task-tracking section exists**

Run: `rg -n "Task Tracking \\(TODOS.md\\)|canonical work log" CLAUDE.md TODOS.md`
Expected: matches in both files

**Step 2: Confirm the symlink still works**

Run: `diff -q agents.md CLAUDE.md`
Expected: no output

**Step 3: Review the current work-log entry**

Run: `sed -n '1,120p' TODOS.md`
Expected: a clear template, an active work log section, and the completed bootstrap task entry
