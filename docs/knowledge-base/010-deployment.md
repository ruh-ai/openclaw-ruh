# Deployment

[[000-INDEX|← Index]] | [[009-ruh-frontend|Ruh Frontend]] | [[011-key-flows|Key Flows →]] | [[012-automation-architecture]]

---

## Local Development

### Prerequisites
- Bun ≥ 1.0
- Node.js ≥ 18
- Docker (for sandboxes)
- PostgreSQL (local or Docker)

### Quick Start

```bash
# 1. Start PostgreSQL (if not running)
docker run -d --name pg \
  -e POSTGRES_USER=openclaw \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=openclaw \
  -p 5432:5432 \
  postgres:16-alpine

# 2. Configure backend
cp ruh-backend/.env.example ruh-backend/.env
# Edit ruh-backend/.env: set DATABASE_URL and either shared auth paths or at least one LLM key

# 3. Run all services
./start.sh
```

Services:
- Backend: http://localhost:8000
- ruh-frontend: http://localhost:3001
- agent-builder-ui: http://localhost:3000

### Run Backend Only

```bash
cd ruh-backend
bun install
bun run dev     # hot-reload
bun run start   # production
```

Runtime checks:
- `GET /health` is the liveness endpoint.
- `GET /ready` is the readiness endpoint and stays non-200 until startup has completed DB initialization.

---

## Environment Variables

### Backend (`ruh-backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL DSN e.g. `postgresql://openclaw:changeme@localhost:5432/openclaw` |
| `PORT` | No | Server port (default: 8000) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins (default: `http://localhost:3000`) |
| `OPENCLAW_ADMIN_TOKEN` | No for local dev, Yes for admin retrofit route | Bearer token required by `POST /api/admin/sandboxes/:sandbox_id/retrofit-shared-codex` and the rollout script |
| `OPENCLAW_SHARED_OAUTH_JSON_PATH` | No | Optional host path to shared OpenClaw OAuth state copied into new sandboxes; defaults to `$HOME/.openclaw/credentials/oauth.json` |
| `CODEX_AUTH_JSON_PATH` | No | Optional fallback host path to shared Codex CLI auth; defaults to `$HOME/.codex/auth.json` |
| `OPENCLAW_SHARED_CODEX_MODEL` | No | Default model applied when shared auth is used (default: `openai-codex/gpt-5.4`) |
| `ANTHROPIC_API_KEY` | Required if shared auth absent | Anthropic LLM key |
| `OPENAI_API_KEY` | Required if shared auth absent | OpenAI LLM key |
| `OPENROUTER_API_KEY` | Required if shared auth absent | OpenRouter key (highest priority) |
| `GEMINI_API_KEY` | Required if shared auth absent | Gemini key |
| `OLLAMA_BASE_URL` | No | Ollama base URL (default: `http://host.docker.internal:11434/v1`) |
| `OLLAMA_MODEL` | No | Ollama model ID (default: `qwen3-coder:30b`) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token |
| `DISCORD_BOT_TOKEN` | No | Discord bot token |

When either shared-auth file exists, new sandboxes prefer that bootstrap path over API-key onboarding. The backend first looks for OpenClaw OAuth state, then Codex CLI auth, and only falls back to API keys or Ollama if neither file is available.

### Retrofitting Running Targets To Shared Codex

Once `OPENCLAW_ADMIN_TOKEN` is configured and the backend is running, operators can retrofit DB-tracked sandboxes and the standalone builder gateway sequentially:

```bash
cd ruh-backend
bun run retrofit:shared-codex
```

The script:
- reads DB-tracked sandboxes from PostgreSQL
- calls the admin retrofit route for each sandbox
- reports unmanaged `openclaw-*` containers without changing them
- recreates the standalone builder gateway compose service and runs the same shared-Codex helper against `openclaw-openclaw-gateway-1`
- verifies both the global default model and the named `architect` agent resolve to the shared Codex model before reporting the builder gateway healthy

The standalone builder gateway also needs host `~/.codex` mounted read-only into `/home/node/.codex` in `/Users/prasanjitdey/Research/Openclaw/docker-compose.yml`.

### Agent Builder UI (`agent-builder-ui/.env`)

| Variable | Required | Description |
|---|---|---|
| `OPENCLAW_GATEWAY_URL` | Yes | WebSocket URL of architect agent gateway e.g. `ws://localhost:18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Yes | Bearer token from sandbox record; still required even if that gateway uses shared Codex/OpenClaw OAuth internally |
| `OPENCLAW_GATEWAY_ORIGIN` | No | Origin header (default: `https://clawagentbuilder.ruh.ai`) |
| `OPENCLAW_TIMEOUT_MS` | No | WS timeout per attempt (default: 180000) |

### Frontend (`ruh-frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | Backend URL visible to browser (default: `http://localhost:8000`) |

## Browser Security Header Deployment

The first-pass browser header policy now ships from the two Next.js apps rather than the checked-in nginx layer:

- `agent-builder-ui/next.config.ts` and `ruh-frontend/next.config.ts` emit CSP, anti-framing, `nosniff`, referrer, and permissions headers for all app routes.
- The checked-in `nginx/nginx.conf` remains the plain-HTTP local repo proxy, so it intentionally does not add HSTS.
- If a deployed ingress or nginx tier is the real HTTPS terminator, that environment may add `Strict-Transport-Security`, but it should not overwrite the app-owned CSP by default.

---

## Docker Compose (Production)

```bash
cp .env.example .env
# Edit .env — set DB credentials, ALLOWED_ORIGINS, and either shared auth paths or at least one LLM key

docker compose up -d
```

**Service startup order:** postgres (healthy) → backend (healthy) → frontend → nginx

Current backend contract:
- The backend process now fails startup if required DB initialization cannot complete.
- Probe rewiring to use `/ready` instead of `/health` is still a follow-up task; do not assume the checked-in Compose/Kubernetes manifests are aligned yet.

**Ports exposed:** Only port 80 (nginx). Internal services communicate on `internal` bridge network.

**Services:**

| Service | Image | Notes |
|---|---|---|
| `postgres` | `postgres:16-alpine` | Persistent volume `postgres_data` |
| `backend` | `./ruh-backend/Dockerfile` | Waits for postgres healthcheck |
| `frontend` | `./ruh-frontend/Dockerfile` | Waits for backend healthcheck |
| `nginx` | `./nginx/Dockerfile` | Port 80 exposed |

**Useful commands:**
```bash
docker compose logs -f backend      # tail backend logs
docker compose restart backend      # restart single service
docker compose down                 # stop everything
docker compose down -v              # stop + delete DB volume
```

---

## Kubernetes

Config lives in `k8s/`. Namespace: `openclaw`.

```
k8s/
  namespace.yaml
  ingress.yaml
  backend/
    deployment.yaml
    service.yaml
    configmap.yaml
    secret.yaml
  frontend/
    deployment.yaml
    service.yaml
  postgres/
    statefulset.yaml
    service.yaml
    secret.yaml
    pvc.yaml          — PersistentVolumeClaim for DB data
```

Apply:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/ingress.yaml
```

---

## CI/CD

Located in `.github/workflows/`:
- `ci.yml` — runs on PR / push
- `cd.yml` — deployment pipeline

---

## Repo Automations

Operational Codex automations used by maintainers are documented separately in [[012-automation-architecture]]. They are distinct from app runtime services:

- Automation config lives under `$CODEX_HOME/automations/<automation_id>/automation.toml`
- Per-automation working memory lives under `$CODEX_HOME/automations/<automation_id>/memory.md`
- Repo-visible run artifacts live in `docs/journal/` and `docs/knowledge-base/learnings/`
- Automation runs should read the KB + `TODOS.md`, make a bounded repo update, append a dated journal entry, write a learning note when the run produces durable knowledge, and emit an inbox item summary

---

## Related Learnings

- [[LEARNING-2026-03-25-sse-heartbeat-idle-timeout-gap]] — long-running SSE routes currently have no heartbeat contract, so proxy idle timeouts in the checked-in nginx config can sever healthy sandbox-create or architect streams
- [[LEARNING-2026-03-25-web-security-headers-gap]] — captures the original missing-header gap and the rollout rule that HSTS belongs only on the actual HTTPS terminator
- [[LEARNING-2026-03-25-docker-daemon-readiness-gap]] — backend startup/readiness currently do not prove the Docker daemon is reachable even though Docker is a runtime prerequisite for core control-plane work
- [[LEARNING-2026-03-25-sandbox-runtime-resource-containment-gap]] — sandbox runtime deployment currently has no documented CPU, memory, PID, or baseline Docker hardening profile for admitted containers
- [[LEARNING-2026-03-25-sandbox-openclaw-version-drift]] — sandbox creation currently depends on `openclaw@latest`, so runtime behavior can drift across create dates without an explicit operator-controlled upgrade step

---

## Related Specs

- [[SPEC-shared-codex-oauth-bootstrap]] — documents shared OpenClaw/Codex auth seeding for new sandboxes and clarifies that builder gateway bearer auth is unchanged
- [[SPEC-shared-codex-retrofit]] — documents the admin retrofit route, rollout script, builder compose mount, and UI lock-in for running shared-Codex sandboxes
- [[SPEC-web-security-headers]] — defines which security headers belong in the Next.js apps versus the HTTPS edge and documents the first-pass CSP tradeoffs
- [[SPEC-agent-learning-and-journal]] — defines the repo-visible journal and durable-learning artifacts used by maintainer automations
- [[SPEC-test-coverage-automation]] — documents the recurring automation that can add validated tests directly to the repo
- [[SPEC-graceful-shutdown]] — defines the backend shutdown grace-period contract that Docker Compose and Kubernetes stop windows must accommodate
