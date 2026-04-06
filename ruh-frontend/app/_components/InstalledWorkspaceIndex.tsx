"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CustomerSessionResponse {
  id: string;
  email: string;
  displayName: string;
  activeOrganization?: {
    id: string;
    name: string;
    slug: string;
    kind: "developer" | "customer";
    plan: string;
  } | null;
}

interface InstalledListing {
  installId: string;
  listingId: string;
  agentId: string;
  installedVersion: string;
  installedAt: string;
  listing: {
    id: string;
    title: string;
    slug: string;
    summary: string;
    category: string;
    iconUrl: string | null;
    installCount?: number;
    avgRating?: number;
  };
}

interface InstalledListingsResponse {
  items?: InstalledListing[];
}

function formatInstalledDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently installed";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initialsFor(title: string) {
  return (
    title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "AI"
  );
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as {
      detail?: string;
      error?: string;
      message?: string;
    };
    return payload.detail || payload.error || payload.message || fallback;
  } catch {
    return fallback;
  }
}

export function InstalledWorkspaceIndex() {
  const [session, setSession] = useState<CustomerSessionResponse | null>(null);
  const [items, setItems] = useState<InstalledListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [sessionResponse, inventoryResponse] = await Promise.all([
          apiFetch(`${API_URL}/api/auth/me`),
          apiFetch(`${API_URL}/api/marketplace/my/installed-listings`),
        ]);

        if (!sessionResponse.ok) {
          throw new Error(
            await readErrorMessage(
              sessionResponse,
              "Could not load the active customer session.",
            ),
          );
        }

        if (!inventoryResponse.ok) {
          throw new Error(
            await readErrorMessage(
              inventoryResponse,
              "Could not load your installed agents.",
            ),
          );
        }

        const nextSession =
          (await sessionResponse.json()) as CustomerSessionResponse;
        const inventory =
          (await inventoryResponse.json()) as InstalledListingsResponse;

        if (!cancelled) {
          setSession(nextSession);
          setItems(inventory.items || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your installed agents.",
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
  }, []);

  const organizationName =
    session?.activeOrganization?.name || "Your organization";
  const userLabel = session?.displayName || session?.email || "Current user";

  return (
    <main className="h-screen overflow-y-auto bg-[#f9f7f9] text-[#121212]">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-6 py-8 lg:px-10">
        <section className="rounded-[32px] border border-[rgba(176,145,182,0.2)] bg-[radial-gradient(circle_at_top,_rgba(247,230,250,0.92),_rgba(255,255,255,0.98))] px-8 py-10 shadow-[0_24px_80px_-56px_rgba(74,21,95,0.35)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b5aff]">
                Customer Workspace
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-[#121212]">
                Open the agents already installed for your work.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#4b5563]">
                This home route now reflects the active customer inventory instead of
                the older sandbox-management shell. Pick an installed agent to open
                its dedicated runtime workspace.
              </p>
            </div>

            <div className="grid gap-3 rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-sm sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#827f82]">
                  Active organization
                </p>
                <p className="mt-1 text-sm font-semibold text-[#121212]">
                  {organizationName}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#827f82]">
                  Active user
                </p>
                <p className="mt-1 text-sm font-semibold text-[#121212]">
                  {userLabel}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 flex-1">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#121212]">
                Installed agent workspaces
              </h2>
              <p className="mt-1 text-sm text-[#4b5563]">
                Launch directly into the runtime that belongs to this org/user session.
              </p>
            </div>

            {!loading && items.length > 0 ? (
              <span className="rounded-full bg-[#fdf4ff] px-3 py-1 text-xs font-semibold text-[#ae00d0]">
                {items.length} installed
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-[#eff0f3] bg-white/80">
              <div className="flex items-center gap-3 text-sm text-[#4b5563]">
                <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-[#ae00d0]" />
                Loading installed workspaces...
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[28px] border border-[#f2c7cf] bg-[#fff7f8] px-6 py-5 text-sm text-[#8a3340]">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[28px] border border-[#eff0f3] bg-white px-8 py-12 text-center shadow-sm">
              <p className="text-lg font-semibold text-[#121212]">
                No installed agents yet
              </p>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#4b5563]">
                Install an agent from the marketplace first, then it will appear here as a
                dedicated workspace card for your current customer session.
              </p>
              <Link
                href="/marketplace"
                className="mt-6 inline-flex items-center rounded-[18px] bg-[linear-gradient(135deg,_#ae00d0,_#7b5aff)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(123,90,255,0.55)] transition hover:brightness-105"
              >
                Browse marketplace
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const listing = item.listing;

                return (
                  <Link
                    key={item.installId}
                    href={`/agents/${item.agentId}`}
                    aria-label={`Open workspace for ${listing.title}`}
                    className="group flex h-full flex-col rounded-[30px] border border-[#e8e0ef] bg-white p-6 shadow-[0_18px_44px_-34px_rgba(43,17,66,0.35)] transition hover:-translate-y-0.5 hover:border-[#d7b7e4] hover:shadow-[0_26px_60px_-34px_rgba(43,17,66,0.45)]"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,_#f7e6fa,_#f1edff)] text-sm font-semibold text-[#7b5aff]">
                        {listing.iconUrl ? (
                          <img
                            src={listing.iconUrl}
                            alt=""
                            className="h-8 w-8 rounded-xl object-cover"
                          />
                        ) : (
                          initialsFor(listing.title)
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#827f82]">
                          <span className="rounded-full bg-[#fdf4ff] px-2.5 py-1 text-[#ae00d0]">
                            {listing.category}
                          </span>
                          <span>v{item.installedVersion}</span>
                        </div>
                        <h3 className="mt-3 text-lg font-semibold text-[#121212]">
                          {listing.title}
                        </h3>
                        <p className="mt-2 line-clamp-3 text-sm leading-7 text-[#4b5563]">
                          {listing.summary}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-3 rounded-[22px] bg-[#faf7fc] p-4 text-sm text-[#4b5563]">
                      <div className="flex items-center justify-between gap-3">
                        <span>Installed</span>
                        <span className="font-medium text-[#121212]">
                          {formatInstalledDate(item.installedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Active org</span>
                        <span className="truncate font-medium text-[#121212]">
                          {organizationName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Active user</span>
                        <span className="truncate font-medium text-[#121212]">
                          {userLabel}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between text-sm font-semibold text-[#ae00d0]">
                      <span>Open workspace</span>
                      <span className="transition group-hover:translate-x-1">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
