import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ws", "bufferutil", "utf-8-validate"],

  typescript: {
    ignoreBuildErrors: false,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  reactStrictMode: true,

  images: {
    remotePatterns: [
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
    ],
  },
};

export default nextConfig;
