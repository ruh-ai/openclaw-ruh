# Local Langfuse Docker Design

## Summary

The repo already has Langfuse instrumentation points in `agent-builder-ui`, but no local deployment target, so traces currently go nowhere. The clean fix is to add a dedicated repo-local Langfuse Docker stack under `langfuse/`, use alternate host ports so it can coexist with the app's existing local services, and generate local bootstrap credentials into ignored env files. `agent-builder-ui` then points at that local stack through an ignored `.env.development.local`, preserving the current rule that Langfuse is additive to the backend-owned `system_events` history.

## Recommended Approach

### 1. Separate local stack

- Use a dedicated `langfuse/docker-compose.yml` instead of modifying the root app compose.
- Keep Langfuse easy to start, stop, and reset independently from the product stack.

### 2. Generated local env

- Generate `langfuse/.env` with secrets, local admin bootstrap values, and fixed project keys.
- Generate `agent-builder-ui/.env.development.local` with the matching `LANGFUSE_*` exporter settings.
- Keep both ignored so secrets do not land in git.

### 3. Small operator wrapper

- Provide one script to generate missing env, run `docker compose`, sync builder vars, and print the exact local UI/login details.

## Why not fold it into the main app compose?

- Langfuse is heavier than the core app stack and would slow normal local boot.
- Its ports and internal dependencies would complicate the root compose file.
- The observability stack is optional operator tooling, not part of the product runtime.

## Initial Slice

- `langfuse/docker-compose.yml`
- `langfuse/.env.example`
- `scripts/langfuse-local.sh`
- `agent-builder-ui/.env.example` update
- ignored `agent-builder-ui/.env.development.local` with synced local tracing credentials

## Risks

- Local port collisions if alternate host ports are not chosen carefully.
- Bootstrap env drift if Langfuse changes required env names in future releases.
- Secret leakage if local overlay files are not ignored.
