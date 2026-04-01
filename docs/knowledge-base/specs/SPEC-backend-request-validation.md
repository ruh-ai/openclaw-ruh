# SPEC: Backend Request Validation

[[000-INDEX|← Index]] | [[002-backend-overview]] | [[004-api-reference]]

## Status
`draft`

## Summary
`ruh-backend` currently relies on route-local coercion and downstream failures for several write and proxy endpoints. This spec defines a shared request-validation boundary so malformed, unknown, or oversized payloads fail fast with deterministic 4xx responses before persistence, `docker exec`, or gateway proxying begins.

## Related Notes
- [[002-backend-overview]] — defines where the shared validator layer should live and how routes should use it
- [[004-api-reference]] — must describe the enforced request contract and validation-error shape
- [[LEARNING-2026-03-25-backend-request-validation-gap]] — captures the inspection that motivated this spec

## Specification

### Goals

- Introduce one reusable runtime validation layer for `req.params`, `req.query`, and `req.body`
- Reject malformed input before store writes, cron shell command assembly, or gateway forwarding
- Make validation failures deterministic and documented instead of depending on downstream exceptions
- Keep the initial implementation bounded to the highest-risk write and proxy routes already identified in [[TODOS]]

### Non-goals

- Rewriting every existing read-only endpoint in the first pass
- Changing persistence schemas or feature semantics beyond request-boundary enforcement
- Forcing the chat proxy into a fully custom request format when gateway compatibility still matters

### Shared validation contract

#### Runtime validator module

- Add a shared backend module under `ruh-backend/src/` that parses route params, query strings, and JSON bodies with explicit schemas.
- Route handlers should consume parsed values from that module instead of reading `req.body` or `req.params` directly once a route is covered by this spec.
- Validation should happen before any side effects such as DB writes, Docker commands, or outbound gateway requests.

#### Unknown-field policy

- Persisted write endpoints should be strict by default: reject unknown top-level keys unless the schema explicitly allows passthrough fields.
- Nested objects should also be strict unless the route explicitly documents an open-ended map.
- The chat proxy remains the main intentional passthrough exception, but its allowed flexibility must still be bounded by a minimal backend-owned schema.

#### Size and shape limits

- Replace the bare `express.json()` call with an explicit JSON size limit that is documented and shared by covered routes.
- Covered schemas must define bounded string sizes for names, descriptions, message text, soul content, and cron payload text.
- Arrays such as `skills`, `cron_jobs`, and persisted workflow collections must enforce maximum lengths and object-shape validation.

#### Error behavior

- Validation failures must return the standard backend error envelope: `{ "detail": "..." }`.
- Use `400` when the request is structurally malformed or missing a required field.
- Use `422` when JSON parses successfully but violates a documented semantic constraint such as enum membership, length bounds, or unknown-field rejection.
- Error messages should identify the failing field or constraint without echoing oversized payloads, secrets, or raw downstream internals.

### Initial route coverage

#### Agent persistence routes

Cover these routes in the first implementation pass:

- `POST /api/agents`
- `PATCH /api/agents/:id`
- `PATCH /api/agents/:id/config`
- `POST /api/agents/:id/sandbox`

Contract notes:

- Agent IDs in params must be validated before store access.
- `POST /api/agents` must require a non-empty `name` and reject undocumented persisted fields.
- `PATCH /api/agents/:id` must allow only documented partial metadata updates.
- `PATCH /api/agents/:id/config` must validate workflow, skill graph, and related config payload shape before persistence.
- `POST /api/agents/:id/sandbox` must require a non-empty `sandbox_id` string and reject extra keys.

#### Sandbox configure-agent push

Cover `POST /api/sandboxes/:sandbox_id/configure-agent` in the first pass.

Contract notes:

- `system_name`, `soul_content`, `skills`, and `cron_jobs` must have explicit schemas and bounded sizes.
- `skills` entries must validate identifier-safe `skill_id` values plus required `name` and `description` fields.
- `cron_jobs` entries must validate `name`, `schedule`, and `message` before any `openclaw cron add` command is assembled.
- The route must reject malformed arrays and unexpected object keys instead of silently iterating partial objects.

#### Cron create/edit routes

Cover these routes in the first implementation pass:

- `POST /api/sandboxes/:sandbox_id/crons`
- `PATCH /api/sandboxes/:sandbox_id/crons/:job_id`

Contract notes:

- `schedule.kind` must be limited to `cron`, `every`, or `at`.
- Each schedule variant must require its matching field (`expr`, `everyMs`, or `at`) and reject incompatible fields.
- `payload.kind` must be limited to `agentTurn` or `systemEvent`.
- `session_target` and `wake_mode` must be validated against explicit allowed values before command construction.
- `description`, `message`, and `text` fields must enforce bounded sizes.

#### Chat proxy boundary

Cover `POST /api/sandboxes/:sandbox_id/chat` with a minimal backend-owned schema in the first pass.

Contract notes:

- Preserve the OpenAI-compatible gateway payload shape for supported chat completions fields.
- Continue allowing provider-specific chat request fields only if the backend intentionally documents them as passthrough.
- Validate `conversation_id` as an optional string and strip it before forwarding.
- Reject obviously malformed payloads such as non-object bodies, missing `messages`, or oversized chat payloads before calling the gateway.
- Do not broaden this route into a custom API unless future product requirements justify it.

### Read and lower-risk routes

- Read-only endpoints may remain on the current ad hoc parsing path until the first covered write/proxy routes are complete.
- After the initial pass lands, future endpoint work should adopt the shared validator by default rather than adding new ad hoc coercion.

## Implementation Notes

- Primary implementation surface: `ruh-backend/src/app.ts` plus a new shared validation helper/module under `ruh-backend/src/`
- API docs updates must accompany runtime enforcement in [[004-api-reference]]
- Backend architecture guidance in [[002-backend-overview]] should tell future agents to use the shared validator for new endpoints
- This spec intentionally precedes any broad refactor so the validator contract is stable before route-by-route migration

## Test Plan

- Add focused validator unit tests for accepted and rejected payload variants
- Add integration or security tests proving invalid payloads fail before persistence, Docker exec, or gateway forwarding
- Verify covered routes return deterministic `400` or `422` responses with the standard `{ "detail": "..." }` envelope
- Run the narrowest relevant verification command for the specific documentation or implementation slice completed in a given run
