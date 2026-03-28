# SPEC: Sandbox Bootstrap Config Apply Contract

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle]] | [[004-api-reference]]

## Status

implemented

## Summary

Sandbox creation must stop treating required post-onboarding bootstrap commands as unchecked best-effort side effects. A sandbox should only emit a normal create `result` after the required gateway, tool, and command-profile mutations have been applied and verified; optional browser-workspace setup may degrade explicitly without pretending the full browser stack is available.

## Related Notes

- [[003-sandbox-lifecycle]] — documents the ordered sandbox create flow and which runtime capabilities are guaranteed before the sandbox is persisted
- [[004-api-reference]] — documents the sandbox-create SSE behavior and the meaning of `result` versus `error`
- [[010-deployment]] — explains which runtime capabilities are required for a healthy created sandbox and which browser enrichments are optional in local/prod environments
- [[SPEC-shared-codex-oauth-bootstrap]] — shared-auth bootstrap remains a prerequisite before config-apply verification
- [[SPEC-agent-config-apply-contract]] — mirrors the same fail-closed, verified-apply pattern used for pushing saved agent config into running sandboxes

## Specification

### Problem Statement

`createOpenclawSandbox()` currently verifies image pull, container launch, OpenClaw install, onboarding, and eventual gateway port health, but most of the post-onboarding runtime contract is still unchecked. Required config writes such as:

- `gateway.bind`
- `gateway.controlUi.allowedOrigins`
- `gateway.trustedProxies`
- `gateway.controlUi.allowInsecureAuth`
- `gateway.http.endpoints.chatCompletions.enabled`
- `browser.noSandbox`
- `browser.headless`
- `tools.profile`
- `commands.native`
- `commands.nativeSkills`

can fail silently while sandbox creation still yields `result` and persists a record. The same gap exists for writing `~/.openclaw/.env` and for proving the required config actually landed in the runtime config.

### Contract Goals

- A normal sandbox-create `result` means the required bootstrap config contract was applied and verified, not just that the gateway port eventually opened.
- Required bootstrap mutations fail closed: the generator emits `error` and no normal sandbox record is persisted.
- Optional browser-workspace enrichments remain explicitly best-effort and must surface bounded warning logs when they degrade.
- Diagnostics stay client-safe and bounded.

### Required Vs Optional Bootstrap Steps

Required steps before `result`:

1. OpenClaw install and onboarding succeed.
2. Shared Codex model/probe succeeds when shared auth is used.
3. Required runtime config mutations succeed:
   - gateway bind + control UI access settings
   - chat completions endpoint enablement
   - browser execution mode flags used by the repo (`browser.noSandbox`, `browser.headless`)
   - tool/command profile flags (`tools.profile`, `commands.native`, `commands.nativeSkills`)
4. Gateway token read succeeds.
5. `~/.openclaw/.env` write succeeds when env vars are being forwarded.
6. Gateway start succeeds and the gateway becomes healthy.
7. One verification pass confirms the required config values resolved to the expected state.

Optional, degradable steps:

- Browser/VNC package installation
- Xvfb/x11vnc/websockify startup
- VNC port exposure

Failure of optional steps must not block ordinary chat-capable sandbox creation, but it must be obvious in logs that the live browser workspace is unavailable.

### SSE / Persistence Contract

- `result` is emitted only after the required bootstrap verification succeeds.
- When a required bootstrap step fails, the generator emits `error` with a bounded message and the partial container is cleaned up.
- Sandbox-create provisioning is not cancelled by an SSE client disconnect. Once the route starts consuming `createOpenclawSandbox()`, transport loss must only stop event delivery to that client, not abort the generator before `result` / persistence can happen.
- The existing route behavior of persisting sandboxes only on `result` remains valid under this contract; no extra degraded persistence state is required for the first slice.

### Verification Contract

The backend must execute one deterministic verification read after required config writes and before emitting `result`. The first slice may verify by reading OpenClaw config values directly from the container and comparing them against the expected settings.

The verification step must prove at minimum:

- the gateway/network settings match the repo contract
- chat completions are enabled
- the browser/tool/command profile settings match the expected values

If any required value is missing or mismatched, sandbox creation fails closed.

## Implementation Notes

- Primary implementation lives in [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/sandboxManager.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/sandboxManager.ts).
- The shipped slice introduces explicit required bootstrap steps for gateway, browser execution mode, and command/tool profile settings, then runs a config verification read before `result`.
- That verification read must itself be shell-safe. Passing a JSON-stringified multiline script directly to `node -e` inside `docker exec ... bash -c` can fail before any config comparison runs; see [[LEARNING-2026-03-27-sandbox-bootstrap-verify-node-e-shell-quoting]].
- The SSE route must use safe writes for `log` / `result` / `approved` / `error` / `done` so a closed client socket does not unwind the async generator and strand a partially built container without a persisted sandbox record.
- API-key bootstrap now treats `auth-profiles.json` writes and the Gemini `supportsStore=false` compat patch as required setup rather than unchecked best-effort side effects.
- Browser/VNC package install and service startup remain optional; they emit warning logs but do not block ordinary chat-capable creation.
- Sandbox creation should inspect `node:22-bookworm` locally and only pull the image when it is missing, so repeated local deploys do not block on unnecessary registry pulls.
- Regression coverage belongs in [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/tests/unit/sandboxManager.test.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/tests/unit/sandboxManager.test.ts) and the narrowest stable create-route test layer that can prove a required-step failure no longer produces `result`.
- The route in [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/app.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/app.ts) should not need new persistence logic if the generator stops yielding `result` on required-step failure.

## Test Plan

- Unit test: a required bootstrap config-set failure yields `error`, does not yield `result`, and cleans up the container.
- Unit test: optional browser-stack installation failure only emits a warning and still yields `result` after the required config verification passes.
- Unit test: successful create path executes the verification read before yielding `result`.
- Route/E2E test: the sandbox-create SSE stream does not emit `result` when the mocked generator reports a required bootstrap failure.
- Route/E2E test: disconnecting the SSE client after early `log` events does not stop the backend from persisting the sandbox on a later `result`.
- Unit test: cached local images skip the `docker pull node:22-bookworm` step, while a missing image still triggers a pull before container create.
