"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { ScrollText, ShieldAlert, Target, UserRound } from "lucide-react";

import { fetchAdminJson } from "@/lib/admin-api";
import {
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
  formatDate,
} from "../_components/AdminPrimitives";

interface AuditEvent {
  event_id: string;
  occurred_at: string;
  action_type: string;
  target_type: string;
  target_id: string;
  outcome: string;
  actor_type: string;
  actor_id: string;
  request_id: string | null;
  details: Record<string, unknown>;
}

interface AuditResponse {
  items: AuditEvent[];
  has_more: boolean;
}

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse>({ items: [], has_more: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionType, setActionType] = useState("");
  const [targetType, setTargetType] = useState("");
  const [actorType, setActorType] = useState("");
  const [outcome, setOutcome] = useState("");
  const [targetId, setTargetId] = useState("");
  const [actorId, setActorId] = useState("");
  const deferredTargetId = useDeferredValue(targetId);
  const deferredActorId = useDeferredValue(actorId);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (actionType) params.set("action_type", actionType);
    if (targetType) params.set("target_type", targetType);
    if (actorType) params.set("actor_type", actorType);
    if (outcome) params.set("outcome", outcome);
    if (deferredTargetId) params.set("target_id", deferredTargetId);
    if (deferredActorId) params.set("actor_id", deferredActorId);

    fetchAdminJson<AuditResponse>(`/api/admin/audit-events?${params.toString()}`)
      .then((response) => {
        setData(response);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load audit events");
      })
      .finally(() => setLoading(false));
  }, [actionType, targetType, actorType, outcome, deferredTargetId, deferredActorId]);

  const successCount = data.items.filter((item) => item.outcome === "success").length;
  const failureCount = data.items.filter((item) => item.outcome !== "success").length;
  const actorCount = new Set(data.items.map((item) => `${item.actor_type}:${item.actor_id}`)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit"
        description="Filterable control-plane event history across actors, targets, outcomes, and request-level context."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Visible Events"
          value={data.items.length}
          detail={data.has_more ? "More events exist beyond the current page." : "Current filter result is fully loaded."}
          icon={ScrollText}
          tone="primary"
        />
        <MetricCard
          label="Success"
          value={successCount}
          detail={`${failureCount} non-success events in the current result set.`}
          icon={ShieldAlert}
          tone={failureCount > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Distinct Actors"
          value={actorCount}
          detail="Unique actor identities represented in this slice."
          icon={UserRound}
          tone="neutral"
        />
        <MetricCard
          label="Distinct Targets"
          value={new Set(data.items.map((item) => `${item.target_type}:${item.target_id}`)).size}
          detail="Unique target resources represented in this slice."
          icon={Target}
          tone="danger"
        />
      </div>

      <Panel
        title="Event Stream"
        description="JWT-admin sessions now use the same audit feed directly from the admin panel."
        actions={
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <input
              type="text"
              value={actionType}
              onChange={(event) => setActionType(event.target.value)}
              placeholder="Action type"
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-2 text-sm outline-none"
            />
            <input
              type="text"
              value={targetType}
              onChange={(event) => setTargetType(event.target.value)}
              placeholder="Target type"
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-2 text-sm outline-none"
            />
            <input
              type="text"
              value={actorType}
              onChange={(event) => setActorType(event.target.value)}
              placeholder="Actor type"
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-2 text-sm outline-none"
            />
            <select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-2 text-sm outline-none"
            >
              <option value="">All outcomes</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
            <input
              type="text"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              placeholder="Target id"
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-2 text-sm outline-none"
            />
            <input
              type="text"
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              placeholder="Actor id"
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-2 text-sm outline-none"
            />
          </div>
        }
      >
        {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="space-y-3">
          {data.items.map((event) => (
            <div
              key={event.event_id}
              className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-5"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={event.outcome === "success" ? "success" : "danger"}>
                      {event.outcome}
                    </StatusPill>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {event.action_type}
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm text-[var(--text-secondary)]">
                    <p>
                      Target:{" "}
                      <span className="font-medium text-[var(--text-primary)]">
                        {event.target_type} / {event.target_id}
                      </span>
                    </p>
                    <p>
                      Actor:{" "}
                      <span className="font-medium text-[var(--text-primary)]">
                        {event.actor_type} / {event.actor_id}
                      </span>
                    </p>
                    {event.request_id ? (
                      <p>
                        Request:{" "}
                        <span className="font-medium text-[var(--text-primary)]">
                          {event.request_id}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="min-w-[15rem] text-sm text-[var(--text-secondary)]">
                  <p>{formatDate(event.occurred_at)}</p>
                </div>
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-[var(--card-color)] p-4 text-xs text-[var(--text-secondary)]">
                {JSON.stringify(event.details, null, 2)}
              </pre>
            </div>
          ))}
        </div>

        {!loading && data.items.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            No audit events matched the current filters.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
