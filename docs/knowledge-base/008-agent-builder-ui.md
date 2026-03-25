# Agent Builder UI

[[000-INDEX|← Index]] | [[007-conversation-store|Conversation Store]] | [[009-ruh-frontend|Ruh Frontend →]]

---

## Overview

A Next.js 15 app (port 3000) providing a conversational UI for building AI agents. Users describe what they want; the system routes messages to an OpenClaw "architect" agent and returns structured skill graphs.

**Path:** `agent-builder-ui/`

---

## App Structure

```
app/
  (auth)/                         — Login flow (currently auth is disabled)
    authenticate/page.tsx
    _components/AuthButton.tsx, ImageCarousel.tsx
  (platform)/                     — Main authenticated area
    layout.tsx                    — Sidebar + main layout
    page.tsx                      — Redirects to /agents
    agents/
      page.tsx                    — Agent list
      [id]/
        chat/page.tsx             — Chat with deployed agent
        deploy/page.tsx           — Deploy agent to sandbox
      create/
        page.tsx                  — Agent creation flow
        _components/              — Chat UI + configure + review sub-flows
        _config/agentChatSteps.ts — Step config for creation wizard
  api/
    openclaw/route.ts             — WebSocket bridge to OpenClaw gateway (SSE out)
    auth.ts                       — Auth helpers
    user.ts                       — User endpoint
middleware.ts                     — Auth middleware (DISABLED — returns NextResponse.next())
```

---

## Agent Creation Flow

3 phases rendered in `agents/create/`:

### Phase 1: Chat (`_components/` chat components)
User converses with the architect agent. `useOpenClawChat` hook manages state.

### Phase 2: Configure (`_components/configure/`)
- `ConfigureAgent.tsx` — stepper wrapper
- `StepChooseSkills.tsx` — review/approve skill graph nodes
- `StepConnectTools.tsx` — configure tool connections
- `StepSetTriggers.tsx` — set up cron/triggers
- `ConnectToolsSidebar.tsx`, `SkillDetailPanel.tsx` — supporting panels

### Phase 3: Review (`_components/review/`)
- `ReviewAgent.tsx` — final review before deployment
- `DataFlowDiagram.tsx` — visual skill graph (using `FlowNode.tsx`)
- `SectionCard.tsx`, `InlineInput.tsx` — editable review sections

The review phase can also run a builder-local "Test Agent" chat that reuses the architect bridge transport with the generated SOUL prompt injected into an isolated `agent:test:<session_id>` gateway session. This lets operators sanity-check the in-progress agent behavior without polluting the main architect conversation or waiting for a real sandbox deploy.

When the page is editing an existing agent, completion now persists both metadata and architect output through the backend-backed agent store before any hot-push runs. The running-sandbox config push uses that merged saved snapshot rather than a transient in-memory object.
Runtime config apply is now fail closed: `pushAgentConfig()` only reports success when the backend returns `ok: true` and `applied: true`, the deploy page waits for that verified result before attaching a sandbox to the agent record, and Improve Agent / Mission Control no longer show blanket success when one or more running sandboxes reject the config update.

## Deployed Agent Chat Page

`app/(platform)/agents/[id]/chat/` is the deployed-agent UI, separate from the architect builder chat.

- `page.tsx` fetches sandbox records from the backend and selects the active sandbox.
- `TabChat.tsx` creates conversations and forwards chat requests through `ruh-backend`.
- `TabChat.tsx` now loads only the newest transcript window first and exposes explicit older-history fetches through the paginated message API.
- `TabChat.tsx` now exposes an `Agent's Workspace` with `terminal`, `files`, `browser`, and `thinking` tabs.
- The Files tab uses the bounded workspace routes in `ruh-backend` to list recent sandbox outputs under `~/.openclaw/workspace`, read inline-safe text previews, show image previews, and expose download links for generated artifacts.
- The Browser tab now accepts structured browser-workspace frames from the sandbox chat SSE stream and renders browser timeline rows, preview URLs, screenshots, and operator takeover/resume state through `lib/openclaw/browser-workspace.ts`.
- Browser parsing still keeps a heuristic markdown fallback for screenshots/URLs/localhost preview announcements when structured browser frames are absent, so future browser work should extend the structured event contract rather than doubling down on text scraping.
- Files workspace state is reset per sandbox/conversation selection, so the first slice avoids leaking one chat's selected file into another even though the backend does not yet persist per-run file snapshots.
- The deployed-agent chat page still has no connector-aware research workspace, source bundle, or result-deliverable surface, so sourced research runs remain trapped in assistant prose even when the workspace already shows browser and terminal activity.
- `TabMissionControl.tsx` is still a lightweight sandbox-ops panel. It shows status, conversation count, loaded skills, and quick actions, but it does not surface preview/publish state, access-control readiness, analytics snapshots, or app/data-resource visibility for generated products.
- The deployed-agent chat page still has no persistent project/workspace-memory surface. Operators cannot save reusable instructions, continuity notes, or pinned workspace references that survive refreshes and feed the next deployed-agent chat run.
- `TabChats.tsx` now loads the newest conversation page first and uses an explicit `Load more` affordance for older history instead of fetching every conversation on mount.
- `TabSettings.tsx` loads available models from `GET /api/sandboxes/:sandbox_id/models`, falls back to a curated catalog when discovery is unavailable, and controls the live provider reconfigure flow for non-shared sandboxes.
- `use-sandbox-health.ts` polls `GET /api/sandboxes/:sandbox_id/status` so the agent list and deployed-agent header surface running vs stopped vs unreachable sandboxes from explicit runtime signals.

When the active sandbox has `shared_codex_enabled=true`:

- the page clears stale local `agent.model` overrides unless they already use `openai-codex/...`
- `TabChat.tsx` always sends `openclaw-default` so the sandbox gateway resolves to its pinned shared model
- `TabSettings.tsx` shows the shared Codex model from sandbox metadata and disables the Apply & Restart provider flow

---

## State Management: `useOpenClawChat`

**File:** `hooks/use-openclaw-chat.ts`

Zustand store with `persist` middleware (stored in `localStorage` as `openclaw-chat-session`).

**State:**
- `sessionId` — uuid, persisted
- `messages: ChatMessage[]` — full conversation history, persisted
- `skillGraph: SkillGraphNode[] | null` — generated skill graph, persisted
- `workflow: WorkflowDefinition | null` — execution order, persisted
- `systemName: string | null` — agent name derived from first skill_id
- `agentRules: string[]` — derived from `agent_metadata` (tone, schedule, primary_users)
- `isLoading`, `statusMessage`, `error` — UI state, not persisted

**Key actions:**
- `sendMessage(text)` — calls `sendToArchitectStreaming()`, processes `ArchitectResponse`
- `initialize(agent)` — re-enter chat for an existing agent
- `reset()` — clear all state, new session

**Response processing by type:**
| Response type | Action |
|---|---|
| `clarification` | Normalize questions (string[] or object[]), display in chat |
| `ready_for_review` | Extract skill_graph, normalize workflow, derive rules, store in state |
| `agent_response` | Plain text message |
| `error` | Display error content |

---

## Gateway Bridge: `/api/openclaw/route.ts`

**What it does:** Bridges the Next.js frontend to the OpenClaw WebSocket gateway. Inputs from client via HTTP POST, outputs SSE stream.

**Environment variables:**
- `OPENCLAW_GATEWAY_URL` — WebSocket URL of the gateway
- `OPENCLAW_GATEWAY_TOKEN` — Bearer token for gateway transport auth
- `OPENCLAW_GATEWAY_ORIGIN` — Origin header (default: `https://clawagentbuilder.ruh.ai`)
- `OPENCLAW_TIMEOUT_MS` — Per-attempt timeout (default: 180000ms)

`OPENCLAW_GATEWAY_TOKEN` is still required even when the architect gateway itself was bootstrapped with shared Codex/OpenClaw OAuth. Shared Codex auth affects the gateway's downstream model calls inside the sandbox; it does not replace bridge-to-gateway authentication.

When that gateway is retrofitted to shared Codex, the retrofit must also clear any explicit `architect.model` override. Updating only `agents.defaults.model.primary` is insufficient for the builder flow, because the `/agents/create` chat still runs through the named `architect` agent and will keep using any stale provider-specific model pin until that override is rewritten.

**WebSocket Protocol (4 steps):**
1. Server sends `event: connect.challenge`
2. Client responds with `connect` request: `{ role: "operator", auth: { token } }`
3. Server responds `{ ok: true }` → send `chat.send { sessionKey: "agent:architect:main", message }`
4. Collect streamed `agent` events + wait for `chat { state: "final" }`

**Response format normalization** (in `finalizeResponse()`):
Tries in order:
1. Pure JSON parse
2. Embedded JSON matching type pattern (`clarification|ready_for_review|...`)
3. JSON in ` ```json ``` ` code block
4. YAML in typed code block (` ```ready_for_review ``` `)
5. Fallback: wrap as `agent_response`

**Retry logic:** 3 attempts, exponential backoff (2s, 4s). Gateway handshake failures are not retried after `AuthError`. Runtime failures that clearly indicate terminal provider-auth issues or model-limit errors are also resolved directly instead of being retried as connectivity problems.

**Tool auto-approval:** `exec.approval.requested` events are automatically approved via `exec.approval.resolve { decision: "allow" }`.

---

## OpenClaw Client Library

### `lib/openclaw/api.ts` — `sendToArchitectStreaming()`
HTTP client that calls `/api/openclaw`, consumes SSE, returns `ArchitectResponse`.

### `lib/openclaw/types.ts`
All TypeScript interfaces for the architect protocol. See [[005-data-models]].

### `lib/openclaw/agent-config.ts`
Agent configuration utilities.

---

## Auth State

Auth middleware (`middleware.ts`) is currently **disabled** — it returns `NextResponse.next()` unconditionally with a `TODO` comment. The underlying redirect logic to `/authenticate` is unreachable dead code.

The current auth/session implementation is also intentionally browser-readable: `authCookies.ts` sets both auth cookies with `httpOnly: false`, `SessionInitializationWrapper.tsx` copies the access token into the persisted `useUserStore`, and client axios interceptors read/refresh those tokens directly. That model is now treated as transitional and should not be extended by future auth work.

## Browser Security Headers

`next.config.ts` now emits an app-wide first-pass browser header policy from `lib/security-headers.ts`: CSP, anti-framing, `nosniff`, referrer policy, and a locked-down permissions policy. The builder's `connect-src` is still environment-aware because browser code directly calls `NEXT_PUBLIC_API_URL`, and `img-src` includes the same remote image hosts already allowed by Next image config.

The builder is now statically light-only at the app shell. `app/layout.tsx` no longer injects a theme-forcing inline script, and `Providers.tsx` no longer wraps the tree in `next-themes` because that package injects its own boot script even for a forced/light-only setup.

---

## Key Dependencies

- `zustand` + `zustand/middleware` — state management with persistence
- `ws` — WebSocket client in the bridge route
- `js-yaml` — YAML parsing for alternate response format
- `@tanstack/react-query` — data fetching (via `QueryProvider`)
- `shadcn/ui` — component library

---

## Feature Specs

- [[SPEC-agent-edit-config-persistence]] — Improve Agent now persists metadata plus architect config before hot-pushing running sandboxes
- [[SPEC-agent-config-apply-contract]] — deploy, hot-push, and Mission Control must treat sandbox config apply as a verified success/failure contract
- [[SPEC-agent-sandbox-health-surface]] — deployed-agent surfaces poll sandbox status and use explicit runtime/container signals instead of inferring liveness from persisted records
- [[SPEC-agent-model-settings]] — LLM provider & model selector (Settings tab on agent chat page)
- [[SPEC-agent-builder-architect-protocol-normalization]] — newer architect payloads are normalized into the stable builder create-flow contract
- [[SPEC-agent-builder-gateway-error-reporting]] — terminal provider-auth failures from the architect run are surfaced directly instead of being mislabeled as gateway outages
- [[SPEC-pre-deploy-agent-testing]] — review mode can test an in-progress agent through the architect bridge with isolated test sessions and SOUL prompt injection
- [[SPEC-agent-builder-session-token-hardening]] — builder auth moves to `HttpOnly` token cookies, server-owned session checks, and no token persistence in browser state
- [[SPEC-web-security-headers]] — builder responses emit a documented first-pass CSP plus baseline anti-framing, referrer, nosniff, and permissions headers
- [[SPEC-deployed-chat-browser-workspace]] — deployed-agent Browser tab consumes structured browser SSE frames for timeline, preview, and takeover state
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — deployed-agent Files tab lists recent workspace outputs, renders safe previews, and exposes artifact downloads
- [[SPEC-control-plane-audit-log]] — builder approval and bridge-side sensitive actions should emit the shared backend-owned audit event shape
- [[SPEC-shared-codex-oauth-bootstrap]] — the architect gateway can use the same shared Codex/OpenClaw auth convention as new sandboxes, but the bridge still uses gateway bearer auth
- [[SPEC-shared-codex-retrofit]] — shared-Codex sandboxes are surfaced to the deployed-agent UI, which locks provider switching and routes chat through `openclaw-default`
- [[SPEC-conversation-history-pagination]] — deployed-agent history/chat load newest pages first and fetch older conversations/messages explicitly

## Related Learnings

- [[LEARNING-2026-03-25-control-plane-audit-gap]] — bridge auth, approval policy, and secret-handling work still need a shared audit trail for architect-side sensitive actions
- [[LEARNING-2026-03-25-control-plane-rate-limit-gap]] — the architect bridge currently has retry logic but no caller throttling or in-flight concurrency guard for the shared privileged gateway
- [[LEARNING-2026-03-25-conversation-history-pagination-gap]] — deployed-agent chat still fetches full conversation lists and full message histories, so larger persisted histories need a bounded read contract before the chat page scales poorly
- [[LEARNING-2026-03-25-agent-builder-session-token-exposure]] — builder auth currently exposes access and refresh tokens to browser JavaScript and persisted Zustand state, so route-gating work should not finalize the auth model until token storage is hardened
- [[LEARNING-2026-03-25-web-security-headers-gap]] — captures the original missing-header gap and the follow-on implementation note that light-only builder shells should avoid `next-themes` because it injects an inline boot script
- [[LEARNING-2026-03-25-architect-bridge-retry-safety]] — bridge transport retries currently resend `chat.send` with a new idempotency key and no client abort path, so transient disconnects can duplicate architect runs or tool side effects
- [[LEARNING-2026-03-25-sse-heartbeat-idle-timeout-gap]] — the browser-facing architect SSE route can still be dropped by proxy idle timeouts during healthy long-running work because it emits no keepalive frames between lifecycle/result events
- [[LEARNING-2026-03-25-architect-sse-final-buffer]] — `sendToArchitectStreaming()` must process the leftover SSE buffer when the stream closes because the last `result` event may arrive without a trailing blank-line delimiter
- [[LEARNING-2026-03-25-architect-sse-crlf-framing]] — `sendToArchitectStreaming()` must normalize CRLF-framed SSE chunks before splitting event boundaries or multi-event streams collapse into one invalid parse block
- [[LEARNING-2026-03-25-architect-sse-multiline-data]] — `sendToArchitectStreaming()` must rejoin all `data:` lines within one SSE event before parsing JSON results
- [[LEARNING-2026-03-25-architect-workflow-normalization]] — `ready_for_review` normalization must preserve architect-supplied `workflow.steps[].wait_for` edges instead of flattening them into sequential dependencies
- [[LEARNING-2026-03-25-agent-edit-config-drift]] — the Improve Agent flow currently saves display metadata without persisting the edited `skillGraph` / `workflow` / `agentRules`, so future deploys and hot-pushes cannot rely on the backend-backed agent snapshot yet
- [[LEARNING-2026-03-25-manus-parity-focus]] — the deployed-agent chat page is now the active project-focus target for Manus-style workspace parity across browser, editor/files, terminal, artifacts, connectors, and productization surfaces
- [[LEARNING-2026-03-25-deployed-chat-browser-event-pass-through]] — the deployed-agent Browser tab can reuse raw sandbox chat SSE and consume top-level `browser` / `browser_event` frames without a new backend route
- [[LEARNING-2026-03-25-deployed-chat-browser-workspace-gap]] — the deployed-agent chat page now has a heuristic Browser tab, but it still lacks a structured browser-workspace contract and broader runtime-workspace telemetry
- [[LEARNING-2026-03-25-deployed-chat-files-artifacts-workspace-gap]] — after the browser slice, the deployed-agent chat page still has no files/editor or artifact preview contract, so generated workspace outputs remain trapped in chat prose and terminal output
- [[LEARNING-2026-03-25-deployed-chat-research-workspace-gap]] — after browser/files/terminal slices are scoped, the next uncovered parity gap is a connector-aware research workspace with source provenance and result-bundle visibility on the deployed-agent chat page
- [[LEARNING-2026-03-25-deployed-chat-productization-surface-gap]] — after the research slice, the next uncovered parity gap is a productization/operator surface for preview, publish, access, analytics, and app/data visibility on the deployed-agent chat page
- [[LEARNING-2026-03-25-deployed-chat-persistent-workspace-memory-gap]] — after productization coverage is represented, the remaining focus-ordered parity gap is durable workspace memory for reusable instructions, pinned references, and continuity across deployed-agent chats
