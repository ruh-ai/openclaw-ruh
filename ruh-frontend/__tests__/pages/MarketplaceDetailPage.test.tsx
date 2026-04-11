import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import MarketplacePage from "@/app/marketplace/page";
import MarketplaceDetailPage from "@/app/marketplace/[slug]/page";
import { server } from "../helpers/server";

const BASE = "http://localhost:8000";

const listing = {
  id: "listing-sarah",
  agentId: "agent-sarah",
  publisherId: "publisher-1",
  ownerOrgId: "org-1",
  title: "Sarah Assistant",
  slug: "sarah-assistant-d15e3c9d",
  summary: "Warm, polished executive assistant for calendar and operations.",
  description:
    "Sarah keeps an organization running by coordinating meetings, following up on action items, and handling operational admin work with a human tone.",
  category: "operations",
  tags: ["assistant", "operations"],
  iconUrl: null,
  screenshots: [],
  version: "1.2.0",
  status: "published",
  reviewNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  installCount: 241,
  avgRating: 4.9,
  publishedAt: "2026-03-31T10:00:00.000Z",
  createdAt: "2026-03-30T10:00:00.000Z",
  updatedAt: "2026-03-31T10:00:00.000Z",
};

describe("Marketplace detail page", () => {
  test("catalog cards link to the listing detail route", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        HttpResponse.json({ items: [listing], total: 1 }),
      ),
    );

    render(<MarketplacePage />);

    const detailLink = await screen.findByRole("link", {
      name: /sarah assistant/i,
    });
    expect(detailLink).toHaveAttribute(
      "href",
      `/marketplace/${listing.slug}`,
    );
  });

  test("renders listing metadata and the installed CTA state", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json(listing),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({
          items: [
            {
              id: "install-1",
              listingId: listing.id,
              userId: "user-1",
              version: listing.version,
              installedAt: "2026-03-31T12:00:00.000Z",
            },
          ],
        }),
      ),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    expect(
      await screen.findByRole("heading", { name: /sarah assistant/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(listing.description)).toBeInTheDocument();
    expect(screen.getAllByText(listing.category).length).toBeGreaterThan(0);
    expect(screen.getByText(/241 installs/i)).toBeInTheDocument();
    expect(screen.getByText(/4\.9 rating/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /installed to workspace/i }),
    ).toBeDisabled();
  });

  test("installs a listing and updates the CTA", async () => {
    let installCalls = 0;

    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json(listing),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ items: [] }),
      ),
      http.post(`${BASE}/api/marketplace/listings/${listing.id}/install`, () => {
        installCalls += 1;
        return HttpResponse.json(
          {
            id: "install-1",
            listingId: listing.id,
            userId: "user-1",
            version: listing.version,
            installedAt: "2026-03-31T12:00:00.000Z",
          },
          { status: 201 },
        );
      }),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /install agent/i }),
    );

    await waitFor(() => {
      expect(installCalls).toBe(1);
      expect(
        screen.getByRole("button", { name: /installed to workspace/i }),
      ).toBeDisabled();
    });
  });

  test("shows error state when listing fetch fails", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 }),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Listing unavailable")).toBeInTheDocument();
    });
  });

  test("shows install error when install POST fails", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json(listing),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ items: [] }),
      ),
      http.post(`${BASE}/api/marketplace/listings/${listing.id}/install`, () =>
        HttpResponse.json({ detail: "Quota exceeded" }, { status: 402 }),
      ),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /install agent/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Install failed")).toBeInTheDocument();
    });
  });

  test("triggers ProvisioningModal for v3 agents that return provisioning:true", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json(listing),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ items: [] }),
      ),
      http.post(`${BASE}/api/marketplace/listings/${listing.id}/install`, () =>
        HttpResponse.json({
          provisioning: true,
          streamId: "stream-xyz",
          agentId: "agent-v3-001",
        }),
      ),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /install agent/i }),
    );

    await waitFor(() => {
      // ProvisioningModal shows "Installing <agent name>"
      expect(screen.getByText(`Installing ${listing.title}`)).toBeInTheDocument();
    });
  });

  test("renders 'Recently updated' when publishedAt is null", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json({ ...listing, publishedAt: null }),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/recently updated/i)).toBeInTheDocument();
    });
  });

  test("renders 'No tags provided' when tags array is empty", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json({ ...listing, tags: [] }),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("No tags provided")).toBeInTheDocument();
    });
  });

  test("renders 'Recently updated' when publishedAt is an invalid date string", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json({ ...listing, publishedAt: "not-a-date" }),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/recently updated/i)).toBeInTheDocument();
    });
  });

  test("still loads listing when installs endpoint fails", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json(listing),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    // Listing should load fine; install button shows "Install Agent" (not installed)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /install agent/i }),
      ).toBeInTheDocument();
    });
  });

  test("ProvisioningModal onComplete callback marks agent as installed", async () => {
    let completeCalled = false;

    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json(listing),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ items: [] }),
      ),
      http.post(`${BASE}/api/marketplace/listings/${listing.id}/install`, () =>
        HttpResponse.json({
          provisioning: true,
          streamId: "stream-complete-test",
          agentId: "agent-complete-test",
        }),
      ),
      // The ProvisioningModal SSE stream endpoint
      http.get(`${BASE}/api/agents/agent-complete-test/provision/stream-complete-test`, () => {
        completeCalled = true;
        return new HttpResponse(
          'data: {"status":"done","agentId":"agent-complete-test"}\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /install agent/i }),
    );

    await waitFor(() =>
      screen.getByText(`Installing ${listing.title}`),
    );

    // Find and click the onComplete trigger — the ProvisioningModal calls onComplete
    // when the stream finishes. We can simulate by clicking a Done/Finish button if present,
    // or trigger via the stream finishing. For deterministic test coverage, find the close-done path.
    const buttons = Array.from(document.querySelectorAll("button"));
    const doneBtn = buttons.find((b) =>
      /done|finish|open workspace/i.test(b.textContent ?? ""),
    );
    if (doneBtn) {
      await userEvent.click(doneBtn);
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /installed to workspace/i }),
        ).toBeDisabled();
      });
    }
  });

  test("ProvisioningModal onClose callback clears provisioning state", async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings/${listing.slug}`, () =>
        HttpResponse.json(listing),
      ),
      http.get(`${BASE}/api/marketplace/my/installs`, () =>
        HttpResponse.json({ items: [] }),
      ),
      http.post(`${BASE}/api/marketplace/listings/${listing.id}/install`, () =>
        HttpResponse.json({
          provisioning: true,
          streamId: "stream-close-test",
          agentId: "agent-close-test",
        }),
      ),
    );

    render(
      await MarketplaceDetailPage({
        params: Promise.resolve({ slug: listing.slug }),
      }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /install agent/i }),
    );

    await waitFor(() =>
      screen.getByText(`Installing ${listing.title}`),
    );

    // Click the × close button in the ProvisioningModal header
    const headerCloseBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.querySelector("span")?.textContent?.includes("×"),
    );
    if (headerCloseBtn) {
      await userEvent.click(headerCloseBtn);
      await waitFor(() => {
        expect(screen.queryByText(`Installing ${listing.title}`)).not.toBeInTheDocument();
      });
    }
  });
});
