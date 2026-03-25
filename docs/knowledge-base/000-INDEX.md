# openclaw-ruh-enterprise — Knowledge Base

> **Entry point for AI agents navigating this codebase.**
> Read this first. Use the links below to navigate to any topic.

---

## What Is This?

**openclaw-ruh-enterprise** is the core infrastructure product for [Ruh.ai](https://ruh.ai) — a platform for deploying, managing, and interacting with AI agent sandboxes.

Each "sandbox" is a local Docker container running the `openclaw` CLI agent gateway. The backend manages their lifecycle; the frontends provide UIs for humans and an AI architect for building agents.

---

## Service Map

| Service | Path | Port | Purpose |
|---|---|---|---|
| `ruh-backend` | `ruh-backend/` | 8000 | TypeScript/Bun REST API — all sandbox, conversation, cron, channel logic |
| `ruh-frontend` | `ruh-frontend/` | 3001 | Developer UI — create sandboxes, chat, manage crons/channels |
| `agent-builder-ui` | `agent-builder-ui/` | 3000 | Agent builder — conversational UI that calls the OpenClaw architect agent |
| `postgres` | docker/k8s | 5432 | PostgreSQL 16 — sandboxes + conversations tables |
| `nginx` | `nginx/` | 80 | Reverse proxy — routes `/api/*` to backend, `/` to frontend |

---

## Knowledge Base Index

### Core Architecture
- [[001-architecture]] — System overview, data flows, request paths, key design decisions

### Backend
- [[002-backend-overview]] — Module map, startup sequence, Express app structure
- [[003-sandbox-lifecycle]] — Sandbox creation flow, Docker management, SSE streaming
- [[004-api-reference]] — All API endpoints with params, responses, error codes
- [[005-data-models]] — DB tables, TypeScript interfaces, serialization

### Domain Logic
- [[006-channel-manager]] — Telegram/Slack configuration, pairing flow
- [[007-conversation-store]] — Conversation + message management, session keys

### Frontends
- [[008-agent-builder-ui]] — Architect chat flow, WebSocket bridge, SSE, skill graph types
- [[009-ruh-frontend]] — Developer UI components, sandbox sidebar, chat/crons/channels panels

### Ops
- [[010-deployment]] — Docker Compose, Kubernetes, environment variables
- [[011-key-flows]] — End-to-end walkthroughs: create sandbox → chat → configure agent
- [[012-automation-architecture]] — How Codex automations operate in this repo, where state lives, and prompt patterns
- [[013-agent-learning-system]] — Repo-wide rule for daily agent journals and durable KB learning notes

### Feature Specs
All feature specifications live in `specs/`. Every spec links to the KB notes it affects, and those notes link back.

- [[SPEC-agent-persistence]] — Backend persistence for agents (PostgreSQL table + REST CRUD API)
- [[SPEC-agent-model-settings]] — Agent LLM provider & model selector (Settings tab, client-side, no backend changes)
- [[SPEC-agent-builder-gateway-error-reporting]] — Architect bridge reports terminal provider-auth failures without mislabeling them as gateway outages
- [[SPEC-agent-builder-architect-protocol-normalization]] — Builder bridge normalizes newer architect payloads into the stable create-flow contract
- [[SPEC-pre-deploy-agent-testing]] — Review-phase test chat reuses the architect bridge with isolated `agent:test:*` sessions and SOUL prompt injection
- [[SPEC-agent-builder-session-token-hardening]] — Agent Builder auth moves to HttpOnly cookies plus a same-origin BFF so browser JS never handles bearer tokens
- [[SPEC-web-security-headers]] — Browser-facing apps emit baseline CSP, anti-framing, nosniff, referrer, and permissions headers with HTTPS-only edge HSTS
- [[SPEC-chat-conversation-boundaries]] — Chat proxy only reuses a conversation session key when the conversation belongs to the target sandbox
- [[SPEC-agent-edit-config-persistence]] — Improve Agent persists metadata and architect config before hot-pushing running sandboxes
- [[SPEC-agent-config-apply-contract]] — Sandbox config apply becomes a verified fail-closed contract for deploy and hot-push flows
- [[SPEC-agent-sandbox-health-surface]] — Deployed-agent surfaces poll sandbox status and use explicit runtime `container_running` instead of DB-only liveness guesses
- [[SPEC-backend-request-validation]] — Shared backend request schemas and deterministic fail-fast 4xx validation for high-risk write/proxy routes
- [[SPEC-backend-shell-command-safety]] — Shared backend shell-quoting and path-normalization contract for configure-agent and cron mutations
- [[SPEC-deployed-chat-browser-workspace]] — Deployed-agent Browser tab consumes structured browser SSE frames for timeline, preview, and takeover state
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — Deployed-agent Files tab lists sandbox outputs, previews safe artifacts, and exposes downloads under a bounded workspace-root contract
- [[SPEC-graceful-shutdown]] — Backend shutdown contract for draining requests, terminating SSE streams, and closing the DB pool within a bounded grace period
- [[SPEC-sandbox-conversation-cleanup]] — Sandbox deletion purges dependent conversation history and direct conversation routes fail closed after delete
- [[SPEC-shared-codex-oauth-bootstrap]] — New sandboxes can seed shared OpenClaw/Codex auth state and default to `openai-codex/gpt-5.4`
- [[SPEC-shared-codex-retrofit]] — Existing running sandboxes and the standalone builder gateway can be retrofitted in place to the shared Codex auth model
- [[SPEC-agent-learning-and-journal]] — Contract for daily agent journals and reusable KB learning notes
- [[SPEC-automation-agent-roles]] — Repo-local role contracts for recurring maintainer agents
- [[SPEC-analyst-project-focus]] — Human-owned `Project Focus` document that steers `Analyst-1` backlog recommendations with a defined fallback path
- [[SPEC-feature-at-a-time-automation-contract]] — `Analyst-1` curates one complete feature package and `Worker-1` finishes one feature package per run
- [[SPEC-control-plane-audit-log]] — Shared durable audit-event contract for backend mutations and architect approval actions
- [[SPEC-test-coverage-automation]] — Repo automation that adds one bounded, validated test improvement per run
- [[SPEC-conversation-history-pagination]] — Cursor-based bounded reads for conversation lists and per-conversation message history across both chat UIs

---

## Obsidian Graph Rules

This knowledge base is designed for Obsidian graph navigation. All notes must follow these rules:

1. **Every note must have at least 2 outgoing `[[wikilinks]]`** to related notes.
2. **Every note must be reachable** from `[[000-INDEX]]` within 2 hops.
3. **Backlinks are mandatory.** If note A links to note B, note B should link back to note A (via the navigation header at minimum).
4. **New specs** must link to all KB notes they touch and be added to this index.
5. **No orphan notes.** If a note has zero incoming links, it is undiscoverable and must be linked from at least one other note.
6. **`LEARNING-*` notes are indexed by backlinks, not by a one-line entry here.** Use [[013-agent-learning-system]] as the stable entry point for that layer.

---

## Quick Navigation for Agents

| "I want to..." | Go to |
|---|---|
| Understand the full system | [[001-architecture]] |
| Add or modify a backend API endpoint | [[004-api-reference]] + [[002-backend-overview]] |
| Change sandbox creation behavior | [[003-sandbox-lifecycle]] |
| Work on the database schema | [[005-data-models]] |
| Fix or extend channel (Telegram/Slack) logic | [[006-channel-manager]] |
| Work on conversations or chat | [[007-conversation-store]] |
| Work on the agent builder chat UI | [[008-agent-builder-ui]] |
| Work on the developer dashboard UI | [[009-ruh-frontend]] |
| Change deployment config | [[010-deployment]] |
| Understand shared Codex OAuth sandbox bootstrap | [[SPEC-shared-codex-oauth-bootstrap]] + [[003-sandbox-lifecycle]] |
| Understand shared Codex retrofit for running sandboxes | [[SPEC-shared-codex-retrofit]] + [[003-sandbox-lifecycle]] |
| Understand browser security headers and CSP policy | [[SPEC-web-security-headers]] + [[010-deployment]] |
| Understand deployed-chat files and artifact previews | [[SPEC-deployed-chat-files-and-artifacts-workspace]] + [[008-agent-builder-ui]] |
| Understand a user journey end-to-end | [[011-key-flows]] |
| Understand or author repo automations | [[012-automation-architecture]] |
| Understand the learning-note and daily-journal workflow | [[013-agent-learning-system]] |
| Understand repo-local maintainer agent roles | [[012-automation-architecture]] + [[SPEC-automation-agent-roles]] |
| Understand the analyst project-focus workflow | [[012-automation-architecture]] + [[SPEC-analyst-project-focus]] + `docs/project-focus.md` |
| Understand feature-at-a-time maintainer runs | [[SPEC-feature-at-a-time-automation-contract]] + [[012-automation-architecture]] |
| Find chronological agent activity by date | `docs/journal/README.md` |
| Create a feature spec | Run `/kb spec <name>` |
| Check KB health | Run `/kb audit` |
| Update KB after code changes | Run `/kb update` |
| Orient before starting a task | Run `/kb read` |

---

## Maintaining This Knowledge Base

This KB is maintained using the **`/kb` skill** (repo-local copy: `.agents/skills/kb/SKILL.md`). The skill has 5 modes:

| Mode | Command | When to use |
|---|---|---|
| **read** | `/kb read` | Start of any task — orient on what the KB knows |
| **spec** | `/kb spec <name>` | Plan phase — create a feature spec with wikilinks |
| **link** | `/kb link` | After editing any KB note — verify graph integrity |
| **audit** | `/kb audit` | Ship phase + weekly retro — full health check |
| **update** | `/kb update` | After code changes — diff-driven note updates |

### When KB work happens in the sprint

```
Think:   /kb read          ← orient before starting
Plan:    /kb spec <name>   ← create spec before building
Ship:    /kb update        ← update notes to match code changes
Ship:    /kb audit         ← verify health before PR
Reflect: /kb audit         ← weekly health check
```

### Spec lifecycle

All specs live in `specs/` and follow this status lifecycle:

```
draft → approved → implemented → deprecated
```

- `draft` — spec written, not yet reviewed
- `approved` — plan reviews passed
- `implemented` — code shipped and tests pass
- `deprecated` — feature removed or superseded

### Adding a new KB note

1. Create the note in `docs/knowledge-base/` with a breadcrumb header: `[[000-INDEX|← Index]] | [[prev]] | [[next →]]`
2. Add at least 2 outgoing `[[wikilinks]]` to related notes
3. Add the note to this INDEX (in the appropriate section). `LEARNING-*` notes are the exception; link them from affected notes and the daily journal instead.
4. Add backlinks from related notes to the new note
5. Run `/kb link` to verify graph integrity
