# Agent Learning System

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[001-architecture]]

---

## Overview

This repo uses three different persistence layers for agent work:

- `TODOS.md` tracks task state, ownership, blockers, and handoff context
- `docs/journal/YYYY-MM-DD.md` records what each non-trivial run actually did on a given date
- `docs/knowledge-base/learnings/LEARNING-YYYY-MM-DD-<task-slug>.md` records durable learnings that future agents should reuse

The goal is to keep core KB notes canonical while still preserving a searchable record of task-specific discoveries and day-by-day agent work.

---

## Artifact Types

### `TODOS.md`

Use `TODOS.md` to answer:

- What task is active or completed?
- Why does the task matter?
- What should the next agent do?

For `Analyst-1` and `Worker-1`, a single `TODOS.md` entry may act as one feature package rather than one isolated code change. In that mode, the entry should also make the user-testable or operator-testable outcome, implementation outline, verification, and completion criteria explicit.

Do not use `TODOS.md` as a substitute for either the daily journal or a durable learning note.

### Daily Journal

Path: `docs/journal/YYYY-MM-DD.md`

Use the daily journal to answer:

- What did this agent run actually work on today?
- What files or areas did it touch?
- What did it verify?
- What blocked it?

Every non-trivial interactive task or automation run must append one section to that day's journal file.

### KB Learning Notes

Path: `docs/knowledge-base/learnings/LEARNING-YYYY-MM-DD-<task-slug>.md`

Use learning notes to answer:

- What durable knowledge did this task reveal?
- What should future agents do differently because of it?
- Which KB notes or specs does this learning affect?

Learning notes are not mandatory for every task. They are required only when the run uncovers durable knowledge worth reusing.

---

## Required Workflow

For every non-trivial agent run:

1. If the run is executing the repo-local `Analyst-1`, `Worker-1`, or `Tester-1` role, read the matching role contract from `agents/` or `.agents/agents/` before choosing work.
2. Read `docs/knowledge-base/000-INDEX.md` and the most relevant linked notes.
3. Read `TODOS.md` and create or update the task entry when the run is substantial.
4. If the run is `Analyst-1`, read `docs/project-focus.md` when it exists before choosing a new backlog feature package so operator-defined priorities are honored.
5. Perform the task work.
6. Decide whether the run produced a durable learning.
7. If yes, create or update a `LEARNING-*` note and link it to the affected KB notes/specs.
8. Append an entry to `docs/journal/YYYY-MM-DD.md`.
9. If the work changed repo behavior, contracts, or expectations, update the affected KB notes/specs.

Recurring automations follow the same repo-visible workflow. Their private `memory.md` files do not replace `docs/journal/` or KB learning notes. Role-backed automations must keep their live prompts aligned with the matching repo role file so the written contract and runtime behavior do not drift. For the feature-at-a-time maintainer path, that means the live prompts, role files, and `TODOS.md` expectations must all agree on one feature package per run.

---

## Durable Learning Decision Rule

Create a learning note when the run produces any of the following:

- a non-obvious root cause
- a hidden implementation or deployment constraint
- a mismatch between documented behavior and runtime behavior
- a reusable debugging, testing, or rollout pattern
- a change in how future agents should operate in this repo

Do not create a learning note for routine edits, formatting-only changes, or status churn that does not change future decisions.

---

## Linking Rules

- Every learning note must link to `[[000-INDEX]]`, the affected KB notes/specs, and the related daily journal entry.
- Affected KB notes or specs should link back to the learning note when that learning materially changes how the area should be understood.
- Core KB notes should stay canonical; reference a learning note instead of appending a chronological run log.
- Individual `LEARNING-*` notes are not listed one-by-one in `[[000-INDEX]]`. They are indexed through backlinks, affected notes, and daily journal entries.

---

## Daily Journal Template

```markdown
# Journal: YYYY-MM-DD

## HH:MM TZ — <agent> — <task title>
- Status: `active` | `completed` | `blocked` | `paused`
- Areas: `path/one`, `path/two`
- Summary: <what this run did and why>
- Verification: <commands run, review performed, or "not run">
- Learning Note: [[LEARNING-YYYY-MM-DD-task-slug]] or `None`
- Blockers: <none or concrete blocker>
```

## Learning Note Template

```markdown
# LEARNING: <Title>

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

## What Was Learned

## Evidence

## Implications For Future Agents

## Links
- [[<affected-note>]]
- [[<affected-spec>]]
- [Journal entry](../../journal/YYYY-MM-DD.md)
```

---

## Related Learnings

- [[LEARNING-2026-03-25-agent-learning-system]] — rollout lesson: keep canonical KB notes stable, use daily journals for chronology, and update runtime automation prompts when role contracts change
- [[LEARNING-2026-03-25-feature-at-a-time-automation-contract]] — maintainer automations should package work as one complete feature so scheduled runs leave behind testable outcomes instead of isolated slices

## Related Specs

- [[SPEC-agent-learning-and-journal]] — canonical contract for journals and durable learnings
- [[SPEC-automation-agent-roles]] — requires repo-local agent roles to produce journals and learnings when applicable
- [[SPEC-analyst-project-focus]] — adds the repo-visible steering artifact that `Analyst-1` reads before choosing focus-aligned work
- [[SPEC-feature-at-a-time-automation-contract]] — defines the feature-package unit of work for `Analyst-1` and `Worker-1`

## Related Notes

- [[012-automation-architecture]] — explains how recurring automations follow the same repo contract
- [[010-deployment]] — documents where automation config and memory live outside the product runtime
