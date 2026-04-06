"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Listing {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  installCount: number;
  avgRating: number;
  iconUrl: string | null;
}

const CATEGORIES = ["", "general", "marketing", "sales", "support", "engineering", "data", "finance", "hr", "operations"];

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchListings = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search) params.set("search", search);
      try {
        const r = await apiFetch(`${API_URL}/api/marketplace/listings?${params}`);
        const data = r.ok ? await r.json() : { items: [] };
        if (!cancelled) setListings(data.items || []);
      } catch {
        if (!cancelled) setListings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchListings();
    return () => { cancelled = true; };
  }, [search, category]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="rounded-[32px] border border-[#eadfd4] bg-[radial-gradient(circle_at_top,_rgba(252,239,225,0.95),_rgba(255,255,255,0.92))] px-8 py-10 shadow-[0_24px_80px_-56px_rgba(88,58,35,0.4)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#946f53]">
          Marketplace
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-[#2f241d]">
          Discover deployable digital employees
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#6d5a4c]">
          Browse published agents that already exist in the backend catalog and
          open a real detail page before installing them into your workspace.
        </p>
      </div>

      <div className="mt-6 flex gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agents..."
          className="flex-1 rounded-2xl border border-[#dbcbbd] bg-white px-4 py-3 text-sm text-[#2f241d] outline-none transition focus:border-[#be9471]"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="rounded-2xl border border-[#dbcbbd] bg-white px-4 py-3 text-sm text-[#2f241d] outline-none transition focus:border-[#be9471]"
        >
          <option value="">All Categories</option>
          {CATEGORIES.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {listings.map(listing => (
          <Link
            key={listing.id}
            href={`/marketplace/${listing.slug}`}
            className="block rounded-[28px] border border-[#e7dbd0] bg-white/90 p-5 shadow-[0_18px_40px_-32px_rgba(70,50,34,0.4)] transition hover:-translate-y-0.5 hover:border-[#c8a789] hover:shadow-[0_22px_44px_-32px_rgba(70,50,34,0.5)]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_#fff3e8,_#f2dfcf)] text-lg">
                {listing.iconUrl ? <img src={listing.iconUrl} alt="" className="w-6 h-6" /> : "\u{1F916}"}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[#2f241d]">
                  {listing.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#6d5a4c]">
                  {listing.summary}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#836e60]">
                  <span className="rounded-full bg-[#f7efe8] px-2.5 py-1 font-medium text-[#8c6447]">
                    {listing.category}
                  </span>
                  <span>{listing.installCount} installs</span>
                  {listing.avgRating > 0 && <span>{"\u2605"} {listing.avgRating.toFixed(1)}</span>}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {loading && <div className="py-12 text-center text-sm text-[#7c695b]">Loading marketplace...</div>}
      {!loading && listings.length === 0 && <div className="py-12 text-center text-sm text-[#7c695b]">No agents published yet</div>}
    </div>
  );
}
