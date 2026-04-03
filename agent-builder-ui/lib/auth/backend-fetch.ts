import { useUserStore } from "@/hooks/use-user";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.accessToken) {
      const store = useUserStore.getState();
      if (store.user) {
        store.setUser({ ...store.user, accessToken: data.accessToken });
      }
    }
    return true;
  } catch {
    return false;
  }
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

  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    headers,
  });

  if (response.status === 401) {
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      const retryHeaders = new Headers(init.headers ?? {});
      const newToken = useUserStore.getState().user?.accessToken;
      if (newToken) {
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
      }
      return fetch(input, {
        ...init,
        credentials: init.credentials ?? "include",
        headers: retryHeaders,
      });
    }
  }

  return response;
}
