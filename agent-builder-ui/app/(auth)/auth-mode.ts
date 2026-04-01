export function resolveAuthMode(authUrl?: string | null): "external" | "local" {
  return authUrl && authUrl.trim().length > 0 ? "external" : "local";
}
