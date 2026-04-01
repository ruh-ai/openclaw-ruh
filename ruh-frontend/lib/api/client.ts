export function apiFetch(
  input: string | URL | globalThis.Request,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: "include",
  });
}

export function createAuthenticatedEventSource(url: string): EventSource {
  return new EventSource(url, { withCredentials: true });
}
