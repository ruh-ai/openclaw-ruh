import { NextRequest, NextResponse } from "next/server";
import { vectorStore } from "@/src/vector";

/**
 * POST /api/vectors/search
 * Semantic search. Body: { collection, embedding, topK?, minScore? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { collection, embedding, topK, minScore } = body;

  if (!collection || !embedding) {
    return NextResponse.json(
      { error: "collection and embedding are required" },
      { status: 400 },
    );
  }

  const results = vectorStore.search(
    collection,
    embedding,
    topK ?? 5,
    minScore ?? 0.0,
  );

  return NextResponse.json({ results });
}
