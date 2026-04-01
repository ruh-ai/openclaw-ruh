# Local Langfuse Docker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repo-local Docker deployment for Langfuse and wire `agent-builder-ui` to export architect traces to it during local development.

**Architecture:** Langfuse runs as an isolated local Docker Compose stack under `langfuse/` with alternate host ports and bootstrap credentials stored in ignored env files. A helper script manages env generation, container lifecycle, and builder env sync so local tracing can be enabled without changing the main app compose stack.

**Tech Stack:** Docker Compose, Langfuse OSS containers, PostgreSQL, Redis, ClickHouse, MinIO, bash, Next.js env overlays

---

### Task 1: Lock the local Langfuse contract in repo docs

**Files:**
- Create: `docs/knowledge-base/specs/SPEC-local-langfuse-docker.md`
- Create: `docs/plans/2026-03-28-local-langfuse-docker-design.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/001-architecture.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/010-deployment.md`

**Step 1: Document the isolation rule**

- Record that local Langfuse is a separate compose stack and remains additive to backend `system_events`.

**Step 2: Document the local operator workflow**

- Capture ports, env files, script usage, and builder integration.

### Task 2: Add the local stack files

**Files:**
- Create: `langfuse/docker-compose.yml`
- Create: `langfuse/.env.example`
- Create: `langfuse/README.md`
- Modify: `.gitignore`

**Step 1: Add the compose stack**

- Base it on the official Langfuse Docker Compose services, but move host ports away from the repo's existing local services.

**Step 2: Add env template**

- Include bootstrap org/project/user fields and all passwords/secrets as placeholders.

**Step 3: Ignore generated local secrets**

- Ensure generated local env overlays for Langfuse and `agent-builder-ui` are ignored.

### Task 3: Add the local operator script

**Files:**
- Create: `scripts/langfuse-local.sh`

**Step 1: Generate env if missing**

- Create `langfuse/.env` with random secrets, bootstrap user, and project keys.

**Step 2: Sync builder tracing env**

- Write `agent-builder-ui/.env.development.local` with the matching `LANGFUSE_*` values.

**Step 3: Wrap compose lifecycle**

- Support `up`, `down`, `status`, and `reset`.

### Task 4: Update builder-local env contract

**Files:**
- Modify: `agent-builder-ui/.env.example`

**Step 1: Document the optional local tracing vars**

- Add the `LANGFUSE_*` variables that the helper script will write for local development.

### Task 5: Verify the real deployment

**Files:**
- Modify: `TODOS.md`
- Modify: `docs/journal/2026-03-28.md`
- Create or modify: `docs/knowledge-base/learnings/LEARNING-2026-03-28-local-langfuse-docker.md`

**Step 1: Validate compose**

Run: `docker compose -f langfuse/docker-compose.yml --env-file langfuse/.env config`

Expected: valid compose output.

**Step 2: Bring the stack up**

Run: `./scripts/langfuse-local.sh up`

Expected: Langfuse containers healthy and UI responding on `http://localhost:3002`.

**Step 3: Verify builder env sync**

Run: `sed -n '1,120p' agent-builder-ui/.env.development.local`

Expected: local `LANGFUSE_*` values pointing at `http://localhost:3002`.

**Step 4: Verify the builder still builds**

Run: `cd agent-builder-ui && npm run build`

Expected: PASS.
