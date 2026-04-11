import { useUserStore } from "@/hooks/use-user";

// Read refresh token from browser cookies (client-side safe).
function readRefreshTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)refreshToken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Singleton refresh promise to coalesce concurrent 401 retries
let refreshInFlight: Promise<string | null> | null = null;

async function tryRefreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refreshToken = readRefreshTokenFromCookie();
      if (!refreshToken) return null;

      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        credentials: "include",
      });
      if (!res.ok) return null;

      const data = await res.json();
      const newToken = data.accessToken as string | undefined;
      if (newToken) {
        // Update the user store so subsequent requests use the new token
        const store = useUserStore.getState();
        if (store.user) {
          store.setUser({ ...store.user, accessToken: newToken });
        }
      }
      return newToken ?? null;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function fetchBackendWithAuth(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const accessToken = useUserStore.getState().user?.accessToken;

  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  // Distributed trace correlation — lets backend trace requests back to this client
  if (!headers.has("x-request-id")) {
    headers.set("x-request-id", crypto.randomUUID());
  }

  const res = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    headers,
  });

  // On 401, try refreshing the token and retry once
  if (res.status === 401) {
    const newToken = await tryRefreshAccessToken();
    if (newToken) {
      const retryHeaders = new Headers(init.headers ?? {});
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
      return fetch(input, {
        ...init,
        credentials: init.credentials ?? "include",
        headers: retryHeaders,
      });
    }
  }

  return res;
}
