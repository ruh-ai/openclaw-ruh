# LEARNING: Sandbox bootstrap still treats required config apply as best-effort

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle]] | [[013-agent-learning-system]]

## Context

This analyst run re-checked the active `docs/project-focus.md`, the current deployed-agent parity backlog in `TODOS.md`, and the live sandbox-create implementation to decide whether the next missing package should still be focus-local or should fall back to a repo-wide reliability gap.

## What Was Learned

The deployed-agent parity focus is already broadly represented in `TODOS.md`, but sandbox creation still has an uncovered cross-cutting reliability gap: `ruh-backend/src/sandboxManager.ts:createOpenclawSandbox()` verifies installation, onboarding, and eventual gateway port health, yet it ignores the success or failure of most required post-onboarding setup commands before yielding a normal sandbox result.

Current local evidence:

- The create flow calls `await run(...)` for gateway config writes, browser/tool profile settings, env-file writes, and browser/VNC startup commands without checking the returned `[ok, out]` tuple for most of those steps.
- A sandbox can therefore reach the existing 60s gateway port probe and emit a persisted `result` even if required runtime capabilities such as chat endpoint enablement, command-mode flags, or other documented bootstrap mutations never applied.
- `docs/knowledge-base/003-sandbox-lifecycle.md` documents those commands as part of the normal create contract, so the KB currently describes a stronger sandbox bootstrap guarantee than the runtime actually enforces.
- Existing backlog items already cover gateway-health fail-closed behavior, access-policy hardening, Docker timeouts, and runtime resource limits, but none define a verified apply contract for the create-time config mutations themselves.

## Evidence

- `ruh-backend/src/sandboxManager.ts`
  - verifies `npm install`, `openclaw --version`, onboarding, shared-auth probes, and gateway health explicitly
  - does **not** check most later `await run(...)` calls for:
    - `openclaw config set gateway.bind ...`
    - `openclaw config set gateway.controlUi.allowedOrigins ...`
    - `openclaw config set gateway.trustedProxies ...`
    - `openclaw config set gateway.http.endpoints.chatCompletions.enabled true`
    - `openclaw config set browser.noSandbox ...`
    - `openclaw config set tools.profile full`
    - `openclaw config set commands.native true`
    - `openclaw config set commands.nativeSkills true`
    - `~/.openclaw/.env` writes and most browser/VNC startup commands
- `docs/knowledge-base/003-sandbox-lifecycle.md`
  - lists those post-onboarding config writes as part of the standard create flow without distinguishing required, optional, or best-effort steps
- `TODOS.md`
  - already tracks `TASK-2026-03-25-21`, `TASK-2026-03-25-49`, `TASK-2026-03-25-53`, and `TASK-2026-03-25-60`, but none cover bootstrap config-apply truthfulness itself

## Implications For Future Agents

- Treat sandbox create as a capability-apply contract, not only an install-plus-port-health contract.
- Separate required bootstrap mutations from optional enrichments such as live browser workspace support so create-time degraded states can be explicit instead of accidental.
- Do not rely on a listening gateway port as proof that the sandbox runtime matches the documented browser/chat/tool configuration.

## Links

- [[003-sandbox-lifecycle]]
- [[004-api-reference]]
- [[010-deployment]]
- [Journal entry](../../journal/2026-03-26.md)
