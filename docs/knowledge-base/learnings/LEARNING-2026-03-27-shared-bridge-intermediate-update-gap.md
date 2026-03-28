# LEARNING: Shared architect runs need forge-style intermediate builder updates

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-agui-protocol-adoption]]

## Context

The active `docs/project-focus.md` still prioritizes [[SPEC-agui-protocol-adoption]] and an iterative Google Ads create loop on the default `/agents/create` path. This run re-checked the live builder producer/consumer chain to find a highest-value gap that was not already captured in `TODOS.md`.

## What Was Learned

The primary shared architect bridge lags behind the forge-chat fallback on progressive builder updates. `BuilderAgent` and `sendToArchitectStreaming()` already support `intermediate` events that can drive staged AG-UI wizard movement, and `forge-chat/route.ts` already emits those updates while content streams. But `app/api/openclaw/route.ts` only emits `status`, `delta`, approval, and final `result` events, so the default shared-gateway create flow cannot surface real `identity`, `skill_discovered`, `tool_hint`, `trigger_hint`, or `channel_hint` updates before `ready_for_review` arrives.

This gap is now fixed in the live workspace: the shared route emits the same bounded `intermediate` SSE frames as forge-chat, `sendToArchitectStreaming()` forwards them on the shared path, and targeted route/client regressions cover the ordered identity → skill → tool → trigger → channel progression. The durable takeaway is to keep both architect bridges on one shared extraction contract and verify common phrasing such as "I'll build the X agent" in the extractor tests.

## Evidence

- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts) already implements `onIntermediate` handling that maps progressive updates into wizard phase/field/skills/tools/triggers/channel events.
- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/api.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/api.ts) is the canonical SSE client parser for both shared and forge architect paths; regressions now assert it forwards `event: intermediate` on the shared route too.
- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/api/openclaw/forge-chat/route.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/api/openclaw/forge-chat/route.ts) contains the bounded `extractIntermediateUpdates()` scanner and emits `intermediate` SSE frames during streaming.
- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/api/openclaw/route.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/api/openclaw/route.ts) now shares the same intermediate-update extraction path as forge-chat and emits ordered `intermediate` SSE frames during shared architect streaming.
- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/intermediate-updates.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/intermediate-updates.ts) needs coverage for realistic identity phrasing, including "I'll build the X agent", because the gated extractor blocks every downstream hint when identity detection misses.

## Implications For Future Agents

- Treat progressive builder UX as a producer-side contract, not only a consumer-side AG-UI state problem.
- When improving `/agents/create`, verify whether the run is using the shared architect bridge or forge-chat fallback before assuming progressive builder phases are backed by real stream events.
- Prefer one shared intermediate-update helper across `forge-chat/route.ts` and `route.ts` rather than letting the two architect paths drift further.
- Keep route-level and client-level regressions together so shared-bridge producer parity does not silently regress while forge-chat keeps passing.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agui-protocol-adoption]]
- [Journal entry](../../journal/2026-03-27.md)
