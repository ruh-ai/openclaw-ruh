/**
 * Integration tests for the marketplace store (listings, reviews, installs) — requires a real PostgreSQL database.
 * Set TEST_DATABASE_URL to an accessible test DB before running.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { setupTestDb, teardownTestDb, truncateAll } from "../../helpers/db";
import * as userStore from "../../../src/userStore";
import * as marketplaceStore from "../../../src/marketplaceStore";
import { hashPassword } from "../../../src/auth/passwords";
import { withConn } from "../../../src/db";


let publisherId: string;
let agentId: string;
let runtimeAgentId: string;
let customerOrgId: string;
/** Pre-computed bcrypt hash of "pass" — avoids 12-round bcrypt in every beforeEach (>500ms). */
let cachedHash: string;

beforeAll(async () => {
  await setupTestDb();
  cachedHash = await hashPassword("pass");
});

beforeEach(async () => {
  await truncateAll();
  // Re-create the publisher user and agent before each test
  const user = await userStore.createUser(
    "publisher@ruh.ai",
    cachedHash,
    "Publisher",
    "developer",
  );
  publisherId = user.id;
  customerOrgId = "org-customer-" + Date.now();

  agentId = "test-agent-" + Date.now();
  runtimeAgentId = "runtime-agent-" + Date.now();
  await withConn(async (client) => {
    await client.query(
      `INSERT INTO organizations (id, name, slug, kind, plan, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [customerOrgId, "Globex", "globex", "customer", "free"],
    );
    await client.query(
      `INSERT INTO agents (id, name, description, status, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      [agentId, "Test Agent", "A test agent", "draft"],
    );
    await client.query(
      `INSERT INTO agents (id, name, description, status, created_at, created_by, org_id)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
      [runtimeAgentId, "Installed Agent", "Installed runtime", "active", publisherId, customerOrgId],
    );
  });
});

afterAll(async () => {
  await teardownTestDb();
});

describe("Marketplace CRUD (integration)", () => {
  test("create listing", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "My Test Agent",
      summary: "A great agent",
      description: "Full description here",
      category: "marketing",
      tags: ["ads", "google"],
    });
    expect(listing.id).toBeTruthy();
    expect(listing.title).toBe("My Test Agent");
    expect(listing.status).toBe("draft");
    expect(listing.slug).toContain("my-test-agent");
    expect(listing.tags).toEqual(["ads", "google"]);
    expect(listing.agentId).toBe(agentId);
    expect(listing.publisherId).toBe(publisherId);
  });

  test("get listing by slug", async () => {
    const created = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Slug Test",
      summary: "Test",
      description: "Test",
      category: "general",
    });

    const found = await marketplaceStore.getListingBySlug(created.slug);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  test("get listing by id", async () => {
    const created = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "ID Lookup",
    });

    const found = await marketplaceStore.getListingById(created.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe("ID Lookup");
  });

  test("submit for review changes status", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Review Test",
      summary: "Test",
      description: "Test",
      category: "general",
    });

    const updated = await marketplaceStore.updateListingStatus(
      listing.id,
      "pending_review",
    );
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("pending_review");
  });

  test("publish listing makes it appear in published list", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Published Agent",
      summary: "Published",
      description: "Published",
      category: "marketing",
    });
    await marketplaceStore.updateListingStatus(listing.id, "published");

    const published = await marketplaceStore.listPublishedListings({});
    expect(published.total).toBeGreaterThanOrEqual(1);
    expect(published.items.some((l) => l.id === listing.id)).toBe(true);
  });

  test("listPendingListings returns pending items", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Pending Agent",
    });
    await marketplaceStore.updateListingStatus(listing.id, "pending_review");

    const pending = await marketplaceStore.listPendingListings();
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending.some((l) => l.id === listing.id)).toBe(true);
  });

  test("listUserListings returns listings by publisher", async () => {
    await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "My Listing",
    });

    const listings = await marketplaceStore.listUserListings(publisherId);
    expect(listings.length).toBe(1);
    expect(listings[0].title).toBe("My Listing");
  });

  test("updateListing patches fields", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Original Title",
      summary: "Original summary",
    });

    const updated = await marketplaceStore.updateListing(listing.id, {
      title: "Updated Title",
      summary: "New summary",
      tags: ["updated"],
    });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Updated Title");
    expect(updated!.summary).toBe("New summary");
    expect(updated!.tags).toEqual(["updated"]);
  });

  test("install and uninstall", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Install Test",
      summary: "Test",
      description: "Test",
      category: "general",
    });

    await marketplaceStore.createInstall({
      listingId: listing.id,
      orgId: customerOrgId,
      userId: publisherId,
      agentId: runtimeAgentId,
      version: "1.0.0",
    });
    const installs = await marketplaceStore.listUserInstalls(
      publisherId,
      customerOrgId,
    );
    expect(installs.length).toBeGreaterThanOrEqual(1);

    const found = await marketplaceStore.getInstall(
      listing.id,
      customerOrgId,
      publisherId,
    );
    expect(found).not.toBeNull();
    expect(found!.version).toBe("1.0.0");
    expect(found!.agentId).toBe(runtimeAgentId);

    await marketplaceStore.removeInstall(listing.id, customerOrgId, publisherId);
    const after = await marketplaceStore.listUserInstalls(
      publisherId,
      customerOrgId,
    );
    const stillInstalled = after.find((i) => i.listingId === listing.id);
    expect(stillInstalled).toBeUndefined();
  });

  test("lists installed listings with joined marketplace metadata", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Installed Sarah",
      summary: "Installed summary",
      description: "Installed description",
      category: "operations",
      tags: ["assistant"],
      version: "1.4.0",
    });
    await marketplaceStore.updateListingStatus(listing.id, "published");

    await marketplaceStore.createInstall({
      listingId: listing.id,
      orgId: customerOrgId,
      userId: publisherId,
      agentId: runtimeAgentId,
      version: "1.4.0",
    });

    const installs = await marketplaceStore.listInstalledListings(
      publisherId,
      customerOrgId,
    );

    expect(installs).toHaveLength(1);
    expect(installs[0].listingId).toBe(listing.id);
    expect(installs[0].agentId).toBe(runtimeAgentId);
    expect(installs[0].installedVersion).toBe("1.4.0");
    expect(installs[0].listing).toEqual(
      expect.objectContaining({
        id: listing.id,
        title: "Installed Sarah",
        category: "operations",
        status: "published",
      }),
    );
  });

  test("review with rating", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Review Agent",
      summary: "Test",
      description: "Test",
      category: "general",
    });

    const review = await marketplaceStore.createReview({
      listingId: listing.id,
      userId: publisherId,
      rating: 5,
      title: "Great!",
      body: "Loved it",
    });
    expect(review.rating).toBe(5);
    expect(review.title).toBe("Great!");
    expect(review.body).toBe("Loved it");

    const reviews = await marketplaceStore.listReviews(listing.id);
    expect(reviews.length).toBe(1);
    expect(reviews[0].id).toBe(review.id);
  });

  test("review updates avg_rating on listing", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Rating Agent",
    });

    await marketplaceStore.createReview({
      listingId: listing.id,
      userId: publisherId,
      rating: 4,
    });

    const refreshed = await marketplaceStore.getListingById(listing.id);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.avgRating).toBe(4);
  });

  test("search listings by text", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Google Ads Monitor",
      summary: "Monitors Google Ads campaigns",
      description: "Full monitor",
      category: "marketing",
    });
    await marketplaceStore.updateListingStatus(listing.id, "published");

    const results = await marketplaceStore.listPublishedListings({
      search: "google",
    });
    expect(results.total).toBeGreaterThanOrEqual(1);
  });

  test("search published listings by category", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Category Filter Agent",
      category: "analytics",
    });
    await marketplaceStore.updateListingStatus(listing.id, "published");

    const results = await marketplaceStore.listPublishedListings({
      category: "analytics",
    });
    expect(results.total).toBeGreaterThanOrEqual(1);
    expect(results.items.every((l) => l.category === "analytics")).toBe(true);

    const empty = await marketplaceStore.listPublishedListings({
      category: "nonexistent",
    });
    expect(empty.total).toBe(0);
  });

  test("incrementInstallCount bumps the counter", async () => {
    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Counter Agent",
    });
    expect(listing.installCount).toBe(0);

    await marketplaceStore.incrementInstallCount(listing.id);
    await marketplaceStore.incrementInstallCount(listing.id);

    const refreshed = await marketplaceStore.getListingById(listing.id);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.installCount).toBe(2);
  });

  test("slug is unique per listing", async () => {
    const a = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Same Title",
    });
    const b = await marketplaceStore.createListing({
      agentId,
      publisherId,
      title: "Same Title",
    });
    // Slugs include a UUID suffix, so they should differ
    expect(a.slug).not.toBe(b.slug);
  });
});
