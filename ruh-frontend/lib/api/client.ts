const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function apiFetch(
  input: string | URL | globalThis.Request,
  init?: RequestInit
): Promise<Response> {
  // Apply a default timeout unless the caller already provides a signal
  let controller: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const finalInit = { ...init, credentials: "include" as const };

  if (!finalInit.signal) {
    controller = new AbortController();
    finalInit.signal = controller.signal;
    timeoutId = setTimeout(() => controller!.abort(), DEFAULT_TIMEOUT_MS);
  }

  let response: Response;
  try {
    response = await fetch(input, finalInit);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    // Deduplicate concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;
    if (refreshed) {
      return fetch(input, { ...init, credentials: "include" });
    }
  }

  return response;
}

export function createAuthenticatedEventSource(url: string): EventSource {
  return new EventSource(url, { withCredentials: true });
}
