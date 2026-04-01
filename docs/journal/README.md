# Repo Journal

This directory is the daily, chronological journal for non-trivial agent work in `openclaw-ruh-enterprise`.

## Rules

- File naming pattern: `YYYY-MM-DD.md`
- Every non-trivial interactive task or automation run appends one section to that day's file
- Journal entries describe what the run did, what it verified, and what blocked it
- Journal entries are mandatory even when the run does not produce a KB learning note
- Durable discoveries belong in `docs/knowledge-base/learnings/`, then the journal should link to that learning note

## Entry Template

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

## Related Docs

- [Agent Learning System](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/013-agent-learning-system.md)
- [Agent Learning And Journal Spec](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/specs/SPEC-agent-learning-and-journal.md)
