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
});
