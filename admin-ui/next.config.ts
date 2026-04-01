import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow connecting to backend API
  async rewrites() {
    return [];
  },
};

export default nextConfig;
