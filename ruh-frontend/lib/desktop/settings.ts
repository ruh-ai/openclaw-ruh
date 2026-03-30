import { isTauri } from "../platform";

export interface AppSettings {
  backend_url: string;
  auto_connect: boolean;
  theme: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  backend_url: "http://localhost:8000",
  auto_connect: true,
  theme: "light",
};

export async function getSettings(): Promise<AppSettings> {
  if (!isTauri()) {
    const stored = localStorage.getItem("ruh-settings");
    return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AppSettings>("get_settings");
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem("ruh-settings", JSON.stringify(settings));
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("update_settings", { settings });
}
