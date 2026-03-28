# SPEC: Backend Config Schema

[[000-INDEX|← Index]] | [[002-backend-overview]] | [[010-deployment]]

## Status
`implemented`

## Summary
`ruh-backend` currently reads environment variables directly across startup, request handling, sandbox bootstrap, and credential encryption. This spec defines one typed config module that validates the backend env contract at startup, applies documented defaults in one place, and makes runtime callers consume frozen typed values instead of ad hoc `process.env` access.

## Related Notes
- [[002-backend-overview]] — owns the backend startup/module contract and should point future endpoints and services at the shared config module
- [[010-deployment]] — documents the operator-facing environment contract, defaults, and startup-failure behavior
- [[001-architecture]] — provides the system-level context for why backend startup must fail fast before serving traffic
- [[LEARNING-2026-03-25-docker-daemon-readiness-gap]] — adjacent reliability work that depends on a stable startup contract

## Specification

### Goals

- Introduce one backend-owned module that parses, validates, and types every runtime env var the backend reads today
- Fail startup deterministically when required configuration is missing or malformed, before DB init, route setup side effects, or port binding
- Centralize documented defaults so runtime modules stop embedding fallback literals
- Give operators one canonical deployment/env reference that matches the runtime behavior exactly

### Non-goals

- Validating test-only env vars used exclusively by the Bun test harness
- Enforcing existence of optional host file paths when their absence is a supported "feature disabled" state
- Replacing runtime readiness checks such as Docker connectivity or DB migrations; this spec only defines configuration parsing

### Config module contract

- Add `ruh-backend/src/config.ts` that exports:
  - a typed `BackendConfig` interface
  - a frozen runtime config object returned by accessor helpers
  - a pure parser helper that tests can call with custom env input
- The parser must classify values as:
  - required
  - optional with default
  - optional nullable/disabled when absent
- Validation failures must be aggregated and thrown together so operators can fix all bad vars in one edit cycle

### Environment variable rules

#### Required

- `DATABASE_URL` — non-empty string

#### Optional with default

- `PORT` — valid integer port, default `8000`
- `ALLOWED_ORIGINS` — comma-separated origin list, default `http://localhost:3000`
- `OLLAMA_BASE_URL` — valid absolute URL, default `http://host.docker.internal:11434/v1`
- `OLLAMA_MODEL` — non-empty string, default `qwen3-coder:30b`
- `OPENCLAW_SHARED_OAUTH_JSON_PATH` — default `$HOME/.openclaw/credentials/oauth.json`
- `CODEX_AUTH_JSON_PATH` — default `$HOME/.codex/auth.json`
- `OPENCLAW_SHARED_CODEX_MODEL` — non-empty string, default `openai-codex/gpt-5.4`

#### Optional nullable / feature-disabled when absent

- `OPENCLAW_ADMIN_TOKEN`
- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `DISCORD_BOT_TOKEN`
- `AGENT_CREDENTIALS_KEY`

### Field-level validation

- URL fields must parse as absolute `http` or `https` URLs
- Port fields must be integers between `1` and `65535`
- Secret/token/model fields must be trimmed; blank strings are treated as unset unless the field is required
- `ALLOWED_ORIGINS` must normalize into a deduplicated array of valid absolute origins
- `AGENT_CREDENTIALS_KEY`, when present, must be exactly 64 hexadecimal characters so encryption never fails later at first use
- Path defaults should be normalized to absolute host paths, but optional-path non-existence should not fail startup by itself

### Runtime integration

- `src/index.ts` should load `.env` before importing startup/runtime modules that need the config parser
- `src/startup.ts` should read `config.port` and use `config` for the "no provider key configured" warning
- `src/db.ts`, `src/app.ts`, `src/sandboxManager.ts`, and `src/credentials.ts` should stop reading `process.env` directly and import typed fields from `config`
- New backend modules should treat `config.ts` as the only approved runtime env boundary

### Startup failure behavior

- Invalid config should abort startup with a single thrown error that lists each failing variable once
- The startup path must fail before the server starts listening
- Operator logs should clearly separate config errors from Docker/readiness/runtime errors so deployments are diagnosable

## Implementation Notes

- Primary runtime files: `ruh-backend/src/config.ts`, `ruh-backend/src/index.ts`, `ruh-backend/src/startup.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/db.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/credentials.ts`
- Tests should prefer the pure parser helper so env parsing can be verified without cross-test module cache leakage
- The deployment note should carry the canonical env table once this lands; keep it aligned with the config parser instead of hand-maintaining divergent defaults
- The shipped implementation keeps strict required-field enforcement for startup and DB init, but optional runtime lookups stay tolerant so non-startup modules can share the same config module without forcing unrelated required vars during isolated tests

## Test Plan

- Unit tests for the config parser covering required-missing, malformed values, defaults, trimming, and frozen-object behavior
- Startup tests proving `startBackend()` uses the typed config port and provider warning contract
- Module-level regression coverage for consumers that previously depended on direct `process.env` reads where the refactor changes behavior
- Focused backend verification command: `bun test tests/unit/config.test.ts tests/unit/startup.test.ts tests/unit/db.test.ts`
