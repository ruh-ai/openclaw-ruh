function normalizeMarketplaceUrl(value: string): string {
  const url = new URL(value);
  const hasCustomPath = url.pathname && url.pathname !== "/";

  if (!hasCustomPath) {
    url.pathname = "/marketplace";
  }

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/$/, "");
  }

  return url.toString();
}

export function getMarketplaceDestination(): string | null {
  const explicitMarketplaceUrl = process.env.NEXT_PUBLIC_MARKETPLACE_URL?.trim();
  if (explicitMarketplaceUrl) {
    return normalizeMarketplaceUrl(explicitMarketplaceUrl);
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000/marketplace";
  }

  return null;
}
