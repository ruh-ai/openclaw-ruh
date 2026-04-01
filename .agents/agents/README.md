# Repo Automation Agents Mirror

This directory is the tool-facing mirror of `agents/`.

## Product Context

**Ruh.ai is the place where enterprises create digital employees with a soul** — AI assistants you love to work with, who understand you and feel like real teammates. The platform has two surfaces: the **Agent Builder** (`agent-builder-ui`) for creating assistants, and the **Client Application** (`ruh-frontend`, future desktop app) where users work alongside them daily. The **Google Ads agent** is the canonical proving case — all features are validated against it. See `docs/project-focus.md` for current priorities.

## Rules

- Keep the role contracts here aligned with the matching files in `agents/`
- Use this directory for local agent-tooling compatibility
- Treat `agents/` as the human-readable catalog and `.agents/agents/` as the execution-oriented mirror
- Every non-trivial run still writes to `docs/journal/YYYY-MM-DD.md`
- Create a KB learning note under `docs/knowledge-base/learnings/` only when the run produced durable insight
- Keep the `Analyst-1` and `Worker-1` contracts aligned on the shared feature-package unit of work
