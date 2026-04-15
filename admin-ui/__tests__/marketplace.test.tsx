import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

mock.module("next/navigation", () => ({
  usePathname: () => "/marketplace",
  useRouter: () => ({ push: mock(() => {}) }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const publishedListing = {
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

const pendingListing = {
  ...publishedListing,
  id: "l2",
  status: "pending_review",
  title: "New Listing",
};

const rejectedListing = {
  ...publishedListing,
  id: "l3",
  status: "rejected",
  title: "Rejected Listing",
  ownerOrgName: null,
  publisherEmail: null,
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
  recentListings: [pendingListing],
  topListings: [publishedListing, { ...pendingListing, id: "l4" }],
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
    window.confirm = mock(() => true);
    window.prompt = mock(() => "");
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

  test("renders listing rows with data covering listingTone variants", async () => {
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

  test("renders rejected listing tone variant", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [rejectedListing],
            topListings: [],
          }),
      } as Response),
    );
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Rejected Listing");
    });
    expect(container.textContent).toContain("rejected");
    // Falls back to slug when no ownerOrgName/publisherEmail
    expect(container.textContent).toContain("google-ads-agent");
  });

  test("renders draft/neutral listing tone", async () => {
    const draftListing = { ...publishedListing, id: "l5", status: "draft", title: "Draft Agent" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [draftListing],
            topListings: [],
          }),
      } as Response),
    );
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Draft Agent");
    });
  });

  test("renders approve and reject buttons for pending listings", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Approve");
    });
    expect(container.textContent).toContain("Reject");
  });

  test("calls reviewListing with approved when Approve clicked", async () => {
    window.confirm = mock(() => true);
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { getAllByText } = render(<MarketplacePage />);

    await waitFor(() => {
      expect(getAllByText("Approve").length).toBeGreaterThan(0);
    });

    mockFetch.mockClear();
    await act(async () => {
      await userEvent.click(getAllByText("Approve")[0]);
    });

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find((call) => {
        const [url, init] = call as [string, RequestInit | undefined];
        return url.includes("/review") && init?.method === "POST";
      });
      expect(postCall).toBeTruthy();
    });
  });

  test("calls reviewListing with rejected and notes when Reject clicked", async () => {
    window.confirm = mock(() => true);
    window.prompt = mock(() => "Quality issues");
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { getAllByText } = render(<MarketplacePage />);

    await waitFor(() => {
      expect(getAllByText("Reject").length).toBeGreaterThan(0);
    });

    mockFetch.mockClear();
    await act(async () => {
      await userEvent.click(getAllByText("Reject")[0]);
    });

    expect(window.prompt).toHaveBeenCalled();
    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find((call) => {
        const [url, init] = call as [string, RequestInit | undefined];
        return url.includes("/review") && init?.method === "POST";
      });
      expect(postCall).toBeTruthy();
      if (postCall) {
        const body = JSON.parse((postCall as [string, RequestInit])[1].body as string);
        expect(body.decision).toBe("rejected");
        expect(body.notes).toBe("Quality issues");
      }
    });
  });

  test("does not call API when review confirmation is cancelled", async () => {
    window.confirm = mock(() => false);
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { getAllByText } = render(<MarketplacePage />);

    await waitFor(() => {
      expect(getAllByText("Approve").length).toBeGreaterThan(0);
    });

    const callCountBefore = mockFetch.mock.calls.length;
    await act(async () => {
      await userEvent.click(getAllByText("Approve")[0]);
    });

    const postCalls = mockFetch.mock.calls.slice(callCountBefore).filter((call) => {
      const [, init] = call as [string, RequestInit | undefined];
      return init?.method === "POST";
    });
    expect(postCalls.length).toBe(0);
  });

  test("shows error when review fails", async () => {
    window.confirm = mock(() => true);
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(marketplaceData),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Review failed" }),
      } as unknown as Response);
    });
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container, getAllByText } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(getAllByText("Approve").length).toBeGreaterThan(0);
    });

    await act(async () => {
      await userEvent.click(getAllByText("Approve")[0]);
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Review failed");
    });
  });

  test("handles fetch error gracefully", async () => {
    mockFetch.mockImplementation(() =>
      Promise.reject(new Error("Network error")),
    );
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Network error");
    });
  });

  test("handles non-Error fetch rejection", async () => {
    mockFetch.mockImplementation(() => Promise.reject("string error"));
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Failed to load marketplace");
    });
  });

  test("shows no listings message when both lists are empty", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [],
            topListings: [],
          }),
      } as Response),
    );
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No listings matched");
    });
  });

  test("renders search and status filter inputs", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { getByPlaceholderText, container } = render(<MarketplacePage />);
    expect(getByPlaceholderText("Search title, owner, or publisher")).toBeTruthy();
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
  });

  test("top listing with unknown owner renders fallback", async () => {
    const unknownOwner = {
      ...publishedListing,
      id: "l6",
      ownerOrgName: null,
      publisherEmail: null,
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...marketplaceData,
            recentListings: [],
            topListings: [unknownOwner],
          }),
      } as Response),
    );
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Unknown owner");
    });
  });
});
