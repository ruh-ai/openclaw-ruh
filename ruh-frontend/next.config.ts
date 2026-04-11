import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
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

export default withSentryConfig(nextConfig, {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
});
