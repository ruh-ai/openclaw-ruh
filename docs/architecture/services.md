# Services

## ruh-backend

**Path:** `ruh-backend/`
**Runtime:** Bun
**Framework:** Express 4
**Port:** 8000

The REST API. Manages sandbox lifecycle via Daytona, persists state to PostgreSQL, and proxies LLM requests to sandbox gateways.

**Key modules:**
- `src/index.ts` — Entry point, starts Express
- `src/app.ts` — Route registration
- `src/db.ts` — PostgreSQL pool (min 2, max 10 connections)
- `src/store.ts` — Sandbox CRUD
- `src/conversationStore.ts` — Conversation and message persistence
- `src/sandboxManager.ts` — Daytona sandbox creation with SSE streaming
- `src/channelManager.ts` — Telegram/Slack config via CLI
- `src/utils.ts` — HTTP helpers, gateway routing, JSON parsing

**Sandbox creation flow:**
1. POST `/api/sandboxes/create` returns a `stream_id`
2. Client subscribes to SSE at `/api/sandboxes/stream/:stream_id`
3. Backend provisions Daytona container (node:22-bookworm, 2vCPU, 2GB RAM, 10GB disk)
4. Installs `openclaw@latest` via npm inside the container
5. Runs `openclaw onboard` with the configured LLM provider
6. Patches gateway config (LAN bind, CORS, trusted proxies, insecure auth)
7. Starts gateway on port 18789
8. Polls for device pairing approval (5-min timeout)
9. Emits `result` event with sandbox metadata, then `done`

---

## ruh-frontend

**Path:** `ruh-frontend/`
**Runtime:** Node.js
**Framework:** Next.js 16 + React 19 + Tailwind CSS 4
**Port:** 3001

The developer-facing UI. Provides sandbox management, chat interface, cron scheduling, and channel configuration.

**Key components:**
- `SandboxSidebar` — Lists sandboxes, triggers creation
- `SandboxForm` — Creation form with real-time SSE log display
- `ChatPanel` — Multi-conversation chat UI with streaming, model selector
- `CronsPanel` — CRUD interface for cron jobs
- `ChannelsPanel` — Telegram/Slack config and pairing approval

**Testing:**
- Unit/component: Jest + React Testing Library
- E2E: Playwright (`navigation.spec.ts`, `chat.spec.ts`)

---

## agent-builder-ui

**Path:** `agent-builder-ui/`
**Runtime:** Node.js
**Framework:** Next.js 15 + React 19 + Tailwind CSS 4 + shadcn/ui
**Port:** 3000

The agent creation wizard. Guides users through building agents via a bot-assisted conversational interface with step-by-step configuration.

**Key flows:**
- `app/(platform)/agents/` — Agent listing
- `app/(platform)/agents/create/` — Creation wizard
  - `ConfigureStepper` — Multi-step wizard (skills → tools → triggers → review)
  - `StepChooseSkills` — Skill selection
  - `StepConnectTools` — Tool connection
  - `StepSetTriggers` — Webhook, schedule, or event triggers
  - `ReviewAgent` — Final review with visual data flow diagram

**State management:** Zustand
**Forms:** React Hook Form + Zod validation
**Data fetching:** React Query
**UI:** Radix UI primitives via shadcn/ui, dark mode via next-themes
**Notifications:** Sonner toast

---

## nginx

**Path:** `nginx/`
**Image:** nginx:1.27-alpine
**Port:** 80

Reverse proxy. Routes traffic to the correct upstream and handles SSE/WebSocket compatibility.

**Routing:**
- `/api/*` → backend:8000 (buffering OFF for SSE)
- `/health` → backend:8000
- `/docs`, `/openapi.json` → backend:8000
- `/` → frontend:3001 (WebSocket upgrade supported)

**Timeouts:** 180s read/send, 10s connect
**Max body:** 50M

---

## postgres

**Image:** postgres:16-alpine
**Port:** 5432 (internal only)

Stores sandbox metadata, conversations, and messages. Tables are initialized by the backend on startup.

Schema: see [architecture/overview.md](overview.md#database-schema)
