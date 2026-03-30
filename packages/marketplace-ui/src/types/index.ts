export interface MarketplaceListing {
  id: string;
  agentId: string;
  publisherId: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  iconUrl: string | null;
  screenshots: string[];
  version: string;
  status: "draft" | "pending_review" | "published" | "rejected" | "archived";
  installCount: number;
  avgRating: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceReview {
  id: string;
  listingId: string;
  userId: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
}

export interface MarketplaceInstall {
  id: string;
  listingId: string;
  userId: string;
  version: string;
  installedAt: string;
}

export interface MarketplaceListingsResponse {
  items: MarketplaceListing[];
  total: number;
}

export const MARKETPLACE_CATEGORIES = [
  "general", "marketing", "sales", "support", "engineering",
  "data", "finance", "hr", "operations", "custom",
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];
