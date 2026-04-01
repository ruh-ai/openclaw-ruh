"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Report {
  id: string;
  task_id: string | null;
  type: string;
  title: string;
  content: string;
  created_at: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  daily_summary: { label: "Daily Summary", icon: CheckCircle2, color: "var(--success)" },
  task_report: { label: "Task Report", icon: FileText, color: "var(--info)" },
  error_report: { label: "Error Report", icon: AlertTriangle, color: "var(--error)" },
  custom: { label: "Report", icon: FileText, color: "var(--text-secondary)" },
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    fetch("/api/reports").then((r) => r.json()).then((d) => setReports(d.reports || [])).catch(() => {});
  }, []);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Work Reports</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Structured output from your agent&apos;s work
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <FileText className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-tertiary)]">No reports yet.</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Reports are generated when your agent completes tasks.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const meta = TYPE_META[report.type] || TYPE_META.custom;
            return (
              <Link
                key={report.id}
                href={`/reports/${report.id}`}
                className="block rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}
                  >
                    <meta.icon className="h-4 w-4" style={{ color: meta.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{report.title}</p>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--bg-muted)] text-[var(--text-tertiary)]">
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                      {report.content.slice(0, 200)}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <Clock className="h-3 w-3 text-[var(--text-tertiary)]" />
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {new Date(report.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
