import { isTauri } from "../platform";

interface Credentials {
  access_token: string;
  refresh_token: string;
}

export async function storeCredentials(accessToken: string, refreshToken: string): Promise<void> {
  if (!isTauri()) {
    // Web fallback: use cookies or localStorage
    document.cookie = `accessToken=${accessToken}; path=/; max-age=${15 * 60}; SameSite=Lax`;
    document.cookie = `refreshToken=${refreshToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("store_credentials", { accessToken, refreshToken });
}

export async function getCredentials(): Promise<Credentials | null> {
  if (!isTauri()) {
    // Web fallback
    const cookies = Object.fromEntries(
      document.cookie.split("; ").map(c => c.split("="))
    );
    if (cookies.accessToken && cookies.refreshToken) {
      return { access_token: cookies.accessToken, refresh_token: cookies.refreshToken };
    }
    return null;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Credentials | null>("get_credentials");
}

export async function clearCredentials(): Promise<void> {
  if (!isTauri()) {
    document.cookie = "accessToken=; path=/; max-age=0";
    document.cookie = "refreshToken=; path=/; max-age=0";
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("clear_credentials");
}
