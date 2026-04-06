"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { BookmarkCheck, Rocket, Store, Tags } from "lucide-react";

import { fetchAdminJson, mutateAdminJson } from "@/lib/admin-api";
import {
  ActionButton,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
  fieldClassName,
  formatDate,
  formatNumber,
} from "../_components/AdminPrimitives";

interface ListingRecord {
  id: string;
  title: string;
  slug: string;
  category: string;
  version: string;
  status: string;
  installCount: number;
  ownerOrgName: string | null;
  publisherEmail: string | null;
  updatedAt: string;
  createdAt: string;
}

interface MarketplaceResponse {
  summary: {
    totalListings: number;
    draft: number;
    pendingReview: number;
    published: number;
    rejected: number;
    archived: number;
    totalInstalls: number;
  };
  recentListings: ListingRecord[];
  topListings: ListingRecord[];
}

function listingTone(status: string) {
  if (status === "published") return "success";
  if (status === "pending_review") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

export default function MarketplacePage() {
  const [data, setData] = useState<MarketplaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionState, setActionState] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const deferredSearch = useDeferredValue(search);

  const loadMarketplace = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (deferredSearch) params.set("search", deferredSearch);
    if (statusFilter) params.set("status", statusFilter);

    fetchAdminJson<MarketplaceResponse>(`/api/admin/marketplace?${params.toString()}`)
      .then((response) => {
        setData(response);
        setError("");
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load marketplace",
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMarketplace();
  }, [deferredSearch, statusFilter]);

  const reviewListing = async (
    listingId: string,
    decision: "approved" | "rejected",
  ) => {
    const notes =
      decision === "rejected"
        ? window.prompt(
            "Optional rejection notes. This will be stored with the moderation decision.",
            "",
          ) ?? ""
        : "";
    const confirmed = window.confirm(
      `${decision === "approved" ? "Approve" : "Reject"} this marketplace listing?`,
    );
    if (!confirmed) {
      return;
    }

    setActionState(`${listingId}:${decision}`);
    try {
      await mutateAdminJson(`/api/marketplace/listings/${listingId}/review`, "POST", {
        decision,
        ...(notes ? { notes } : {}),
      });
      loadMarketplace();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to moderate listing",
      );
    } finally {
      setActionState(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketplace"
        description="Catalog health, review pressure, and install momentum across the current marketplace inventory."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Listings"
          value={data?.summary.totalListings ?? 0}
          detail="Total marketplace listings in scope."
          icon={Store}
          tone="primary"
        />
        <MetricCard
          label="Pending Review"
          value={data?.summary.pendingReview ?? 0}
          detail={`${data?.summary.rejected ?? 0} rejected listings and ${data?.summary.draft ?? 0} drafts.`}
          icon={Tags}
          tone={(data?.summary.pendingReview ?? 0) > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Published"
          value={data?.summary.published ?? 0}
          detail="Listings currently live for install."
          icon={BookmarkCheck}
          tone="success"
        />
        <MetricCard
          label="Installs"
          value={data?.summary.totalInstalls ?? 0}
          detail="Total recorded marketplace installs."
          icon={Rocket}
          tone="danger"
        />
      </div>

      <Panel
        title="Catalog"
        description="Filter recent marketplace inventory by title or lifecycle state."
        actions={
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, owner, or publisher"
              className={fieldClassName}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={fieldClassName}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_review">Pending review</option>
              <option value="published">Published</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        }
      >
        {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Recent Listings
            </h3>
            {data?.recentListings.map((listing) => (
              <div
                key={listing.id}
                className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-5"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {listing.title}
                  </p>
                  <StatusPill tone={listingTone(listing.status)}>
                    {listing.status}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {listing.ownerOrgName || listing.publisherEmail || listing.slug}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill tone="neutral">{listing.category}</StatusPill>
                  <StatusPill tone="primary">v{listing.version}</StatusPill>
                  <StatusPill tone="success">
                    {formatNumber(listing.installCount)} installs
                  </StatusPill>
                </div>
                <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                  Created {formatDate(listing.createdAt)} · Updated {formatDate(listing.updatedAt)}
                </p>
                {listing.status === "pending_review" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton
                      tone="primary"
                      onClick={() => reviewListing(listing.id, "approved")}
                      busy={actionState === `${listing.id}:approved`}
                      disabled={actionState !== null}
                    >
                      Approve
                    </ActionButton>
                    <ActionButton
                      tone="danger"
                      onClick={() => reviewListing(listing.id, "rejected")}
                      busy={actionState === `${listing.id}:rejected`}
                      disabled={actionState !== null}
                    >
                      Reject
                    </ActionButton>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Top Installed Listings
            </h3>
            {data?.topListings.map((listing) => (
              <div
                key={`${listing.id}-top`}
                className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {listing.title}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {listing.ownerOrgName || listing.publisherEmail || "Unknown owner"}
                    </p>
                  </div>
                  <StatusPill tone={listingTone(listing.status)}>
                    {listing.status}
                  </StatusPill>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-[var(--text-secondary)]">
                  <span>{formatNumber(listing.installCount)} installs</span>
                  <span>Updated {formatDate(listing.updatedAt)}</span>
                </div>
                {listing.status === "pending_review" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton
                      tone="primary"
                      onClick={() => reviewListing(listing.id, "approved")}
                      busy={actionState === `${listing.id}:approved`}
                      disabled={actionState !== null}
                    >
                      Approve
                    </ActionButton>
                    <ActionButton
                      tone="danger"
                      onClick={() => reviewListing(listing.id, "rejected")}
                      busy={actionState === `${listing.id}:rejected`}
                      disabled={actionState !== null}
                    >
                      Reject
                    </ActionButton>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {!loading &&
        data &&
        data.recentListings.length === 0 &&
        data.topListings.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            No listings matched the current filters.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
