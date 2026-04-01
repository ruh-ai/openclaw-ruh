import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/src/db";
import { randomUUID } from "crypto";

export async function GET() {
  const db = getDb();
  const reports = db
    .prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT 50")
    .all();
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, content, type, task_id, data } = body;

  if (!title || !content || !type) {
    return NextResponse.json(
      { error: "title, content, and type are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO reports (id, task_id, type, title, content, data) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, task_id || null, type, title, content, JSON.stringify(data || {}));

  db.prepare(
    "INSERT INTO activity_log (type, summary, details) VALUES (?, ?, ?)"
  ).run("report.created", `Report: ${title}`, JSON.stringify({ report_id: id, type }));

  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  return NextResponse.json({ report }, { status: 201 });
}
