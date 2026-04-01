# SPEC: Shared Codex Retrofit For Running Targets

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle|Sandbox Lifecycle]] | [[004-api-reference|API Reference]] | [[010-deployment|Deployment]]

## Status

implemented

## Summary

Existing running OpenClaw sandboxes and the standalone builder gateway can be retrofitted in place to the same shared Codex/OpenClaw auth model already used for new sandboxes. The retrofit adds sandbox metadata so shared-Codex targets are visible to the UI, exposes an admin-only backend route for DB-tracked sandboxes, ships a repo-local rollout script for sequential operator use, and locks the browser UI to gateway-default chat on those sandboxes.

## Related Notes

- [[001-architecture]] — transport auth to the gateway remains separate from downstream shared Codex model auth
- [[003-sandbox-lifecycle]] — documents the in-place retrofit helper, metadata updates, and builder-gateway exception
- [[004-api-reference]] — documents the admin retrofit route and the `409` lockout on user-facing provider reconfiguration
- [[005-data-models]] — `sandboxes` now persist shared-Codex state
- [[008-agent-builder-ui]] — deployed-agent chat/settings UI now respects shared-Codex sandbox metadata
- [[010-deployment]] — documents `OPENCLAW_ADMIN_TOKEN`, the rollout script, and the builder compose mount
- [[SPEC-shared-codex-oauth-bootstrap]] — this retrofit extends the same shared-auth convention from new sandboxes to already-running targets

## Specification

### Backend retrofit path

- Add `POST /api/admin/sandboxes/:sandbox_id/retrofit-shared-codex`.
- Require `Authorization: Bearer <OPENCLAW_ADMIN_TOKEN>`.
- Accept only an optional `model` string; default to `OPENCLAW_SHARED_CODEX_MODEL` or `openai-codex/gpt-5.4`.
- Reuse the same shared-auth seed resolution as sandbox creation:
  1. `OPENCLAW_SHARED_OAUTH_JSON_PATH`
  2. `$HOME/.openclaw/credentials/oauth.json`
  3. `CODEX_AUTH_JSON_PATH`
  4. `$HOME/.codex/auth.json`
- Detect the container home directory before writing auth state so both `/root` sandboxes and `/home/node` gateways are supported.
- Copy shared auth into the appropriate home dir unless the target file already exists.
- Set `agents.defaults.model.primary`.
- If the target has an explicit `architect` agent entry, rewrite that agent-level `model` override to the shared Codex model too so the builder chat does not keep resolving through a stale provider-specific pin.
- Probe `openai-codex` before returning success.
- Restart the gateway and wait for health.

### Sandbox metadata

Persist these fields on sandbox records:

- `shared_codex_enabled: boolean`
- `shared_codex_model: string | null`

These fields must be returned from sandbox list/detail endpoints, persisted for new shared-auth sandboxes, and updated after a successful retrofit of an existing sandbox.

### User-facing enforcement

- `POST /api/sandboxes/:sandbox_id/reconfigure-llm` must return `409` when `shared_codex_enabled=true`.
- In `agent-builder-ui`, if the active sandbox is shared-Codex:
  - clear stale local `agent.model` values unless they already use `openai-codex/...`
  - send `openclaw-default` for new conversation creation and chat requests
  - show the shared Codex model as active in Settings
  - disable provider-switching UI and the current Apply & Restart flow

### Operator rollout

- Add a repo-local rollout script that:
  - enumerates DB-tracked sandboxes from PostgreSQL
  - calls the admin retrofit route sequentially
  - verifies the persisted metadata after each success
  - reports unmanaged `openclaw-*` containers without touching them
- Handle the standalone builder gateway separately:
  - mount host `~/.codex` read-only into `/home/node/.codex`
  - recreate the `openclaw-gateway` service
  - run the same shared-Codex retrofit helper against `openclaw-openclaw-gateway-1`

## Implementation Notes

- Backend route and lockout live in `ruh-backend/src/app.ts`.
- Shared-Codex persistence lives in `ruh-backend/src/store.ts`.
- Retrofit helpers live in `ruh-backend/src/sandboxManager.ts`. When the shared source is Codex CLI auth, the helper also syncs `~/.codex/auth.json` into OpenClaw's `auth-profiles.json` as `openai-codex:default` so probes and runtime model resolution see a real provider target. Builder-style targets with a configured `architect` agent also have that agent override rewritten and verified with an architect-specific probe.
- Sequential operator rollout is implemented in `ruh-backend/scripts/retrofit-shared-codex.ts`.
- The standalone builder gateway compose mount lives outside the repo at `/Users/prasanjitdey/Research/Openclaw/docker-compose.yml`.
- Frontend lock-in behavior lives in:
  - `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`
  - `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`
  - `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabSettings.tsx`
  - `agent-builder-ui/lib/openclaw/shared-codex.ts`

## Test Plan

- `cd ruh-backend && bun test ./tests/unit/sandboxManager.test.ts`
- `cd ruh-backend && bun test ./tests/e2e/chatProxy.test.ts`
- `cd ruh-backend && bun x tsc --noEmit`
- `cd agent-builder-ui && bun test ./lib/openclaw/shared-codex.test.ts`
- `cd agent-builder-ui && npx tsc --noEmit`
- Manual operator verification:
  - run `bun run scripts/retrofit-shared-codex.ts`
  - verify each DB sandbox is marked `shared_codex_enabled=true`
  - verify `openclaw models status --json` on a retrofitted sandbox reports `defaultModel` and `resolvedDefault` as `openai-codex/gpt-5.4`
  - verify `openclaw models status --agent architect --json` on the standalone builder gateway reports `defaultModel` and `resolvedDefault` as `openai-codex/gpt-5.4` with no `missingProvidersInUse`
  - verify the builder gateway still uses `OPENCLAW_GATEWAY_TOKEN` for bridge auth while using shared Codex auth for model access
