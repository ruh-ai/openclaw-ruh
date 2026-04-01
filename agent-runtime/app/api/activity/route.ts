import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/src/db";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") || "20");
  const before = req.nextUrl.searchParams.get("before");

  const db = getDb();
  const items = before
    ? db.prepare("SELECT * FROM activity_log WHERE id < ? ORDER BY id DESC LIMIT ?").all(before, limit)
    : db.prepare("SELECT * FROM activity_log ORDER BY id DESC LIMIT ?").all(limit);

  const cursor = items.length > 0 ? (items[items.length - 1] as { id: number }).id : null;
  return NextResponse.json({ items, cursor });
}
