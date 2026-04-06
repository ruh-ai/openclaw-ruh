import { NextRequest, NextResponse } from "next/server";
import { vectorStore } from "@/src/vector";

/**
 * GET /api/vectors?collection=memory&limit=10
 * List vectors in a collection, or list all collections if no collection specified.
 */
export async function GET(req: NextRequest) {
  const collection = req.nextUrl.searchParams.get("collection");

  if (!collection) {
    return NextResponse.json({ collections: vectorStore.collections() });
  }

  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const db = (await import("@/src/db")).getDb();
  const rows = db
    .prepare("SELECT id, collection, content, metadata, created_at FROM vectors WHERE collection = ? ORDER BY created_at DESC LIMIT ?")
    .all(collection, limit) as Array<{
      id: string; collection: string; content: string; metadata: string; created_at: string;
    }>;

  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      metadata: JSON.parse(r.metadata),
    })),
    count: vectorStore.count(collection),
  });
}

/**
 * POST /api/vectors
 * Upsert a vector. Body: { collection, id, content, embedding, metadata? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { collection, id, content, embedding, metadata } = body;

  if (!collection || !id || !content || !embedding) {
    return NextResponse.json(
      { error: "collection, id, content, and embedding are required" },
      { status: 400 },
    );
  }

  vectorStore.upsert(collection, id, content, embedding, metadata ?? {});
  return NextResponse.json({ ok: true, id, collection });
}
