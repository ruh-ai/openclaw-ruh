/**
 * use-github-connection.ts — Hook for GitHub OAuth connection status.
 */
import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useGitHubConnection() {
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/github/status`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected ?? false);
        setUsername(data.username ?? null);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const connect = useCallback((redirectPath?: string) => {
    const redirect = redirectPath ?? window.location.pathname + window.location.search;
    window.location.href = `${API_BASE}/api/auth/github?redirect=${encodeURIComponent(redirect)}`;
  }, []);

  return { connected, username, loading, connect, refresh: checkStatus };
}
