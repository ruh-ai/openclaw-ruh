/**
 * Platform detection — detects whether running in Tauri desktop or web browser.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export function getPlatform(): "desktop" | "web" {
  return isTauri() ? "desktop" : "web";
}
