# LEARNING: Backend APIs currently echo raw diagnostics to clients

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[002-backend-overview]] | [[004-api-reference]]

## Context

After a concurrent update claimed the deployed-chat cancellation gap during this automation run, the remaining untracked backend security boundaries were re-checked against the live route implementations to find the next highest-leverage missing task.

## What Was Learned

- Several backend routes still expose raw gateway or CLI diagnostics directly to browsers instead of a client-safe error contract.
- Non-streaming sandbox chat reflects upstream gateway error bodies via `JSON.stringify(resp.data)`.
- Cron routes splice raw CLI output into `detail` strings or success fallbacks, and channel probe/pairing routes return raw `output` blobs from container-side `openclaw` commands.
- Because the generic error middleware returns `{ detail: err.message }`, any raw diagnostic string that gets wrapped into an error automatically crosses the API boundary.

## Evidence

- `ruh-backend/src/app.ts`:
  - `POST /api/sandboxes/:sandbox_id/chat` throws `httpError(resp.status, JSON.stringify(resp.data))` for upstream `4xx` gateway responses.
  - Cron routes use patterns like ``httpError(502, `openclaw cron add failed: ${output.slice(0, 400)}`)`` and `res.json({ ok: true, output })`.
  - The shared error middleware returns `res.status(status).json({ detail: err.message })`.
- `ruh-backend/src/channelManager.ts` returns raw `output` from `openclaw channels status --probe`, `openclaw pairing list`, and `openclaw pairing approve`.
- Existing backlog items already cover sandbox secret redaction, truthful channel-save outcomes, structured logging, and audit redaction, but none define what raw backend diagnostics may safely leave the API at all.

## Implications For Future Agents

- Treat client-facing error/diagnostic redaction as a distinct boundary from log redaction, audit-event redaction, or normal read-model secret masking.
- Do not rely on `err.message` as a safe browser payload when route handlers or helpers can include upstream JSON, stderr, or container output in that string.
- When tightening this boundary, keep operator diagnostics available through the right layer later (structured logs, audit tooling, explicit debug endpoints) instead of leaving raw CLI/gateway output on ordinary product APIs.

## Links

- [[002-backend-overview]]
- [[004-api-reference]]
- [[006-channel-manager]]
- [Journal entry](../../journal/2026-03-25.md)
