# Ruh Frontend

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[010-deployment|Deployment →]]

---

## Overview

A Next.js 16 web application (port 3001) that is currently in transition from a sandbox-management developer surface into the first customer-org web app. The underlying UI is still the older sandbox/chat shell, but it now boots behind the shared customer-session contract: `/login` is public, non-auth routes are gated by middleware, and runtime calls use cookie-backed auth so customer org admins and members can enter the app with the same backend `appAccess.customer` truth used by the rest of the platform. As of 2026-04-01, its marketplace is no longer browse-only: `/marketplace` remains the live catalog list, `/marketplace/[slug]` renders real agent detail from `/api/marketplace/listings/:slug`, and the detail view resolves legacy install CTA state from `/api/marketplace/my/installs` before calling `POST /api/marketplace/listings/:id/install`. Checkout/use parity and assigned inventory are still tracked in [[SPEC-marketplace-store-parity]].

**Path:** `ruh-frontend/`

---

## App Structure

```
app/
  _components/
    CustomerSessionGate.tsx — hydrates `/api/auth/me` and rejects non-customer sessions
  layout.tsx        — root layout
  login/page.tsx    — customer login page
  marketplace/[slug]/page.tsx — customer-web marketplace detail route
  marketplace/[slug]/MarketplaceDetailClient.tsx — live detail + install client component
  page.tsx          — main page, renders full sandbox management UI
components/
  SandboxSidebar.tsx    — left sidebar: list + select + delete sandboxes
  SandboxForm.tsx       — create new sandbox (SSE progress display)
  SandboxResult.tsx     — show sandbox details after creation
  ChatPanel.tsx         — chat with selected sandbox
  HistoryPanel.tsx      — paginated conversation list + rename/delete
  MissionControlPanel.tsx — overview + crons + channels tabs
  CronsPanel.tsx        — manage cron jobs
  ChannelsPanel.tsx     — configure Telegram/Slack channels
__tests__/
  components/           — component tests
  pages/                — page tests
  helpers/              — fixtures + test server
e2e/
  chat.spec.ts          — Playwright e2e
  navigation.spec.ts    — Playwright e2e
lib/
  auth/app-access.ts    — customer app-access helper
  api/client.ts         — credentialed fetch + SSE helpers
middleware.ts           — route guard that keeps `/login` public and redirects protected routes without auth cookies
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
- Sends messages via `POST /api/sandboxes/:id/chat/ws` (with `conversation_id`)
- Loads only the newest transcript window on open and adds an explicit older-history fetch instead of eagerly rendering the full transcript
- Supports streaming responses, tool/lifecycle status updates, and streamed `persistence_error` reporting when the assistant reply was delivered but could not be saved

### `HistoryPanel`

- Loads the newest paginated conversation page first from `GET /api/sandboxes/:id/conversations`
- Uses an explicit `Load more` affordance to fetch older conversations instead of eagerly loading the whole sandbox history

### `MissionControlPanel`

- `Overview` tab shows explicit sandbox status from `GET /api/sandboxes/:id/status`, quick links, SSH command, and a lightweight conversation count
- `Crons` tab embeds `CronsPanel`
- `Channels` tab embeds `ChannelsPanel`

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

## Auth State

The customer-web gate is now active per [[SPEC-app-access-and-org-marketplace]]. `middleware.ts` keeps `/login` public but redirects every other page to `/login?redirect_url=...` when both auth cookies are missing. After hydration, `CustomerSessionGate.tsx` calls `GET /api/auth/me` with `credentials: "include"`, auto-switches to the first eligible customer membership through `POST /api/auth/switch-org` when a recoverable multi-org session is active on the wrong tenant, and only redirects to `/login` when no eligible customer org exists.

Customer login is local-email/password for now. `app/login/page.tsx` posts to `POST /api/auth/login`, auto-switches through `POST /api/auth/switch-org` when the returned session includes a valid customer membership but started on a developer org, then requires `appAccess.customer` before redirecting back to the requested route. The shell still renders the legacy sandbox-management UI, but it now does so under a real customer-org session instead of a no-auth local surface.

`CustomerSessionGate.tsx` also now renders a lightweight active-organization switcher for multi-customer-org users, so they can move between customer tenants without logging out as long as the browser session is still valid.

`lib/api/client.ts` is the browser transport seam for this slice:
- `apiFetch()` always sends `credentials: "include"` to the backend
- `createAuthenticatedEventSource()` always opens SSE with `withCredentials: true`

That helper is used by the sandbox sidebar, chat, history, mission control, cron, channel, marketplace catalog/detail/install flows, and sandbox-create flows so the web app no longer logs in successfully and then drops auth on every cross-origin backend request.

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
- [[SPEC-app-access-and-org-marketplace]] — turns ruh-frontend into a fail-closed customer-org surface and later extends it toward marketplace purchase, entitlement, and assignment parity with `ruh_app`
- [[SPEC-marketplace-store-parity]] — defines the next customer-web marketplace slice: detail routes, CTA states, checkout/use flow, and parity with `ruh_app`

## Related Learnings

- [[LEARNING-2026-03-28-repo-testability-audit]] — the developer UI still embeds fetch, SSE, pairing, and save/restart side effects directly inside large client components, which pushes tests toward UI-heavy harnesses
- [[LEARNING-2026-03-25-conversation-history-pagination-gap]] — captured the earlier dev-chat full-history read gap before cursor pagination plus load-more behavior shipped
- [[LEARNING-2026-03-25-sandboxform-sse-terminal-state]] — `SandboxForm` must guard terminal SSE UI state against stale EventSource callback closures
- [[LEARNING-2026-03-25-session-backed-chat-history-replay]] — `ChatPanel` still replays persisted transcript windows in addition to gateway session-key continuity, which is the current tradeoff behind refresh-safe history
- [[LEARNING-2026-03-25-channel-config-false-success]] — `ChannelsPanel` currently shows a saved/restarted state for any 200 response even though backend channel-save helpers can log failed apply steps without failing the overall response
- [[LEARNING-2026-03-25-web-security-headers-gap]] — captures the original missing-header gap and why this UI's direct browser-to-backend calls require an env-aware `connect-src`
