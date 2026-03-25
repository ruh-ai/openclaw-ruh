# Ruh Frontend (Developer UI)

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[010-deployment|Deployment →]]

---

## Overview

A Next.js 16 dev tool (port 3001) for directly managing sandboxes. Provides a low-level interface: create sandboxes, chat with them, configure cron jobs and channels.

**Path:** `ruh-frontend/`

---

## App Structure

```
app/
  layout.tsx        — root layout
  page.tsx          — main page, renders full sandbox management UI
components/
  SandboxSidebar.tsx    — left sidebar: list + select + delete sandboxes
  SandboxForm.tsx       — create new sandbox (SSE progress display)
  SandboxResult.tsx     — show sandbox details after creation
  ChatPanel.tsx         — chat with selected sandbox
  CronsPanel.tsx        — manage cron jobs
  ChannelsPanel.tsx     — configure Telegram/Slack channels
__tests__/
  components/           — component tests
  pages/                — page tests
  helpers/              — fixtures + test server
e2e/
  chat.spec.ts          — Playwright e2e
  navigation.spec.ts    — Playwright e2e
```

---

## Components

### `SandboxSidebar`

- Fetches `GET /api/sandboxes` on mount and when `refreshKey` prop changes
- Renders sandbox list: name, truncated ID, creation date, green/yellow status dot (`approved` flag)
- Delete button: `DELETE /api/sandboxes/:id`, removes from local state only after a successful response so failed deletes stay visible in the list
- Calls `onSelect(sandbox)` or `onNew()` callbacks

**API URL:** `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"`

---

### `SandboxForm`

Create new sandbox. Posts to `POST /api/sandboxes/create`, then connects to SSE stream.
Displays progress log lines as they arrive. On `result` event, emits `onCreated(record)`.
Keep terminal SSE state stable when the transport closes after `done` or structured `error`; see [[LEARNING-2026-03-25-sandboxform-sse-terminal-state]].

---

### `SandboxResult`

Shows sandbox details after creation: URL, gateway token, SSH command, status.

---

### `ChatPanel`

Chat interface for a selected sandbox.
- Creates/loads conversations via `POST /api/sandboxes/:id/conversations`
- Sends messages via `POST /api/sandboxes/:id/chat` (with `conversation_id`)
- Appends messages via `POST /api/sandboxes/:id/conversations/:conv_id/messages`
- Loads only the newest transcript window on open and adds an explicit older-history fetch instead of eagerly rendering the full transcript
- Supports streaming responses

### `HistoryPanel`

- Loads the newest paginated conversation page first from `GET /api/sandboxes/:id/conversations`
- Uses an explicit `Load more` affordance to fetch older conversations instead of eagerly loading the whole sandbox history

---

### `CronsPanel`

Manage cron jobs for a sandbox.
- Lists via `GET /api/sandboxes/:id/crons`
- Create, delete, toggle enable/disable, manual run
- Maps to all cron API endpoints

---

### `ChannelsPanel`

Configure Telegram/Slack channels.
- Reads config via `GET /api/sandboxes/:id/channels`
- Updates via `PUT /api/sandboxes/:id/channels/telegram|slack`
- Shows pairing codes and approval button
- Shows connection status probe
- Currently treats any `200` channel-save response as success and clears the entered secret fields, even though the backend channel-manager helper does not yet expose a truthful fail-closed apply contract; see [[LEARNING-2026-03-25-channel-config-false-success]].

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API URL (browser-visible) |

## Browser Security Headers

`next.config.ts` now emits the shared first-pass browser header policy from `lib/security-headers.ts`: CSP, anti-framing, `nosniff`, referrer policy, and a locked-down permissions policy. Because this UI still calls the backend directly from the browser, `connect-src` is intentionally derived from `NEXT_PUBLIC_API_URL` so normal fetch flows and sandbox-create SSE remain allowed without resorting to wildcard origins.

---

## Testing

- **Unit/component tests:** Jest + React Testing Library (`__tests__/`)
- **E2E tests:** Playwright (`e2e/`)
- Test helpers: `fixtures.ts` (mock data), `server.ts` (MSW mock server)

Run tests:
```bash
cd ruh-frontend
npm test            # Jest
npx playwright test # E2E
```

## Related Specs

- [[SPEC-web-security-headers]] — developer UI responses should emit the shared browser-security-header policy without breaking direct backend fetches or sandbox-create SSE
- [[SPEC-conversation-history-pagination]] — developer chat/history now use cursor-paginated reads with explicit load-more behavior

## Related Learnings

- [[LEARNING-2026-03-25-conversation-history-pagination-gap]] — the dev chat history UI still fetches full conversation lists and full transcripts, so larger persisted histories need a bounded load-more contract before page-open cost scales poorly
- [[LEARNING-2026-03-25-sandboxform-sse-terminal-state]] — `SandboxForm` must guard terminal SSE UI state against stale EventSource callback closures
- [[LEARNING-2026-03-25-session-backed-chat-history-replay]] — `ChatPanel` currently replays the full transcript even though conversation-backed chat already forwards a persistent gateway session key
- [[LEARNING-2026-03-25-channel-config-false-success]] — `ChannelsPanel` currently shows a saved/restarted state for any 200 response even though backend channel-save helpers can log failed apply steps without failing the overall response
- [[LEARNING-2026-03-25-web-security-headers-gap]] — captures the original missing-header gap and why this UI's direct browser-to-backend calls require an env-aware `connect-src`
