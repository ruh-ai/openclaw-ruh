# Repo Automation Agents

This directory is the human-readable catalog for recurring repo-maintainer agents in `openclaw-ruh-enterprise`.

## Product Context

**Ruh.ai is the place where enterprises create digital employees with a soul** — AI assistants you love to work with, who understand you and feel like real teammates. The platform has two surfaces: the **Agent Builder** (`agent-builder-ui`) for creating assistants, and the **Client Application** (`ruh-frontend`, future desktop app) where users work alongside them daily. The **Google Ads agent** is the canonical proving case — all features are validated against it. See `docs/project-focus.md` for current priorities.

## Structure

- `agents/` is the readable source of truth for role definitions
- `.agents/agents/` is the tool-facing mirror for local agent tooling
- When one copy changes, update the other in the same diff

## Initial Agents

- [Analyst-1](./analyst-1.md) — focus-aware backlog analyst that turns the current `docs/project-focus.md` priorities into one complete feature package, or falls back to global gap analysis
- [Worker-1](./worker-1.md) — implementation worker that completes one unblocked feature package with normal repo discipline
- [Tester-1](./tester-1.md) — test worker that adds one bounded, validated test improvement or one TODO fallback

## Shared Output Contract

Every non-trivial run by these agents must:

- update `TODOS.md` when task state or handoff context changed
- append a dated entry to `docs/journal/YYYY-MM-DD.md`
- create or update a KB learning note under `docs/knowledge-base/learnings/` when the run produced durable knowledge another agent should reuse

## Related Notes

- See [012-automation-architecture](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/012-automation-architecture.md) for the operator-layer automation model
- See [013-agent-learning-system](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/013-agent-learning-system.md) for the repo-wide journal and durable-learning workflow
- See [SPEC-automation-agent-roles](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/specs/SPEC-automation-agent-roles.md) for the canonical repo contract
