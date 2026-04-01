# SPEC: Local Test User Seeding

[[000-INDEX|← Index]] | [[014-auth-system]]

## Status

implemented

## Summary

Local QA now needs a stable account matrix that covers platform admin, developer organizations, customer organizations, employees, and cross-org membership without requiring real SSO setup. This spec adds an idempotent backend seed path that can populate those users directly into the local database, keep one shared password for manual testing, and be rerun safely as the auth schema evolves.

## Related Notes

- [[014-auth-system]] — seeded users must follow the live local auth, org membership, and active-org session model
- [[005-data-models]] — the seed path writes `users`, `organizations`, `organization_memberships`, and `auth_identities`

## Specification

### Goals

1. Provide one repeatable command that seeds all required local QA users.
2. Cover the key tenancy contexts:
   - platform admin
   - developer org owners and developers
   - customer org admins and employees
   - one cross-org user for active-org switching tests
3. Use a single shared password for local manual testing.
4. Be idempotent so rerunning the command updates the fixture instead of duplicating rows.
5. Print the seeded credentials in a copyable format after execution.

### Non-goals

- This seed path does not create real SSO identities or enterprise IdP config.
- This seed path does not create marketplace purchases, agent entitlements, or employee-to-agent assignments.
- This seed path is for local/dev QA, not production bootstrap.

### Seed Contract

- Backend script entrypoint: `ruh-backend/scripts/seed-test-users.ts`
- Backend implementation module: importable so integration tests can call it directly
- Default shared password: `RuhTest123`, overridable by env
- The seed must ensure:
  - required orgs exist with the correct `kind`
  - required users exist with the correct legacy global `role`
  - required org memberships exist and stay `active`
  - `local` auth identities exist for every seeded email
  - reruns update password hashes, display names, legacy roles, and primary `org_id` fields

### Seed Matrix

- Platform:
  - `admin@ruh.test`
- Developer orgs:
  - one developer org with owner + developer
  - one second developer org with owner
- Customer orgs:
  - one customer org with admin + two employees
  - one second customer org with admin + one employee
- Cross-org:
  - one user with developer-org membership and customer-org membership for org-switch testing

## Implementation Notes

- Keep the seed logic backend-owned and DB-aware instead of issuing multiple HTTP register calls
- Prefer one importable seeding function plus a thin CLI wrapper
- Integration coverage should prove:
  - the expected rows are created
  - reruns do not duplicate rows
  - reruns can rotate the shared password
- Implemented files:
  - `ruh-backend/src/testUserSeed.ts`
  - `ruh-backend/scripts/seed-test-users.ts`
  - `ruh-backend/tests/integration/testUserSeed.test.ts`
  - `ruh-backend/package.json` via `bun run seed:test-users`

## Test Plan

- Integration test: seed once and assert expected user/org/membership/identity counts and key roles
- Integration test: seed twice and assert counts stay stable while the password hash matches the newest password
- Manual verification: run the seed command against the local DB, log in through the local builder auth fallback, and confirm the printed credentials work
