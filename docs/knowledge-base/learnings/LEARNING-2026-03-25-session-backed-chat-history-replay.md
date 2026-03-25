# LEARNING: Session-backed sandbox chat needs one history contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[007-conversation-store]] | [[009-ruh-frontend]]

## Context

While reviewing the current repo state for the highest-leverage missing backlog item that was not already captured in `TODOS.md`, the deployed sandbox chat flows were inspected across the backend proxy route and both chat UIs.

## What Was Learned

- The repo currently has two conflicting request contracts for the same session-backed chat route.
- `ruh-backend/src/app.ts` forwards `x-openclaw-session-key` whenever `conversation_id` is present, so the backend already treats the gateway conversation as stateful.
- `ruh-frontend/components/ChatPanel.tsx` still sends the entire prior transcript on every turn with `messages: [...messages, userMsg]`, even though that request also carries `conversation_id`.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` sends only the newest user turn for the same backend route, proving the product does not currently agree on whether the client or the gateway session owns history after a conversation is created.

## Evidence

- `docs/knowledge-base/001-architecture.md` and `docs/knowledge-base/007-conversation-store.md` both describe the session key as the mechanism that preserves conversation context in the gateway.
- `ruh-backend/src/app.ts` looks up `conversation_id`, derives `openclaw_session_key`, and forwards it as `x-openclaw-session-key`.
- `ruh-frontend/components/ChatPanel.tsx` posts `messages: [...messages, userMsg]` together with `conversation_id: conv.id`.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` posts only `messages: [{ role: "user", content: text }]` together with the same kind of `conversation_id`.

## Implications For Future Agents

- Do not assume that session-backed chat should replay the entire transcript just because the route is OpenAI-compatible.
- Define one explicit contract for requests with `conversation_id` before extending chat persistence, trigger-driven chat entry points, or additional sandbox chat surfaces.
- Keep the two deployed chat clients aligned so future fixes do not silently land in one UI while the other keeps a different memory model.

## Links

- [[007-conversation-store]]
- [[009-ruh-frontend]]
- [Journal entry](../../journal/2026-03-25.md)
