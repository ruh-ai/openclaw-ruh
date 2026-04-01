# SPEC: Shared Codex OAuth Bootstrap

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle|Sandbox Lifecycle]] | [[010-deployment|Deployment]]

## Status

implemented

## Summary

New OpenClaw sandboxes should prefer a shared Codex/OpenClaw OAuth identity instead of per-sandbox API-key onboarding. The repo uses the unsafe shortcut the user requested: seed host OAuth state into each new sandbox, skip interactive provider setup, switch the default model to `openai-codex/gpt-5.4`, and live-probe the provider before declaring the sandbox ready.

## Related Notes

- [[003-sandbox-lifecycle]] — sandbox creation flow now seeds shared auth before model probing
- [[008-agent-builder-ui]] — builder bridge still uses gateway bearer auth, but its target gateway should be bootstrapped with the same Codex-auth convention
- [[010-deployment]] — new env vars document where shared OAuth/Codex auth state is sourced from
- [[001-architecture]] — model auth and gateway auth remain separate concerns
- [[SPEC-shared-codex-retrofit]] — extends the same shared-auth convention to already-running sandboxes and the standalone builder gateway

## Specification

### Bootstrap precedence

When creating a sandbox:

1. Prefer host `~/.openclaw/credentials/oauth.json` if present or explicitly configured.
2. Otherwise fall back to host `~/.codex/auth.json` if present or explicitly configured.
3. If neither exists, fall back to the legacy API-key/Ollama onboarding behavior.

### Shared-auth sandbox flow

For sandboxes using shared Codex auth:

1. Copy the selected host auth file into the container.
2. Run `openclaw onboard --non-interactive ... --auth-choice skip`.
3. Set `agents.defaults.model.primary` to `openai-codex/gpt-5.4` unless overridden.
4. Run `openclaw models status --probe --probe-provider openai-codex --json`.
5. Fail sandbox creation if the live probe does not succeed.

### Builder gateway

The `agent-builder-ui` route keeps using OpenClaw gateway bearer auth. This spec does not replace `OPENCLAW_GATEWAY_TOKEN`; instead it documents that the architect gateway it points to should itself be bootstrapped with the same shared Codex-auth convention.

## Implementation Notes

- `[[003-sandbox-lifecycle]]` is implemented in `ruh-backend/src/sandboxManager.ts` by resolving shared auth from explicit paths, environment variables, or default host files; seeding that state into the container; onboarding with `--auth-choice skip`; setting `agents.defaults.model.primary`; and live-probing `openai-codex` before the sandbox is considered ready.
- `ruh-backend/tests/unit/sandboxManager.test.ts` covers the fallback from missing OpenClaw OAuth state to Codex CLI auth and the precedence rule when both files are present.
- `[[008-agent-builder-ui]]` is unchanged in code for this feature: the builder bridge still authenticates to the architect gateway with `OPENCLAW_GATEWAY_TOKEN`, and the gateway itself must be bootstrapped separately with the same shared-auth convention.

## Test Plan

- `cd ruh-backend && bun test ./tests/unit/sandboxManager.test.ts`
- `cd ruh-backend && bun x tsc --noEmit`
- Disposable Docker smoke test: copy host Codex auth into a temporary sandbox, run non-interactive onboarding with `--auth-choice skip`, set the default model to `openai-codex/gpt-5.4`, and verify `openclaw models status --probe --probe-provider openai-codex --json` succeeds.
