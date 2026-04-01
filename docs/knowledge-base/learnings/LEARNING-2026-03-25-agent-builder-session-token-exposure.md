# LEARNING: Agent Builder Session Tokens Are Browser-Readable

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]]

## Context

While reviewing the current repo state for the highest-leverage missing backlog item, the agent-builder auth implementation was inspected alongside the existing auth-related tasks in `TODOS.md`.

## What Was Learned

- The current builder auth model does not just lack route protection; it also exposes both auth tokens to browser JavaScript.
- `agent-builder-ui/services/authCookies.ts` sets `accessToken` and `refreshToken` with `httpOnly: false`, and `sameSite: "none"`, so the browser session is intentionally script-readable today.
- `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx` copies the current access token into the persisted `useUserStore`, and `agent-builder-ui/app/api/auth.ts` writes refreshed tokens back into that same persisted store.
- Because the existing backlog focused on auth gates and authenticated routes, token-exposure hardening needs its own dedicated task rather than being assumed inside those other items.

## Evidence

- `agent-builder-ui/services/authCookies.ts` sets:
  - `httpOnly: false` for both `accessToken` and `refreshToken`
  - `sameSite: "none"` for both set and clear paths
- `agent-builder-ui/hooks/use-user.ts` persists the user store under `user-session-storage`.
- `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx` stores `accessToken: currentToken || ""` in that persisted store.
- `agent-builder-ui/app/api/auth.ts` refresh flow updates the persisted store with `accessToken: response.data.access_token`.
- Existing `TODOS.md` tasks cover route gating, bridge auth, backend auth, and ownership scoping, but none explicitly remove the browser-readable token surface.

## Implications For Future Agents

- Treat token-storage hardening as a separate security boundary from page auth or bridge auth.
- Avoid implementing new auth checks that rely on browser JS reading `accessToken` or `refreshToken` unless the spec explicitly accepts that risk.
- When working on builder auth, prefer `HttpOnly` cookie or server-validated session patterns and keep raw tokens out of persisted Zustand/localStorage state.

## Links

- [[008-agent-builder-ui]]
- [[001-architecture]]
- [[SPEC-agent-builder-session-token-hardening]]
- [Journal entry](../../journal/2026-03-25.md#0532-ist--codex--task-2026-03-25-28-harden-agent-builder-session-token-storage)
