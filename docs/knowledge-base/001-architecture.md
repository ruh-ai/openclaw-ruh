# Architecture Overview

[[000-INDEX|← Index]] | [[010-deployment]] | [[012-automation-architecture]]

---

## System Diagram

```
Browser (User)                    Flutter App (ruh_app)
    │                                  │
    ▼                                  │  REST / SSE
┌─────────────────────────────────┐    │
│  Nginx (:80)                    │    │
│  /api/*  → backend:8000        │    │
│  /  → ruh-frontend / builder   │    │
└──────────────┬──────────────────┘    │
               │                       │
  ┌────────────┼──────────┐            │
  ▼            ▼          ▼            ▼
ruh-frontend  builder-ui  ruh-backend ◄──┘
(Next.js 16)  (Next.js 15) (Bun/Express)
port 3001     port 3000    port 8000
                   │            │
                   │ WebSocket  │ docker exec
                   ▼            ▼
            OpenClaw Gateway  Docker Containers
            (inside sandbox)  (openclaw-<uuid>)
                                    │
                               PostgreSQL 16
                                port 5432
```

---

## Key Design Decisions

### 1. Sandbox = Docker Container
Each sandbox is a `node:22-bookworm` Docker container with `openclaw` installed globally. The backend interacts with it via `docker exec`, not a network API. The container exposes port 18789 (GATEWAY_PORT) which is mapped to a random host port on creation.

### 2. SSE for Sandbox Creation
`POST /api/sandboxes/create` returns a `stream_id` immediately. The client then connects to `GET /api/sandboxes/stream/:stream_id` (Server-Sent Events) to receive progress events: `log`, `result`, `approved`, `error`, `done`. This decouples the long-running Docker setup (~2-5 min) from the HTTP request.

### 3. Two Separate Frontends
- **`ruh-frontend`** — low-level developer tool. Direct REST API calls to `ruh-backend`. No end-user auth layer is described here.
- **`agent-builder-ui`** — higher-level conversational builder. Connects to an OpenClaw architect agent via WebSocket through a Next.js API route bridge (`/api/openclaw`). In non-development environments, page routes fail closed behind cookie-aware middleware and session-bootstrap redirects, and the bridge route separately validates the current session plus same-origin request integrity before opening the privileged gateway connection. Local development intentionally bypasses those page/session auth gates.

### 4. OpenClaw Agent as Architect
The `agent-builder-ui` doesn't have its own LLM logic. It routes messages to an OpenClaw agent running inside a sandbox acting as the "architect". The gateway bridge (`agent-builder-ui/app/api/openclaw/route.ts`) handles the WebSocket protocol, retries, execution-approval policy, and response format normalization (JSON / YAML / embedded JSON). The bridge still authenticates to that gateway with `OPENCLAW_GATEWAY_TOKEN`; this transport auth is separate from whatever model auth the gateway uses internally.

### 5. Shared Codex OAuth Can Override API-Key Bootstrap
When host shared auth state exists, sandbox creation now prefers that over API-key bootstrap: it seeds host OpenClaw OAuth or Codex CLI auth into the container, skips interactive provider onboarding, sets the default model to `openai-codex/gpt-5.5`, and live-probes `openai-codex` before continuing. Existing running sandboxes can be retrofitted later and marked with persisted shared-Codex metadata. If no shared auth is available, the legacy provider priority still applies: **OpenRouter → OpenAI → Anthropic → Gemini → Ollama (fallback)**.

### 6. Conversations Have Session Keys
Each conversation gets an `openclaw_session_key` formatted as `agent:main:<uuid>`. This key is sent as `x-openclaw-session-key` header when proxying chat completions, so the OpenClaw gateway maintains session context for that conversation.

### 7. Repo Maintenance Includes Codex Automations
This repository also uses Codex desktop automations for recurring maintenance tasks such as backlog curation, implementation work, and status updates. Those runs are not part of the deployed product runtime; they are an operator layer that reads the repo, updates files like `TODOS.md`, appends daily run logs under `docs/journal/`, writes durable KB learnings when needed, and uses per-automation memory stored under `$CODEX_HOME/automations/<automation_id>/`. `Analyst-1` can read the human-owned `docs/project-focus.md` steering artifact when the operator wants backlog recommendations to stay inside an explicitly declared priority area, and the maintainer contract now treats one `TODOS.md` entry as one feature package so `Worker-1` can finish a user-testable feature in a single run.

See [[012-automation-architecture]] for the automation operating model and prompt patterns, and see [[013-agent-learning-system]] for the shared journal and learning-note contract across all agents.
The repo-local role contracts for those maintainer agents now live in `agents/` and `.agents/agents/`; see [[SPEC-automation-agent-roles]].

### 8. Sensitive Control-Plane Writes Emit Audit Events
Representative backend control-plane mutations now persist redacted audit rows in PostgreSQL before returning success. The first backend slice writes `control_plane_audit_events` for sandbox delete, agent delete, configure-agent, LLM reconfigure, shared-Codex retrofit, cron mutations, channel updates, and pairing approvals, and exposes an admin-only `GET /api/admin/audit-events` query surface. The current slice is backend-owned only; architect approval events still belong to the follow-up bridge work tracked by [[SPEC-control-plane-audit-log]].

### 9. Agent-Readable Observability Is Hybrid
Durable system/runtime history now lives in the backend-owned `system_events` table and is exposed through `/api/system/events` plus scoped sandbox/agent read routes. Langfuse/OpenTelemetry is additive and currently limited to the Node-based architect bridge in `agent-builder-ui`, where it traces architect request milestones and can return a `trace_id` in the terminal bridge result when enabled. Agents should treat PostgreSQL-backed `system_events` as the canonical product-runtime log and use Langfuse only for bridge/LLM trace correlation.

---

## Platform Architecture (Three-Tier User Model)

The platform serves three user types through dedicated interfaces:

| User Tier | Interface | Service | Purpose |
|-----------|-----------|---------|---------|
| **Admin** | Admin Dashboard | `admin-ui` (port 3002) | Platform management, user oversight, marketplace moderation |
| **Developer** | Agent Builder | `agent-builder-ui` (port 3000) | Create, configure, test, and publish agents |
| **End User** | Customer Web App | `ruh-frontend` (port 3001) | Org admins and members browse, purchase, and use agents |
| **End User** | Flutter App | `ruh_app` (cross-platform) | Native mobile/desktop client — same API surface and customer contract as ruh-frontend |

### Auth Layer
All services authenticate against `ruh-backend /api/auth/*`. JWT access tokens (15min) + refresh token rotation (7 days). See [[014-auth-system]].

### Employee Marketplace
Agents flow: Developer builds → submits to marketplace → Admin reviews → End user installs. See [[016-marketplace]].

### Flutter Client App
`ruh_app/` is a cross-platform Flutter client (iOS, Android, macOS, desktop) using Riverpod + GoRouter. It consumes the same `ruh-backend` REST/SSE API as `ruh-frontend` and features a Manus-style split-pane chat with an "Agent's Computer" panel (Terminal, Code, Browser tabs with tool-driven auto-switching). See [[018-ruh-app]].

---

## Related Learnings

- [[LEARNING-2026-03-28-repo-testability-audit]] — repo-wide audit of the architectural seams that currently make backend and frontend behavior expensive to test in isolation
- [[LEARNING-2026-03-28-agent-readable-system-events]] — canonical runtime observability should stay backend-owned, with Langfuse limited to additive bridge tracing and shared correlation ids
- [[LEARNING-2026-03-25-control-plane-audit-gap]] — the current auth, secret, and approval backlog still lacks a shared durable audit trail for sensitive control-plane mutations
- [[LEARNING-2026-03-25-control-plane-rate-limit-gap]] — expensive backend and architect routes currently have no shared abuse-control boundary, so one caller can consume disproportionate Docker and gateway capacity
- [[LEARNING-2026-03-27-agent-builder-bridge-auth-contract]] — page-route auth is not enough for `/api/openclaw`; the privileged bridge must validate the server-side builder session itself before opening the gateway
- [[REVIEW-paperclip-openspace-architecture]] — architecture review of Paperclip + OpenSpace integration patterns, fire-and-forget hooks, shell injection risk, and Phase 2 coordinator readiness

---

## Related Specs

- [[SPEC-agent-builder-architect-protocol-normalization]] — defines the bridge-side normalization boundary between evolving architect payloads and the stable builder UI contract
- [[SPEC-agent-builder-gateway-error-reporting]] — clarifies that architect-run provider auth failures happen after a successful gateway connection and should not be surfaced as transport outages
- [[SPEC-architect-bridge-retry-safety]] — builder requests reuse one logical request ID and stop retrying once the gateway has accepted the run
- [[SPEC-architect-exec-approval-policy]] — the builder bridge classifies architect exec approval requests and fails closed for unsafe or unclear tool runs
- [[SPEC-agent-builder-session-token-hardening]] — defines the builder auth/session boundary so browser code no longer handles bearer tokens directly
- [[SPEC-agent-builder-auth-gate]] — defines the current fail-closed page-gating contract for builder routes while the token model is still transitional
- [[SPEC-agent-builder-bridge-auth]] — defines the server-side bridge-session validation and same-origin boundary for `/api/openclaw`
- [[SPEC-web-security-headers]] — defines the browser-enforced response-header policy across the Next.js frontends and edge proxy
- [[SPEC-shared-codex-oauth-bootstrap]] — documents the shared-auth sandbox bootstrap path and the separation between model auth and gateway bearer auth
- [[SPEC-shared-codex-retrofit]] — documents the in-place retrofit path for running sandboxes and the builder gateway while preserving separate gateway bearer auth
- [[SPEC-control-plane-audit-log]] — defines the shared audit boundary for backend control-plane mutations and architect approval activity
- [[SPEC-agent-readable-system-events]] — defines the broader backend-owned runtime event history and Langfuse correlation boundary for agent-readable observability
- [[SPEC-local-langfuse-docker]] — defines the local self-hosted Langfuse deployment that complements the bridge-side trace export contract
- [[SPEC-agent-learning-and-journal]] — defines the repo-wide journal and durable-learning contract for interactive agents and automations
- [[SPEC-test-coverage-automation]] — defines the bounded analyze-patch-verify automation used to improve repo test coverage
- [[SPEC-automation-agent-roles]] — defines the mirrored repo-local contracts for `Analyst-1`, `Worker-1`, and `Tester-1`
- [[SPEC-analyst-project-focus]] — defines the project-focus steering artifact and the analyst fallback rules when no focus is active
- [[SPEC-feature-at-a-time-automation-contract]] — defines the feature-package unit of work for `Analyst-1` backlog curation and `Worker-1` implementation runs

---

## Request Path: Developer UI Chat

```
User types message in ruh-frontend
    → POST /api/sandboxes/:id/chat/ws (ruh-backend)
    → Looks up SandboxRecord (gateway port + token)
    → Looks up ConversationRecord (session key) when conversation_id is present
    → Opens gateway operator WebSocket at ws://localhost:<gateway_port>
      Auth: connect.challenge → connect req with gateway token
    → Sends chat.send with the session-scoped workspace rule + user content
    → Streams SSE back to client:
      - status events
      - OpenAI-style text deltas
      - tool start / tool completion frames
      - persistence_error when transcript save fails after content streamed
```

Deployed-agent/operator surfaces still use the lower-level `POST /api/sandboxes/:id/chat` HTTP proxy when they need OpenAI-compatible chat-completions semantics plus browser-workspace pass-through frames.

## Request Path: Agent Builder

```
User types in agent-builder-ui
    → useOpenClawChat.sendMessage()
    → POST /api/openclaw (Next.js route — bridge)
    → WebSocket to OPENCLAW_GATEWAY_URL
      Handshake: connect.challenge → connect req → hello-ok
      Send: chat.send { sessionKey: "agent:architect:<session_id>", message }
      Receive: agent lifecycle events + final text
      Bridge policy: only a narrow read-only exec allowlist auto-runs; other approval requests fail closed
      Parse: JSON → YAML → embedded JSON → agent_response fallback
    → SSE stream back to client: status events + result event
    → ArchitectResponse parsed in useOpenClawChat
```

---

## Environment Variables

See [[010-deployment]] for full list. Key ones:

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | ruh-backend | PostgreSQL DSN |
| `OPENCLAW_SHARED_OAUTH_JSON_PATH` | ruh-backend | Optional host path to shared OpenClaw OAuth state for new sandboxes |
| `CODEX_AUTH_JSON_PATH` | ruh-backend | Optional host path to shared Codex CLI auth fallback for new sandboxes |
| `OPENCLAW_SHARED_CODEX_MODEL` | ruh-backend | Default `openai-codex` model applied after shared-auth bootstrap |
| `ANTHROPIC_API_KEY` | ruh-backend | LLM key (fallback) |
| `OPENROUTER_API_KEY` | ruh-backend | LLM key (highest priority) |
| `OPENCLAW_GATEWAY_URL` | agent-builder-ui | WebSocket URL for architect agent |
| `OPENCLAW_GATEWAY_TOKEN` | agent-builder-ui | Auth token for the gateway transport, separate from model auth |
| `NEXT_PUBLIC_API_URL` | ruh-frontend | Backend URL from browser |
- [[SPEC-agent-as-project]] — Agent-as-project lifecycle: persistent repo, branch-based improvements, PR-driven reviews
