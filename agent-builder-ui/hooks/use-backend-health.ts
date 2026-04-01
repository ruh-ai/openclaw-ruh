"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface BackendHealthState {
  ready: boolean;
  checking: boolean;
  error: string | null;
}

export function useBackendHealth(): BackendHealthState {
  const [state, setState] = useState<BackendHealthState>({
    ready: true, // optimistic default to avoid flash
    checking: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`${API_BASE}/ready`, { signal: AbortSignal.timeout(5000) });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setState({ ready: data.ready === true, checking: false, error: data.ready ? null : (data.reason ?? "Backend not ready") });
        } else {
          setState({ ready: false, checking: false, error: `Backend returned ${res.status}` });
        }
      } catch {
        if (cancelled) return;
        setState({ ready: false, checking: false, error: "Backend is not reachable" });
      }
    }

    check();

    return () => { cancelled = true; };
  }, []);

  return state;
}
