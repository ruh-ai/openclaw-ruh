# Local Test User Seeding Design

## Goal

Provide one rerunnable local command that seeds a complete multi-tenant QA account matrix into the real backend database so the platform can be tested without real SSO.

## Recommended Approach

Use an idempotent backend-owned seed module plus a thin CLI script.

Why this approach:
- it matches the current auth schema directly
- it can update existing rows instead of duplicating them
- it is easy to test with integration coverage
- it avoids fragile one-off SQL or manual UI setup

## Fixture Shape

- `admin@ruh.test` as the global platform admin
- developer org A: owner + developer + cross-org developer member
- developer org B: owner
- customer org A: admin + two employees + cross-org employee member
- customer org B: admin + employee
- one shared password for every account

## Data Rules

- developer-facing users keep legacy global role `developer`
- customer-facing users keep legacy global role `end_user`
- platform admin keeps legacy global role `admin`
- every seeded email gets a `local` auth identity
- memberships must always be `active`
- reruns must update password hash and display data in place

## Verification

- integration tests prove idempotency and password rotation
- the seed script runs against the local DB
- the final output prints the login matrix for manual QA
