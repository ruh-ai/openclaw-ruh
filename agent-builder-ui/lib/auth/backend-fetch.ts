import { useUserStore } from "@/hooks/use-user";

export async function fetchBackendWithAuth(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const accessToken = useUserStore.getState().user?.accessToken;

  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    headers,
  });
}
