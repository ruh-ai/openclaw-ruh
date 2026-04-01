/**
 * Unit tests for src/marketplaceStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({
  rows: [],
  rowCount: 0,
}));
const mockClient = { query: mockQuery };

mock.module("../../src/db", () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) =>
    fn(mockClient),
}));

// Mock uuid to return deterministic IDs
mock.module("uuid", () => ({
  v4: () => "test-uuid-1234-5678-9abc-def012345678",
}));

import * as marketplaceStore from "../../src/marketplaceStore";

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── slugify ──────────────────────────────────────────────────────────────────

describe("slugify", () => {
  test("converts title to lowercase hyphen-separated slug", () => {
    expect(marketplaceStore.slugify("My Cool Agent")).toBe("my-cool-agent");
  });

  test("strips special characters", () => {
    expect(marketplaceStore.slugify("Agent @#$ Builder!")).toBe(
      "agent-builder",
    );
  });

  test("collapses multiple spaces and hyphens", () => {
    expect(marketplaceStore.slugify("  too   many   spaces  ")).toBe(
      "too-many-spaces",
    );
  });

  test("handles empty string", () => {
    expect(marketplaceStore.slugify("")).toBe("");
  });

  test("handles already-slugified text", () => {
    expect(marketplaceStore.slugify("already-a-slug")).toBe("already-a-slug");
  });
});

// ── createListing ────────────────────────────────────────────────────────────

describe("createListing", () => {
  test("inserts a listing with correct parameters", async () => {
    const fakeRow = {
      id: "test-uuid-1234-5678-9abc-def012345678",
      agent_id: "agent-1",
      publisher_id: "user-1",
      title: "Test Agent",
      slug: "test-agent-test-uui",
      summary: "A test agent",
      description: "Longer description",
      category: "engineering",
      tags: '["ai", "test"]',
      icon_url: null,
      screenshots: "[]",
      version: "1.0.0",
      status: "draft",
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      install_count: 0,
      avg_rating: 0,
      published_at: null,
      created_at: "2026-03-28T00:00:00Z",
      updated_at: "2026-03-28T00:00:00Z",
    };
    mockQuery.mockImplementation(async () => ({
      rows: [fakeRow],
      rowCount: 1,
    }));

    const listing = await marketplaceStore.createListing({
      agentId: "agent-1",
      publisherId: "user-1",
      title: "Test Agent",
      summary: "A test agent",
      description: "Longer description",
      category: "engineering",
      tags: ["ai", "test"],
    });

    expect(listing.id).toBe("test-uuid-1234-5678-9abc-def012345678");
    expect(listing.agentId).toBe("agent-1");
    expect(listing.publisherId).toBe("user-1");
    expect(listing.ownerOrgId).toBeNull();
    expect(listing.title).toBe("Test Agent");
    expect(listing.category).toBe("engineering");
    expect(listing.status).toBe("draft");

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO marketplace_listings");
  });

  test("uses default values when optional fields omitted", async () => {
    const fakeRow = {
      id: "test-uuid-1234-5678-9abc-def012345678",
      agent_id: "agent-1",
      publisher_id: "user-1",
      title: "Minimal Agent",
      slug: "minimal-agent-test-uui",
      summary: "",
      description: "",
      category: "general",
      tags: "[]",
      icon_url: null,
      screenshots: "[]",
      version: "1.0.0",
      status: "draft",
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      install_count: 0,
      avg_rating: 0,
      published_at: null,
      created_at: "2026-03-28T00:00:00Z",
      updated_at: "2026-03-28T00:00:00Z",
    };
    mockQuery.mockImplementation(async () => ({
      rows: [fakeRow],
      rowCount: 1,
    }));

    const listing = await marketplaceStore.createListing({
      agentId: "agent-1",
      publisherId: "user-1",
      title: "Minimal Agent",
    });

    expect(listing.summary).toBe("");
    expect(listing.category).toBe("general");
    expect(listing.version).toBe("1.0.0");

    // Check that defaults were passed to the query
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain(""); // summary default
    expect(params).toContain("general"); // category default
    expect(params).toContain("1.0.0"); // version default
  });
});

// ── getListingById ───────────────────────────────────────────────────────────

describe("getListingById", () => {
  test("returns null when listing not found", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await marketplaceStore.getListingById("nonexistent");
    expect(result).toBeNull();
  });

  test("queries by id", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await marketplaceStore.getListingById("listing-123");
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("WHERE id = $1");
    expect(mockQuery.mock.calls[0][1]).toEqual(["listing-123"]);
  });
});

// ── getListingBySlug ─────────────────────────────────────────────────────────

describe("getListingBySlug", () => {
  test("returns null when slug not found", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await marketplaceStore.getListingBySlug("nonexistent-slug");
    expect(result).toBeNull();
  });

  test("queries by slug", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await marketplaceStore.getListingBySlug("my-cool-agent-abc12345");
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("WHERE slug = $1");
    expect(mockQuery.mock.calls[0][1]).toEqual(["my-cool-agent-abc12345"]);
  });
});

// ── listPublishedListings ────────────────────────────────────────────────────

describe("listPublishedListings", () => {
  test("filters by published status", async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{ count: "0" }],
      rowCount: 1,
    }));
    await marketplaceStore.listPublishedListings();

    // First call is COUNT, second is SELECT
    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain("status = 'published'");
  });

  test("adds category filter when provided", async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{ count: "0" }],
      rowCount: 1,
    }));
    await marketplaceStore.listPublishedListings({ category: "engineering" });

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain("category = $1");
    expect(mockQuery.mock.calls[0][1]).toEqual(["engineering"]);
  });

  test("adds search filter when provided", async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{ count: "0" }],
      rowCount: 1,
    }));
    await marketplaceStore.listPublishedListings({ search: "cool" });

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain("ILIKE");
    expect(mockQuery.mock.calls[0][1]).toEqual(["%cool%"]);
  });
});

// ── listPendingListings ──────────────────────────────────────────────────────

describe("listPendingListings", () => {
  test("queries for pending_review status", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await marketplaceStore.listPendingListings();
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'pending_review'");
  });
});

describe("listOrgListings", () => {
  test("queries by owner organization id", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await marketplaceStore.listOrgListings("org-123");
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("WHERE owner_org_id = $1");
    expect(mockQuery.mock.calls[0][1]).toEqual(["org-123"]);
  });
});

// ── updateListing ────────────────────────────────────────────────────────────

describe("updateListing", () => {
  test("builds dynamic SET clause for provided fields", async () => {
    const fakeRow = {
      id: "listing-1",
      agent_id: "agent-1",
      publisher_id: "user-1",
      title: "Updated Title",
      slug: "test-slug",
      summary: "",
      description: "",
      category: "general",
      tags: "[]",
      icon_url: null,
      screenshots: "[]",
      version: "1.0.0",
      status: "draft",
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      install_count: 0,
      avg_rating: 0,
      published_at: null,
      created_at: "2026-03-28T00:00:00Z",
      updated_at: "2026-03-28T00:00:00Z",
    };
    mockQuery.mockImplementation(async () => ({
      rows: [fakeRow],
      rowCount: 1,
    }));

    await marketplaceStore.updateListing("listing-1", {
      title: "Updated Title",
      category: "data",
    });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("UPDATE marketplace_listings SET");
    expect(sql).toContain("title = $1");
    expect(sql).toContain("category = $2");
    expect(sql).toContain("updated_at = NOW()");
  });
});

// ── updateListingStatus ──────────────────────────────────────────────────────

describe("updateListingStatus", () => {
  test("sets published_at when status is published", async () => {
    const fakeRow = {
      id: "listing-1",
      agent_id: "agent-1",
      publisher_id: "user-1",
      title: "My Agent",
      slug: "my-agent",
      summary: "",
      description: "",
      category: "general",
      tags: "[]",
      icon_url: null,
      screenshots: "[]",
      version: "1.0.0",
      status: "published",
      review_notes: "looks good",
      reviewed_by: "admin-1",
      reviewed_at: "2026-03-28T00:00:00Z",
      install_count: 0,
      avg_rating: 0,
      published_at: "2026-03-28T00:00:00Z",
      created_at: "2026-03-28T00:00:00Z",
      updated_at: "2026-03-28T00:00:00Z",
    };
    mockQuery.mockImplementation(async () => ({
      rows: [fakeRow],
      rowCount: 1,
    }));

    await marketplaceStore.updateListingStatus(
      "listing-1",
      "published",
      "admin-1",
      "looks good",
    );

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("published_at = COALESCE(published_at, NOW())");
    expect(sql).toContain("reviewed_by = $2");
    expect(sql).toContain("review_notes = $3");
  });
});

// ── incrementInstallCount ────────────────────────────────────────────────────

describe("incrementInstallCount", () => {
  test("increments install_count atomically", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 1 }));
    await marketplaceStore.incrementInstallCount("listing-1");

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("install_count = install_count + 1");
    expect(mockQuery.mock.calls[0][1]).toEqual(["listing-1"]);
  });
});

// ── createReview ─────────────────────────────────────────────────────────────

describe("createReview", () => {
  test("inserts review and updates avg_rating", async () => {
    const fakeReview = {
      id: "test-uuid-1234-5678-9abc-def012345678",
      listing_id: "listing-1",
      user_id: "user-1",
      rating: 5,
      title: "Great",
      body: "Works well",
      created_at: "2026-03-28T00:00:00Z",
      updated_at: "2026-03-28T00:00:00Z",
    };
    mockQuery.mockImplementation(async () => ({
      rows: [fakeReview],
      rowCount: 1,
    }));

    const review = await marketplaceStore.createReview({
      listingId: "listing-1",
      userId: "user-1",
      rating: 5,
      title: "Great",
      body: "Works well",
    });

    expect(review.rating).toBe(5);
    expect(review.listingId).toBe("listing-1");

    // Should have two queries: INSERT + UPDATE avg_rating
    expect(mockQuery.mock.calls.length).toBe(2);
    const avgSql = mockQuery.mock.calls[1][0] as string;
    expect(avgSql).toContain("avg_rating");
    expect(avgSql).toContain("AVG(rating)");
  });
});

// ── createInstall ────────────────────────────────────────────────────────────

describe("createInstall", () => {
  test("inserts a runtime install record with org and agent ownership", async () => {
    const fakeInstall = {
      id: "test-uuid-1234-5678-9abc-def012345678",
      listing_id: "listing-1",
      org_id: "org-1",
      user_id: "user-1",
      agent_id: "agent-runtime-1",
      source_agent_version_id: "version-1",
      version: "1.0.0",
      installed_at: "2026-03-28T00:00:00Z",
      last_launched_at: null,
    };
    mockQuery.mockImplementation(async () => ({
      rows: [fakeInstall],
      rowCount: 1,
    }));

    const install = await marketplaceStore.createInstall({
      listingId: "listing-1",
      orgId: "org-1",
      userId: "user-1",
      agentId: "agent-runtime-1",
      sourceAgentVersionId: "version-1",
      version: "1.0.0",
    });

    expect(install.listingId).toBe("listing-1");
    expect(install.orgId).toBe("org-1");
    expect(install.agentId).toBe("agent-runtime-1");
    expect(install.version).toBe("1.0.0");

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO marketplace_runtime_installs");
  });
});

// ── listInstalledListings ───────────────────────────────────────────────────

describe("listInstalledListings", () => {
  test("joins marketplace installs with listing metadata ordered by install date", async () => {
    const fakeRow = {
      install_id: "install-1",
      listing_id: "listing-1",
      org_id: "org-1",
      user_id: "user-1",
      agent_id: "agent-runtime-1",
      source_agent_version_id: "version-1",
      installed_version: "1.2.0",
      installed_at: "2026-04-01T10:00:00Z",
      last_launched_at: null,
      listing: {
        id: "listing-1",
        agent_id: "agent-1",
        publisher_id: "publisher-1",
        owner_org_id: "org-1",
        title: "Sarah Assistant",
        slug: "sarah-assistant",
        summary: "Warm executive assistant",
        description: "Runs calendar and follow-ups",
        category: "operations",
        tags: ["assistant"],
        icon_url: null,
        screenshots: [],
        version: "1.2.0",
        status: "published",
        review_notes: null,
        reviewed_by: null,
        reviewed_at: null,
        install_count: 42,
        avg_rating: 4.9,
        published_at: "2026-03-31T10:00:00Z",
        created_at: "2026-03-30T10:00:00Z",
        updated_at: "2026-03-31T10:00:00Z",
      },
    };
    mockQuery.mockImplementation(async () => ({
      rows: [fakeRow],
      rowCount: 1,
    }));

    const installs = await marketplaceStore.listInstalledListings("user-1", "org-1");

    expect(installs).toHaveLength(1);
    expect(installs[0]).toEqual({
      installId: "install-1",
      listingId: "listing-1",
      orgId: "org-1",
      userId: "user-1",
      agentId: "agent-runtime-1",
      sourceAgentVersionId: "version-1",
      installedVersion: "1.2.0",
      installedAt: "2026-04-01T10:00:00Z",
      lastLaunchedAt: null,
      listing: expect.objectContaining({
        id: "listing-1",
        title: "Sarah Assistant",
        category: "operations",
      }),
    });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("FROM marketplace_runtime_installs i");
    expect(sql).toContain("JOIN marketplace_listings l ON l.id = i.listing_id");
    expect(sql).toContain("ORDER BY i.installed_at DESC");
    expect(mockQuery.mock.calls[0][1]).toEqual(["user-1", "org-1"]);
  });
});

// ── removeInstall ────────────────────────────────────────────────────────────

describe("removeInstall", () => {
  test("returns true when install deleted", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 1 }));
    const result = await marketplaceStore.removeInstall("listing-1", "org-1", "user-1");
    expect(result).toBe(true);
  });

  test("returns false when install not found", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const result = await marketplaceStore.removeInstall("listing-1", "org-1", "user-1");
    expect(result).toBe(false);
  });
});

// ── Serialization ────────────────────────────────────────────────────────────

describe("serialization", () => {
  test("serializeListingRow handles JSONB tags as parsed array", async () => {
    const row = {
      id: "l1",
      agent_id: "a1",
      publisher_id: "u1",
      title: "T",
      slug: "s",
      summary: "",
      description: "",
      category: "general",
      tags: ["ai", "bot"], // pre-parsed by pg driver
      icon_url: null,
      screenshots: [],
      version: "1.0.0",
      status: "draft",
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      install_count: 0,
      avg_rating: 0,
      published_at: null,
      created_at: "2026-03-28T00:00:00Z",
      updated_at: "2026-03-28T00:00:00Z",
    };
    mockQuery.mockImplementation(async () => ({ rows: [row], rowCount: 1 }));

    const listing = await marketplaceStore.getListingById("l1");
    expect(listing!.tags).toEqual(["ai", "bot"]);
    expect(Array.isArray(listing!.screenshots)).toBe(true);
  });
});
