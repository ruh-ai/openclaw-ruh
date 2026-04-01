# LEARNING: Agent Learning System Rollout

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

While formalizing a repo-wide agent operating contract, the repo already had strong KB and `TODOS.md` rules plus private automation `memory.md` files. What it lacked was a shared, repo-visible distinction between chronological work history and durable knowledge.

## What Was Learned

- Core KB notes should stay canonical and stable; per-task learnings work better as dedicated `LEARNING-*` notes than as ad hoc appendices inside architecture or API notes.
- Every non-trivial run should leave a daily journal entry, but only durable discoveries should become KB learning notes. Treating every run as a learning note would create noise and make the Obsidian graph harder to use.
- The live automation prompts had already drifted from the documented role contracts. In particular, `worker-1` was still acting like a backlog analyst, so the operating model has to update runtime prompts and not just human-readable docs.
- Even after the role names were fixed, the live prompts still did not actually read `agents/analyst-1.md`, `agents/worker-1.md`, or `agents/tester-1.md`. Matching ids are not enough; role-backed automations must explicitly load the repo role file at runtime or the repo catalog becomes descriptive instead of authoritative.

## Evidence

- `docs/knowledge-base/012-automation-architecture.md` previously described repo automations in terms of `TODOS.md` and private memory, but not repo-visible journals or durable learnings.
- `/Users/prasanjitdey/.codex/automations/worker-1/automation.toml` previously used a prompt that only added a new TODO entry instead of executing one unblocked task.
- The new system note, spec, role docs, and automation prompts now all point at the same journal and learning-note contract.
- Before this follow-up fix, `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml`, `/Users/prasanjitdey/.codex/automations/worker-1/automation.toml`, and `/Users/prasanjitdey/.codex/automations/tester-1/automation.toml` still contained generic prompts with no reference to the repo's `agents/*.md` role files.
- The current prompts now load the matching repo role file first and treat its mission, outputs, guardrails, and success criteria as part of the live run contract.

## Implications For Future Agents

- When changing agent workflow, update the KB system note, the shared instruction files, the role definitions, and the live automation prompts together.
- Use `docs/journal/` for chronological run history and `docs/knowledge-base/learnings/` only for reusable knowledge.
- If an automation prompt and the written role contract disagree, treat that as contract drift and fix both sides in the same change.
- If a live automation is supposed to embody a repo role, make the prompt read the matching `agents/<role>.md` file explicitly instead of assuming the shared name is enough.

## Links

- [[012-automation-architecture]]
- [[SPEC-automation-agent-roles]]
- [Journal entry](../../journal/2026-03-25.md#1538-ist--codex--task-2026-03-25-67-bind-live-codex-automations-to-repo-role-files)
