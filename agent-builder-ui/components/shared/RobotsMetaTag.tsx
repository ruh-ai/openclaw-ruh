import { headers } from "next/headers";

/**
 * Component that conditionally renders robots meta tag based on hostname
 * Only shows noindex for development URL
 */
export default async function RobotsMetaTag() {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  // Check if this is a development URL that should be noindexed
  const isDevelopmentUrl =
    host.includes("rapidinnovation.dev") || host.includes("localhost");

  if (isDevelopmentUrl) {
    return <meta name="robots" content="noindex" />;
  }

  return null;
}
