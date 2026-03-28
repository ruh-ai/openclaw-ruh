import type { NextConfig } from "next";
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
  serverExternalPackages: ["ws", "bufferutil", "utf-8-validate"],

  typescript: {
    ignoreBuildErrors: false,
  },

  eslint: {
    ignoreDuringBuilds: true,
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

  images: {
    remotePatterns: [...remotePatterns],
  },

};

export default nextConfig;
