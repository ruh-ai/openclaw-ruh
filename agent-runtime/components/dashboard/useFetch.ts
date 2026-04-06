"use client";

import { useEffect, useState, useCallback } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Simple data-fetching hook for dashboard pages.
 * Fetches from the agent-runtime API (same origin).
 *
 * Usage:
 *   const { data, loading } = useFetch<Stats>("/api/stats");
 *   const { data } = useFetch<Row[]>("/api/query", {
 *     method: "POST",
 *     body: { sql: "SELECT * FROM bookings LIMIT 20" },
 *   });
 */
export function useFetch<T = unknown>(
  url: string,
  options?: {
    method?: string;
    body?: unknown;
    refreshInterval?: number;
  },
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const fetchOptions: RequestInit = {};
        if (options?.method) fetchOptions.method = options.method;
        if (options?.body) {
          fetchOptions.method = fetchOptions.method || "POST";
          fetchOptions.headers = { "Content-Type": "application/json" };
          fetchOptions.body = JSON.stringify(options.body);
        }

        const res = await fetch(url, fetchOptions);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(err.error || `Request failed: ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json as T);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fetch failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick]);

  // Auto-refresh
  useEffect(() => {
    if (!options?.refreshInterval) return;
    const interval = setInterval(refetch, options.refreshInterval);
    return () => clearInterval(interval);
  }, [options?.refreshInterval, refetch]);

  return { data, loading, error, refetch };
}
