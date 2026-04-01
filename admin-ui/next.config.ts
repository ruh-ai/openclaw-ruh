import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow connecting to backend API
  async rewrites() {
    return [];
  },
};

export default nextConfig;
