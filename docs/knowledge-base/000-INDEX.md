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
| `ruh-backend` | `ruh-backend/` | 8000 | TypeScript/Bun REST API — sandbox, agent, auth, marketplace logic |
| `agent-builder-ui` | `agent-builder-ui/` | 3000 | Agent builder — conversational UI for developers to create agents |
| `ruh-frontend` | `ruh-frontend/` | 3001 | Customer web app — org admins and members interact with deployed agents |
| `ruh_app` | `ruh_app/` | N/A | Flutter cross-platform client app (iOS, Android, macOS, desktop) |
| `admin-ui` | `admin-ui/` | 3002 | Admin panel — platform management, user/agent oversight, moderation |
| `@ruh/marketplace-ui` | `packages/marketplace-ui/` | N/A | Shared marketplace React components |
| `postgres` | docker/k8s | 5432 | PostgreSQL 16 |
| `nginx` | `nginx/` | 80 | Reverse proxy |

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
- [[018-ruh-app]] — Flutter customer app for organization admins and members

### Platform
- [[014-auth-system]] — JWT auth, 3 user tiers (admin/developer/end_user), bcrypt, sessions
- [[015-admin-panel]] — Admin dashboard (admin-ui), user/agent management, moderation
- [[016-marketplace]] — Employee Marketplace, shared UI package, publish/install flow
- [[017-desktop-app]] — Deprecated Tauri desktop wrapper note retained for historical context

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
- [[SPEC-openclaw-bridge-forge-required]] — `/api/openclaw` is forge-only for builder execution and fails closed instead of reviving the retired shared architect gateway
- [[SPEC-architect-bridge-retry-safety]] — Builder architect requests use one stable request identity, abort cleanly, and fail closed after gateway acceptance
- [[SPEC-architect-exec-approval-policy]] — Builder architect bridge classifies exec approvals, auto-allows only a narrow safe set, and denies the rest visibly
- [[SPEC-agent-builder-architect-protocol-normalization]] — Builder bridge normalizes newer architect payloads into the stable create-flow contract
- [[SPEC-architect-structured-config-handoff]] — Builder preserves architect-emitted `tool_connections` and `triggers` through AG-UI draft state and reopen
- [[SPEC-google-ads-agent-creation-loop]] — `/agents/create` uses Google Ads as the proving case for persisted MCP-style tool metadata and supported trigger definitions
- [[SPEC-agent-builder-channel-persistence]] — builder-selected messaging channels persist through save, reopen, and deploy handoff as truthful planned state
- [[SPEC-agent-discovery-doc-persistence]] — approved PRD/TRD discovery docs persist through draft autosave, save, reopen, and Improve Agent review
- [[SPEC-agent-create-session-resume]] — `/agents/create?agentId=...` rehydrates from backend truth plus a safe local draft cache so refreshes do not drop builder progress or forge linkage
- [[SPEC-create-flow-lifecycle-navigation]] — create-flow stepper clicks inspect earlier stages without discarding already-unlocked forward progress
- [[SPEC-agent-create-deploy-handoff]] — `/agents/create` hands new agents into the real first-deploy route instead of saving and exiting to the list
- [[SPEC-agent-improvement-persistence]] — Builder recommendations become metadata-only saved agent state across review, reopen, and deploy
- [[SPEC-tool-integration-workspace]] — `/tools` and `/agents/create` share a truthful tool-research workspace plus fail-closed connector setup for `mcp`, `api`, and `cli`
- [[SPEC-copilot-config-workspace]] — `/agents/create` moves Co-Pilot controls into the Agent's Computer Config tab and uses builder-aware workspace auto-focus
- [[SPEC-create-flow-static-workspace-tabs]] — `/agents/create` keeps Co-Pilot workspace tabs static instead of auto-switching during builder activity
- [[SPEC-agent-builder-gated-skill-tool-flow]] — `/agents/create` locks downstream tabs until purpose metadata generates a real skill graph, resolves those skills against the registry, and blocks deploy on unresolved custom skills
- [[SPEC-pre-deploy-agent-testing]] — Review-phase test chat reuses the architect bridge with isolated `agent:test:*` sessions and SOUL prompt injection
- [[SPEC-multi-tenant-auth-foundation]] — Multi-tenant auth foundation: org memberships, active-org sessions, and local login fallback ahead of SSO
- [[SPEC-app-access-and-org-marketplace]] — Shared app-access contract, org-owned marketplace flow, Stripe checkout, and seat-based member assignment program
- [[SPEC-marketplace-store-parity]] — Research-backed rollout for store.ruh.ai-style catalog/detail/use parity across web and Flutter without abandoning org-owned entitlements
- [[SPEC-admin-billing-control-plane]] — Stripe-backed billing support console, Ruh entitlements, and customer-org billing operations in admin-ui
- [[SPEC-ruh-app-customer-surface-redesign]] — Redesigns the Flutter customer shell, workspace, marketplace, and detail surfaces around customer trust and clearer hierarchy
- [[SPEC-ruh-app-chat-first-agent-config]] — Makes Flutter agent launch chat-first and adds a first-class Agent Config tab with customer-safe runtime editing
- [[SPEC-ruh-app-runtime-recovery]] — Makes Flutter chat/runtime surfaces honest about sandbox health and gives operators direct recovery actions where failures happen
- [[SPEC-ruh-app-login-convenience]] — Flutter login page adds password visibility and remembered email without storing raw passwords
- [[SPEC-admin-control-plane]] — Expands `admin-ui` into a real super-admin control plane for overview, orgs, runtime, audit, marketplace, and system visibility
- [[SPEC-local-test-user-seeding]] — Idempotent backend seed command for local QA users across platform, developer-org, customer-org, and cross-org roles
- [[SPEC-local-demo-marketplace-seeding]] — Idempotent local demo seed for real agent-backed published marketplace listings
- [[SPEC-remove-tauri-desktop-app]] — Removes the deprecated Tauri wrapper and makes `ruh_app` the only native client path
- [[SPEC-gateway-tool-events]] — Structured sandbox tool events let chat UIs react to live tool execution with workspace/tab updates
- [[SPEC-agent-builder-session-token-hardening]] — Agent Builder auth moves to HttpOnly cookies plus a same-origin BFF so browser JS never handles bearer tokens
- [[SPEC-builder-pipeline-manifest]] — Builder derives a v1-conformant pipeline-manifest.json from each completed ArchitecturePlan; Ship gates deploy on `POST /api/conformance/check`
- [[SPEC-agent-builder-auth-gate]] — Builder pages fail closed behind middleware and session-bootstrap redirects while token hardening remains a follow-on
- [[SPEC-agent-builder-bridge-auth]] — `/api/openclaw` validates the caller session server-side and rejects cross-site bridge requests before gateway access
- [[SPEC-web-security-headers]] — Browser-facing apps emit baseline CSP, anti-framing, nosniff, referrer, and permissions headers with HTTPS-only edge HSTS
- [[SPEC-chat-conversation-boundaries]] — Chat proxy only reuses a conversation session key when the conversation belongs to the target sandbox
- [[SPEC-atomic-chat-persistence]] — Backend-owned chat delivery now persists successful conversation exchanges and reports streamed persistence failures explicitly
- [[SPEC-agent-edit-config-persistence]] — Improve Agent persists metadata and architect config before hot-pushing running sandboxes
- [[SPEC-agent-config-apply-contract]] — Sandbox config apply becomes a verified fail-closed contract for deploy and hot-push flows
- [[SPEC-real-agent-evaluation]] — Real agent evaluation with execution traces, LLM judge scoring, and GEPA-inspired reinforcement loop for iterative skill improvement
- [[SPEC-agent-sandbox-health-surface]] — Deployed-agent surfaces poll sandbox status and use explicit runtime `container_running` instead of DB-only liveness guesses
- [[SPEC-backend-request-validation]] — Shared backend request schemas and deterministic fail-fast 4xx validation for high-risk write/proxy routes
- [[SPEC-backend-config-schema]] — Centralized typed backend env parsing, defaults, and startup-fail validation contract
- [[SPEC-backend-schema-migrations]] — Ordered backend schema ledger and startup migration runner for PostgreSQL evolution
- [[SPEC-backend-shell-command-safety]] — Shared backend shell-quoting and path-normalization contract for configure-agent and cron mutations
- [[SPEC-agent-readable-system-events]] — Backend-owned structured system-event history plus optional Langfuse bridge correlation for agent-readable observability
- [[SPEC-local-langfuse-docker]] — Repo-local Docker deployment and env wiring for a self-hosted Langfuse UI on localhost
- [[SPEC-sandbox-runtime-reconciliation]] — Backend reconciles sandbox DB rows with Docker runtime truth and exposes admin drift report/repair flows
- [[SPEC-deployed-chat-browser-workspace]] — Deployed-agent Browser tab consumes structured browser SSE frames for timeline, preview, and takeover state
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — Deployed-agent Files tab lists sandbox outputs, previews safe artifacts, and exposes downloads under a bounded workspace-root contract
- [[SPEC-deployed-chat-artifact-preview]] — Deployed-agent Files tab classifies outputs by artifact type, renders richer previews, and exposes a gallery-oriented browse mode
- [[SPEC-deployed-chat-code-control-handoff]] — Deployed-agent Files tab adds session-scoped code handoff summaries, copy actions, and bounded workspace bundle export
- [[SPEC-deployed-chat-task-mode]] — Manus-style task plan decomposition, Code Editor tab, and auto-switching ComputerView for deployed-agent chat
- [[SPEC-deployed-chat-workspace-history]] — Deployed-agent conversations persist bounded `workspace_state` so Browser workspace history survives refresh and reopen
- [[SPEC-deployed-chat-task-and-terminal-history]] — Deployed-agent conversations persist bounded task-plan and terminal replay in the shared workspace history envelope
- [[SPEC-graceful-shutdown]] — Backend shutdown contract for draining requests, terminating SSE streams, and closing the DB pool within a bounded grace period
- [[SPEC-sandbox-conversation-cleanup]] — Sandbox deletion purges dependent conversation history and direct conversation routes fail closed after delete
- [[SPEC-shared-codex-oauth-bootstrap]] — New sandboxes can seed shared OpenClaw/Codex auth state and default to `openai-codex/gpt-5.5`
- [[SPEC-sandbox-bootstrap-config-apply-contract]] — Sandbox create fails closed unless required bootstrap config writes land and verify before `result`
- [[SPEC-shared-codex-retrofit]] — Existing running sandboxes and the standalone builder gateway can be retrofitted in place to the shared Codex auth model
- [[SPEC-agent-learning-and-journal]] — Contract for daily agent journals and reusable KB learning notes
- [[SPEC-automation-agent-roles]] — Repo-local role contracts for recurring maintainer agents
- [[SPEC-analyst-project-focus]] — Human-owned `Project Focus` document that steers `Analyst-1` backlog recommendations with a defined fallback path
- [[SPEC-feature-at-a-time-automation-contract]] — `Analyst-1` curates one complete feature package and `Worker-1` finishes one feature package per run
- [[SPEC-selected-tool-mcp-runtime-apply]] — Deploy/runtime config writes only selected configured MCP connectors and clears stale runtime state
- [[SPEC-control-plane-audit-log]] — Shared durable audit-event contract for backend mutations and architect approval actions
- [[SPEC-test-coverage-automation]] — Repo automation that adds one bounded, validated test improvement per run
- [[SPEC-conversation-history-pagination]] — Cursor-based bounded reads for conversation lists and per-conversation message history across both chat UIs
- [[SPEC-deployed-chat-workspace-memory]] — Deployed-agent chat persists reusable workspace instructions, continuity notes, and safe pinned references per agent
- [[SPEC-agui-protocol-adoption]] — Replace custom ChatEvent/ChatTransport with AG-UI protocol standard for agent-frontend communication
- [[SPEC-agent-computer-terminal-shell]] — Shared Agent's Computer terminal uses a bounded provisioning-style shell with an embedded prompt
- [[SPEC-builder-terminal-transcript-isolation]] — Builder terminal commands stay in Agent's Computer history instead of echoing into the left chat transcript
- [[SPEC-builder-contextual-refine-loop]] — Builder suggestions and post-build architect runs stay grounded in the current named agent and stage state
- [[SPEC-competitive-intelligence-learnings]] — Self-evolving multi-worker agent architecture: internal worker teams, skill evolution, enterprise governance
- [[SPEC-hermes-runner-readiness-and-dashboard]] — Hermes resolves its agent runner outside shell PATH assumptions and Mission Control foregrounds blocked-state plus active-goal pressure
- [[SPEC-hermes-goal-task-board]] — Hermes goals now decompose into dedicated board tasks with goal linkage, board status, and agent-attributed execution history
- [[SPEC-hermes-selectable-runner]] — Hermes can run agent work through either Claude Code or Codex with explicit runner switching and per-runner validation
- [[SPEC-hermes-resettable-task-state]] — Hermes can clear task/goal state to a stable blank slate because built-in strategist and analyst timers now honor schedule disables
- [[SPEC-agent-creation-lifecycle]] — **Implemented.** Full 7-stage agent creation lifecycle reference: Think → Plan → Build → Review → Test → Ship → Reflect with state machine, container lifecycle, eval loop, and deployment
- [[SPEC-agent-creation-v3-build-pipeline]] — **Implemented (v4).** Workspace-first build pipeline: Think = multi-step research agent, Plan = structural decisions (no inline content), Build = v4 orchestrator with scaffold + specialist sub-agents + validation
- [[SPEC-gateway-ws-proxy]] — Backend WS proxy replaces the Next.js SSE bridge: backend authenticates with the gateway server-side, browser gets bidirectional real-time events
- [[SPEC-agent-as-project]] — Each agent is a persistent software project: one GitHub repo, branch-based improvements, PR-driven reviews, incremental builds, and full development lifecycle
- [[SPEC-agent-mission-control-dashboard]] — Standalone Next.js dashboard for each deployed agent: real-time ops, task tracking, execution history
- [[SPEC-agent-runtime-v2]] — Full-stack agent runtime: SQLite database, vector store for RAG, custom API layer, Mission Control dashboard
- [[SPEC-agent-webhook-trigger-runtime]] — Signed inbound webhook triggers with shared-secret provisioning and replay-safe delivery
- [[SPEC-smart-agent-setup]] — AI-powered auto-population of agent config variables with three-tier classification

---

## Source Code Annotations (`@kb:`)

Critical source files contain `@kb:` annotations that link them to the KB notes they implement. This creates a bidirectional bond: KB notes document the code, and code declares which notes describe it.

- **Syntax:** `// @kb: 003-sandbox-lifecycle 001-architecture` (in JSDoc or standalone comment)
- **Validation:** `bun scripts/check-kb-annotations.ts` checks for broken references and missing annotations
- **Convention:** See CLAUDE.md "Source Code Annotations" section for full rules

When a KB note is renamed, update all `@kb:` references in source files. When a new critical file is created, add an `@kb:` annotation.

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
| Understand the full agent creation lifecycle (all 7 stages) | [[SPEC-agent-creation-lifecycle]] + [[008-agent-builder-ui]] |
| Work on the developer dashboard UI | [[009-ruh-frontend]] |
| Change deployment config | [[010-deployment]] |
| Understand agent-readable system logs and observability | [[SPEC-agent-readable-system-events]] + [[002-backend-overview]] |
| Run local Langfuse for builder tracing | [[SPEC-local-langfuse-docker]] + [[010-deployment]] |
| Understand shared Codex OAuth sandbox bootstrap | [[SPEC-shared-codex-oauth-bootstrap]] + [[003-sandbox-lifecycle]] |
| Understand shared Codex retrofit for running sandboxes | [[SPEC-shared-codex-retrofit]] + [[003-sandbox-lifecycle]] |
| Understand forge sandbox creation and promotion | [[004-api-reference]] + [[011-key-flows]] |
| Understand browser security headers and CSP policy | [[SPEC-web-security-headers]] + [[010-deployment]] |
| Understand browser/VNC and preview proxy surfaces | [[004-api-reference]] + [[009-ruh-frontend]] |
| Understand deployed-chat files and artifact previews | [[SPEC-deployed-chat-files-and-artifacts-workspace]] + [[008-agent-builder-ui]] |
| Understand deployed-chat artifact classification and gallery previews | [[SPEC-deployed-chat-artifact-preview]] + [[008-agent-builder-ui]] |
| Understand deployed-chat code handoff and workspace export | [[SPEC-deployed-chat-code-control-handoff]] + [[008-agent-builder-ui]] |
| Understand task plan mode, code editor, and auto-switch | [[SPEC-deployed-chat-task-mode]] + [[008-agent-builder-ui]] |
| Understand deployed-chat workspace history replay | [[SPEC-deployed-chat-workspace-history]] + [[008-agent-builder-ui]] |
| Understand deployed-chat task and terminal replay history | [[SPEC-deployed-chat-task-and-terminal-history]] + [[008-agent-builder-ui]] |
| Understand the shared Agent's Computer terminal shell | [[SPEC-agent-computer-terminal-shell]] + [[008-agent-builder-ui]] |
| Understand why builder terminal commands stay out of transcript | [[SPEC-builder-terminal-transcript-isolation]] + [[008-agent-builder-ui]] |
| Understand builder contextual suggestions and refine-mode reconfiguration | [[SPEC-builder-contextual-refine-loop]] + [[008-agent-builder-ui]] |
| Adopt AG-UI protocol for agent-frontend communication | [[SPEC-agui-protocol-adoption]] + [[008-agent-builder-ui]] |
| Understand the unified Co-Pilot Config workspace | [[SPEC-copilot-config-workspace]] + [[008-agent-builder-ui]] |
| Understand why create-flow workspace tabs stay static | [[SPEC-create-flow-static-workspace-tabs]] + [[008-agent-builder-ui]] |
| Understand saved PRD/TRD discovery-doc persistence | [[SPEC-agent-discovery-doc-persistence]] + [[008-agent-builder-ui]] |
| Understand create-flow refresh/reopen recovery | [[SPEC-agent-create-session-resume]] + [[008-agent-builder-ui]] |
| Understand why `/api/openclaw` now fails closed without `forge_sandbox_id` | [[SPEC-openclaw-bridge-forge-required]] + [[008-agent-builder-ui]] |
| Understand create-flow stepper/back navigation after refresh | [[SPEC-create-flow-lifecycle-navigation]] + [[008-agent-builder-ui]] |
| Understand purpose-gated skill inference and deploy blocking in Co-Pilot | [[SPEC-agent-builder-gated-skill-tool-flow]] + [[008-agent-builder-ui]] |
| Research or integrate a tool for an agent | [[SPEC-tool-integration-workspace]] + [[008-agent-builder-ui]] |
| Understand a user journey end-to-end | [[011-key-flows]] |
| Investigate sandbox runtime drift or repair DB/container skew | [[003-sandbox-lifecycle]] + [[SPEC-sandbox-runtime-reconciliation]] |
| Understand or author repo automations | [[012-automation-architecture]] |
| Understand the learning-note and daily-journal workflow | [[013-agent-learning-system]] |
| Understand repo-local maintainer agent roles | [[012-automation-architecture]] + [[SPEC-automation-agent-roles]] |
| Understand Hermes runner readiness and blocked Mission Control state | [[SPEC-hermes-runner-readiness-and-dashboard]] + [[012-automation-architecture]] |
| Understand the Hermes goal/task planning board | [[SPEC-hermes-goal-task-board]] + [[012-automation-architecture]] |
| Understand Hermes runner switching between Claude Code and Codex | [[SPEC-hermes-selectable-runner]] + [[012-automation-architecture]] |
| Reset Hermes task/goal state without immediate repopulation | [[SPEC-hermes-resettable-task-state]] + [[012-automation-architecture]] |
| Understand the analyst project-focus workflow | [[012-automation-architecture]] + [[SPEC-analyst-project-focus]] + `docs/project-focus.md` |
| Understand feature-at-a-time maintainer runs | [[SPEC-feature-at-a-time-automation-contract]] + [[012-automation-architecture]] |
| Understand the multi-tenant auth foundation | [[SPEC-multi-tenant-auth-foundation]] + [[014-auth-system]] + [[005-data-models]] |
| Understand the app-access, marketplace, checkout, and seat-assignment program | [[SPEC-app-access-and-org-marketplace]] + [[014-auth-system]] + [[016-marketplace]] |
| Understand the store.ruh.ai marketplace parity rollout | [[SPEC-marketplace-store-parity]] + [[016-marketplace]] + [[018-ruh-app]] |
| Understand the admin billing-control-plane architecture | [[SPEC-admin-billing-control-plane]] + [[015-admin-panel]] + [[016-marketplace]] |
| Understand the Flutter customer-surface redesign | [[SPEC-ruh-app-customer-surface-redesign]] + [[018-ruh-app]] + [[016-marketplace]] |
| Understand Flutter login convenience behavior | [[SPEC-ruh-app-login-convenience]] + [[018-ruh-app]] + [[014-auth-system]] |
| Understand the super-admin control plane expansion | [[SPEC-admin-control-plane]] + [[015-admin-panel]] + [[004-api-reference]] |
| Seed local QA accounts for auth and tenant testing | [[SPEC-local-test-user-seeding]] + [[014-auth-system]] |
| Seed real local marketplace demo listings | [[SPEC-local-demo-marketplace-seeding]] + [[016-marketplace]] + [[SPEC-local-test-user-seeding]] |
| Work on authentication | [[014-auth-system]] |
| Work on admin panel | [[015-admin-panel]] |
| Work on marketplace | [[016-marketplace]] |
| Work on Flutter customer app | [[018-ruh-app]] |
| Find chronological agent activity by date | `docs/journal/README.md` |
| Understand multi-worker agent architecture and skill evolution | [[SPEC-competitive-intelligence-learnings]] |
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

1. Create the note in `docs/knowledge-base/` with a breadcrumb header: `[[000-INDEX|← Index]] | [[related-note]] | [[related-note]]`
2. Add at least 2 outgoing `[[wikilinks]]` to related notes
3. Add the note to this INDEX (in the appropriate section). `LEARNING-*` notes are the exception; link them from affected notes and the daily journal instead.
4. Add backlinks from related notes to the new note
5. Run `/kb link` to verify graph integrity
