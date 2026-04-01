"use client";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SystemPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-lg font-bold text-[var(--text-primary)]">System Health</h1>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Backend and infrastructure status</p>

      <div className="mt-6 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-5">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : health ? (
          <pre className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap">
            {JSON.stringify(health, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-[var(--error)]">Failed to connect to backend</p>
        )}
      </div>
    </div>
  );
}
