import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/src/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of ["title", "description", "status", "priority", "outcome", "error", "skill_used", "due_at"]) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  // Auto-set timestamps based on status transitions
  if (body.status === "in_progress" && existing.status !== "in_progress") {
    updates.push("started_at = datetime('now')");
  }
  if (body.status === "done" && existing.status !== "done") {
    updates.push("completed_at = datetime('now')");
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  // Log activity
  if (body.status && body.status !== existing.status) {
    db.prepare(
      "INSERT INTO activity_log (type, summary, details) VALUES (?, ?, ?)"
    ).run(
      `task.${body.status}`,
      `Task ${body.status}: ${existing.title}`,
      JSON.stringify({ task_id: id, from: existing.status, to: body.status })
    );
  }

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  return NextResponse.json({ task });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  db.prepare(
    "INSERT INTO activity_log (type, summary, details) VALUES (?, ?, ?)"
  ).run("task.deleted", `Task deleted: ${existing.title}`, JSON.stringify({ task_id: id }));

  return NextResponse.json({ ok: true });
}
