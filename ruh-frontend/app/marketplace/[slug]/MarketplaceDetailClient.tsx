"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface MarketplaceListing {
  id: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  installCount: number;
  avgRating: number;
  iconUrl: string | null;
  screenshots: string[];
  publishedAt: string | null;
}

interface InstallsResponse {
  items?: Array<{
    listingId?: string;
    listing_id?: string;
  }>;
}

function formatPublishedDate(iso: string | null) {
  if (!iso) {
    return "Recently updated";
  }

  const publishedAt = new Date(iso);
  if (Number.isNaN(publishedAt.getTime())) {
    return "Recently updated";
  }

  return publishedAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MarketplaceDetailClient({ slug }: { slug: string }) {
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [installed, setInstalled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [listingResponse, installsResponse] = await Promise.all([
          apiFetch(`${API_URL}/api/marketplace/listings/${slug}`),
          apiFetch(`${API_URL}/api/marketplace/my/installs`),
        ]);

        if (!listingResponse.ok) {
          throw new Error("Listing not found");
        }

        const nextListing = (await listingResponse.json()) as MarketplaceListing;
        const installsPayload = installsResponse.ok
          ? ((await installsResponse.json()) as InstallsResponse)
          : { items: [] };
        const installIds = new Set(
          (installsPayload.items || [])
            .map((item) => item.listingId || item.listing_id)
            .filter(Boolean),
        );

        if (!cancelled) {
          setListing(nextListing);
          setInstalled(installIds.has(nextListing.id));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load this marketplace listing.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleInstall = async () => {
    if (!listing || installed || installing) {
      return;
    }

    setInstalling(true);
    setError(null);

    try {
      const response = await apiFetch(
        `${API_URL}/api/marketplace/listings/${listing.id}/install`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error("Install failed");
      }

      setInstalled(true);
      setListing((current) =>
        current
          ? {
              ...current,
              installCount: current.installCount + 1,
            }
          : current,
      );
    } catch (installError) {
      setError(
        installError instanceof Error
          ? installError.message
          : "Could not install this agent.",
      );
    } finally {
      setInstalling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f3ef] px-6 py-16">
        <div className="mx-auto max-w-5xl animate-pulse rounded-[32px] border border-[#eadfd4] bg-white/80 p-10 shadow-sm">
          <div className="h-4 w-28 rounded-full bg-[#efe5db]" />
          <div className="mt-6 h-12 w-72 rounded-2xl bg-[#efe5db]" />
          <div className="mt-4 h-4 w-full rounded-full bg-[#f4ece5]" />
          <div className="mt-2 h-4 w-4/5 rounded-full bg-[#f4ece5]" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-[#f7f3ef] px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-[#eadfd4] bg-white p-10 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8f6d54]">
            Marketplace
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-[#2f241d]">
            Listing unavailable
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6b5b4f]">
            {error || "This listing is not available right now."}
          </p>
          <Link
            href="/marketplace"
            className="mt-8 inline-flex items-center rounded-full border border-[#d8c7b8] px-4 py-2 text-sm font-medium text-[#5e4736] transition hover:border-[#c5b09e] hover:bg-[#f6eee8]"
          >
            Back to marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(247,228,210,0.9),_transparent_42%),linear-gradient(180deg,_#f8f3ee_0%,_#f7f3ef_48%,_#fbf8f5_100%)] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/marketplace"
          className="inline-flex items-center rounded-full border border-[#dacbbd] bg-white/80 px-4 py-2 text-sm font-medium text-[#654d3d] shadow-sm backdrop-blur transition hover:border-[#c9b39f] hover:bg-white"
        >
          Back to marketplace
        </Link>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_340px]">
          <div className="rounded-[32px] border border-[#eadfd4] bg-white/85 p-8 shadow-[0_24px_80px_-48px_rgba(88,58,35,0.45)] backdrop-blur">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,_#fff3e8,_#f2dfcf)] text-3xl shadow-inner">
                {listing.iconUrl ? (
                  <img
                    src={listing.iconUrl}
                    alt=""
                    className="h-10 w-10 rounded-xl object-cover"
                  />
                ) : (
                  "✦"
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#916c4f]">
                  <span className="rounded-full bg-[#f8eee5] px-3 py-1 text-[#9d6f47]">
                    {listing.category}
                  </span>
                  <span>Version {listing.version}</span>
                  <span>Published {formatPublishedDate(listing.publishedAt)}</span>
                </div>
                <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-[#2f241d]">
                  {listing.title}
                </h1>
                <p className="mt-3 max-w-3xl text-base leading-8 text-[#69584c]">
                  {listing.summary || listing.description}
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 rounded-[28px] border border-[#eee3d8] bg-[#fcfaf8] p-5 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f7b61]">
                  Adoption
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#30251e]">
                  {listing.installCount}
                </p>
                <p className="mt-1 text-sm text-[#7a6759]">
                  {listing.installCount} installs
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f7b61]">
                  Rating
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#30251e]">
                  {listing.avgRating.toFixed(1)}
                </p>
                <p className="mt-1 text-sm text-[#7a6759]">
                  {listing.avgRating.toFixed(1)} rating
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f7b61]">
                  Tags
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {listing.tags.length > 0 ? (
                    listing.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#5c4a3d] shadow-sm"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[#7a6759]">
                      No tags provided
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-[28px] border border-[#eee3d8] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#2f241d]">
                What this agent does
              </h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-8 text-[#5f5046]">
                {listing.description}
              </p>
            </div>
          </div>

          <aside className="rounded-[32px] border border-[#e7d9cb] bg-[#2f241d] p-6 text-[#f9f4ef] shadow-[0_24px_80px_-48px_rgba(47,36,29,0.95)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d6b598]">
              Workspace action
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              {installed ? "Installed to workspace" : "Ready to install"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[#e8d9cb]">
              This first slice uses the current install contract so your team can
              add published agents from the real marketplace instead of the mock
              catalog.
            </p>

            <button
              type="button"
              onClick={handleInstall}
              disabled={installed || installing}
              className="mt-8 w-full rounded-[20px] bg-[linear-gradient(135deg,_#f3d2b0,_#d9a776)] px-5 py-4 text-sm font-semibold text-[#2b1f18] shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {installing
                ? "Installing..."
                : installed
                  ? "Installed to Workspace"
                  : "Install Agent"}
            </button>

            {error ? (
              <div className="mt-4 rounded-2xl border border-[#83583a] bg-[#4f3729] px-4 py-3 text-sm text-[#f7e6d7]">
                {error}
              </div>
            ) : null}

            <div className="mt-8 rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#cda989]">
                Current contract
              </p>
              <p className="mt-3 text-sm leading-7 text-[#e8d9cb]">
                Org checkout, entitlements, and seat assignment land in the next
                marketplace slice. For now this uses the authenticated legacy
                install endpoint that already exists in the backend.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
