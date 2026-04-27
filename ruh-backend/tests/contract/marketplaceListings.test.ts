/**
 * Contract tests: /api/marketplace/* endpoints must return documented response
 * shapes. These tests validate the API contract, not business logic.
 */

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

import { describe, expect, test, mock, beforeEach } from "bun:test";
import { makeSandboxRecord } from "../helpers/fixtures";
import { signAccessToken } from "../../src/auth/tokens";
import {
  orgsById,
  memberships,
  resetContractStores,
} from "../helpers/contractStoreMocks";

// ── Fake data ────────────────────────────────────────────────────────────────

function makeFakeListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-001",
    agentId: "agent-001",
    publisherId: "usr-001",
    ownerOrgId: "org-001",
    title: "Test Agent",
    slug: "test-agent",
    summary: "A test agent for contract testing",
    description: "Full description of the test agent.",
    category: "general",
    tags: ["test", "contract"],
    iconUrl: "https://example.com/icon.png",
    screenshots: ["https://example.com/ss1.png"],
    version: "1.0.0",
    status: "published",
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    installCount: 42,
    avgRating: 4.5,
    publishedAt: "2026-01-15T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockListPublished = mock(async () => ({
  items: [makeFakeListing()],
  total: 1,
}));
const mockGetBySlug = mock(async () => makeFakeListing());
const mockGetById = mock(async () => makeFakeListing());
const mockListInstalledListings = mock(async () => [
  {
    installId: "install-001",
    listingId: "listing-001",
    orgId: "org-customer-001",
    userId: "usr-customer-001",
    agentId: "agent-runtime-001",
    sourceAgentVersionId: "version-001",
    installedVersion: "1.0.0",
    installedAt: "2026-04-01T12:00:00.000Z",
    lastLaunchedAt: null,
    listing: makeFakeListing(),
  },
]);

mock.module("../../src/marketplaceStore", () => ({
  listPublishedListings: mockListPublished,
  getListingBySlug: mockGetBySlug,
  getListingById: mockGetById,
  createListing: mock(async () => makeFakeListing()),
  updateListing: mock(async () => makeFakeListing()),
  updateListingStatus: mock(async () => makeFakeListing()),
  listPendingListings: mock(async () => []),
  listUserListings: mock(async () => []),
  incrementInstallCount: mock(async () => {}),
  createReview: mock(async () => ({})),
  listReviews: mock(async () => []),
  createInstall: mock(async () => ({})),
  removeInstall: mock(async () => true),
  listUserInstalls: mock(async () => []),
  listInstalledListings: mockListInstalledListings,
  getInstall: mock(async () => null),
}));

// orgStore + organizationMembershipStore mocks live in
// tests/helpers/contractStoreMocks.ts. The customer org + membership for
// /my/installed-listings tests are seeded in beforeEach below.

// Required by app.ts — same pattern as existing contract tests
mock.module("../../src/store", () => ({
  getSandbox: mock(async () => makeSandboxRecord()),
  listSandboxes: mock(async () => []),
  deleteSandbox: mock(async () => false),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  initDb: mock(async () => {}),
}));

mock.module("../../src/conversationStore", () => ({
  getConversation: mock(async () => null),
  getConversationForSandbox: mock(async () => null),
  listConversations: mock(async () => []),
  listConversationsPage: mock(async () => ({ items: [], has_more: false, next_cursor: null })),
  createConversation: mock(async () => ({})),
  appendMessages: mock(async () => true),
  renameConversation: mock(async () => true),
  deleteConversation: mock(async () => true),
  getMessages: mock(async () => []),
  getMessagesPage: mock(async () => ({ messages: [], has_more: false, next_cursor: null })),
  initDb: mock(async () => {}),
}));

mock.module("../../src/sandboxManager", () => ({
  createOpenclawSandbox: mock(async function* () {}),
  PREVIEW_PORTS: [],
  reconfigureSandboxLlm: mock(async () => ({})),
  retrofitSandboxToSharedCodex: mock(async () => ({})),
  dockerExec: mock(async () => [true, "true"]),
  ensureInteractiveRuntimeServices: mock(async () => {}),
  getContainerName: (sandboxId: string) => `openclaw-${sandboxId}`,
  stopAndRemoveContainer: mock(async () => {}),
  restartGateway: mock(async () => [true, ""]),
  waitForGateway: mock(async () => true),
  sandboxExec: mock(async () => [0, ""]),
}));

mock.module("axios", () => ({
  default: { get: mock(async () => ({})), post: mock(async () => ({})) },
  get: mock(async () => ({})),
  post: mock(async () => ({})),
}));

// ─────────────────────────────────────────────────────────────────────────────

const { request } = await import("../helpers/app.ts?contractMarketplaceListings");

beforeEach(() => {
  mockListPublished.mockImplementation(async () => ({
    items: [makeFakeListing()],
    total: 1,
  }));
  mockGetBySlug.mockImplementation(async () => makeFakeListing());
  mockGetById.mockImplementation(async () => makeFakeListing());
  mockListInstalledListings.mockImplementation(async () => [
    {
      installId: "install-001",
      listingId: "listing-001",
      orgId: "org-customer-001",
      userId: "usr-customer-001",
      agentId: "agent-runtime-001",
      sourceAgentVersionId: "version-001",
      installedVersion: "1.0.0",
      installedAt: "2026-04-01T12:00:00.000Z",
      lastLaunchedAt: null,
      listing: makeFakeListing(),
    },
  ]);

  // Seed the shared org + membership state for requireActiveCustomerOrg.
  // /my/installed-listings checks the user's active customer org and a
  // valid membership; without these the route 403s.
  resetContractStores();
  orgsById.set("org-customer-001", {
    id: "org-customer-001",
    name: "Globex",
    slug: "globex",
    kind: "customer",
    plan: "free",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  memberships.push({
    id: "membership-001",
    orgId: "org-customer-001",
    userId: "usr-customer-001",
    role: "employee",
    status: "active",
    organizationName: "Globex",
    organizationSlug: "globex",
    organizationKind: "customer",
    organizationPlan: "free",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

function customerToken() {
  return signAccessToken({
    userId: "usr-customer-001",
    email: "customer@test.dev",
    role: "end_user",
    orgId: "org-customer-001",
  });
}

// ── Listing shape validator ─────────────────────────────────────────────────

function assertListingShape(listing: Record<string, unknown>) {
  expect(typeof listing.id).toBe("string");
  expect(typeof listing.title).toBe("string");
  expect(typeof listing.slug).toBe("string");
  expect(typeof listing.summary).toBe("string");
  expect(typeof listing.description).toBe("string");
  expect(typeof listing.category).toBe("string");
  expect(["string", "object"].includes(typeof listing.ownerOrgId)).toBe(true);
  expect(Array.isArray(listing.tags)).toBe(true);
  // iconUrl can be string or null
  expect(["string", "object"].includes(typeof listing.iconUrl)).toBe(true);
  expect(typeof listing.version).toBe("string");
  expect(typeof listing.status).toBe("string");
  expect(typeof listing.installCount).toBe("number");
  expect(typeof listing.avgRating).toBe("number");
  // publishedAt can be string or null
  expect(["string", "object"].includes(typeof listing.publishedAt)).toBe(true);
  expect(typeof listing.createdAt).toBe("string");
  expect(typeof listing.updatedAt).toBe("string");
}

// ── GET /api/marketplace/listings ───────────────────────────────────────────

describe("GET /api/marketplace/listings — response contract", () => {
  test("returns { items: MarketplaceListing[], total: number }", async () => {
    const res = await request().get("/api/marketplace/listings").expect(200);

    expect(typeof res.body.total).toBe("number");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  test("each item conforms to MarketplaceListing shape", async () => {
    const res = await request().get("/api/marketplace/listings").expect(200);

    for (const item of res.body.items) {
      assertListingShape(item as Record<string, unknown>);
    }
  });

  test("returns empty items array when no listings", async () => {
    mockListPublished.mockImplementation(async () => ({ items: [], total: 0 }));

    const res = await request().get("/api/marketplace/listings").expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(0);
    expect(res.body.total).toBe(0);
  });

  test("rejects invalid category with 400", async () => {
    const res = await request()
      .get("/api/marketplace/listings?category=nonexistent")
      .expect(400);

    expect(typeof res.body.detail).toBe("string");
  });
});

// ── GET /api/marketplace/listings/:slug ─────────────────────────────────────

describe("GET /api/marketplace/listings/:slug — response contract", () => {
  test("returns a single MarketplaceListing shape", async () => {
    const res = await request()
      .get("/api/marketplace/listings/test-agent")
      .expect(200);

    assertListingShape(res.body as Record<string, unknown>);
  });

  test("returns 404 when listing not found", async () => {
    mockGetBySlug.mockImplementation(async () => null);
    mockGetById.mockImplementation(async () => null);

    const res = await request()
      .get("/api/marketplace/listings/nonexistent-slug")
      .expect(404);

    expect(typeof res.body.detail).toBe("string");
  });

  test("falls back to ID lookup when slug not found", async () => {
    mockGetBySlug.mockImplementation(async () => null);
    // getById returns a valid listing
    mockGetById.mockImplementation(async () =>
      makeFakeListing({ id: "listing-by-id" }),
    );

    const res = await request()
      .get("/api/marketplace/listings/listing-by-id")
      .expect(200);

    assertListingShape(res.body as Record<string, unknown>);
  });
});

// ── GET /api/marketplace/categories ─────────────────────────────────────────

describe("GET /api/marketplace/categories — response contract", () => {
  test("returns { categories: string[] }", async () => {
    const res = await request().get("/api/marketplace/categories").expect(200);

    expect(typeof res.body.categories).toBe("object");
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThan(0);

    for (const cat of res.body.categories) {
      expect(typeof cat).toBe("string");
    }
  });

  test("includes known categories", async () => {
    const res = await request().get("/api/marketplace/categories").expect(200);

    const categories = res.body.categories as string[];
    expect(categories).toContain("general");
    expect(categories).toContain("marketing");
    expect(categories).toContain("engineering");
  });
});

// ── GET /api/marketplace/my/installed-listings ──────────────────────────────

describe("GET /api/marketplace/my/installed-listings — response contract", () => {
  test("returns installed listings for an authenticated customer user", async () => {
    const res = await request()
      .get("/api/marketplace/my/installed-listings")
      .set("Authorization", `Bearer ${customerToken()}`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({
        installId: "install-001",
        listingId: "listing-001",
        agentId: "agent-runtime-001",
        installedVersion: "1.0.0",
        installedAt: "2026-04-01T12:00:00.000Z",
      }),
    );
    assertListingShape(res.body.items[0].listing as Record<string, unknown>);
  });

  test("requires authentication", async () => {
    await request().get("/api/marketplace/my/installed-listings").expect(401);
  });
});
