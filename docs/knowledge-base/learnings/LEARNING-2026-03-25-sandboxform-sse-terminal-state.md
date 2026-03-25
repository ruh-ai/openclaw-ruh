# LEARNING: SandboxForm SSE terminal state must not rely on captured React state

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[009-ruh-frontend]] | [[SPEC-test-coverage-automation]]

## Context

`ruh-frontend/components/SandboxForm.tsx` opens an `EventSource` for sandbox creation progress and transitions to a success UI on the `done` event. The component also assigns `sse.onerror` to catch transport failures after the stream starts.

## What Was Learned

The `sse.onerror` callback cannot safely branch on the `status` value captured when the handler was registered. After a `done` event, a normal transport close can still trigger `onerror`, and the stale closure can overwrite the successful terminal state with an `SSE connection error`.

Track the latest terminal state in a ref or another non-stale source when EventSource handlers can fire after React state updates. This keeps the UI stable when `done` or structured `error` events have already finalized the stream.

## Evidence

- Added a focused regression in `ruh-frontend/__tests__/components/SandboxForm.test.tsx` that emits `done` and then triggers `onerror`.
- The test failed before the fix because the component replaced `Sandbox ready!` with `SSE connection error`.
- The fix uses a `statusRef`-backed `updateStatus()` helper in `ruh-frontend/components/SandboxForm.tsx`, and the full `SandboxForm` component suite now passes.

## Implications For Future Agents

- When patching SSE or WebSocket UI flows in `ruh-frontend`, treat terminal transport events as potentially arriving after a success transition.
- Prefer regressions that simulate the exact event order, not just the happy-path terminal event in isolation.
- If sandbox-create stream semantics change, rerun the `SandboxForm` component suite before assuming the terminal-state logic is still correct.

## Links
- [[009-ruh-frontend]]
- [[SPEC-test-coverage-automation]]
- [Journal entry](../../journal/2026-03-25.md)
