import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { getSecurityHeaders } from "./lib/security-headers";

const remotePatterns = [
  {
    protocol: "https",
    hostname: "storage.googleapis.com",
    port: "",
    pathname: "/**",
  },
  {
    protocol: "https",
    hostname: "firebasestorage.googleapis.com",
    port: "",
    pathname: "/**",
  },
  {
    protocol: "https",
    hostname: "ruh.ai",
    port: "",
    pathname: "/**",
  },
  {
    protocol: "https",
    hostname: "lh3.googleusercontent.com",
    port: "",
    pathname: "/**",
  },
  {
    protocol: "https",
    hostname: "*.googleusercontent.com",
    port: "",
    pathname: "/**",
  },
] as const;

const imageSources = remotePatterns.map((pattern) =>
  pattern.port
    ? `${pattern.protocol}://${pattern.hostname}:${pattern.port}`
    : `${pattern.protocol}://${pattern.hostname}`,
);

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ws", "bufferutil", "utf-8-validate"],

  typescript: {
    ignoreBuildErrors: false,
  },

  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders({
          apiUrl: process.env.NEXT_PUBLIC_API_URL,
          authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
          imageSources,
          nodeEnv: process.env.NODE_ENV,
        }),
      },
    ];
  },

  // Proxy sandbox preview requests so the Dashboard iframe loads from the same
  // origin (localhost:3000). This avoids cross-origin cookie/fetch issues that
  // break Next.js hydration inside the iframe.
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return {
      beforeFiles: [
        {
          source: "/api/sandbox-preview/:sandboxId/proxy/:port",
          destination: `${apiUrl}/api/sandboxes/:sandboxId/preview/proxy/:port/`,
        },
        {
          source: "/api/sandbox-preview/:sandboxId/proxy/:port/:path*",
          destination: `${apiUrl}/api/sandboxes/:sandboxId/preview/proxy/:port/:path*`,
        },
      ],
    };
  },

  images: {
    remotePatterns: [...remotePatterns],
  },

};

export default withSentryConfig(nextConfig, {
  // Only upload source maps when SENTRY_AUTH_TOKEN is set (CI/CD builds)
  silent: !process.env.SENTRY_AUTH_TOKEN,
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
});
