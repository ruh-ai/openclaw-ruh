# LEARNING: Sandbox create should prove required bootstrap state before persistence

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle]] | [[SPEC-sandbox-bootstrap-config-apply-contract]]

## Context

Worker-1 implemented TASK-2026-03-26-93 after the analyst run documented that sandbox creation still treated many required post-onboarding mutations as best-effort side effects.

## What Was Learned

The safe contract for sandbox bootstrap is not "install OpenClaw, run onboarding, and wait for the gateway port." A truthful create flow also has to:

- separate required bootstrap mutations from optional browser-workspace enrichments
- fail closed when required writes such as gateway/tool/command settings, auth-profile writes, env-file writes, or gateway startup fail
- perform one deterministic verification read before yielding `result`

The implemented slice verifies the final required state directly from `~/.openclaw/openclaw.json` before sandbox persistence. This catches a different class of drift than process-exit checks alone: a config command may report success while the final persisted config still does not match the expected runtime contract.

## Evidence

- `ruh-backend/src/sandboxManager.ts`
  - now groups required create-time mutations into an explicit bootstrap sequence
  - treats `auth-profiles.json` and Gemini `supportsStore=false` patching as required in the API-key bootstrap path
  - fails sandbox creation on gateway token read, env-file write, gateway start, or verification mismatch before yielding `result`
  - keeps browser/VNC install + startup optional and visible through warning logs
- `ruh-backend/tests/unit/sandboxManager.test.ts`
  - proves a required bootstrap step failure yields `error` and no `result`
  - proves the happy path executes a final bootstrap verification call
  - proves browser-stack failure remains non-fatal when required config still verifies

## Implications For Future Agents

- When modifying sandbox bootstrap, add new required mutations to the same explicit apply + verify contract instead of introducing unchecked `await run(...)` calls after onboarding.
- If a future slice needs operator-visible degraded browser state, surface it as structured create metadata or persisted sandbox state instead of inferring it only from log text.
- Keep runtime verification bounded and deterministic; direct config reads are a stable first layer, while richer runtime probes can extend this contract later.

## Links

- [[003-sandbox-lifecycle]]
- [[004-api-reference]]
- [[010-deployment]]
- [[SPEC-sandbox-bootstrap-config-apply-contract]]
- [Journal entry](../../journal/2026-03-26.md)
