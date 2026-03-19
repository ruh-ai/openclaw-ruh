/**
 * Utility functions for generating canonical URLs for SEO optimization
 */

export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  return "https://developer.openclaw.ruh.ai";
}

export function generateCanonicalUrl(path: string = ""): string {
  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedPath = cleanPath.replace(/\/$/, "") || "/";
  return `${baseUrl}${normalizedPath}`;
}

export function generateCanonicalMetadata(path: string = "") {
  return {
    alternates: {
      canonical: generateCanonicalUrl(path),
    },
  };
}
