import type { MarketplaceListing } from "../types";

interface AgentCardProps {
  listing: MarketplaceListing;
  onClick?: () => void;
}

export function AgentCard({ listing, onClick }: AgentCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-[#e5e5e3] p-4 hover:border-[#ae00d0]/30 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#ae00d0]/10 flex items-center justify-center text-lg shrink-0">
          {listing.iconUrl ? (
            <img src={listing.iconUrl} alt="" className="w-6 h-6 rounded" />
          ) : (
            "\u{1F916}"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[#1a1a1a] group-hover:text-[#ae00d0] transition-colors truncate">
            {listing.title}
          </h3>
          <p className="text-[11px] text-[#8a8a8a] mt-0.5 line-clamp-2 leading-relaxed">
            {listing.summary}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-[#8a8a8a] bg-[#f5f5f3] px-1.5 py-0.5 rounded">
              {listing.category}
            </span>
            {listing.avgRating > 0 && (
              <span className="text-[10px] text-[#f59e0b]">
                {"\u2605".repeat(Math.round(listing.avgRating))} {listing.avgRating.toFixed(1)}
              </span>
            )}
            <span className="text-[10px] text-[#8a8a8a]">
              {listing.installCount} install{listing.installCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
