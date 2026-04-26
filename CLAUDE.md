# openclaw-ruh — CLAUDE.md

> **Repo:** https://github.com/ruh-ai/openclaw-ruh
> **Prerequisites:** Docker, Bun >= 1.3, Node.js >= 20, at least one LLM API key
>
> **Quick start:**
> ```bash
> docker run -d --name pg -e POSTGRES_USER=openclaw -e POSTGRES_PASSWORD=changeme -e POSTGRES_DB=openclaw -p 5432:5432 postgres:16-alpine
> cp ruh-backend/.env.example ruh-backend/.env  # add your LLM key
> ./start.sh                                     # starts backend:8000, builder:3000, client:3001
> ```

---

## How to Work on This Codebase

### Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### Surgical Changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Every changed line should trace directly to the request.

### Goal-Driven Execution

Define success criteria. Loop until verified.

- "Add validation" → write tests for invalid inputs, then make them pass
- "Fix the bug" → write a test that reproduces it, then make it pass
- "Refactor X" → ensure tests pass before and after

For multi-step tasks, state a brief plan with verification checks:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Source of Truth — What to Edit for What

| If you want to change... | Edit this file |
|---|---|
| Agent creation flow / architect behavior | `docs/plans/agent-creation-architecture-v2.md` |
| Backend API routes | `ruh-backend/src/app.ts` |
| Sandbox creation / Docker orchestration | `ruh-backend/src/services/sandboxManager.ts` |
| Builder ↔ OpenClaw bridge | `agent-builder-ui/app/api/openclaw/route.ts` |
| Brand colors, typography, design system | `DESIGN.md` |
| Database schema | `ruh-backend/src/db/` + update KB `005-data-models.md` |
| Production deployment | `deploy/deploy.sh` + `deploy/docker-compose.prod.yml` |
| Nginx routing / SSL | `nginx/nginx.conf` + `deploy/nginx-ssl.conf` |
| LLM provider config | `ruh-backend/src/services/sandboxManager.ts` (`createOpenclawSandbox`) |
| Environment variables | `.env.example` (source of truth for all env vars) |
| Project priorities / focus | `docs/project-focus.md` |
| This file (agent instructions) | `CLAUDE.md` |

---

## What Is This Project?

**openclaw-ruh-enterprise** is the core platform for [Ruh.ai](https://ruh.ai) — where enterprises create **digital employees with a soul**.

AI assistants with personality, context, and judgment that feel like real teammates. They grow with you.

### Product Shape

- **Agent Builder** (`agent-builder-ui`) — create and shape your assistant's soul: personality, skills, tools, triggers, memory. This is the primary focus right now.
- **Client Application** (`ruh-frontend`) — where end users work with deployed assistants daily.
- **Backend** (`ruh-backend`) — sandbox orchestration, agent lifecycle, persistence, deployment. Each sandbox is a Docker container running the `openclaw` CLI gateway.

### Proving Case: Google Ads Agent

The **Google Ads agent** is the first assistant being built on the platform. Every feature is validated against this agent. See `docs/project-focus.md` for current priorities.

### Agent Creation Architecture (v2)

**The container IS the agent from day one.**

1. Name + description submitted → new Docker container spins up immediately
2. The **Architect** (OpenClaw agent) runs inside that container and guides creation through conversation
3. Architect writes the workspace: `SOUL.md`, `skills/`, `tools/`, `triggers/`, `.openclaw/`
4. **Test** → container switches from Architect → Agent mode (no new container)
5. **Ship** → workspace pushed to GitHub via OAuth

Do not implement any feature that routes builder chat to a shared container — every agent gets its own.

**Full spec:** `docs/plans/agent-creation-architecture-v2.md`

**Meta-skill for authoring agents:** `.claude/skills/agent-builder/SKILL.md` (`/agent-builder`). This is the canonical playbook for the 7-stage pipeline — PRD/TRD structure, `architecture.json` shape, SKILL.md authoring patterns adapted from Claude Code (progressive disclosure, description-first matching, tight tool scopes), and the common failure modes we've hit in production. The same file is seeded into every sandbox at bootstrap via `sandboxManager.ts` (mirror at `ruh-backend/skills/agent-builder/SKILL.md`) so the Architect reads it at runtime. **Use it when building new agents, improving the Architect itself, or reviewing an architecture.json / SKILL.md.**

### Brand & Design

**Reference `DESIGN.md` before any UI changes.** It defines colors (primary `#ae00d0`, secondary `#7b5aff`), typography (Satoshi, Sora, Jost), and the "Alive Additions" — subtle animations that make agent creation feel like bringing a colleague to life.

---

## Service Map

| Service | Path | Port | Stack |
|---|---|---|---|
| `ruh-backend` | `ruh-backend/` | 8000 | Bun + Express + PostgreSQL |
| `agent-builder-ui` | `agent-builder-ui/` | 3000 | Next.js 15 (Yarn) |
| `ruh-frontend` | `ruh-frontend/` | 3001 | Next.js 16 (npm) |
| `admin-ui` | `admin-ui/` | 3002 | Next.js 15 |
| `ruh_app` | `ruh_app/` | 3003 | Flutter (mobile/desktop) |
| `@ruh/marketplace-ui` | `packages/marketplace-ui/` | — | Shared React components |
| `postgres` | docker | 5432 | PostgreSQL 16 |
| `nginx` | `nginx/` | 80/443 | Reverse proxy (prod only) |

---

## Local Development

```bash
# 1. Start PostgreSQL
docker run -d --name pg \
  -e POSTGRES_USER=openclaw \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=openclaw \
  -p 5432:5432 postgres:16-alpine

# 2. Configure env
cp ruh-backend/.env.example ruh-backend/.env
# Edit .env — add at least one LLM key (OPENROUTER_API_KEY, OPENAI_API_KEY, etc.)

# 3. Start all services
./start.sh
# → backend:8000, builder:3000, frontend:3001
```

`start.sh` runs all three services with hot-reload:
- Backend: `bun run --watch src/index.ts`
- Builder: `yarn dev`
- Frontend: `npm run dev`

Backend only: `cd ruh-backend && bun run dev`

### Environment Variables

**Backend (`ruh-backend/.env`):**
- `DATABASE_URL` — required (e.g. `postgresql://openclaw:changeme@localhost:5432/openclaw`)
- `PORT` — default 8000
- `ALLOWED_ORIGINS` — default `http://localhost:3000,http://localhost:3001,http://localhost:3002`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — JWT signing secrets
- `AGENT_CREDENTIALS_KEY` — 64 hex chars for credential encryption
- `SANDBOX_IMAGE` — default `ruh-sandbox:latest`
- LLM keys (at least one): `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- Optional: `OLLAMA_BASE_URL`, `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`

**Agent Builder (`agent-builder-ui/.env`):**
- `NEXT_PUBLIC_API_URL` — default `http://localhost:8000`
- `OPENCLAW_GATEWAY_URL` — WebSocket URL of architect agent gateway
- `OPENCLAW_GATEWAY_TOKEN` — Bearer token from sandbox record
- `OPENCLAW_TIMEOUT_MS` — default 180000ms

**Frontend (`ruh-frontend/.env`):**
- `NEXT_PUBLIC_API_URL` — default `http://localhost:8000`

---

## Production (GCP)

The app runs on a **GCE VM (Ubuntu 24.04)** at `/opt/ruh`, deployed via Docker Compose behind nginx with SSL.

### Domain: `codezero2pi.com`

| Subdomain | Service | Internal Port |
|---|---|---|
| `builder.codezero2pi.com` | agent-builder-ui | 3000 |
| `app.codezero2pi.com` | ruh-frontend | 3001 |
| `admin.codezero2pi.com` | admin-ui | 3002 |
| `api.codezero2pi.com` | ruh-backend | 8000 |

### Architecture

- All services run as Docker containers via `deploy/docker-compose.prod.yml`
- Nginx handles SSL termination (Let's Encrypt via certbot, auto-renews every 12h)
- PostgreSQL data persisted in a Docker volume
- Backend runs as `root` to access Docker socket (manages sandbox containers)
- Sandbox containers use `172.17.0.1` (Docker host IP) instead of `localhost`

### Deploy Flow

Triggered by GitHub Actions CD after tests pass. Runs `deploy/deploy.sh`:

1. `git fetch origin dev && git reset --hard origin/dev`
2. Apply deployment patches (lockfile fixes, Docker-in-Docker, bridge-auth proxy headers)
3. `docker compose build --parallel`
4. Rebuild sandbox image if `Dockerfile.sandbox` changed
5. `docker compose up -d`
6. Fix sandbox URLs in DB (`localhost` → `172.17.0.1`)
7. Health check against `https://api.codezero2pi.com/health`

### Known Deployment Patches

These are applied at deploy time and should eventually be fixed in the codebase:

- `--frozen-lockfile` → `bun install` (lockfiles may be stale)
- `npm ci` → `npm install` (same reason)
- Docker CLI installed into backend image at build time
- `bridge-auth.ts` patched to use `X-Forwarded-Host` behind reverse proxy
- `architect-sandbox/route.ts` patched: `localhost` → `172.17.0.1`
- `next.config.ts`: `ignoreBuildErrors: true` for builder

### First-Time Server Setup

```bash
# On fresh Ubuntu 24.04 VM:
bash deploy/gcp-setup.sh
# → installs Docker, clones repo, generates secrets, builds sandbox image
# → then: edit /opt/ruh/.env with LLM keys, run docker compose up -d

# SSL setup:
bash deploy/init-ssl.sh
```

### Server Management

**Full reference:** `.claude/skills/gcp-server/SKILL.md` — covers all operations, thresholds, and safety rules.

**GCP Project:** `ruhai-469019` | **Zone:** `us-central1-a` | **VM:** `ruh-demo` (e2-standard-4, 34.31.176.40)

Access the server via `gcloud compute ssh` — no manual SSH config needed:

```bash
# Quick health check
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="uptime && free -h && df -h / && sudo docker ps --format 'table {{.Names}}\t{{.Status}}'"

# Service logs (replace 'backend' with any service name)
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="cd /opt/ruh && sudo docker compose -f deploy/docker-compose.prod.yml logs --tail=100 backend"

# Restart a service
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="cd /opt/ruh && sudo docker compose -f deploy/docker-compose.prod.yml restart backend"

# Full redeploy (confirm with user first)
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="cd /opt/ruh && bash deploy/deploy.sh"

# Check sandbox containers
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="sudo docker ps --filter 'name=openclaw-'"
```

---

## Critical Design Decisions

1. **Sandbox = Docker container.** Each sandbox is `node:22-bookworm` with `openclaw` installed. Backend interacts via `docker exec`, not network API.

2. **SSE for sandbox creation.** `POST /api/sandboxes/create` returns a `stream_id`. Progress via `GET /api/sandboxes/stream/:stream_id` (Server-Sent Events). Takes ~2–5 min.

3. **Two separate frontends.** `agent-builder-ui` creates agents (WebSocket bridge to OpenClaw architect). `ruh-frontend` is where end users work with deployed agents (REST).

4. **OpenClaw architect agent.** `agent-builder-ui` has no LLM logic. It routes messages to an OpenClaw agent in a sandbox via `agent-builder-ui/app/api/openclaw/route.ts`.

5. **LLM provider priority:** OpenRouter → OpenAI → Anthropic → Gemini → Ollama. Set in `sandboxManager.ts:createOpenclawSandbox()`.

6. **Session keys.** `openclaw_session_key = "agent:main:<conv_uuid>"`. Forwarded as `x-openclaw-session-key` header.

7. **Message persistence is frontend responsibility.** Backend does NOT auto-persist messages. Frontend must call `POST .../messages` after each exchange.

8. **Auth uses custom JWT.** Bcrypt (12 rounds), 15-min access tokens, refresh UUIDs rotated on each use, httpOnly cookies. Three roles: admin, developer, end_user. **Auth is currently disabled** in `agent-builder-ui/middleware.ts`.

9. **Marketplace is a shared package.** `@ruh/marketplace-ui` consumed by builder (publish), frontend (browse), admin (moderate).

---

## Backend: Adding a New Endpoint

1. Add route handler in `app.ts` using `asyncHandler(async (req, res) => { ... })`
2. Use `getRecord(sandbox_id)` to validate sandbox exists (throws 404)
3. Use `sandboxExec(sandbox_id, cmd, timeoutSec)` for container commands
4. Use `parseJsonOutput(output)` for JSON from CLI commands
5. Throw `httpError(status, message)` for expected errors
6. Add tests in `ruh-backend/tests/`

Routes that modify data: use `requireAuth`. Admin-only: `requireRole('admin')`. Public reads: `optionalAuth`.

### Gateway URL Resolution

`utils.ts:gatewayUrlAndHeaders()` resolves in order:
1. `signed_url` (no extra auth)
2. `standard_url`
3. `dashboard_url` (fallback)

---

## Testing

Full strategy in `TESTING.md`.

```bash
npm run test:all          # Unit + contract tests
npm run test:integration  # Against real Postgres
npm run typecheck:all     # TypeScript check all services
```

| Service | Unit Tests | E2E | Coverage Threshold |
|---------|-----------|-----|--------------------|
| `ruh-backend` | `bun test tests/unit/` | `bun test tests/e2e/` | 75% |
| `agent-builder-ui` | `bun test lib/ hooks/ app/` | `npx playwright test` | 60% |
| `ruh-frontend` | `npx jest` | `npx playwright test` | 60% |
| `admin-ui` | `bun test` | `npx playwright test` | 50% |
| `marketplace-ui` | `bun test` | — | 80% |

Test runners: bun:test (backend, builder, admin, marketplace), Jest+MSW (frontend), Playwright (E2E).

Pre-commit hooks (Husky): typecheck on commit, unit tests on push.

---

## Common Debugging

| Problem | Check |
|---|---|
| Gateway unreachable | `docker ps` — is container running? `docker exec openclaw-<id> openclaw gateway status` |
| Chat returns 503 | `standard_url` / `gateway_port` in DB correct? |
| SSE stream hangs | `/tmp/openclaw-gateway.log` inside container |
| Agent builder no response | `OPENCLAW_GATEWAY_URL` + `OPENCLAW_GATEWAY_TOKEN` env vars |
| Sandbox creation fails | Check backend logs, Docker socket permissions, disk space |
| Prod 502 errors | `docker compose logs nginx`, check if upstream service is healthy |
| Sandbox URLs wrong (prod) | Run the URL fix SQL from `deploy.sh` (`localhost` → `172.17.0.1`) |

---

## Logs & Telemetry (Local Dev)

**Full reference:** `.claude/skills/openclaw-logs/SKILL.md` — triage decision tree, canonical commands, safety rules. Use `/openclaw-logs` to invoke.

You have direct access to every log source in this stack — don't ask the user to paste logs, go read them. Start with the cheapest source that answers the question; escalate to richer tools only when structured fields are needed.

### Quick reference — log sources

| Source | Location | Access | What's in it |
|---|---|---|---|
| **Backend (ruh-backend)** | `/tmp/backend.log` (host) | `tail -N /tmp/backend.log` | HTTP requests, gateway-proxy lines (`[gateway-proxy] Upgrade request: …`, `Auth OK: …`, `Connected to sandbox …`), SSE stream events, errors. Written because `./start.sh` redirects bun stdout here. Verify with `lsof -p <bun-pid>` if location changes. |
| **Agent Builder (Next.js)** | stderr of `next dev -p 3000` | `ps aux \| grep "next dev"` → check if redirected; otherwise attach to process output or wait for next request to see compile/route logs | API route compile errors, `console.warn` from `/api/openclaw/route.ts`, Langfuse trace spans |
| **Sandbox gateway (per container)** | `/tmp/openclaw-gateway.log` (inside container) | `docker exec openclaw-<id> tail -N /tmp/openclaw-gateway.log` | WS connect/disconnect (`[ws] webchat connected conn=… client=… reason=…`), `[tools]` failures, `[agent/embedded] embedded run agent end`, `[agents/auth-profiles]` events |
| **OpenClaw subsystem (structured JSON)** | `/tmp/openclaw/openclaw-YYYY-MM-DD.log` (inside container) | `docker exec openclaw-<id> tail -N /tmp/openclaw/openclaw-$(date -u +%Y-%m-%d).log` | Pino-style JSON per event: `_meta.name` = subsystem, `1.event` = event name, `_meta.logLevelName` = level. Use when the human-readable gateway log isn't enough and you need tool arguments, run IDs, error hashes, etc. |
| **Postgres** | container `pg` | `docker exec pg psql -U openclaw -d openclaw -c "…"` | Sandbox records (`sandboxes`), agents (`agents`), conversations, messages, `system_events` audit ledger |
| **OpenClaw config** | `/root/.openclaw/openclaw.json` (inside container) | `docker exec openclaw-<id> cat /root/.openclaw/openclaw.json` | Gateway port, auth token, allowed origins, default model, agent paths, OTEL endpoint |

### Useful queries

```bash
# Tail backend gateway-proxy activity (drop the -f to just snapshot)
tail -f /tmp/backend.log | grep --line-buffered -E "gateway-proxy|ws/gateway|openclaw.bridge|Gateway"

# Sandbox gateway log — last N lines from a specific container
docker exec openclaw-<id> tail -60 /tmp/openclaw-gateway.log

# OpenClaw structured log — all events in a time window for one agent/run
docker exec openclaw-<id> bash -c "grep '\"2026-04-16T21:3' /tmp/openclaw/openclaw-2026-04-16.log" | python3 -m json.tool

# What sandboxes are running + DB token
docker ps --filter 'name=openclaw-' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker exec pg psql -U openclaw -d openclaw -c "select sandbox_id, sandbox_name, gateway_port, approved from sandboxes order by created_at desc limit 10;"

# Probe the WS handshake against a live gateway (bypasses the backend proxy — useful to isolate where a bug is)
# See the investigation in docs/knowledge-base — the shape of CONNECT_REQUEST is in ruh-backend/src/gatewayProxy.ts
```

### Richer telemetry (when raw logs aren't enough)

Each of these is *emitting* telemetry already; whether it's captured depends on local setup:

| System | Emitted by | Where to read | When to use |
|---|---|---|---|
| **OTEL traces** | Sandbox gateway → `http://host.docker.internal:4318/v1/traces` (configured in each sandbox's `openclaw.json` under `diagnostics.otel`) | Wherever your OTEL collector forwards (Jaeger, Tempo, Langfuse's OTLP ingestor, file exporter). If no collector is wired, traces are dropped. Check `docker ps \| grep -i otel` | Gateway-side latency, tool execution spans, LLM call spans |
| **Langfuse** | `ruh-backend` + `agent-builder-ui` via `withLangfuseBridgeTrace(…)` wrapping every architect turn | `langfuse-web` container — expose port and open the UI. Each turn appears as a trace with tool calls, token usage, generation latency, errors, and full message history | Best single-pane-of-glass view of an architect turn. Use before grepping logs when debugging "why did the agent respond like that" |
| **GlitchTip** (Sentry-compatible) | Container `deploy-glitchtip-postgres-1` is running | GlitchTip web UI — check `docker ps \| grep glitchtip` for the web container + port | Uncaught exceptions, unhandled promise rejections. Not all services are instrumented yet — check before relying on this |

### When to reach for each

- **First check `/tmp/backend.log`** when a browser request looks stuck or errors. Covers 80% of backend-side issues.
- **Then `docker exec … tail … /tmp/openclaw-gateway.log`** when the backend reached the sandbox but the agent didn't respond. Shows tool failures, WS lifecycle, LLM provider errors.
- **Fall back to `/tmp/openclaw/openclaw-YYYY-MM-DD.log`** when the human-readable gateway log doesn't have enough detail (e.g., need the full tool call args, the runId to trace, the error hash to group).
- **Postgres** to understand the *stored* state vs what the gateway thinks is running (drift is real — see `SPEC-sandbox-runtime-reconciliation`).
- **Langfuse** when the user says "the agent said something weird" — replay the turn in the UI instead of reconstructing from logs.
- **Browser devtools** via `mcp__Claude_in_Chrome__read_console_messages` / `read_network_requests` when the problem is on the client side (cookies not sent, fetch failing, React state wedged).

### Production logs (GCP VM)

For prod (`ruh-demo` VM), none of the local paths apply. Use `gcloud compute ssh` + `docker compose logs` — see **Production (GCP) → Server Management** above. The `.claude/skills/gcp-server/SKILL.md` has the full command reference and safety rules.

---

## Knowledge Base

The project has an Obsidian-style knowledge base that maps all services, APIs, data models, and flows. **This is how you understand the project** — read it before working, update it when you change things.

- Location: `docs/knowledge-base/`
- Entry point: `docs/knowledge-base/000-INDEX.md` — start here
- Feature specs: `docs/knowledge-base/specs/`
- Format: Markdown with `[[wikilinks]]` connecting related notes

### When to read

Before starting any task, check the relevant KB note. The index has a quick-nav table mapping tasks to notes:

| Task | Note |
|---|---|
| Full system architecture | `001-architecture.md` |
| Backend API endpoints | `004-api-reference.md` |
| Sandbox lifecycle | `003-sandbox-lifecycle.md` |
| Database schema | `005-data-models.md` |
| Agent builder UI | `008-agent-builder-ui.md` |
| Agent creation lifecycle | `specs/SPEC-agent-creation-lifecycle.md` |
| Ruh frontend | `009-ruh-frontend.md` |
| Auth system | `014-auth-system.md` |
| Deployment | `010-deployment.md` |
| Key user flows | `011-key-flows.md` |

### When to update

**Every PR to `dev` should include KB updates if the change affects documented behavior.** This keeps documentation accurate without a separate "docs sprint." Specifically:

- **New endpoint or API change** → update `004-api-reference.md`
- **New feature** → create `specs/SPEC-<name>.md` with `[[wikilinks]]` to related notes
- **Schema change** → update `005-data-models.md`
- **New service or major architectural change** → update `001-architecture.md`
- **Changed sandbox behavior** → update `003-sandbox-lifecycle.md`
- **Changed user flow** → update `011-key-flows.md`

If you're unsure whether a change warrants a KB update, it probably does. A one-line addition is better than stale docs.

---

## Key Rules

- **Read the KB before working.** `docs/knowledge-base/000-INDEX.md` is the entry point. Don't guess at architecture — it's documented.
- **Update the KB with every PR to `dev`.** Documentation stays accurate because it ships with the code, not after.
- **Read the logs directly.** You have `tail` on `/tmp/backend.log` and `docker exec` into every sandbox (`/tmp/openclaw-gateway.log`, `/tmp/openclaw/openclaw-YYYY-MM-DD.log`) and `psql` into the `pg` container. Don't ask the user to paste logs — go read them. Full reference in **Logs & Telemetry (Local Dev)** above.
- **Use `/agent-builder` when authoring or reviewing agents.** `.claude/skills/agent-builder/SKILL.md` encodes the 7-stage pipeline, the strict shapes `skill_graph`/`workflow`/`discovery_documents` expect, the SKILL.md authoring format, and the failure modes we've already debugged. The same file is seeded into every sandbox so the Architect follows the same rules at runtime.
- **Every agent gets its own container.** Never route builder chat to a shared sandbox.
- **Check `DESIGN.md` before any UI change.** Brand, colors, typography, and alive animations are defined there.
- **Check `docs/project-focus.md` for current priorities.** The Google Ads agent is the proving case — all features validate against it.
- **`.env.example` is the single source of truth for environment variables.** Keep it complete and accurate.
- **Match existing style.** Even if you'd do it differently. Consistency beats preference.
- **Every changed line should trace to the request.** No drive-by refactoring, no speculative improvements.
