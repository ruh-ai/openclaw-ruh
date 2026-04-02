import {
  getEligibleCustomerMemberships,
  ensureCustomerSurfaceSession,
  type CustomerSessionMembership,
  type CustomerSurfaceSession,
} from "@/lib/auth/customer-session";

function makeMembership(
  overrides: Partial<CustomerSessionMembership> = {}
): CustomerSessionMembership {
  return {
    organizationId: "org-1",
    organizationName: "Acme",
    organizationSlug: "acme",
    organizationKind: "customer",
    organizationPlan: "pro",
    role: "owner",
    status: "active",
    ...overrides,
  };
}

describe("getEligibleCustomerMemberships", () => {
  test("returns memberships with customer kind, active status, and allowed role", () => {
    const session: CustomerSurfaceSession = {
      memberships: [
        makeMembership({ role: "owner" }),
        makeMembership({ organizationId: "org-2", role: "admin" }),
        makeMembership({ organizationId: "org-3", role: "employee" }),
      ],
    };
    const result = getEligibleCustomerMemberships(session);
    expect(result).toHaveLength(3);
  });

  test("excludes memberships with non-customer org kind", () => {
    const session: CustomerSurfaceSession = {
      memberships: [makeMembership({ organizationKind: "developer" })],
    };
    expect(getEligibleCustomerMemberships(session)).toHaveLength(0);
  });

  test("excludes memberships with inactive status", () => {
    const session: CustomerSurfaceSession = {
      memberships: [makeMembership({ status: "suspended" })],
    };
    expect(getEligibleCustomerMemberships(session)).toHaveLength(0);
  });

  test("excludes memberships with disallowed role", () => {
    const session: CustomerSurfaceSession = {
      memberships: [makeMembership({ role: "viewer" })],
    };
    expect(getEligibleCustomerMemberships(session)).toHaveLength(0);
  });

  test("returns empty array when session is null", () => {
    expect(getEligibleCustomerMemberships(null)).toEqual([]);
  });

  test("returns empty array when session is undefined", () => {
    expect(getEligibleCustomerMemberships(undefined)).toEqual([]);
  });

  test("returns empty array when memberships is null", () => {
    expect(getEligibleCustomerMemberships({ memberships: null })).toEqual([]);
  });

  test("returns empty array when memberships is empty", () => {
    expect(getEligibleCustomerMemberships({ memberships: [] })).toEqual([]);
  });
});

describe("ensureCustomerSurfaceSession", () => {
  test("returns session as-is when customer access is already true", async () => {
    const session: CustomerSurfaceSession = {
      appAccess: { admin: false, builder: false, customer: true },
      memberships: [makeMembership()],
    };
    const switchOrg = jest.fn();
    const result = await ensureCustomerSurfaceSession(session, switchOrg);
    expect(result).toBe(session);
    expect(switchOrg).not.toHaveBeenCalled();
  });

  test("calls switchOrganization with first eligible membership when no customer access", async () => {
    const session: CustomerSurfaceSession = {
      appAccess: { admin: false, builder: false, customer: false },
      memberships: [
        makeMembership({ organizationId: "org-42" }),
        makeMembership({ organizationId: "org-99" }),
      ],
    };
    const switched: CustomerSurfaceSession = {
      appAccess: { admin: false, builder: false, customer: true },
      memberships: session.memberships,
    };
    const switchOrg = jest.fn().mockResolvedValue(switched);

    const result = await ensureCustomerSurfaceSession(session, switchOrg);
    expect(switchOrg).toHaveBeenCalledWith("org-42");
    expect(result).toBe(switched);
  });

  test("returns session unchanged when no eligible memberships exist", async () => {
    const session: CustomerSurfaceSession = {
      appAccess: { admin: false, builder: false, customer: false },
      memberships: [makeMembership({ organizationKind: "developer" })],
    };
    const switchOrg = jest.fn();
    const result = await ensureCustomerSurfaceSession(session, switchOrg);
    expect(result).toBe(session);
    expect(switchOrg).not.toHaveBeenCalled();
  });

  test("returns session unchanged when appAccess is null and no eligible membership", async () => {
    const session: CustomerSurfaceSession = {
      appAccess: null,
      memberships: [],
    };
    const switchOrg = jest.fn();
    const result = await ensureCustomerSurfaceSession(session, switchOrg);
    expect(result).toBe(session);
    expect(switchOrg).not.toHaveBeenCalled();
  });
});
