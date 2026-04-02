import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock dependencies
mock.module("@/services/axios", () => ({
  default: {
    get: mock(() => Promise.resolve({ data: {} })),
    post: mock(() => Promise.resolve({ data: {} })),
  },
}));

mock.module("@/lib/auth/app-access", () => ({
  assertBuilderAppAccess: mock(() => {}),
}));

mock.module("@/app/api/auth", () => ({
  switchBuilderOrganizationRequest: mock(async () => ({})),
}));

mock.module("@/lib/auth/tenant-switch", () => ({
  ensureBuilderSurfaceSession: mock(async (session: unknown) => session),
}));

describe("mapCurrentUser", () => {
  test("maps backend response to User shape", async () => {
    const { mapCurrentUser } = await import("./user");

    const user = mapCurrentUser({
      id: "user-1",
      email: "alice@example.com",
      displayName: "Alice Smith",
      avatarUrl: "https://example.com/avatar.png",
      role: "developer",
      platformRole: "user",
      activeOrganization: {
        id: "org-1",
        name: "Acme Corp",
        slug: "acme",
        kind: "developer",
        plan: "pro",
      },
      activeMembership: null,
      memberships: [],
      appAccess: { admin: false, builder: true, customer: false },
    });

    expect(user.id).toBe("user-1");
    expect(user.fullName).toBe("Alice Smith");
    expect(user.email).toBe("alice@example.com");
    expect(user.company).toBe("Acme Corp");
    expect(user.profileImage).toBe("https://example.com/avatar.png");
    expect(user.platformRole).toBe("user");
    expect(user.activeOrganization?.slug).toBe("acme");
  });

  test("uses email as fullName when displayName is empty", async () => {
    const { mapCurrentUser } = await import("./user");

    const user = mapCurrentUser({
      id: "user-2",
      email: "bob@example.com",
      displayName: "",
      role: "developer",
      appAccess: { admin: false, builder: true, customer: false },
    });

    expect(user.fullName).toBe("bob@example.com");
  });

  test("handles null avatarUrl", async () => {
    const { mapCurrentUser } = await import("./user");

    const user = mapCurrentUser({
      id: "user-3",
      email: "carol@example.com",
      displayName: "Carol",
      avatarUrl: null,
      role: "developer",
      appAccess: { admin: false, builder: true, customer: false },
    });

    expect(user.profileImage).toBeUndefined();
  });

  test("defaults memberships to empty array when missing", async () => {
    const { mapCurrentUser } = await import("./user");

    const user = mapCurrentUser({
      id: "user-4",
      email: "dan@example.com",
      displayName: "Dan",
      role: "developer",
      appAccess: { admin: false, builder: true, customer: false },
    });

    expect(user.memberships).toEqual([]);
    expect(user.activeMembership).toBeNull();
    expect(user.activeOrganization).toBeNull();
  });

  test("defaults platformRole to 'user' when missing", async () => {
    const { mapCurrentUser } = await import("./user");

    const user = mapCurrentUser({
      id: "user-5",
      email: "eve@example.com",
      displayName: "Eve",
      role: "admin",
      appAccess: { admin: false, builder: true, customer: false },
    });

    expect(user.platformRole).toBe("user");
  });
});
