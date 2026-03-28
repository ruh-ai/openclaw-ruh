# LEARNING: Backend config startup/runtime split

[[000-INDEX|← Index]] | [[002-backend-overview]] | [[SPEC-backend-config-schema]]

## Context

`ruh-backend` moved scattered env reads into `src/config.ts` so startup, DB init, sandbox bootstrap, and credential encryption consume one typed config contract.

## What Changed

- Startup and DB initialization now use strict config parsing that requires `DATABASE_URL` and aggregates malformed values before the process listens.
- Non-startup modules such as `sandboxManager.ts` and `credentials.ts` still read through the same config module, but via a tolerant accessor that does not force unrelated required vars during isolated tests or optional helper execution.

## Why It Matters

- A single strict parser for every caller caused `sandboxManager` unit coverage to fail because optional shared-auth lookups inherited the startup-only `DATABASE_URL` requirement.
- Keeping one module but separating strict-startup parsing from tolerant runtime lookup preserves the single source of truth without making unrelated helpers impossible to test in isolation.

## Guidance

- Use strict config parsing for startup paths, DB init, and any code that cannot function without the required env contract.
- Use the tolerant runtime accessor for modules that only need optional config fields and may run in isolated tests without the full backend startup env.
- Do not reintroduce direct `process.env` reads in backend source; extend `src/config.ts` instead.

## Related Notes

- [[002-backend-overview]] — documents `config.ts` as the backend env boundary
- [[010-deployment]] — documents the operator-facing env table and startup failure behavior
- [[SPEC-backend-config-schema]] — captures the centralized config contract
