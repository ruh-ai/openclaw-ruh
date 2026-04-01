/**
 * Marketplace routes — browse, publish, review, and install agent listings.
 * Mounted at /api/marketplace in app.ts.
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { requireAuth, requireRole, optionalAuth } from "./auth/middleware";
import { requireActiveDeveloperOrg } from "./auth/builderAccess";
import { requireActiveCustomerOrg } from "./auth/customerAccess";
import { httpError } from "./utils";
import * as marketplaceStore from "./marketplaceStore";
import * as agentStore from "./agentStore";
import * as agentVersionStore from "./agentVersionStore";
import {
  buildInstalledAgentSeed,
  buildPublishedRuntimeSnapshot,
  type AgentRuntimeSnapshot,
} from "./marketplaceRuntime";
import * as store from "./store";
import { stopAndRemoveContainer } from "./sandboxManager";

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export const CATEGORIES = [
  "general",
  "marketing",
  "sales",
  "support",
  "engineering",
  "data",
  "finance",
  "hr",
  "operations",
  "custom",
] as const;

const router = Router();

async function requireBuilderContext(req: Request) {
  return requireActiveDeveloperOrg(req.user);
}

async function requireCustomerContext(req: Request) {
  return requireActiveCustomerOrg(req.user);
}

async function ensurePublishedListingSnapshot(
  listing: marketplaceStore.ListingRecord,
): Promise<agentVersionStore.AgentVersionRecord<AgentRuntimeSnapshot>> {
  const existing =
    await agentVersionStore.getAgentVersionByVersion<AgentRuntimeSnapshot>(
      listing.agentId,
      listing.version,
    );
  if (existing) {
    return existing;
  }

  const sourceAgent = await agentStore.getAgent(listing.agentId);
  if (!sourceAgent) {
    throw httpError(404, "The source agent for this listing no longer exists");
  }

  return agentVersionStore.createAgentVersion<AgentRuntimeSnapshot>({
    agentId: sourceAgent.id,
    version: listing.version,
    changelog: `Marketplace publish snapshot for listing ${listing.id}`,
    snapshot: buildPublishedRuntimeSnapshot(sourceAgent),
    createdBy: listing.publisherId,
  });
}

function canManageListing(
  listing: marketplaceStore.ListingRecord,
  builderContext: Awaited<ReturnType<typeof requireBuilderContext>>,
  userId: string,
  role: string,
) {
  if (role === "admin") {
    return true;
  }

  if (listing.ownerOrgId) {
    return listing.ownerOrgId === builderContext.organization.id;
  }

  return listing.publisherId === userId;
}

// ── GET /categories ──────────────────────────────────────────────────────────

router.get("/categories", (_req, res) => {
  res.json({ categories: CATEGORIES });
});

// ── GET /listings ────────────────────────────────────────────────────────────

router.get(
  "/listings",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { category, search, page, limit } = req.query;

    if (
      category &&
      !CATEGORIES.includes(category as (typeof CATEGORIES)[number])
    ) {
      throw httpError(400, `Invalid category: ${category}`);
    }

    const result = await marketplaceStore.listPublishedListings({
      category: category as string | undefined,
      search: search as string | undefined,
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? Math.min(parseInt(String(limit), 10), 100) : 20,
    });

    res.json(result);
  }),
);

// ── GET /listings/:slug ──────────────────────────────────────────────────────

router.get(
  "/listings/:slug",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const listing = await marketplaceStore.getListingBySlug(req.params.slug);
    if (!listing) {
      // Also try by ID as fallback
      const byId = await marketplaceStore.getListingById(req.params.slug);
      if (!byId) throw httpError(404, "Listing not found");
      res.json(byId);
      return;
    }
    res.json(listing);
  }),
);

// ── POST /listings ───────────────────────────────────────────────────────────

router.post(
  "/listings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const builderContext = await requireBuilderContext(req);
    const {
      agentId,
      title,
      summary,
      description,
      category,
      tags,
      iconUrl,
      screenshots,
      version,
    } = req.body;

    if (!agentId || !title) {
      throw httpError(400, "agentId and title are required");
    }
    if (typeof title !== "string" || title.length < 3) {
      throw httpError(400, "Title must be at least 3 characters");
    }
    if (
      category &&
      !CATEGORIES.includes(category as (typeof CATEGORIES)[number])
    ) {
      throw httpError(400, `Invalid category: ${category}`);
    }

    const ownership = await agentStore.getAgentOwnership(String(agentId));
    if (!ownership) {
      throw httpError(404, "Agent not found");
    }
    if (ownership.createdBy !== req.user!.userId) {
      throw httpError(
        403,
        "Only the agent creator can publish it to the marketplace",
      );
    }
    if (ownership.orgId !== builderContext.organization.id) {
      throw httpError(
        403,
        "The active developer organization must own the agent being published",
      );
    }

    const listing = await marketplaceStore.createListing({
      agentId,
      publisherId: req.user!.userId,
      ownerOrgId: builderContext.organization.id,
      title,
      summary,
      description,
      category,
      tags,
      iconUrl,
      screenshots,
      version,
    });

    res.status(201).json(listing);
  }),
);

// ── PATCH /listings/:id ──────────────────────────────────────────────────────

router.patch(
  "/listings/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const builderContext = await requireBuilderContext(req);
    const listing = await marketplaceStore.getListingById(req.params.id);
    if (!listing) throw httpError(404, "Listing not found");

    // Only owner can update
    if (
      !canManageListing(
        listing,
        builderContext,
        req.user!.userId,
        req.user!.role,
      )
    ) {
      throw httpError(403, "Only the listing owner can update it");
    }

    // Cannot update published listings without going back to draft
    if (listing.status === "published" && req.user!.role !== "admin") {
      throw httpError(
        400,
        "Cannot update a published listing directly. Create a new version.",
      );
    }

    const {
      title,
      summary,
      description,
      category,
      tags,
      iconUrl,
      screenshots,
      version,
    } = req.body;

    if (
      category &&
      !CATEGORIES.includes(category as (typeof CATEGORIES)[number])
    ) {
      throw httpError(400, `Invalid category: ${category}`);
    }

    const updated = await marketplaceStore.updateListing(req.params.id, {
      title,
      summary,
      description,
      category,
      tags,
      iconUrl,
      screenshots,
      version,
    });

    res.json(updated);
  }),
);

// ── POST /listings/:id/submit ────────────────────────────────────────────────

router.post(
  "/listings/:id/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const builderContext = await requireBuilderContext(req);
    const listing = await marketplaceStore.getListingById(req.params.id);
    if (!listing) throw httpError(404, "Listing not found");

    if (
      !canManageListing(
        listing,
        builderContext,
        req.user!.userId,
        req.user!.role,
      )
    ) {
      throw httpError(403, "Only the listing owner can submit for review");
    }
    if (listing.status !== "draft" && listing.status !== "rejected") {
      throw httpError(
        400,
        `Cannot submit a listing with status: ${listing.status}`,
      );
    }

    const updated = await marketplaceStore.updateListingStatus(
      req.params.id,
      "pending_review",
    );
    res.json(updated);
  }),
);

// ── POST /listings/:id/review ────────────────────────────────────────────────

router.post(
  "/listings/:id/review",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const listing = await marketplaceStore.getListingById(req.params.id);
    if (!listing) throw httpError(404, "Listing not found");

    if (listing.status !== "pending_review") {
      throw httpError(
        400,
        `Cannot review a listing with status: ${listing.status}`,
      );
    }

    const { decision, notes } = req.body;
    if (!decision || !["approved", "rejected"].includes(decision)) {
      throw httpError(400, 'decision must be "approved" or "rejected"');
    }

    const newStatus = decision === "approved" ? "published" : "rejected";
    if (newStatus === "published") {
      await ensurePublishedListingSnapshot(listing);
    }
    const updated = await marketplaceStore.updateListingStatus(
      req.params.id,
      newStatus as marketplaceStore.ListingStatus,
      req.user!.userId,
      notes,
    );

    res.json(updated);
  }),
);

// ── GET /listings/:id/reviews ────────────────────────────────────────────────

router.get(
  "/listings/:id/reviews",
  asyncHandler(async (req, res) => {
    const reviews = await marketplaceStore.listReviews(req.params.id);
    res.json({ items: reviews });
  }),
);

// ── POST /listings/:id/reviews ───────────────────────────────────────────────

router.post(
  "/listings/:id/reviews",
  requireAuth,
  asyncHandler(async (req, res) => {
    const listing = await marketplaceStore.getListingById(req.params.id);
    if (!listing) throw httpError(404, "Listing not found");
    if (listing.status !== "published") {
      throw httpError(400, "Can only review published listings");
    }

    const { rating, title, body } = req.body;
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      throw httpError(400, "rating must be an integer between 1 and 5");
    }

    const review = await marketplaceStore.createReview({
      listingId: req.params.id,
      userId: req.user!.userId,
      rating,
      title,
      body,
    });

    res.status(201).json(review);
  }),
);

// ── POST /listings/:id/install ───────────────────────────────────────────────

router.post(
  "/listings/:id/install",
  requireAuth,
  asyncHandler(async (req, res) => {
    const customerContext = await requireCustomerContext(req);
    const listing = await marketplaceStore.getListingById(req.params.id);
    if (!listing) throw httpError(404, "Listing not found");
    if (listing.status !== "published") {
      throw httpError(400, "Can only install published listings");
    }

    const existingInstall = await marketplaceStore.getInstall(
      req.params.id,
      customerContext.organization.id,
      req.user!.userId,
    );
    if (existingInstall) {
      res.json(existingInstall);
      return;
    }

    const sourceVersion = await ensurePublishedListingSnapshot(listing);
    const installedAgent = await agentStore.saveAgent(
      buildInstalledAgentSeed(sourceVersion.snapshot, {
        userId: req.user!.userId,
        orgId: customerContext.organization.id,
        fallbackName: listing.title,
        fallbackDescription: listing.summary || listing.description,
      }),
    );

    const install = await marketplaceStore.createInstall({
      listingId: req.params.id,
      orgId: customerContext.organization.id,
      userId: req.user!.userId,
      agentId: installedAgent.id,
      sourceAgentVersionId: sourceVersion.id,
      version: listing.version,
    });

    await marketplaceStore.incrementInstallCount(req.params.id);

    res.status(201).json({
      ...install,
      agentId: installedAgent.id,
    });
  }),
);

// ── DELETE /listings/:id/install ─────────────────────────────────────────────

router.delete(
  "/listings/:id/install",
  requireAuth,
  asyncHandler(async (req, res) => {
    const customerContext = await requireCustomerContext(req);
    const install = await marketplaceStore.getInstall(
      req.params.id,
      customerContext.organization.id,
      req.user!.userId,
    );
    if (!install) throw httpError(404, "Install not found");

    const agent = await agentStore.getAgentForCreatorInOrg(
      install.agentId,
      req.user!.userId,
      customerContext.organization.id,
    );
    if (agent) {
      for (const sandboxId of agent.sandbox_ids ?? []) {
        await store.deleteSandbox(sandboxId).catch(() => {});
        stopAndRemoveContainer(sandboxId).catch(() => {});
      }
      await agentStore.deleteAgent(agent.id);
    }

    const removed = await marketplaceStore.removeInstall(
      req.params.id,
      customerContext.organization.id,
      req.user!.userId,
    );
    if (!removed) throw httpError(404, "Install not found");
    res.json({ ok: true, agentId: install.agentId });
  }),
);

// ── GET /my/installs ─────────────────────────────────────────────────────────

router.get(
  "/my/installs",
  requireAuth,
  asyncHandler(async (req, res) => {
    const customerContext = await requireCustomerContext(req);
    const installs = await marketplaceStore.listUserInstalls(
      req.user!.userId,
      customerContext.organization.id,
    );
    res.json({ items: installs });
  }),
);

// ── GET /my/installed-listings ──────────────────────────────────────────────

router.get(
  "/my/installed-listings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const customerContext = await requireCustomerContext(req);
    const installs = await marketplaceStore.listInstalledListings(
      req.user!.userId,
      customerContext.organization.id,
    );
    res.json({ items: installs });
  }),
);

// ── GET /my/listings ─────────────────────────────────────────────────────────

router.get(
  "/my/listings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const builderContext = await requireBuilderContext(req);
    const listings = await marketplaceStore.listOrgListings(
      builderContext.organization.id,
    );
    res.json({ items: listings });
  }),
);

export { router as marketplaceRouter };
