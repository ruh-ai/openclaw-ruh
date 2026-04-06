export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function buildApiUrl(path: string) {
  return `${API_URL}${path}`;
}

export async function fetchAdminJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      message =
        payload?.message ||
        payload?.detail ||
        payload?.error ||
        message;
    } catch {
      // Ignore JSON parse failures and keep the generic message.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function mutateAdminJson<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  return fetchAdminJson<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
