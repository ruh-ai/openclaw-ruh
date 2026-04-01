# SPEC: Agent Config Apply Contract

[[000-INDEX|← Index]] | [[004-api-reference]] | [[008-agent-builder-ui]]

## Status

implemented

## Summary

Applying agent config to a running sandbox must become a verified, fail-closed contract instead of a best-effort side effect. The backend should report which SOUL, skill, and cron mutations succeeded or failed, and the deploy/hot-push flows must only report success after that contract is satisfied.

## Related Notes

- [[004-api-reference]] — documents the request and response contract for `POST /api/sandboxes/:sandbox_id/configure-agent`
- [[008-agent-builder-ui]] — deploy and hot-push flows currently treat any HTTP 200 as success
- [[011-key-flows]] — sandbox deploy flow currently attaches a sandbox before config apply is proven
- [[SPEC-agent-edit-config-persistence]] — saved agent state should remain the source of truth before any runtime push is attempted
- [[SPEC-selected-tool-mcp-runtime-apply]] — selected configured MCP connectors are part of the fail-closed runtime apply contract

## Specification

### Problem Statement

The current config-push path is optimistic in two places:

1. `POST /api/sandboxes/:sandbox_id/configure-agent` always returns HTTP `200` with `{ ok: true, steps }`, even when one or more `docker exec` writes fail.
2. `agent-builder-ui/lib/openclaw/agent-config.ts` turns every HTTP-success response into `{ ok: true }` without inspecting the backend step outcomes.

That combination lets the UI mark deploy or hot-push as successful while the sandbox may be missing `SOUL.md`, one or more skills, or cron registrations.

### Contract Goals

- A config apply must have an explicit success/failure result.
- Partial writes must not be reported as success.
- The UI must surface enough structured detail to explain which apply step failed.
- Agent-to-sandbox attachment and hot-push success UI must respect the apply result.

### Backend Response Contract

`POST /api/sandboxes/:sandbox_id/configure-agent` keeps the existing request body shape but changes its response semantics.

Successful apply:

```json
{
  "ok": true,
  "applied": true,
  "steps": [
    { "kind": "soul", "target": "SOUL.md", "ok": true, "message": "SOUL.md written" },
    { "kind": "skill", "target": "web-search", "ok": true, "message": "Skill web-search written" }
  ]
}
```

Failed or partial apply:

```json
{
  "ok": false,
  "applied": false,
  "detail": "Agent config apply failed",
  "steps": [
    { "kind": "soul", "target": "SOUL.md", "ok": true, "message": "SOUL.md written" },
    { "kind": "cron", "target": "daily-report", "ok": false, "message": "Cron daily-report failed" }
  ]
}
```

Rules:

- `steps` is an ordered array of structured step results, one item per attempted mutation.
- `ok` / `applied` are `true` only when every attempted step succeeds.
- If any attempted step fails, the route returns a non-2xx status (`500` by default, `4xx` only for request validation or missing sandbox cases).
- Failure payloads must keep the standard backend `detail` field and may still include `steps` for UI diagnostics.
- The route should stop immediately on the first failed mutation unless a later implementation deliberately adds compensating rollback. This spec does not require rollback yet.

### Frontend Consumption Contract

`pushAgentConfig()` must treat config apply as successful only when:

- the HTTP status is success, and
- the parsed body explicitly reports `ok: true` / `applied: true`.

If the backend reports a failed step or returns a non-2xx status:

- `pushAgentConfig()` returns `{ ok: false, steps, detail }` or throws a typed error
- callers must not infer success from the existence of `steps`

### Deploy Flow Rules

`agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` must change from optimistic attach-first behavior to verified deploy behavior.

Required rules:

1. The deploy flow may create the sandbox and stream provisioning progress as it does today.
2. The UI must not present deployment as successful until config apply succeeds.
3. If config apply fails, the flow must enter an explicit warning/error state instead of logging success text such as "Agent configuration complete."
4. Attaching the sandbox to the agent record should happen only after config apply succeeds, or the attachment must be marked as pending/unverified by a later design. For the bounded implementation that follows this spec, attach-after-success is the preferred path.

### Improve-Agent / Mission-Control Rules

- The improve-agent hot-push flow must aggregate per-sandbox apply results and surface an error state when any sandbox fails.
- Mission Control manual push must set its success state only from the returned apply contract, not from the absence of thrown fetch errors.
- A failed runtime push does not roll back the already-saved agent record from [[SPEC-agent-edit-config-persistence]]; it only means one or more running sandboxes are out of sync with the saved config.

### Step Taxonomy

Each step result should include:

- `kind`: `soul` | `skill` | `cron` | `runtime_env` | `mcp` | `webhook`
- `target`: deterministic identifier such as `SOUL.md`, normalized `skill_id`, or cron name
- `ok`: boolean
- `message`: user-safe summary

Future work may add `stdout` / `stderr` or machine-readable failure codes, but this v1 contract only requires safe summary strings.

## Implementation Notes

- Backend implementation starts in [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/app.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/app.ts) by replacing the current string-only `steps` array with structured step results and fail-closed route status handling.
- Shared step/result types should live close to the route or in a small helper so `agent-builder-ui` can consume the same shape without duplicating string parsing.
- Frontend callers to update after the route contract lands:
  [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/agent-config.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/agent-config.ts),
  [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx),
  [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/page.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/page.tsx),
  [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx).
- The implementation should preserve the existing request payload and keep shell-safety/path-normalization behavior unchanged.

## Test Plan

- Backend unit coverage for `configure-agent` should prove the route returns failure when any SOUL/skill/cron mutation fails and that successful runs return structured step results.
- Frontend unit coverage for `pushAgentConfig()` should prove it rejects or returns `ok: false` when the backend responds with HTTP success but `ok: false`.
- Deploy-flow coverage should prove a sandbox is not attached or marked successful when config apply fails.
- Mission Control and improve-agent UI coverage should prove the success indicators depend on the new apply contract.
