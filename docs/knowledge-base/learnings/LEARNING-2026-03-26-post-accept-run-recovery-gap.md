# LEARNING: Post-accept architect disconnects now fail closed, but builder UX still drops the recovery context

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-architect-bridge-retry-safety]] | [[SPEC-agent-learning-and-journal]]

## Context

This analyst run reviewed the active Google Ads create-flow lane after the bridge retry-safety work, builder timeout package, deploy-readiness package, and draft/session recovery packages were already present in `TODOS.md`. The goal was to find the highest-value missing feature package that still was not represented as a worker-ready entry.

## What Was Learned

The repo now has a safer bridge boundary for architect retries, but it still lacks the operator-facing recovery contract for the case where the run was already accepted before the transport failed.

- `/api/openclaw` already distinguishes post-accept disconnects from pre-accept transport failures and returns a typed error payload that warns the architect run may still be finishing remotely.
- That typed response includes the stable `request_id`, but the AG-UI builder path does not preserve that context; it collapses the case into a generic `RUN_ERROR`.
- The builder UI therefore cannot tell the operator "this previous run may still finish" versus "nothing happened, try again", which reintroduces duplicate-run risk at the product layer even though the bridge no longer blindly resends.
- This gap is meaningfully different from the existing stalled-run timeout work: the timeout package covers sessions that never reach a terminal result, while this seam is specifically about the accepted-run boundary and the explicit fork-or-reset choice that should follow it.

## Evidence

- `agent-builder-ui/app/api/openclaw/route.ts` catches `GatewayRetryBoundaryError` with `stage === "post_accept"` and sends a `result` payload whose `content` says the architect run was accepted before the connection dropped and may still be running remotely, together with `request_id`.
- `agent-builder-ui/lib/openclaw/api.ts` returns that `result` payload as a normal `ArchitectResponse`.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` handles every `response.type === "error"` case by emitting only `RUN_ERROR` with a generic message, dropping `request_id` and the acceptance-boundary semantics.
- `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts` and `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` have no dedicated state or UI surface for an "uncertain completion" builder run.
- `docs/knowledge-base/specs/SPEC-architect-bridge-retry-safety.md` explicitly made full run reattachment/resume a non-goal for the shipped retry-safety slice, which means the remaining product gap must be tracked separately instead of assumed solved.

## Implications For Future Agents

- Treat bridge retry safety and builder recovery UX as separate milestones. Safe non-resend behavior in the route does not by itself give operators a safe next action.
- Do not solve this by reintroducing automatic retry after acceptance. The missing contract is operator-visible uncertainty handling and explicit fork/reset behavior.
- Keep this package distinct from the stalled-run timeout package. One covers "the run never finished"; the other covers "the run may still be finishing, but the transport to the UI is gone."

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-architect-bridge-retry-safety]]
- [Journal entry](../../journal/2026-03-26.md)
