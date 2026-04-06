import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/src/db";

/**
 * POST /api/query
 * Execute a read-only SQL query against the agent's database.
 * Body: { sql: string, params?: unknown[] }
 *
 * Only SELECT statements are allowed — no writes through this endpoint.
 * Agent skills write data directly via the db module.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sql, params } = body;

  if (!sql || typeof sql !== "string") {
    return NextResponse.json({ error: "sql is required" }, { status: 400 });
  }

  // Only allow read operations
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH") && !normalized.startsWith("PRAGMA")) {
    return NextResponse.json(
      { error: "Only SELECT, WITH, and PRAGMA statements are allowed" },
      { status: 403 },
    );
  }

  try {
    const db = getDb();
    const rows = db.prepare(sql).all(...(params ?? []));
    return NextResponse.json({ rows, count: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Query failed" },
      { status: 400 },
    );
  }
}
