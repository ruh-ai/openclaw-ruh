import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/src/db";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const db = getDb();
  let events;
  if (from && to) {
    events = db
      .prepare("SELECT * FROM calendar_events WHERE starts_at >= ? AND starts_at <= ? ORDER BY starts_at")
      .all(from, to);
  } else {
    events = db
      .prepare("SELECT * FROM calendar_events ORDER BY starts_at DESC LIMIT 50")
      .all();
  }
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, type, starts_at, ends_at, recurrence, task_id } = body;

  if (!title || !type || !starts_at) {
    return NextResponse.json(
      { error: "title, type, and starts_at are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO calendar_events (id, task_id, title, type, starts_at, ends_at, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, task_id || null, title, type, starts_at, ends_at || null, recurrence || null);

  const event = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id);
  return NextResponse.json({ event }, { status: 201 });
}
