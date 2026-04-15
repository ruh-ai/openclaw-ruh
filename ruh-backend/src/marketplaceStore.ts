/**
 * Data store for the Employee Marketplace — listings, reviews, installs.
 * Follows the same withConn + raw SQL pattern as userStore.ts.
 *
 * @kb: 016-marketplace 005-data-models
 */

import { v4 as uuidv4 } from "uuid";
import { withConn } from "./db";

// ── Interfaces ───────────────────────────────────────────────────────────────

export type ListingStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected"
  | "archived";

export interface ListingRecord {
  id: string;
  agentId: string;
  publisherId: string;
  ownerOrgId: string | null;
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  iconUrl: string | null;
  screenshots: string[];
  version: string;
  status: ListingStatus;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  repoUrl: string | null;
  installCount: number;
  avgRating: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRecord {
  id: string;
  listingId: string;
  userId: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstallRecord {
  id: string;
  listingId: string;
  orgId: string;
  userId: string;
  agentId: string;
  sourceAgentVersionId: string | null;
  version: string;
  installedAt: string;
  lastLaunchedAt: string | null;
}

export interface InstalledListingRecord {
  installId: string;
  listingId: string;
  orgId: string;
  userId: string;
  agentId: string;
  sourceAgentVersionId: string | null;
  installedVersion: string;
  installedAt: string;
  lastLaunchedAt: string | null;
  listing: ListingRecord;
}

// ── Serializers ──────────────────────────────────────────────────────────────

function serializeListingRow(row: Record<string, unknown>): ListingRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    publisherId: String(row.publisher_id),
    ownerOrgId: row.owner_org_id ? String(row.owner_org_id) : null,
    title: String(row.title),
    slug: String(row.slug),
    summary: String(row.summary),
    description: String(row.description),
    category: String(row.category),
    tags: Array.isArray(row.tags)
      ? row.tags
      : JSON.parse(String(row.tags || "[]")),
    iconUrl: row.icon_url ? String(row.icon_url) : null,
    screenshots: Array.isArray(row.screenshots)
      ? row.screenshots
      : JSON.parse(String(row.screenshots || "[]")),
    version: String(row.version),
    status: String(row.status) as ListingStatus,
    reviewNotes: row.review_notes ? String(row.review_notes) : null,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    repoUrl: row.repo_url ? String(row.repo_url) : null,
    installCount: Number(row.install_count),
    avgRating: Number(row.avg_rating ?? 0),
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function serializeReviewRow(row: Record<string, unknown>): ReviewRecord {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    userId: String(row.user_id),
    rating: Number(row.rating),
    title: row.title ? String(row.title) : null,
    body: row.body ? String(row.body) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function serializeInstallRow(row: Record<string, unknown>): InstallRecord {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    orgId: String(row.org_id),
    userId: String(row.user_id),
    agentId: String(row.agent_id),
    sourceAgentVersionId: row.source_agent_version_id
      ? String(row.source_agent_version_id)
      : null,
    version: String(row.version),
    installedAt: String(row.installed_at),
    lastLaunchedAt: row.last_launched_at ? String(row.last_launched_at) : null,
  };
}

function serializeInstalledListingRow(
  row: Record<string, unknown>,
): InstalledListingRecord {
  const listingValue = row.listing;
  const listingRow =
    listingValue && typeof listingValue === "object"
      ? (listingValue as Record<string, unknown>)
      : (JSON.parse(String(listingValue || "{}")) as Record<string, unknown>);

  return {
    installId: String(row.install_id),
    listingId: String(row.listing_id),
    orgId: String(row.org_id),
    userId: String(row.user_id),
    agentId: String(row.agent_id),
    sourceAgentVersionId: row.source_agent_version_id
      ? String(row.source_agent_version_id)
      : null,
    installedVersion: String(row.installed_version),
    installedAt: String(row.installed_at),
    lastLaunchedAt: row.last_launched_at ? String(row.last_launched_at) : null,
    listing: serializeListingRow(listingRow),
  };
}

// ── Slug helper ──────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Listings ─────────────────────────────────────────────────────────────────

export async function createListing(data: {
  agentId: string;
  publisherId: string;
  ownerOrgId?: string | null;
  title: string;
  summary?: string;
  description?: string;
  category?: string;
  tags?: string[];
  iconUrl?: string;
  screenshots?: string[];
  version?: string;
  repoUrl?: string | null;
}): Promise<ListingRecord> {
  return withConn(async (client) => {
    const id = uuidv4();
    const slug = slugify(data.title) + "-" + id.slice(0, 8);
    const result = await client.query(
      `INSERT INTO marketplace_listings
         (id, agent_id, publisher_id, owner_org_id, title, slug, summary, description, category, tags, icon_url, screenshots, version, repo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        id,
        data.agentId,
        data.publisherId,
        data.ownerOrgId ?? null,
        data.title,
        slug,
        data.summary ?? "",
        data.description ?? "",
        data.category ?? "general",
        JSON.stringify(data.tags ?? []),
        data.iconUrl ?? null,
        JSON.stringify(data.screenshots ?? []),
        data.version ?? "1.0.0",
        data.repoUrl ?? null,
      ],
    );
    return serializeListingRow(result.rows[0]);
  });
}

export async function getListingById(
  id: string,
): Promise<ListingRecord | null> {
  return withConn(async (client) => {
    const result = await client.query(
      "SELECT * FROM marketplace_listings WHERE id = $1",
      [id],
    );
    return result.rows[0] ? serializeListingRow(result.rows[0]) : null;
  });
}

export async function getListingByAgentId(
  agentId: string,
): Promise<ListingRecord | null> {
  return withConn(async (client) => {
    const result = await client.query(
      "SELECT * FROM marketplace_listings WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1",
      [agentId],
    );
    return result.rows[0] ? serializeListingRow(result.rows[0]) : null;
  });
}

export async function getListingBySlug(
  slug: string,
): Promise<ListingRecord | null> {
  return withConn(async (client) => {
    const result = await client.query(
      "SELECT * FROM marketplace_listings WHERE slug = $1",
      [slug],
    );
    return result.rows[0] ? serializeListingRow(result.rows[0]) : null;
  });
}

export async function listPublishedListings(filters?: {
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: ListingRecord[]; total: number }> {
  return withConn(async (client) => {
    const conditions: string[] = [`status = 'published'`];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters?.category) {
      conditions.push(`category = $${paramIdx++}`);
      params.push(filters.category);
    }
    if (filters?.search) {
      conditions.push(
        `(title ILIKE $${paramIdx} OR summary ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`,
      );
      params.push(`%${filters.search}%`);
      paramIdx++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const limit = filters?.limit ?? 20;
    const page = filters?.page ?? 1;
    const offset = (page - 1) * limit;

    const countResult = await client.query(
      `SELECT COUNT(*) FROM marketplace_listings ${where}`,
      params,
    );
    const total = parseInt(String(countResult.rows[0].count), 10);

    const result = await client.query(
      `SELECT * FROM marketplace_listings ${where} ORDER BY published_at DESC NULLS LAST LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    return { items: result.rows.map(serializeListingRow), total };
  });
}

export async function listPendingListings(): Promise<ListingRecord[]> {
  return withConn(async (client) => {
    const result = await client.query(
      `SELECT * FROM marketplace_listings WHERE status = 'pending_review' ORDER BY updated_at ASC`,
    );
    return result.rows.map(serializeListingRow);
  });
}

export async function listUserListings(
  publisherId: string,
): Promise<ListingRecord[]> {
  return withConn(async (client) => {
    const result = await client.query(
      `SELECT * FROM marketplace_listings WHERE publisher_id = $1 ORDER BY created_at DESC`,
      [publisherId],
    );
    return result.rows.map(serializeListingRow);
  });
}

export async function listOrgListings(
  ownerOrgId: string,
): Promise<ListingRecord[]> {
  return withConn(async (client) => {
    const result = await client.query(
      `SELECT * FROM marketplace_listings WHERE owner_org_id = $1 ORDER BY created_at DESC`,
      [ownerOrgId],
    );
    return result.rows.map(serializeListingRow);
  });
}

export async function updateListing(
  id: string,
  patch: Partial<
    Pick<
      ListingRecord,
      | "title"
      | "summary"
      | "description"
      | "category"
      | "tags"
      | "iconUrl"
      | "screenshots"
      | "version"
    >
  >,
): Promise<ListingRecord | null> {
  return withConn(async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.title !== undefined) {
      sets.push(`title = $${idx++}`);
      params.push(patch.title);
    }
    if (patch.summary !== undefined) {
      sets.push(`summary = $${idx++}`);
      params.push(patch.summary);
    }
    if (patch.description !== undefined) {
      sets.push(`description = $${idx++}`);
      params.push(patch.description);
    }
    if (patch.category !== undefined) {
      sets.push(`category = $${idx++}`);
      params.push(patch.category);
    }
    if (patch.tags !== undefined) {
      sets.push(`tags = $${idx++}`);
      params.push(JSON.stringify(patch.tags));
    }
    if (patch.iconUrl !== undefined) {
      sets.push(`icon_url = $${idx++}`);
      params.push(patch.iconUrl);
    }
    if (patch.screenshots !== undefined) {
      sets.push(`screenshots = $${idx++}`);
      params.push(JSON.stringify(patch.screenshots));
    }
    if (patch.version !== undefined) {
      sets.push(`version = $${idx++}`);
      params.push(patch.version);
    }

    if (sets.length === 0) return getListingById(id);

    sets.push(`updated_at = NOW()`);
    const result = await client.query(
      `UPDATE marketplace_listings SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );
    return result.rows[0] ? serializeListingRow(result.rows[0]) : null;
  });
}

export async function updateListingStatus(
  id: string,
  status: ListingStatus,
  reviewedBy?: string,
  reviewNotes?: string,
): Promise<ListingRecord | null> {
  return withConn(async (client) => {
    const sets: string[] = [`status = $1`, `updated_at = NOW()`];
    const params: unknown[] = [status];
    let idx = 2;

    if (reviewedBy) {
      sets.push(`reviewed_by = $${idx++}`);
      params.push(reviewedBy);
      sets.push(`reviewed_at = NOW()`);
    }
    if (reviewNotes !== undefined) {
      sets.push(`review_notes = $${idx++}`);
      params.push(reviewNotes);
    }
    if (status === "published") {
      sets.push(`published_at = COALESCE(published_at, NOW())`);
    }

    const result = await client.query(
      `UPDATE marketplace_listings SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );
    return result.rows[0] ? serializeListingRow(result.rows[0]) : null;
  });
}

export async function incrementInstallCount(id: string): Promise<void> {
  await withConn(async (client) => {
    await client.query(
      `UPDATE marketplace_listings SET install_count = install_count + 1, updated_at = NOW() WHERE id = $1`,
      [id],
    );
  });
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export async function createReview(data: {
  listingId: string;
  userId: string;
  rating: number;
  title?: string;
  body?: string;
}): Promise<ReviewRecord> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO marketplace_reviews (id, listing_id, user_id, rating, title, body)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id,
        data.listingId,
        data.userId,
        data.rating,
        data.title ?? null,
        data.body ?? null,
      ],
    );

    // Update average rating on the listing
    await client.query(
      `UPDATE marketplace_listings
       SET avg_rating = (SELECT COALESCE(AVG(rating), 0) FROM marketplace_reviews WHERE listing_id = $1),
           updated_at = NOW()
       WHERE id = $1`,
      [data.listingId],
    );

    return serializeReviewRow(result.rows[0]);
  });
}

export async function listReviews(listingId: string): Promise<ReviewRecord[]> {
  return withConn(async (client) => {
    const result = await client.query(
      `SELECT * FROM marketplace_reviews WHERE listing_id = $1 ORDER BY created_at DESC`,
      [listingId],
    );
    return result.rows.map(serializeReviewRow);
  });
}

// ── Installs ─────────────────────────────────────────────────────────────────

export async function createInstall(data: {
  listingId: string;
  orgId: string;
  userId: string;
  agentId: string;
  sourceAgentVersionId?: string | null;
  version: string;
}): Promise<InstallRecord> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO marketplace_runtime_installs
         (id, listing_id, org_id, user_id, agent_id, source_agent_version_id, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        data.listingId,
        data.orgId,
        data.userId,
        data.agentId,
        data.sourceAgentVersionId ?? null,
        data.version,
      ],
    );
    return serializeInstallRow(result.rows[0]);
  });
}

export async function removeInstall(
  listingId: string,
  orgId: string,
  userId: string,
): Promise<boolean> {
  return withConn(async (client) => {
    const result = await client.query(
      `DELETE FROM marketplace_runtime_installs WHERE listing_id = $1 AND org_id = $2 AND user_id = $3`,
      [listingId, orgId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function listUserInstalls(
  userId: string,
  orgId: string,
): Promise<InstallRecord[]> {
  return withConn(async (client) => {
    const result = await client.query(
      `SELECT * FROM marketplace_runtime_installs
       WHERE user_id = $1 AND org_id = $2
       ORDER BY installed_at DESC`,
      [userId, orgId],
    );
    return result.rows.map(serializeInstallRow);
  });
}

export async function listInstalledListings(
  userId: string,
  orgId: string,
): Promise<InstalledListingRecord[]> {
  return withConn(async (client) => {
    const result = await client.query(
      `SELECT
         i.id AS install_id,
         i.listing_id,
         i.org_id,
         i.user_id,
         i.agent_id,
         i.source_agent_version_id,
         i.version AS installed_version,
         i.installed_at,
         i.last_launched_at,
         row_to_json(l) AS listing
       FROM marketplace_runtime_installs i
       JOIN marketplace_listings l ON l.id = i.listing_id
       WHERE i.user_id = $1 AND i.org_id = $2
       ORDER BY i.installed_at DESC`,
      [userId, orgId],
    );
    return result.rows.map(serializeInstalledListingRow);
  });
}

export async function getInstall(
  listingId: string,
  orgId: string,
  userId: string,
): Promise<InstallRecord | null> {
  return withConn(async (client) => {
    const result = await client.query(
      `SELECT * FROM marketplace_runtime_installs
       WHERE listing_id = $1 AND org_id = $2 AND user_id = $3`,
      [listingId, orgId, userId],
    );
    return result.rows[0] ? serializeInstallRow(result.rows[0]) : null;
  });
}

export async function markInstallLaunched(id: string): Promise<void> {
  await withConn(async (client) => {
    await client.query(
      `UPDATE marketplace_runtime_installs
       SET last_launched_at = NOW()
       WHERE id = $1`,
      [id],
    );
  });
}
