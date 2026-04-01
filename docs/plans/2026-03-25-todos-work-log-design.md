# TODOS Work Log Design

## Summary

Make the root `TODOS.md` file the canonical agent work log for this repository. Future agents should be able to read it and quickly understand what task was in progress, what changed, what remains, and whether any blocker or handoff exists.

## Decision

Use a single root-level `TODOS.md` instead of per-service todo files. This keeps discovery trivial, works for cross-service changes, and reduces the risk of context being split across multiple documents.

## Required Behavior

- Agents read `TODOS.md` before non-trivial work.
- Agents create or update a task entry before broad edits.
- Agents keep the entry current when scope changes, blockers appear, work pauses, or work completes.
- Entries are written for handoff readability, not just as personal notes.

## Entry Shape

Each active-work entry should include:

- Task title
- Status
- Owner/agent
- Started date
- Updated date
- Affected files or areas
- Current summary
- Next step
- Blockers

## Success Criteria

- `CLAUDE.md` explicitly states that `TODOS.md` is the canonical work log.
- `agents.md` inherits the same policy via symlink to `CLAUDE.md`.
- `TODOS.md` contains a clear template and at least one concrete entry showing the expected format.
