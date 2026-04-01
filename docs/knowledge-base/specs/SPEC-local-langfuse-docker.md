# SPEC: Local Langfuse Docker Stack

[[000-INDEX|← Index]] | [[010-deployment]] | [[008-agent-builder-ui]]

## Status

implemented

## Summary

The repo now has optional Langfuse tracing on the architect bridge, but local development still has no Langfuse target, so traces never leave the process and there is no UI to inspect them. This spec adds a repo-local Docker deployment for Langfuse on alternate host ports, plus local env wiring so `agent-builder-ui` can export architect traces to a local Langfuse UI without coupling Langfuse to the app's main compose stack.

## Related Notes

- [[001-architecture]] — local Langfuse must stay additive to the backend-owned `system_events` observability model
- [[008-agent-builder-ui]] — the Node bridge owns the Langfuse/OpenTelemetry exporter configuration
- [[010-deployment]] — documents the local Docker stack, port contract, and setup workflow
- [[SPEC-agent-readable-system-events]] — local Langfuse exists to complement, not replace, the canonical backend event ledger

## Specification

### Deployment Shape

- Add a dedicated repo-local Langfuse Docker Compose stack under `langfuse/`.
- Do not fold Langfuse into the root `docker-compose.yml`; it should remain an operator/dev tool that can be started and stopped independently.
- Use official Langfuse container images and the same core dependencies Langfuse documents for low-scale Docker Compose deployments:
  - `langfuse-web`
  - `langfuse-worker`
  - `postgres`
  - `redis`
  - `clickhouse`
  - `minio`

### Local Port Contract

The repo's main local services already use `3000`, `3001`, `5432`, and Docker-managed sandbox ports. The local Langfuse stack therefore starts from a default alternate-host-port contract and auto-selects the next free host port when one of those defaults is already occupied:

- Langfuse UI: `http://localhost:3002`
- Langfuse worker health/debug port: `127.0.0.1:3032`
- Langfuse Postgres: `127.0.0.1:5433`
- Langfuse Redis: `127.0.0.1:6380`
- Langfuse ClickHouse HTTP/native: `127.0.0.1:8124`, `127.0.0.1:9002`
- Langfuse MinIO API/console: `http://localhost:9092`, `http://127.0.0.1:9093`

### Secrets And Local State

- Store actual Langfuse bootstrap secrets in an ignored `langfuse/.env` file generated locally.
- Do not commit generated Langfuse project keys or admin credentials.
- If the builder needs local Langfuse credentials, write them to an ignored `agent-builder-ui/.env.development.local`.

### Bootstrap Contract

The local stack should pre-seed one usable local org, project, and admin user through env variables so the user does not need to click through first-time setup manually.

Required bootstrap outputs:

- one local admin email + password
- one local project public key
- one local project secret key
- the Langfuse base URL used by `agent-builder-ui`

### Builder Integration

- `agent-builder-ui` local development must be able to opt into the local Langfuse stack via `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_TRACING_ENVIRONMENT`, and `LANGFUSE_RELEASE`.
- The local env overlay must not replace existing gateway-related variables.
- Restarting `agent-builder-ui` after writing the local overlay should be sufficient for traces to start exporting.

### Operator Workflow

The repo should provide one documented local workflow to:

1. generate missing Langfuse secrets/env
2. start the stack
3. sync builder env variables
4. print the UI URL and bootstrap login/project credentials
5. stop or reset the stack later

## Implementation Notes

- Prefer a single repo script that wraps `docker compose -f langfuse/docker-compose.yml --env-file langfuse/.env`.
- Pin the local stack around alternate host ports so it can run beside the repo's existing local services.
- If one of the default host ports is already bound, the local script should automatically bump that service to the next free host port and propagate the chosen value into both `langfuse/.env` and the builder overlay.
- Update `.gitignore` so new local builder env overlays are not accidentally committed.

## Test Plan

- `docker compose -f langfuse/docker-compose.yml --env-file langfuse/.env config`
- `docker compose -f langfuse/docker-compose.yml --env-file langfuse/.env up -d`
- Verify the Langfuse UI responds on `http://localhost:3002`
- Verify the builder local env overlay contains the expected `LANGFUSE_*` values
- Verify `agent-builder-ui` still builds with the Langfuse env overlay present
