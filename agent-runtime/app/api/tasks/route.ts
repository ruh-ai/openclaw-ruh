import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/src/db";
import { randomUUID } from "crypto";

export async function GET() {
  const db = getDb();
  const tasks = db
    .prepare(
      "SELECT * FROM tasks ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'review' THEN 1 WHEN 'backlog' THEN 2 WHEN 'done' THEN 3 ELSE 4 END, priority DESC, created_at DESC"
    )
    .all();
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, priority, due_at } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO tasks (id, title, description, priority, due_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, title, description || "", priority || 0, due_at || null);

  // Log activity
  db.prepare(
    "INSERT INTO activity_log (type, summary, details) VALUES (?, ?, ?)"
  ).run("task.created", `Task created: ${title}`, JSON.stringify({ task_id: id }));

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  return NextResponse.json({ task }, { status: 201 });
}
