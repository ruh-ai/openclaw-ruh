# Local Langfuse

Repo-local Langfuse stack for builder tracing.

## Quick start

```bash
./scripts/langfuse-local.sh up
```

This will:

- generate `langfuse/.env` if it does not exist
- start the Langfuse Docker stack on alternate local ports
- write `agent-builder-ui/.env.development.local` with matching `LANGFUSE_*` values
- print the local UI URL and bootstrap login/project credentials
- auto-bump any occupied default host port to the next free port and persist the actual choice in `langfuse/.env`

## Commands

```bash
./scripts/langfuse-local.sh up
./scripts/langfuse-local.sh down
./scripts/langfuse-local.sh status
./scripts/langfuse-local.sh reset
./scripts/langfuse-local.sh sync-builder-env
```

## URLs

- Default Langfuse UI: `http://localhost:3002`
- Default MinIO API: `http://localhost:9092`
- Default MinIO Console: `http://127.0.0.1:9093`

If one of those ports is already in use, run `./scripts/langfuse-local.sh status` or inspect `langfuse/.env` to see the effective port assignments.

The stack is intentionally separate from the root app `docker-compose.yml`.
