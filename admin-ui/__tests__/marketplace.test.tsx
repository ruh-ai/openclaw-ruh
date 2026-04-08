import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

const listingRecord = {
  id: "l1",
  title: "Google Ads Agent",
  slug: "google-ads-agent",
  category: "marketing",
  version: "1.0.0",
  status: "published",
  installCount: 50,
  ownerOrgName: "Ruh AI",
  publisherEmail: "dev@ruh.ai",
  updatedAt: "2026-01-01T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
};

const marketplaceData = {
  summary: {
    totalListings: 8,
    draft: 1,
    pendingReview: 2,
    published: 5,
    rejected: 0,
    archived: 0,
    totalInstalls: 100,
  },
  recentListings: [{ ...listingRecord, id: "l2", status: "pending_review", title: "New Listing" }],
  topListings: [listingRecord],
};

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(marketplaceData),
  } as Response),
);

describe("MarketplacePage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "test-token");
  });

  test("renders Marketplace heading", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { getByText } = render(<MarketplacePage />);
    expect(getByText("Marketplace")).toBeTruthy();
  });

  test("renders marketplace subtitle", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    const text = container.textContent || "";
    expect(text).toContain("marketplace");
  });

  test("renders catalog section", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    const text = container.textContent || "";
    expect(text).toContain("Catalog");
  });

  test("renders listing rows with data after fetch covering listingTone variants", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Google Ads Agent");
    });
    expect(container.textContent).toContain("New Listing");
    expect(container.textContent).toContain("published");
    expect(container.textContent).toContain("pending_review");
  });

  test("fetches marketplace from API on mount", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    render(<MarketplacePage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/api/admin/marketplace");
  });
});
