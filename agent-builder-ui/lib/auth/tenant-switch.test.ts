import { describe, expect, test } from "bun:test";

import { ensureBuilderSurfaceSession } from "./tenant-switch";

describe("ensureBuilderSurfaceSession", () => {
  test("returns the current session when builder access is already active", async () => {
    const session = {
      appAccess: { admin: false, builder: true, customer: false },
      memberships: [
        {
          organizationId: "org-dev",
          organizationKind: "developer",
          role: "owner",
          status: "active",
        },
      ],
    };

    const result = await ensureBuilderSurfaceSession(session, async () => {
      throw new Error("should not switch");
    });

    expect(result).toBe(session);
  });

  test("switches into the first eligible developer membership when needed", async () => {
    const session = {
      appAccess: { admin: false, builder: false, customer: true },
      memberships: [
        {
          organizationId: "org-customer",
          organizationKind: "customer",
          role: "admin",
          status: "active",
        },
        {
          organizationId: "org-dev",
          organizationKind: "developer",
          role: "developer",
          status: "active",
        },
      ],
    };

    const result = await ensureBuilderSurfaceSession(session, async (organizationId) => ({
      switchedTo: organizationId,
    }));

    expect(result).toEqual({ switchedTo: "org-dev" });
  });

  test("leaves the session unchanged when no eligible developer membership exists", async () => {
    const session = {
      appAccess: { admin: false, builder: false, customer: true },
      memberships: [
        {
          organizationId: "org-customer",
          organizationKind: "customer",
          role: "employee",
          status: "active",
        },
      ],
    };

    const result = await ensureBuilderSurfaceSession(session, async () => {
      throw new Error("should not switch");
    });

    expect(result).toBe(session);
  });
});
