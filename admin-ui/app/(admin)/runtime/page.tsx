"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, ShieldCheck, TriangleAlert, Waypoints } from "lucide-react";

import { fetchAdminJson, mutateAdminJson } from "@/lib/admin-api";
import {
  ActionButton,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
  formatDate,
  formatNumber,
} from "../_components/AdminPrimitives";

interface RuntimeResponse {
  summary: {
    total: number;
    healthy: number;
    gateway_unreachable: number;
    db_only: number;
    container_only: number;
    approved: number;
    sharedCodexEnabled: number;
  };
  items: Array<{
    sandbox_id: string;
    sandbox_name: string | null;
    sandbox_state: string | null;
    drift_state: string;
    container_exists: boolean;
    container_running: boolean;
    container_status: string | null;
    approved: boolean;
    shared_codex_enabled: boolean;
    shared_codex_model: string | null;
    dashboard_url: string | null;
    standard_url: string | null;
    signed_url: string | null;
    created_at: string | null;
    linked_agents: Array<{
      id: string;
      name: string;
      status: string;
      attachment: "runtime" | "forge";
    }>;
  }>;
}

function driftTone(driftState: string) {
  if (driftState === "healthy") return "success";
  if (driftState === "gateway_unreachable") return "warning";
  return "danger";
}

export default function RuntimePage() {
  const [data, setData] = useState<RuntimeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionState, setActionState] = useState<string | null>(null);

  const loadRuntime = () => {
    setLoading(true);
    fetchAdminJson<RuntimeResponse>("/api/admin/runtime")
      .then((response) => {
        setData(response);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load runtime");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRuntime();
  }, []);

  const repair = async (sandboxId: string, action: string) => {
    const confirmed = window.confirm(
      `Run runtime repair '${action}' for sandbox ${sandboxId}?`,
    );
    if (!confirmed) {
      return;
    }

    setActionState(`${sandboxId}:${action}`);
    try {
      await mutateAdminJson(
        `/api/admin/sandboxes/${sandboxId}/reconcile/repair`,
        "POST",
        { action },
      );
      loadRuntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Repair failed");
    } finally {
      setActionState(null);
    }
  };

  const restartSandbox = async (sandboxId: string) => {
    const confirmed = window.confirm(`Restart sandbox ${sandboxId}?`);
    if (!confirmed) {
      return;
    }

    setActionState(`${sandboxId}:restart`);
    try {
      await mutateAdminJson(`/api/admin/sandboxes/${sandboxId}/restart`, "POST");
      loadRuntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restart failed");
    } finally {
      setActionState(null);
    }
  };

  const restartGateway = async (sandboxId: string) => {
    const confirmed = window.confirm(
      `Restart the OpenClaw gateway in sandbox ${sandboxId}?`,
    );
    if (!confirmed) {
      return;
    }

    setActionState(`${sandboxId}:gateway`);
    try {
      await mutateAdminJson(
        `/api/admin/sandboxes/${sandboxId}/gateway/restart`,
        "POST",
      );
      loadRuntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gateway restart failed");
    } finally {
      setActionState(null);
    }
  };

  const retrofitSharedCodex = async (sandboxId: string) => {
    const confirmed = window.confirm(
      `Retrofit sandbox ${sandboxId} to shared Codex authentication and model defaults?`,
    );
    if (!confirmed) {
      return;
    }

    setActionState(`${sandboxId}:retrofit`);
    try {
      await mutateAdminJson(
        `/api/admin/sandboxes/${sandboxId}/retrofit-shared-codex`,
        "POST",
      );
      loadRuntime();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Shared Codex retrofit failed",
      );
    } finally {
      setActionState(null);
    }
  };

  const driftCount = data
    ? data.summary.gateway_unreachable +
      data.summary.db_only +
      data.summary.container_only
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Runtime"
        description="Operator view over sandbox inventory, reconciliation drift, DB/runtime skew, and safe repair actions."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Tracked Sandboxes"
          value={data?.summary.total ?? 0}
          detail="Combined DB and Docker runtime inventory."
          icon={Waypoints}
          tone="primary"
        />
        <MetricCard
          label="Healthy"
          value={data?.summary.healthy ?? 0}
          detail={`${driftCount} items need review or repair.`}
          icon={ShieldCheck}
          tone={driftCount > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Runtime Drift"
          value={`${data?.summary.db_only ?? 0}/${data?.summary.container_only ?? 0}`}
          detail="DB-only versus container-only entries."
          icon={TriangleAlert}
          tone="danger"
        />
        <MetricCard
          label="Shared Codex"
          value={data?.summary.sharedCodexEnabled ?? 0}
          detail={`${data?.summary.approved ?? 0} approved sandboxes recorded in the DB.`}
          icon={DatabaseZap}
          tone="warning"
        />
      </div>

      <Panel
        title="Reconciliation"
        description="JWT-backed admin access now reaches the same repair surface that previously required an admin token."
      >
        {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="space-y-4">
          {data?.items.map((item) => {
            const openUrl =
              item.dashboard_url || item.signed_url || item.standard_url;
            const action =
              item.drift_state === "db_only"
                ? "delete_db_record"
                : item.drift_state === "container_only"
                  ? "remove_orphan_container"
                  : null;

            return (
              <div
                key={item.sandbox_id}
                className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-5"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-[var(--text-primary)]">
                        {item.sandbox_name || item.sandbox_id}
                      </p>
                      <StatusPill tone={driftTone(item.drift_state)}>
                        {item.drift_state}
                      </StatusPill>
                      {item.approved ? (
                        <StatusPill tone="success">approved</StatusPill>
                      ) : null}
                      {item.shared_codex_enabled ? (
                        <StatusPill tone="warning">
                          shared codex{item.shared_codex_model ? ` · ${item.shared_codex_model}` : ""}
                        </StatusPill>
                      ) : null}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {item.sandbox_id}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill tone={item.container_running ? "success" : "danger"}>
                        {item.container_running ? "container running" : "container stopped"}
                      </StatusPill>
                      <StatusPill tone={item.container_exists ? "primary" : "danger"}>
                        {item.container_exists ? "container present" : "no container"}
                      </StatusPill>
                      <StatusPill tone={item.sandbox_state === "running" ? "success" : "neutral"}>
                        DB state: {item.sandbox_state || "unknown"}
                      </StatusPill>
                    </div>
                    {item.linked_agents.length ? (
                      <div className="flex max-w-3xl flex-wrap gap-2">
                        {item.linked_agents.map((agent) => (
                          <StatusPill
                            key={`${item.sandbox_id}-${agent.id}-${agent.attachment}`}
                            tone={agent.attachment === "forge" ? "warning" : "primary"}
                          >
                            {agent.name} · {agent.attachment}
                          </StatusPill>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)]">
                        No linked agents were resolved for this sandbox.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 text-sm text-[var(--text-secondary)] xl:min-w-[16rem]">
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {item.container_status || "No container status"}
                      </p>
                      <p>Docker status</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {formatDate(item.created_at)}
                      </p>
                      <p>Created</p>
                    </div>
                    {openUrl ? (
                      <a
                        href={openUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-color)] px-4 py-2 text-center font-semibold text-[var(--accent-primary)]"
                      >
                        Open sandbox
                      </a>
                    ) : null}
                    {item.container_exists ? (
                      <ActionButton
                        onClick={() => restartSandbox(item.sandbox_id)}
                        busy={actionState === `${item.sandbox_id}:restart`}
                        disabled={actionState !== null}
                      >
                        Restart sandbox
                      </ActionButton>
                    ) : null}
                    {item.container_running ? (
                      <ActionButton
                        onClick={() => restartGateway(item.sandbox_id)}
                        busy={actionState === `${item.sandbox_id}:gateway`}
                        disabled={actionState !== null}
                      >
                        Restart gateway
                      </ActionButton>
                    ) : null}
                    {item.container_exists && item.approved && !item.shared_codex_enabled ? (
                      <ActionButton
                        tone="primary"
                        onClick={() => retrofitSharedCodex(item.sandbox_id)}
                        busy={actionState === `${item.sandbox_id}:retrofit`}
                        disabled={actionState !== null}
                      >
                        Enable shared Codex
                      </ActionButton>
                    ) : null}
                    {action ? (
                      <ActionButton
                        onClick={() => repair(item.sandbox_id, action)}
                        disabled={actionState === `${item.sandbox_id}:${action}`}
                        busy={actionState === `${item.sandbox_id}:${action}`}
                      >
                        {action === "delete_db_record"
                          ? "Delete stale DB record"
                          : "Remove orphan container"}
                      </ActionButton>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!loading && data && data.items.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            No runtime entries were returned by reconciliation.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
