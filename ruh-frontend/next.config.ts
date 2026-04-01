import type { NextConfig } from "next";
import { getSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders({
          apiUrl: process.env.NEXT_PUBLIC_API_URL,
          nodeEnv: process.env.NODE_ENV,
        }),
      },
    ];
  },
};

export default nextConfig;
