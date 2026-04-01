# LEARNING: Live builder sessions can hang after `start` while the create UI stays opaque

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-agent-learning-and-journal]]

## Context

This run used a real browser against the default Co-Pilot create flow at `/agents/create` to verify the current Google Ads proving-case path. The goal was to distinguish a frontend render regression from a live architect-bridge/runtime problem.

## What Was Learned

The live create shell itself is not the primary failure. The Co-Pilot UI renders, and the same shell correctly displays mocked SSE `clarification` responses from `POST /api/openclaw`. The reliability gap is in the live architect session path: some fresh builder sessions return a normalized `clarification` or `data_schema_proposal`-style response within seconds, while other sessions hang indefinitely after the bridge emits lifecycle phases up through `start`. Reusing the hanging session id reproduces the stall outside the browser, so the browser getting stuck on `Connecting…` is a symptom of a session-level architect run that never reaches `result`, not just a broken chat renderer.

## Evidence

- Real browser check against `http://127.0.0.1:3001/agents/create` showed the create shell, input, and mocked SSE rendering all work, but one live submission remained on `Connecting…` with no assistant text.
- Direct `curl -N` calls to `POST /api/openclaw` with fresh session ids returned normalized `result` payloads quickly for some sessions and timed out after `connecting` → `authenticated` → `thinking` → `start` for others.
- Replaying the browser's original `session_id` directly against `POST /api/openclaw` reproduced the same hang, confirming the stall was not limited to Playwright or the UI layer.
- A browser-context `fetch('/api/openclaw')` with a fresh session id could parse the final SSE `result`, which rules out a blanket browser inability to consume the stream.
- `agent-builder-ui/e2e/create-agent.spec.ts` is no longer aligned with the live shell: its `locator("textarea")` assumption now fails because the create page exposes multiple textarea fields at once.
- Targeted code review now confirms the raw lifecycle signals already exist: `agent-builder-ui/app/api/openclaw/route.ts` emits `status` events for phases such as `connecting`, `authenticated`, `thinking`, `start`, `retrying`, and `error`, and `agent-builder-ui/lib/openclaw/api.ts` forwards those callbacks to the frontend.
- The current builder loading UI still collapses those signals into one opaque placeholder: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` renders only a generic `Connecting…` state while `isLoading` is true and there are no live steps or response text yet.

## Implications For Future Agents

- When debugging `/agents/create`, separate two questions:
  1. Does the Co-Pilot UI render mocked architect responses correctly?
  2. Does the live architect session actually reach `result` for the current session id?
- Do not assume a browser-level stall means the render path is broken; verify the same `session_id` directly against `POST /api/openclaw`.
- The current builder UX is too opaque during long or hung runs because it only shows a generic `Connecting…` state until text arrives. Future fixes should surface lifecycle phases, add a bounded timeout/cancel/retry path, or both.
- Treat the next reliability fix as a UI-and-bridge contract problem, not just a gateway bug hunt: the frontend already receives enough status information to fail closed on hung runs but does not expose or act on it.
- Refresh `agent-builder-ui/e2e/create-agent.spec.ts` before treating it as reliable coverage for the live create flow.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
