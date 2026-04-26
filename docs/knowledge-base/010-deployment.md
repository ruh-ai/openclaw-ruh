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
- `GET /ready` is the readiness endpoint and stays non-200 until startup has completed DB initialization and any pending schema migrations.

---

## Environment Variables

### Backend (`ruh-backend/.env`)

`ruh-backend/src/config.ts` is now the canonical env contract. Startup aggregates malformed config into one error before opening a port.

| Variable | Classification | Default | Validation |
|---|---|---|---|
| `DATABASE_URL` | Required | None | Non-empty PostgreSQL DSN string |
| `PORT` | Optional with default | `8000` | Integer from `1` to `65535` |
| `ALLOWED_ORIGINS` | Optional with default | `http://localhost:3000` | Comma-separated absolute `http`/`https` origins |
| `OPENCLAW_ADMIN_TOKEN` | Optional nullable | None | Trimmed non-empty string when set |
| `OPENCLAW_SHARED_OAUTH_JSON_PATH` | Optional with default | `$HOME/.openclaw/credentials/oauth.json` | Absolute host path string |
| `CODEX_AUTH_JSON_PATH` | Optional with default | `$HOME/.codex/auth.json` | Absolute host path string |
| `OPENCLAW_SHARED_CODEX_MODEL` | Optional with default | `openai-codex/gpt-5.5` | Trimmed non-empty string |
| `OPENROUTER_API_KEY` | Optional nullable | None | Trimmed non-empty string when set |
| `OPENAI_API_KEY` | Optional nullable | None | Trimmed non-empty string when set |
| `ANTHROPIC_API_KEY` | Optional nullable | None | Trimmed non-empty string when set |
| `GEMINI_API_KEY` | Optional nullable | None | Trimmed non-empty string when set |
| `OLLAMA_BASE_URL` | Optional with default | `http://host.docker.internal:11434/v1` | Absolute `http`/`https` URL |
| `OLLAMA_MODEL` | Optional with default | `qwen3-coder:30b` | Trimmed non-empty string |
| `TELEGRAM_BOT_TOKEN` | Optional nullable | None | Trimmed non-empty string when set |
| `DISCORD_BOT_TOKEN` | Optional nullable | None | Trimmed non-empty string when set |
| `AGENT_CREDENTIALS_KEY` | Optional nullable | None | Exactly 64 hex characters when set |

When either shared-auth file exists, new sandboxes prefer that bootstrap path over API-key onboarding. The backend first looks for OpenClaw OAuth state, then Codex CLI auth, and only falls back to API keys or Ollama if neither file is available.

Startup validation behavior:
- Missing or malformed required config aborts startup before the backend listens.
- Validation errors are aggregated so operators can fix multiple bad vars in one pass.
- Non-startup modules such as sandbox bootstrap helpers still read optional config through the same module, but they do not force unrelated required vars during isolated test runs.

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
| `LANGFUSE_PUBLIC_KEY` | No | Enables architect-bridge Langfuse tracing when paired with `LANGFUSE_SECRET_KEY` |
| `LANGFUSE_SECRET_KEY` | No | Secret key for Langfuse trace export |
| `LANGFUSE_BASE_URL` | No | Override Langfuse API base URL for self-hosted deployments |
| `LANGFUSE_TRACING_ENVIRONMENT` | No | Environment label attached to exported bridge traces |
| `LANGFUSE_RELEASE` | No | Release/version label attached to exported bridge traces |

If the Langfuse variables are unset, `agent-builder-ui` keeps the same bridge behavior and simply skips trace export. The backend `system_events` ledger remains available regardless of Langfuse rollout state.

### Local Langfuse Docker Stack

The repo now carries an isolated local Langfuse stack under `langfuse/` so builder traces can be inspected without coupling Langfuse to the main app `docker-compose.yml`.

Bring it up with:

```bash
./scripts/langfuse-local.sh up
```

That workflow:
- generates ignored bootstrap secrets in `langfuse/.env` if they do not exist yet
- starts the Langfuse web/worker plus `postgres`, `redis`, `clickhouse`, and `minio`
- writes ignored builder tracing vars to `agent-builder-ui/.env.development.local`
- prints the local UI URL plus the bootstrap admin email/password and project API keys

Default local port contract:
- Langfuse UI: `http://localhost:3002`
- Langfuse worker port: `127.0.0.1:3032`
- Langfuse Postgres: `127.0.0.1:5433`
- Langfuse Redis: `127.0.0.1:6380`
- Langfuse ClickHouse HTTP/native: `127.0.0.1:8124`, `127.0.0.1:9002`
- Langfuse MinIO API/console: `http://localhost:9092`, `http://127.0.0.1:9093`

If one of those host ports is already occupied, `scripts/langfuse-local.sh` now picks the next free host port automatically and writes the chosen values into `langfuse/.env`. Use `./scripts/langfuse-local.sh status` or inspect `langfuse/.env` to see the effective port map on the current machine.

Useful commands:

```bash
./scripts/langfuse-local.sh status
./scripts/langfuse-local.sh down
./scripts/langfuse-local.sh reset
./scripts/langfuse-local.sh sync-builder-env
```

`agent-builder-ui` must be restarted after the local env overlay changes. The local builder overlay only writes `LANGFUSE_*` variables, so it does not replace the gateway-related env already present in `.env.local`.

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
- The backend process now fails startup if required config, DB initialization, or schema migrations cannot complete.
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

- [[LEARNING-2026-03-28-local-langfuse-docker-bootstrap]] — local Langfuse works best as an isolated stack with headless bootstrap and an ignored builder env overlay
- [[LEARNING-2026-03-28-agent-readable-system-events]] — Langfuse rollout is optional and should correlate with, not replace, the backend-owned `system_events` ledger
- [[LEARNING-2026-03-25-sse-heartbeat-idle-timeout-gap]] — long-running SSE routes currently have no heartbeat contract, so proxy idle timeouts in the checked-in nginx config can sever healthy sandbox-create or architect streams
- [[LEARNING-2026-03-25-web-security-headers-gap]] — captures the original missing-header gap and the rollout rule that HSTS belongs only on the actual HTTPS terminator
- [[LEARNING-2026-03-26-backend-config-runtime-split]] — centralized backend config parsing now separates strict startup validation from tolerant optional runtime lookups, which matters when extending env-driven backend helpers or tests
- [[LEARNING-2026-03-25-docker-daemon-readiness-gap]] — backend startup/readiness currently do not prove the Docker daemon is reachable even though Docker is a runtime prerequisite for core control-plane work
- [[LEARNING-2026-03-25-sandbox-runtime-resource-containment-gap]] — sandbox runtime deployment currently has no documented CPU, memory, PID, or baseline Docker hardening profile for admitted containers
- [[LEARNING-2026-03-25-sandbox-openclaw-version-drift]] — sandbox creation currently depends on `openclaw@latest`, so runtime behavior can drift across create dates without an explicit operator-controlled upgrade step

---

## Related Specs

- [[SPEC-backend-config-schema]] — defines the centralized backend env contract, defaults, and startup-time validation behavior
- [[SPEC-backend-schema-migrations]] — defines the backend-owned migration ledger and automatic startup-apply workflow
- [[SPEC-sandbox-bootstrap-config-apply-contract]] — defines which sandbox-create bootstrap mutations are required before a sandbox is treated as healthy and which browser enrichments may degrade
- [[SPEC-shared-codex-oauth-bootstrap]] — documents shared OpenClaw/Codex auth seeding for new sandboxes and clarifies that builder gateway bearer auth is unchanged
- [[SPEC-shared-codex-retrofit]] — documents the admin retrofit route, rollout script, builder compose mount, and UI lock-in for running shared-Codex sandboxes
- [[SPEC-agent-readable-system-events]] — documents the new Langfuse-related env/config contract and backend retention requirements for durable system events
- [[SPEC-local-langfuse-docker]] — documents the repo-local self-hosted Langfuse Docker stack, bootstrap env, and builder overlay workflow
- [[SPEC-web-security-headers]] — defines which security headers belong in the Next.js apps versus the HTTPS edge and documents the first-pass CSP tradeoffs
- [[SPEC-agent-learning-and-journal]] — defines the repo-visible journal and durable-learning artifacts used by maintainer automations
- [[SPEC-test-coverage-automation]] — documents the recurring automation that can add validated tests directly to the repo
- [[SPEC-graceful-shutdown]] — defines the backend shutdown grace-period contract that Docker Compose and Kubernetes stop windows must accommodate
