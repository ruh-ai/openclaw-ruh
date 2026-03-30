/**
 * Marketplace routes — browse, publish, review, and install agent listings.
 * Mounted at /api/marketplace in app.ts.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireRole, optionalAuth } from './auth/middleware';
import { httpError } from './utils';
import * as marketplaceStore from './marketplaceStore';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export const CATEGORIES = [
  'general',
  'marketing',
  'sales',
  'support',
  'engineering',
  'data',
  'finance',
  'hr',
  'operations',
  'custom',
] as const;

const router = Router();

// ── GET /categories ──────────────────────────────────────────────────────────

router.get('/categories', (_req, res) => {
  res.json({ categories: CATEGORIES });
});

// ── GET /listings ────────────────────────────────────────────────────────────

router.get('/listings', optionalAuth, asyncHandler(async (req, res) => {
  const { category, search, page, limit } = req.query;

  if (category && !CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    throw httpError(400, `Invalid category: ${category}`);
  }

  const result = await marketplaceStore.listPublishedListings({
    category: category as string | undefined,
    search: search as string | undefined,
    page: page ? parseInt(String(page), 10) : 1,
    limit: limit ? Math.min(parseInt(String(limit), 10), 100) : 20,
  });

  res.json(result);
}));

// ── GET /listings/:slug ──────────────────────────────────────────────────────

router.get('/listings/:slug', optionalAuth, asyncHandler(async (req, res) => {
  const listing = await marketplaceStore.getListingBySlug(req.params.slug);
  if (!listing) {
    // Also try by ID as fallback
    const byId = await marketplaceStore.getListingById(req.params.slug);
    if (!byId) throw httpError(404, 'Listing not found');
    res.json(byId);
    return;
  }
  res.json(listing);
}));

// ── POST /listings ───────────────────────────────────────────────────────────

router.post('/listings', requireAuth, requireRole('developer', 'admin'), asyncHandler(async (req, res) => {
  const { agentId, title, summary, description, category, tags, iconUrl, screenshots, version } = req.body;

  if (!agentId || !title) {
    throw httpError(400, 'agentId and title are required');
  }
  if (typeof title !== 'string' || title.length < 3) {
    throw httpError(400, 'Title must be at least 3 characters');
  }
  if (category && !CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    throw httpError(400, `Invalid category: ${category}`);
  }

  const listing = await marketplaceStore.createListing({
    agentId,
    publisherId: req.user!.userId,
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
}));

// ── PATCH /listings/:id ──────────────────────────────────────────────────────

router.patch('/listings/:id', requireAuth, asyncHandler(async (req, res) => {
  const listing = await marketplaceStore.getListingById(req.params.id);
  if (!listing) throw httpError(404, 'Listing not found');

  // Only owner can update
  if (listing.publisherId !== req.user!.userId && req.user!.role !== 'admin') {
    throw httpError(403, 'Only the listing owner can update it');
  }

  // Cannot update published listings without going back to draft
  if (listing.status === 'published' && req.user!.role !== 'admin') {
    throw httpError(400, 'Cannot update a published listing directly. Create a new version.');
  }

  const { title, summary, description, category, tags, iconUrl, screenshots, version } = req.body;

  if (category && !CATEGORIES.includes(category as typeof CATEGORIES[number])) {
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
}));

// ── POST /listings/:id/submit ────────────────────────────────────────────────

router.post('/listings/:id/submit', requireAuth, asyncHandler(async (req, res) => {
  const listing = await marketplaceStore.getListingById(req.params.id);
  if (!listing) throw httpError(404, 'Listing not found');

  if (listing.publisherId !== req.user!.userId) {
    throw httpError(403, 'Only the listing owner can submit for review');
  }
  if (listing.status !== 'draft' && listing.status !== 'rejected') {
    throw httpError(400, `Cannot submit a listing with status: ${listing.status}`);
  }

  const updated = await marketplaceStore.updateListingStatus(req.params.id, 'pending_review');
  res.json(updated);
}));

// ── POST /listings/:id/review ────────────────────────────────────────────────

router.post('/listings/:id/review', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const listing = await marketplaceStore.getListingById(req.params.id);
  if (!listing) throw httpError(404, 'Listing not found');

  if (listing.status !== 'pending_review') {
    throw httpError(400, `Cannot review a listing with status: ${listing.status}`);
  }

  const { decision, notes } = req.body;
  if (!decision || !['approved', 'rejected'].includes(decision)) {
    throw httpError(400, 'decision must be "approved" or "rejected"');
  }

  const newStatus = decision === 'approved' ? 'published' : 'rejected';
  const updated = await marketplaceStore.updateListingStatus(
    req.params.id,
    newStatus as marketplaceStore.ListingStatus,
    req.user!.userId,
    notes,
  );

  res.json(updated);
}));

// ── GET /listings/:id/reviews ────────────────────────────────────────────────

router.get('/listings/:id/reviews', asyncHandler(async (req, res) => {
  const reviews = await marketplaceStore.listReviews(req.params.id);
  res.json({ items: reviews });
}));

// ── POST /listings/:id/reviews ───────────────────────────────────────────────

router.post('/listings/:id/reviews', requireAuth, asyncHandler(async (req, res) => {
  const listing = await marketplaceStore.getListingById(req.params.id);
  if (!listing) throw httpError(404, 'Listing not found');
  if (listing.status !== 'published') {
    throw httpError(400, 'Can only review published listings');
  }

  const { rating, title, body } = req.body;
  if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
    throw httpError(400, 'rating must be an integer between 1 and 5');
  }

  const review = await marketplaceStore.createReview({
    listingId: req.params.id,
    userId: req.user!.userId,
    rating,
    title,
    body,
  });

  res.status(201).json(review);
}));

// ── POST /listings/:id/install ───────────────────────────────────────────────

router.post('/listings/:id/install', requireAuth, asyncHandler(async (req, res) => {
  const listing = await marketplaceStore.getListingById(req.params.id);
  if (!listing) throw httpError(404, 'Listing not found');
  if (listing.status !== 'published') {
    throw httpError(400, 'Can only install published listings');
  }

  const install = await marketplaceStore.createInstall({
    listingId: req.params.id,
    userId: req.user!.userId,
    version: listing.version,
  });

  await marketplaceStore.incrementInstallCount(req.params.id);

  res.status(201).json(install);
}));

// ── DELETE /listings/:id/install ─────────────────────────────────────────────

router.delete('/listings/:id/install', requireAuth, asyncHandler(async (req, res) => {
  const removed = await marketplaceStore.removeInstall(req.params.id, req.user!.userId);
  if (!removed) throw httpError(404, 'Install not found');
  res.json({ ok: true });
}));

// ── GET /my/installs ─────────────────────────────────────────────────────────

router.get('/my/installs', requireAuth, asyncHandler(async (req, res) => {
  const installs = await marketplaceStore.listUserInstalls(req.user!.userId);
  res.json({ items: installs });
}));

// ── GET /my/listings ─────────────────────────────────────────────────────────

router.get('/my/listings', requireAuth, asyncHandler(async (req, res) => {
  const listings = await marketplaceStore.listUserListings(req.user!.userId);
  res.json({ items: listings });
}));

export { router as marketplaceRouter };
