import { MarketplaceDetailClient } from "./MarketplaceDetailClient";

export default async function MarketplaceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <MarketplaceDetailClient slug={slug} />;
}
