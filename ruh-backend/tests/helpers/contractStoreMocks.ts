/**
 * Shared store mocks for contract tests — solves the "first-wins" mock-leakage
 * problem.
 *
 * Bun's mock.module() is process-global and first-call wins (see
 * tests/helpers/mockDb.ts for the same pattern applied to src/db). When two
 * contract test files each declare their own mock.module() for the same
 * store, only the alphabetically-first one takes effect; the second file's
 * mockGetOrg / mockGetMembershipForUserOrg become dangling symbols that
 * never receive calls. The result was tests like marketplace's
 * /my/installed-listings 403'ing because the route hit auth's mock instead
 * of marketplace's, with state seeded for auth's scenarios only.
 *
 * The fix: ONE place that calls mock.module('../../src/orgStore', …) and
 * mock.module('../../src/organizationMembershipStore', …). Each test file
 * imports the exported mock symbols + state Maps and resets them in its own
 * beforeEach.
 */

import { mock } from 'bun:test';

// ─── Org store ────────────────────────────────────────────────────────────

export const orgsById = new Map<string, Record<string, unknown>>();

export const mockGetOrg = mock(
  async (id: string) => orgsById.get(id) ?? null,
);
export const mockListOrgs = mock(
  async () => Array.from(orgsById.values()),
);
export const mockCreateOrg = mock(async () => null);

mock.module('../../src/orgStore', () => ({
  getOrg: mockGetOrg,
  listOrgs: mockListOrgs,
  createOrg: mockCreateOrg,
}));

// ─── Organization membership store ────────────────────────────────────────

export const memberships: Array<Record<string, unknown>> = [];

export const mockGetMembershipForUserOrg = mock(
  async (userId: string, orgId: string) =>
    memberships.find((m) => m.userId === userId && m.orgId === orgId) ?? null,
);
export const mockListMembershipsForUser = mock(
  async (userId: string) => memberships.filter((m) => m.userId === userId),
);
export const mockCreateMembership = mock(async () => null);

mock.module('../../src/organizationMembershipStore', () => ({
  getMembershipForUserOrg: mockGetMembershipForUserOrg,
  listMembershipsForUser: mockListMembershipsForUser,
  createMembership: mockCreateMembership,
}));

// ─── Per-test reset helper ────────────────────────────────────────────────

/** Clears all shared state. Call from beforeEach. */
export function resetContractStores(): void {
  orgsById.clear();
  memberships.length = 0;
}
