"use client";

import { useEffect, useState } from "react";
import { Activity, Server, ShieldCheck, Waypoints } from "lucide-react";

import { API_URL, fetchAdminJson } from "@/lib/admin-api";
import {
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
} from "../_components/AdminPrimitives";

interface RuntimeSummaryResponse {
  summary: {
    total: number;
    healthy: number;
    gateway_unreachable: number;
    db_only: number;
    container_only: number;
  };
}

export default function SystemPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSummaryResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/health`).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Health endpoint failed (${response.status})`);
        }
        return response.json() as Promise<Record<string, unknown>>;
      }),
      fetchAdminJson<RuntimeSummaryResponse>("/api/admin/runtime"),
    ])
      .then(([healthResponse, runtimeResponse]) => {
        setHealth(healthResponse);
        setRuntime(runtimeResponse);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load system data");
      })
      .finally(() => setLoading(false));
  }, []);

  const driftCount = runtime
    ? runtime.summary.gateway_unreachable +
      runtime.summary.db_only +
      runtime.summary.container_only
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System"
        description="Raw backend readiness plus runtime-derived operational context for the current admin session."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Health Endpoint"
          value={health ? "reachable" : loading ? "loading" : "down"}
          detail="Backend readiness response from `/health`."
          icon={Activity}
          tone={health ? "success" : "danger"}
        />
        <MetricCard
          label="Tracked Sandboxes"
          value={runtime?.summary.total ?? 0}
          detail="Runtime inventory visible to the admin panel."
          icon={Server}
          tone="primary"
        />
        <MetricCard
          label="Healthy Runtime"
          value={runtime?.summary.healthy ?? 0}
          detail={`${driftCount} runtime entries are not healthy.`}
          icon={ShieldCheck}
          tone={driftCount > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Runtime Drift"
          value={driftCount}
          detail="Gateway failures, DB-only rows, and container-only rows combined."
          icon={Waypoints}
          tone={driftCount > 0 ? "danger" : "neutral"}
        />
      </div>

      <Panel
        title="Backend Health Payload"
        description="Raw service data for debugging the current process state."
      >
        {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

        {health ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(health).map(([key, value]) => (
                <StatusPill
                  key={key}
                  tone={typeof value === "boolean" ? (value ? "success" : "danger") : "neutral"}
                >
                  {key}: {String(value)}
                </StatusPill>
              ))}
            </div>
            <pre className="overflow-x-auto rounded-3xl bg-[var(--bg-subtle)] p-5 text-xs text-[var(--text-secondary)]">
              {JSON.stringify(health, null, 2)}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {loading ? "Loading backend health…" : "No health payload available."}
          </p>
        )}
      </Panel>
    </div>
  );
}
