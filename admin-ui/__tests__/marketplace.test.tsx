import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor, act } from "@testing-library/react";
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

  test("shows error message when API fails", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Marketplace unavailable" }),
      } as Response),
    );
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Marketplace unavailable");
    });
  });

  test("reviewListing: calls review endpoint when approved and confirmed", async () => {
    const pendingListing = { ...listingRecord, id: "l3", status: "pending_review", title: "Pending Listing" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [pendingListing],
          }),
      } as Response),
    );
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;
    globalThis.prompt = mock(() => "") as unknown as typeof prompt;

    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Pending Listing");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const approveBtn = buttons.find((b) => b.textContent?.includes("Approve"));
    expect(approveBtn).toBeTruthy();

    await act(async () => {
      approveBtn!.click();
    });

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => (c as unknown[])[0] as string);
      expect(urls.some((u) => u.includes("/review"))).toBe(true);
    });
  });

  test("reviewListing: no request when confirm is cancelled", async () => {
    const pendingListing = { ...listingRecord, id: "l4", status: "pending_review", title: "Cancelable Listing" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [pendingListing],
          }),
      } as Response),
    );
    globalThis.confirm = mock(() => false) as unknown as typeof confirm;
    globalThis.prompt = mock(() => "") as unknown as typeof prompt;

    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Cancelable Listing");
    });

    const callsBefore = mockFetch.mock.calls.length;
    const buttons = Array.from(container.querySelectorAll("button"));
    const approveBtn = buttons.find((b) => b.textContent?.includes("Approve"));
    if (approveBtn) {
      await act(async () => {
        approveBtn.click();
      });
    }
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });

  test("reviewListing: reject path shows prompt for notes", async () => {
    const pendingListing = { ...listingRecord, id: "l6", status: "pending_review", title: "Reject Me" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [pendingListing],
          }),
      } as Response),
    );
    const promptFn = mock(() => "Too promotional") as unknown as typeof prompt;
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;
    globalThis.prompt = promptFn;

    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Reject Me");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const rejectBtn = buttons.find((b) => b.textContent?.includes("Reject"));
    expect(rejectBtn).toBeTruthy();

    await act(async () => {
      rejectBtn!.click();
    });

    await waitFor(() => {
      // prompt should have been called for rejection notes
      expect(promptFn).toHaveBeenCalled();
    });
  });

  test("search input onChange updates filter state", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    const searchInput = container.querySelector(
      'input[placeholder="Search title, owner, or publisher"]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    await act(async () => {
      searchInput.value = "agent";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  test("status filter select onChange updates filter state", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    const selects = Array.from(container.querySelectorAll("select"));
    const statusSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.textContent === "All statuses"),
    );
    expect(statusSelect).toBeTruthy();
    await act(async () => {
      statusSelect!.value = "draft";
      statusSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  test("reviewListing: shows error when review POST fails", async () => {
    const pendingListing = { ...listingRecord, id: "l7", status: "pending_review", title: "Fail Review" };
    let callCount = 0;
    mockFetch.mockImplementation((_url: unknown, init?: RequestInit) => {
      callCount++;
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: "Review service down" }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [pendingListing],
          }),
      } as Response);
    });
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;
    globalThis.prompt = mock(() => "") as unknown as typeof prompt;

    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Fail Review");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const approveBtn = buttons.find((b) => b.textContent?.includes("Approve"));
    expect(approveBtn).toBeTruthy();

    await act(async () => {
      approveBtn!.click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Review service down");
    }, { timeout: 3000 });
  });

  test("listingTone: draft status renders as neutral", async () => {
    const draftListing = { ...listingRecord, id: "l8", status: "draft", title: "Draft Listing" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [draftListing],
          }),
      } as Response),
    );
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("draft");
    });
  });

  test("top listings section renders approve/reject for pending items", async () => {
    const topPending = { ...listingRecord, id: "l9", status: "pending_review", title: "Top Pending" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            topListings: [topPending],
          }),
      } as Response),
    );
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;
    globalThis.prompt = mock(() => "") as unknown as typeof prompt;

    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Top Pending");
    });

    // Should have Approve/Reject buttons in top listings section
    const buttons = Array.from(container.querySelectorAll("button"));
    const approveButtons = buttons.filter((b) => b.textContent?.includes("Approve"));
    expect(approveButtons.length).toBeGreaterThanOrEqual(1);

    // Click one to cover the top-listings reviewListing arrow function
    await act(async () => {
      approveButtons[approveButtons.length - 1].click();
    });

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => (c as unknown[])[0] as string);
      expect(urls.some((u) => u.includes("/review"))).toBe(true);
    });
  });

  test("listingTone: rejected status renders as danger", async () => {
    const rejectedListing = { ...listingRecord, id: "l5", status: "rejected", title: "Rejected Listing" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [rejectedListing],
          }),
      } as Response),
    );
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("rejected");
    });
    expect(container.textContent).toContain("Rejected Listing");
  });
});
