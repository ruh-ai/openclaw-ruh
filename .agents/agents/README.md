# Repo Automation Agents Mirror

This directory is the tool-facing mirror of `agents/`.

## Product Context

**Ruh.ai is the place where enterprises create digital employees with a soul** — AI assistants you love to work with, who understand you and feel like real teammates. The platform has two surfaces: the **Agent Builder** (`agent-builder-ui`) for creating assistants, and the **Client Application** (`ruh-frontend`, future desktop app) where users work alongside them daily. The **Google Ads agent** is the canonical proving case — all features are validated against it. See `docs/project-focus.md` for current priorities.

## Agents

| Agent | Role | Delegates to |
|-------|------|-------------|
| `analyst-1` | Inspects repo, identifies highest-value missing feature, adds TODO entry | — |
| `worker-1` | Picks one unblocked feature from TODOS.md, implements end-to-end | — |
| `tester-1` | Makes one bounded test improvement per run | — |
| `hermes-1` | Orchestrator relay — submits tasks/goals to Hermes queue (localhost:8100) | Hermes specialists: backend, frontend, flutter, test, reviewer, sandbox |

### Hermes Integration

`hermes-1` bridges the Codex automation layer with the Hermes autonomous task queue. Instead of doing work directly, it submits tasks and goals to the Hermes backend API. This ensures:

- Work is routed to the best specialist agent automatically
- The evolution engine scores results and improves agents over time
- All work is tracked in the structured PostgreSQL backend (hermes database)
- Cold memory (ChromaDB) captures learnings for future reuse

The full Hermes agent definitions live in `.claude/agents/`. The `hermes-1` agent here is the lightweight relay that connects scheduled Codex automations to that system.

## Rules

- Keep the role contracts here aligned with the matching files in `agents/`
- Use this directory for local agent-tooling compatibility
- Treat `agents/` as the human-readable catalog and `.agents/agents/` as the execution-oriented mirror
- Every non-trivial run still writes to `docs/journal/YYYY-MM-DD.md`
- Create a KB learning note under `docs/knowledge-base/learnings/` only when the run produced durable insight
- Keep the `Analyst-1` and `Worker-1` contracts aligned on the shared feature-package unit of work
- `hermes-1` should check Hermes health before every submission — do not assume it is running
