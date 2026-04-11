/**
 * Marketplace routes — browse, publish, review, and install agent listings.
 * Mounted at /api/marketplace in app.ts.
 *
 * @kb: 016-marketplace 004-api-reference
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
import { streams as _streams } from "./streamRegistry";
import { v4 as uuidv4 } from "uuid";

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
      repoUrl,
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

    // If no repoUrl provided, try to get it from the source agent
    let effectiveRepoUrl = repoUrl;
    if (!effectiveRepoUrl) {
      const sourceAgent = await agentStore.getAgent(String(agentId));
      effectiveRepoUrl = sourceAgent?.repo_url ?? null;
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
      repoUrl: effectiveRepoUrl,
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

// ── POST /listings/auto-publish ─────────────────────────────────────────────
// One-step publish: creates a listing and immediately publishes it.
// Used by the Ship stage so deployed agents appear in the marketplace
// without a manual review step. Only the agent creator can call this.

router.post(
  "/listings/auto-publish",
  requireAuth,
  asyncHandler(async (req, res) => {
    const builderContext = await requireBuilderContext(req);
    const { agentId, title, summary, description, category, tags } = req.body;

    if (!agentId || !title) {
      throw httpError(400, "agentId and title are required");
    }

    // Check if a listing already exists for this agent
    const existing = await marketplaceStore.getListingByAgentId(String(agentId));
    if (existing) {
      // If already published, return it as-is
      if (existing.status === "published") {
        res.json(existing);
        return;
      }
      // If draft/rejected, update and publish it
      if (existing.status === "draft" || existing.status === "rejected") {
        await ensurePublishedListingSnapshot(existing);
        const updated = await marketplaceStore.updateListingStatus(
          existing.id,
          "published",
          req.user!.userId,
          "Auto-published on deploy",
        );
        res.json(updated);
        return;
      }
    }

    // Verify ownership
    const ownership = await agentStore.getAgentOwnership(String(agentId));
    if (!ownership) {
      throw httpError(404, "Agent not found");
    }
    if (ownership.createdBy !== req.user!.userId && req.user!.role !== "admin") {
      throw httpError(403, "Only the agent creator can publish it");
    }

    // Create + publish in one step
    const listing = await marketplaceStore.createListing({
      agentId: String(agentId),
      publisherId: req.user!.userId,
      ownerOrgId: builderContext.organization.id,
      title: String(title),
      summary: summary ? String(summary) : "",
      description: description ? String(description) : "",
      category: category ? String(category) : "general",
      tags: Array.isArray(tags) ? tags : [],
    });

    await ensurePublishedListingSnapshot(listing);
    const published = await marketplaceStore.updateListingStatus(
      listing.id,
      "published",
      req.user!.userId,
      "Auto-published on deploy",
    );

    res.status(201).json(published);
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

    // V3 agents with repo_url: trigger sandbox provisioning with clone + setup
    const repoUrl = sourceVersion.snapshot.repoUrl;
    if (repoUrl) {
      const kebabName = installedAgent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const streamId = uuidv4();
      _streams.set(streamId, {
        status: "pending",
        request: {
          sandbox_name: `install-${kebabName}`,
          forge_agent_id: installedAgent.id,
          reproduce_repo_url: repoUrl,
          run_agent_setup: true,
        },
      });

      res.status(201).json({
        ...install,
        agentId: installedAgent.id,
        streamId,
        provisioning: true,
      });
      return;
    }

    // V2 agents (no repo_url): instant install from snapshot
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
