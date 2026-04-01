import Link from "next/link";
import { agentsRoute, toolsRoute } from "@/shared/routes";
import { getMarketplaceDestination } from "@/lib/utils/marketplace-url";

export default function MarketplacePage() {
  const marketplaceDestination = getMarketplaceDestination();

  return (
    <section className="flex h-full w-full items-center justify-center px-6 py-10">
      <div className="max-w-xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-secondary-font">
          Developer Workspace
        </div>
        <h1 className="mt-3 text-2xl font-bold text-brand-primary-font">
          Marketplace lives in the customer app
        </h1>
        <p className="mt-3 text-sm leading-6 text-brand-secondary-font">
          This builder route exists to catch stale bookmarks and older deep links.
          Browse the actual marketplace in the customer surface, or return to Agents
          and Tools to keep building.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {marketplaceDestination ? (
            <Link
              href={marketplaceDestination}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Open Marketplace
            </Link>
          ) : null}
          <Link
            href={agentsRoute}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-brand-primary-font"
          >
            Go to Agents
          </Link>
          <Link
            href={toolsRoute}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-brand-primary-font"
          >
            Open Tools
          </Link>
        </div>
        {marketplaceDestination ? (
          <p className="mt-4 text-xs leading-5 text-brand-secondary-font">
            Destination: {marketplaceDestination}
          </p>
        ) : (
          <p className="mt-4 text-xs leading-5 text-brand-secondary-font">
            Set <code>NEXT_PUBLIC_MARKETPLACE_URL</code> in the builder env to wire
            this route to the live marketplace surface outside local development.
          </p>
        )}
      </div>
    </section>
  );
}
