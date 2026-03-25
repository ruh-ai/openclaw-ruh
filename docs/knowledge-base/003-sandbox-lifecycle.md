# Sandbox Lifecycle

[[000-INDEX|← Index]] | [[002-backend-overview|Backend Overview]] | [[004-api-reference|API Reference →]]

---

## Overview

A sandbox is a long-lived Docker container (`node:22-bookworm`) with the `openclaw` CLI installed and a gateway running on port 18789. Creating one takes ~2-5 minutes.

---

## Creation Flow (SSE)

### Step 1: Client POSTs to create

```
POST /api/sandboxes/create
Body: { "sandbox_name": "my-agent" }
Response: { "stream_id": "<uuid>" }
```

This is instant — just registers a `StreamEntry` in the in-memory `_streams` Map with status `pending`.

### Step 2: Client connects to SSE stream

```
GET /api/sandboxes/stream/:stream_id
```

Sets headers for SSE (`text/event-stream`). Calls `createOpenclawSandbox()` async generator.

### Step 3: Generator yields events

| Event | Data | Meaning |
|---|---|---|
| `log` | `{ message: string }` | Progress message |
| `result` | `SandboxRecord` | Container is up, gateway URL known |
| `approved` | `{ message: string }` | Device pairing approved |
| `error` | `{ message: string }` | Fatal error, container cleaned up |
| `done` | `{ stream_id }` | All done |

### Step 4: On `result` event

Backend calls `store.saveSandbox()` to persist the sandbox record in PostgreSQL.

### Step 5: On `approved` event

Backend calls `store.markApproved()` to set `approved=TRUE`.

---

## What Happens Inside `createOpenclawSandbox()`

Located at: `ruh-backend/src/sandboxManager.ts`

```
1. Generate sandbox_id (uuid v4)
2. Resolve shared auth seed: prefer host `~/.openclaw/credentials/oauth.json`, then host `~/.codex/auth.json`, unless explicit env/option overrides are set
3. Build env args from channel tokens plus LLM API keys only when shared auth is absent
4. docker pull node:22-bookworm
5. docker run -d --name openclaw-<id> -p 18789 <env-args> node:22-bookworm tail -f /dev/null
6. docker port <container> 18789/tcp  → get host port
7. docker exec: npm install -g openclaw@latest  (retry with --unsafe-perm on fail)
8. docker exec: openclaw --version
9. [if shared auth] docker exec: create parent dir + copy host auth JSON into `/root/.openclaw/credentials/oauth.json` or `/root/.codex/auth.json`
10. Build onboard command:
   shared auth → `--auth-choice skip`
   otherwise OpenRouter > OpenAI > Anthropic > Gemini > Ollama
11. docker exec: openclaw onboard --non-interactive ...
12. [if shared auth] docker exec: `openclaw config set agents.defaults.model.primary openai-codex/gpt-5.4` (or override); if an explicit `architect` agent exists, rewrite its `model` override to the same shared Codex model; then run `openclaw models status --probe --probe-provider openai-codex --json`
13. [otherwise] docker exec: node -e "..." → write auth-profiles.json
14. [if Gemini and no shared auth] patch openclaw.json: set compat.supportsStore=false
15. docker exec: openclaw config set gateway.bind lan
16. docker exec: openclaw config set gateway.controlUi.allowedOrigins [...]
17. docker exec: openclaw config set gateway.trustedProxies [...]
18. docker exec: openclaw config set gateway.controlUi.allowInsecureAuth true
19. docker exec: openclaw config set gateway.http.endpoints.chatCompletions.enabled true
20. docker exec: node -e "..." → read gateway token from openclaw.json
21. docker exec: write env vars to ~/.openclaw/.env
22. docker exec: openclaw gateway run --bind lan --port 18789 (background)
23. Poll port 18789 up to 60s (20 × 3s intervals)
24. yield ['result', { sandbox_id, sandbox_name, gateway_url, gateway_token, ... }]
25. Poll: openclaw devices approve --latest (up to 300s)
26. yield ['approved', ...] when device pairing succeeds
```

## Shared Codex OAuth Bootstrap

When shared auth is available, sandbox creation now uses it before any API-key path:

1. Prefer OpenClaw OAuth state from `OPENCLAW_SHARED_OAUTH_JSON_PATH` or `$HOME/.openclaw/credentials/oauth.json`.
2. Otherwise fall back to Codex CLI auth from `CODEX_AUTH_JSON_PATH` or `$HOME/.codex/auth.json`.
3. Run non-interactive onboarding with `--auth-choice skip`.
4. Set the default model to `OPENCLAW_SHARED_CODEX_MODEL` or `openai-codex/gpt-5.4`.
5. Fail fast if `openclaw models status --probe --probe-provider openai-codex --json` does not succeed.

If no shared auth exists, sandbox creation keeps the legacy API-key/Ollama bootstrap behavior.

## Retrofit Existing Running Sandboxes

Existing DB-tracked sandboxes can now be retrofitted in place to the same shared-Codex model without recreating the container:

1. `POST /api/admin/sandboxes/:sandbox_id/retrofit-shared-codex` requires `Authorization: Bearer <OPENCLAW_ADMIN_TOKEN>`.
2. `retrofitSandboxToSharedCodex()` resolves the same shared auth seed as sandbox creation.
3. The helper detects the container home directory, seeds auth into that home, refreshes onboarding, and when the source is Codex CLI auth it also syncs `~/.codex/auth.json` into `~/.openclaw/agents/main/agent/auth-profiles.json` as `openai-codex:default`.
4. The helper then sets `agents.defaults.model.primary`, aligns any explicit `architect` agent override to that same model, probes `openai-codex` for both the default target and the architect target when present, restarts the gateway, and waits for health.
5. The sandbox record is then marked with `shared_codex_enabled=true` and `shared_codex_model=<model>`.

The helper keeps legacy provider config files in place; it only changes the active default path and shared-Codex metadata.

The standalone builder gateway is not DB-tracked, so it is handled separately by the operator rollout script and the external compose project.

---

## Container Naming

Container name = `openclaw-<sandbox_id>` (e.g., `openclaw-a1b2c3d4-...`)

Function: `getContainerName(sandboxId)` in `ruh-backend/src/docker.ts`

---

## Executing Commands in a Sandbox

All cron and channel operations use `sandboxExec()` (in `app.ts`):

```typescript
async function sandboxExec(sandboxId: string, cmd: string, timeoutSec = 30)
// → dockerExec(getContainerName(sandboxId), cmd, timeoutSec * 1000)
// → [exitCode: 0|1, stdout+stderr]
```

Low-level: `dockerExec(containerName, cmd, timeoutMs)` in `ruh-backend/src/docker.ts`
Uses `Bun.spawn(['docker', 'exec', containerName, 'bash', '-c', cmd])`

---

## Deleting a Sandbox

```
DELETE /api/sandboxes/:sandbox_id
```

1. Calls `store.deleteSandbox()` — removes from PostgreSQL
   - The store now deletes `conversations` rows for that sandbox first, so `messages` rows cascade away before the sandbox row is removed
2. Calls `stopAndRemoveContainer()` best-effort: `docker rm -f openclaw-<id>`
3. Direct conversation routes fail closed with `404` once the sandbox record is gone, even if a caller still knows the old `sandbox_id` and `conv_id`

---

## SSH Into a Sandbox

Each sandbox record includes `ssh_command`: `docker exec -it openclaw-<id> bash`

---

## Related Learnings

- [[LEARNING-2026-03-25-sandbox-runtime-drift]] — current sandbox inventory can drift between Postgres and Docker because list/detail/status routes do not reconcile the two runtime sources of truth
- [[LEARNING-2026-03-25-sandbox-provisioning-job-persistence]] — sandbox create progress is only durable inside one backend process today, so restart-safe provisioning needs persisted job state rather than an in-memory stream map
- [[LEARNING-2026-03-25-sse-heartbeat-idle-timeout-gap]] — sandbox-create SSE can sit idle longer than the checked-in proxy timeout budget during healthy long-running steps, so reconnectability alone is not enough without heartbeat keepalives
- [[LEARNING-2026-03-25-sandbox-delete-conversation-orphans]] — deleting a sandbox currently leaves conversation history behind because chat data is not tied to sandbox lifecycle with enforced cleanup
- [[LEARNING-2026-03-25-sandbox-gateway-insecure-auth-default]] — new sandboxes currently enable permissive gateway control-UI auth by default, so gateway access policy needs its own explicit hardening contract
- [[LEARNING-2026-03-25-sandbox-runtime-resource-containment-gap]] — new sandboxes currently launch without CPU, memory, PID, or baseline Docker hardening guards, so one admitted container can consume disproportionate host resources
- [[LEARNING-2026-03-25-docker-daemon-readiness-gap]] — backend health endpoints currently ignore Docker availability even though sandbox lifecycle operations depend on a live daemon
- [[LEARNING-2026-03-25-sandbox-openclaw-version-drift]] — sandbox bootstrap still installs `openclaw@latest`, so newly created sandboxes can drift onto different runtime behavior with no repo change or explicit rollout
- [[LEARNING-2026-03-25-docker-timeouts-not-enforced]] — sandbox lifecycle timeout budgets currently flow through helpers that do not enforce them, so hung Docker/OpenClaw subprocesses can stall create, retrofit, restart, or cleanup paths indefinitely

---

## Related Specs

- [[SPEC-shared-codex-oauth-bootstrap]] — documents the shared-auth bootstrap precedence, probe requirement, and builder-gateway boundary
- [[SPEC-shared-codex-retrofit]] — documents the admin retrofit route, persisted shared-Codex metadata, rollout script, and builder-gateway retrofit path
- [[SPEC-sandbox-conversation-cleanup]] — documents backend-owned conversation/message cleanup on sandbox delete plus fail-closed post-delete route behavior
- [[SPEC-graceful-shutdown]] — defines how sandbox-create SSE streams and in-flight provisioning should terminate when the backend process is asked to stop
