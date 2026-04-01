# LEARNING: Local Langfuse Needs An Isolated Stack And Headless Bootstrap

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[010-deployment]] | [[008-agent-builder-ui]] | [[SPEC-local-langfuse-docker]]

## Context

The repo gained optional Langfuse tracing on the Node-based architect bridge, but local development still had no Langfuse target. Getting a usable local UI required deciding whether to fold Langfuse into the main app stack or run it separately, and whether the repo could avoid a manual first-run setup in the Langfuse UI.

## What Was Learned

- Langfuse is practical locally as a separate Docker Compose stack, not as part of the repo's main `docker-compose.yml`. Keeping it isolated avoids collisions with the app's existing Postgres and frontend ports and makes it easier to reset without touching the product stack.
- The local stack still needs the full Langfuse dependency set (`postgres`, `redis`, `clickhouse`, `minio`, `langfuse-web`, `langfuse-worker`) even for a developer-only install.
- Langfuse's documented `LANGFUSE_INIT_*` headless-initialization variables are the right way to pre-seed a local org, project, API keys, and admin user so operators do not need a manual first-run click path.
- Builder-local trace export should be wired through an ignored overlay file such as `agent-builder-ui/.env.development.local`, and that overlay should contain only `LANGFUSE_*` values so it does not overwrite gateway transport config.
- On macOS/Docker Desktop, port probes that rely on binding `127.0.0.1` can miss Docker-managed wildcard listeners. A real listener scan (`lsof -iTCP:<port> -sTCP:LISTEN`) is safer when auto-selecting host ports for local compose services.

## Evidence

- `langfuse/docker-compose.yml` defines a repo-local stack named `openclaw-langfuse` on alternate host ports headed by `http://localhost:3002`.
- `scripts/langfuse-local.sh` generates ignored bootstrap secrets, writes the local builder env overlay, and wraps the compose lifecycle with `up`, `down`, `status`, `reset`, and `sync-builder-env`.
- A live collision with an existing `devpulse_postgres` listener on `0.0.0.0:5433` forced the script to auto-bump Langfuse Postgres to `127.0.0.1:5434`, which verified the collision-handling path.
- `agent-builder-ui/.env.example` now documents the full local/self-hosted Langfuse env contract the bridge understands.
- `langfuse/README.md` gives the repo-local operator workflow instead of requiring an external Langfuse deployment.

## Implications For Future Agents

- If a task needs local trace inspection, start with `./scripts/langfuse-local.sh up` instead of editing the main app compose stack.
- Treat `langfuse/.env` and `agent-builder-ui/.env.development.local` as operator-local generated files; they should stay ignored and never become tracked config.
- Keep the builder restart requirement explicit whenever `LANGFUSE_*` overlays change, because Next.js route handlers read env at process start.
- Local Langfuse remains additive observability. Durable agent-readable runtime history still belongs in backend-owned `system_events`.

## Links

- [[001-architecture]]
- [[008-agent-builder-ui]]
- [[010-deployment]]
- [[SPEC-agent-readable-system-events]]
- [[SPEC-local-langfuse-docker]]
- [Journal entry](../../journal/2026-03-28.md)
