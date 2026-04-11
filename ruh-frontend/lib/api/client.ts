export function apiFetch(
  input: string | URL | globalThis.Request,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});

  // Distributed trace correlation
  if (!headers.has("x-request-id")) {
    headers.set("x-request-id", crypto.randomUUID());
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}

export function createAuthenticatedEventSource(url: string): EventSource {
  return new EventSource(url, { withCredentials: true });
}
