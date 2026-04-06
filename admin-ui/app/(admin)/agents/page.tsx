"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { Bot, Cable, Hammer, Waypoints } from "lucide-react";

import { fetchAdminJson, mutateAdminJson } from "@/lib/admin-api";
import {
  ActionButton,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
  fieldClassName,
  formatDate,
  formatNumber,
} from "../_components/AdminPrimitives";

interface AgentRecord {
  id: string;
  name: string;
  description: string;
  status: string;
  sandboxCount: number;
  sandboxIds: string[];
  forgeSandboxId: string | null;
  createdAt: string;
  creatorEmail: string | null;
  creatorDisplayName: string | null;
  orgName: string | null;
  orgSlug: string | null;
  orgKind: string | null;
  toolConnectionCount: number;
  runtimeInputCount: number;
  triggerCount: number;
  channelCount: number;
}

interface AgentsResponse {
  items: AgentRecord[];
  total: number;
}

function statusTone(status: string) {
  if (status === "active") return "success";
  if (status === "forging") return "warning";
  return "neutral";
}

export default function AgentsPage() {
  const [data, setData] = useState<AgentsResponse>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionState, setActionState] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const deferredSearch = useDeferredValue(search);

  const loadAgents = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (deferredSearch) params.set("search", deferredSearch);
    if (statusFilter) params.set("status", statusFilter);

    fetchAdminJson<AgentsResponse>(`/api/admin/agents?${params.toString()}`)
      .then((response) => {
        setData(response);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load agents");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAgents();
  }, [deferredSearch, statusFilter]);

  const restartSandboxes = async (sandboxIds: string[], kind: string) => {
    if (sandboxIds.length === 0) return;
    const confirmed = window.confirm(
      `Restart ${sandboxIds.length} ${kind} sandbox${sandboxIds.length === 1 ? "" : "es"}?`,
    );
    if (!confirmed) return;

    const key = `restart:${sandboxIds.join(",")}`;
    setActionState(key);
    try {
      for (const sandboxId of sandboxIds) {
        await mutateAdminJson(`/api/admin/sandboxes/${sandboxId}/restart`, "POST");
      }
      loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart sandbox");
    } finally {
      setActionState(null);
    }
  };

  const deleteAgent = async (agentId: string, agentName: string) => {
    const confirmed = window.confirm(
      `Delete agent ${agentName}? Runtime and forge sandboxes linked to it will also be cleaned up.`,
    );
    if (!confirmed) return;

    setActionState(`delete:${agentId}`);
    try {
      await mutateAdminJson(`/api/admin/agents/${agentId}`, "DELETE");
      loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setActionState(null);
    }
  };

  const activeAgents = data.items.filter((agent) => agent.status === "active").length;
  const forgingAgents = data.items.filter((agent) => agent.status === "forging").length;
  const sandboxAttachments = data.items.reduce(
    (sum, agent) => sum + agent.sandboxCount,
    0,
  );
  const forgeLinks = data.items.filter((agent) => agent.forgeSandboxId).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Global agent oversight across creators, owning organizations, runtime attachments, and operational readiness."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Visible Agents"
          value={data.total}
          detail="Agents matching the current filters."
          icon={Bot}
          tone="primary"
        />
        <MetricCard
          label="Active"
          value={activeAgents}
          detail={`${forgingAgents} forging and ${data.total - activeAgents - forgingAgents} draft`}
          icon={Waypoints}
          tone="success"
        />
        <MetricCard
          label="Runtime Attachments"
          value={sandboxAttachments}
          detail="Tracked runtime sandbox links across the current result set."
          icon={Cable}
          tone="warning"
        />
        <MetricCard
          label="Forge Links"
          value={forgeLinks}
          detail="Agents still holding a forge sandbox reference."
          icon={Hammer}
          tone="danger"
        />
      </div>

      <Panel
        title="Agent Inventory"
        description="Ownership and runtime context for every visible agent."
        actions={
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search agent, owner, or org"
              className={fieldClassName}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={fieldClassName}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="forging">Forging</option>
            </select>
          </div>
        }
      >
        {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <tr>
                <th className="pb-3 font-semibold">Agent</th>
                <th className="pb-3 font-semibold">Owner</th>
                <th className="pb-3 font-semibold">Runtime</th>
                <th className="pb-3 font-semibold">Capability</th>
                <th className="pb-3 font-semibold">Created</th>
                <th className="pb-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((agent) => (
                <tr key={agent.id} className="border-t border-[var(--border-default)]">
                  <td className="py-4 pr-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--text-primary)]">
                          {agent.name}
                        </p>
                        <StatusPill tone={statusTone(agent.status)}>
                          {agent.status}
                        </StatusPill>
                      </div>
                      <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                        {agent.description || "No agent description saved."}
                      </p>
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="space-y-2">
                      <p className="font-medium text-[var(--text-primary)]">
                        {agent.creatorDisplayName || agent.creatorEmail || "Unknown creator"}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {agent.creatorEmail || "No creator email"}
                      </p>
                      {agent.orgName ? (
                        <div className="flex items-center gap-2">
                          <StatusPill tone={agent.orgKind === "developer" ? "primary" : "warning"}>
                            {agent.orgKind}
                          </StatusPill>
                          <span className="text-sm text-[var(--text-secondary)]">
                            {agent.orgName} ({agent.orgSlug})
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)]">
                          No owning organization recorded
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="space-y-2">
                      <p className="font-medium text-[var(--text-primary)]">
                        {formatNumber(agent.sandboxCount)} runtime sandboxes
                      </p>
                      {agent.sandboxIds.length ? (
                        <div className="flex max-w-md flex-wrap gap-2">
                          {agent.sandboxIds.map((sandboxId) => (
                            <StatusPill key={sandboxId} tone="neutral">
                              {sandboxId}
                            </StatusPill>
                          ))}
                        </div>
                      ) : null}
                      {agent.forgeSandboxId ? (
                        <StatusPill tone="warning">
                          Forge: {agent.forgeSandboxId}
                        </StatusPill>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <StatusPill tone="primary">
                        {agent.toolConnectionCount} tools
                      </StatusPill>
                      <StatusPill tone="warning">
                        {agent.runtimeInputCount} runtime inputs
                      </StatusPill>
                      <StatusPill tone="neutral">
                        {agent.triggerCount} triggers
                      </StatusPill>
                      <StatusPill tone="success">
                        {agent.channelCount} channels
                      </StatusPill>
                    </div>
                  </td>
                  <td className="py-4 pr-4 text-sm text-[var(--text-secondary)]">
                    {formatDate(agent.createdAt)}
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex flex-col gap-2 md:items-end">
                      {agent.sandboxIds.length ? (
                        <ActionButton
                          onClick={() => restartSandboxes(agent.sandboxIds, "runtime")}
                          busy={
                            actionState === `restart:${agent.sandboxIds.join(",")}`
                          }
                          disabled={actionState !== null}
                        >
                          Restart runtime
                        </ActionButton>
                      ) : null}
                      {agent.forgeSandboxId ? (
                        <ActionButton
                          onClick={() =>
                            restartSandboxes([agent.forgeSandboxId!], "forge")
                          }
                          busy={actionState === `restart:${agent.forgeSandboxId}`}
                          disabled={actionState !== null}
                        >
                          Restart forge
                        </ActionButton>
                      ) : null}
                      <ActionButton
                        tone="danger"
                        onClick={() => deleteAgent(agent.id, agent.name)}
                        busy={actionState === `delete:${agent.id}`}
                        disabled={actionState !== null}
                      >
                        Delete agent
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && data.items.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            No agents matched the current filters.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
