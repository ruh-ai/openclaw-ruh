"use client";
import { useEffect, useState } from "react";

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
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    fetch(`${API_URL}/api/marketplace/listings?${params}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setListings(data.items || []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [search, category]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold">Employee Marketplace</h1>
      <p className="text-sm text-gray-500 mt-1">Discover and install AI agents built by developers</p>

      <div className="flex gap-3 mt-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agents..."
          className="flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-500"
        />
        <select value={category} onChange={e => setCategory(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
          <option value="">All Categories</option>
          {CATEGORIES.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {listings.map(listing => (
          <a key={listing.id} href={`/marketplace/${listing.slug}`} className="block p-4 border rounded-xl hover:border-purple-300 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-lg">
                {listing.iconUrl ? <img src={listing.iconUrl} alt="" className="w-6 h-6" /> : "\u{1F916}"}
              </div>
              <div>
                <h3 className="text-sm font-bold">{listing.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{listing.summary}</p>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{listing.category}</span>
                  <span>{listing.installCount} installs</span>
                  {listing.avgRating > 0 && <span>{"\u2605"} {listing.avgRating.toFixed(1)}</span>}
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading...</div>}
      {!loading && listings.length === 0 && <div className="text-center py-12 text-gray-400">No agents published yet</div>}
    </div>
  );
}
