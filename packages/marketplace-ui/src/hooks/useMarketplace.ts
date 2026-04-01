import { useState, useCallback } from "react";
import type { MarketplaceListing, MarketplaceListingsResponse } from "../types";

interface UseMarketplaceOptions {
  apiUrl: string;
  accessToken?: string | null;
}

export function useMarketplace({ apiUrl, accessToken }: UseMarketplaceOptions) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }, [accessToken]);

  const fetchListings = useCallback(async (params?: { category?: string; search?: string; page?: number; limit?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (params?.category) qs.set("category", params.category);
      if (params?.search) qs.set("search", params.search);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      const res = await fetch(`${apiUrl}/api/marketplace/listings?${qs}`, { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to fetch listings");
      const data: MarketplaceListingsResponse = await res.json();
      setListings(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, getHeaders]);

  const getListing = useCallback(async (slug: string): Promise<MarketplaceListing | null> => {
    try {
      const res = await fetch(`${apiUrl}/api/marketplace/listings/${slug}`, { headers: getHeaders() });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }, [apiUrl, getHeaders]);

  const installListing = useCallback(async (listingId: string) => {
    const res = await fetch(`${apiUrl}/api/marketplace/listings/${listingId}/install`, {
      method: "POST",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Install failed");
  }, [apiUrl, getHeaders]);

  const uninstallListing = useCallback(async (listingId: string) => {
    const res = await fetch(`${apiUrl}/api/marketplace/listings/${listingId}/install`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Uninstall failed");
  }, [apiUrl, getHeaders]);

  return { listings, total, loading, error, fetchListings, getListing, installListing, uninstallListing };
}
