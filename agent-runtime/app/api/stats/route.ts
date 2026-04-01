import { NextResponse } from "next/server";
import { getDb } from "@/src/db";

export async function GET() {
  const db = getDb();

  const today = new Date().toISOString().split("T")[0];

  const tasksByStatus = db
    .prepare("SELECT status, COUNT(*) as count FROM tasks GROUP BY status")
    .all() as Array<{ status: string; count: number }>;

  const todayActivity = db
    .prepare("SELECT COUNT(*) as count FROM activity_log WHERE created_at >= ?")
    .get(today) as { count: number };

  const tasksCompleted = db
    .prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'done' AND completed_at >= ?")
    .get(today) as { count: number };

  const totalTasks = db
    .prepare("SELECT COUNT(*) as count FROM tasks")
    .get() as { count: number };

  const totalReports = db
    .prepare("SELECT COUNT(*) as count FROM reports")
    .get() as { count: number };

  const errorCount = db
    .prepare("SELECT COUNT(*) as count FROM activity_log WHERE type LIKE 'error%' AND created_at >= ?")
    .get(today) as { count: number };

  return NextResponse.json({
    tasks: Object.fromEntries(tasksByStatus.map((r) => [r.status, r.count])),
    totalTasks: totalTasks.count,
    tasksCompletedToday: tasksCompleted.count,
    activityToday: todayActivity.count,
    totalReports: totalReports.count,
    errorsToday: errorCount.count,
  });
}
