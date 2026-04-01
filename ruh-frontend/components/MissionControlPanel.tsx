"use client";

import { useEffect, useState, useCallback } from "react";
import type { SandboxRecord } from "./SandboxSidebar";
import CronsPanel from "./CronsPanel";
import ChannelsPanel from "./ChannelsPanel";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type MCTab = "overview" | "crons" | "channels";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso?: string): string {
  if (!iso) return "unknown";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Inline SVGs ───────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? "animate-spin" : ""}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    </svg>
  );
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} className="p-1.5 rounded-lg text-gray-400 hover:text-[#ae00d0] hover:bg-[#fdf4ff] transition-colors shrink-0">
      {copied ? <span className="text-green-500"><CheckIcon /></span> : <CopyIcon />}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{children}</p>;
}

// ── Overview sub-panel ────────────────────────────────────────────────────────

function OverviewPanel({ sandbox }: { sandbox: SandboxRecord }) {
  const [gatewayStatus, setGatewayStatus] = useState<Record<string, unknown> | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [convCount, setConvCount] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/status`);
      if (res.ok) setGatewayStatus(await res.json());
    } catch { /* silently fail */ }
    finally { setStatusLoading(false); }
  }, [sandbox.sandbox_id]);

  const fetchConvCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations`);
      if (res.ok) {
        const data = await res.json() as { items?: unknown[] };
        setConvCount((data.items ?? []).length);
      }
    } catch { setConvCount(null); }
  }, [sandbox.sandbox_id]);

  useEffect(() => { fetchStatus(); fetchConvCount(); }, [fetchStatus, fetchConvCount]);

  const sshCommand = sandbox.ssh_command || `docker exec -it openclaw-${sandbox.sandbox_id} bash`;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl space-y-6">

        {/* Gateway Status */}
        <div>
          <SectionTitle>Gateway Status</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-[#eff0f3] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                statusLoading ? "bg-gray-300 animate-pulse" : sandbox.approved ? "bg-green-400" : "bg-yellow-400 animate-pulse"
              }`} />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Health</p>
                <p className="text-sm font-semibold text-gray-900">
                  {statusLoading ? "Checking…" : sandbox.approved ? "Running" : "Pending"}
                </p>
              </div>
              <button onClick={fetchStatus} className="ml-auto text-gray-400 hover:text-[#ae00d0] transition-colors">
                <RefreshIcon spinning={statusLoading} />
              </button>
            </div>
            <div className="bg-white border border-[#eff0f3] rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Port</p>
              <p className="text-sm font-semibold text-gray-900 font-mono">
                {(gatewayStatus?.gateway_port as number | undefined) ?? sandbox.gateway_port ?? "—"}
              </p>
            </div>
            <div className="bg-white border border-[#eff0f3] rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Deployed</p>
              <p className="text-sm font-semibold text-gray-900">{timeAgo(sandbox.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Activity */}
        <div>
          <SectionTitle>Activity</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-[#eff0f3] rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Conversations</p>
              <p className="text-2xl font-bold text-gray-900">{convCount ?? "—"}</p>
            </div>
            <div className="bg-white border border-[#eff0f3] rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">State</p>
              <p className="text-sm font-semibold text-gray-900 capitalize">{sandbox.sandbox_state ?? "—"}</p>
            </div>
            <div className="bg-white border border-[#eff0f3] rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Approval</p>
              <p className={`text-sm font-semibold ${sandbox.approved ? "text-green-600" : "text-yellow-600"}`}>
                {sandbox.approved ? "Approved" : "Pending"}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <SectionTitle>Quick Actions</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {sandbox.dashboard_url && (
              <a
                href={sandbox.dashboard_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-[#fdf4ff] hover:text-[#ae00d0] hover:border-[#ae00d0] transition-colors"
              >
                <ExternalLinkIcon />
                Open Dashboard
              </a>
            )}
            <button
              onClick={() => { fetchStatus(); fetchConvCount(); }}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-[#fdf4ff] hover:text-[#ae00d0] hover:border-[#ae00d0] transition-colors"
            >
              <RefreshIcon />
              Refresh
            </button>
          </div>
        </div>

        {/* SSH Access */}
        <div>
          <SectionTitle>SSH / Terminal Access</SectionTitle>
          <div className="flex items-center gap-2 bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3">
            <span className="text-white/40 shrink-0"><TerminalIcon /></span>
            <code className="flex-1 text-xs font-mono text-green-400/80 truncate">{sshCommand}</code>
            <CopyButton text={sshCommand} />
          </div>
        </div>

        {/* Sandbox Details */}
        <div>
          <SectionTitle>Sandbox Details</SectionTitle>
          <div className="bg-white border border-[#eff0f3] rounded-xl px-4 py-3 space-y-2.5">
            {[
              { label: "Sandbox ID",      value: sandbox.sandbox_id,              mono: true },
              { label: "Name",            value: sandbox.sandbox_name },
              { label: "State",           value: sandbox.sandbox_state ?? "—" },
              { label: "Gateway Port",    value: String(sandbox.gateway_port ?? "—"), mono: true },
              ...(gatewayStatus?.version ? [{ label: "Gateway Version", value: String(gatewayStatus.version), mono: true }] : []),
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <span className="text-[11px] text-gray-400 shrink-0">{label}</span>
                <span className={`text-xs text-gray-900 truncate text-right ${mono ? "font-mono" : ""}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}

// ── MissionControlPanel ───────────────────────────────────────────────────────

const TABS: { id: MCTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "crons",    label: "Crons" },
  { id: "channels", label: "Channels" },
];

export default function MissionControlPanel({ sandbox }: { sandbox: SandboxRecord }) {
  const [activeTab, setActiveTab] = useState<MCTab>("overview");

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Sub-tab bar */}
      <div className="shrink-0 flex items-center gap-1 px-6 py-2 border-b border-[#eff0f3]">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
              activeTab === id
                ? "bg-[#fdf4ff] text-[#ae00d0]"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === "overview"  && <OverviewPanel sandbox={sandbox} />}
        {activeTab === "crons"     && <CronsPanel sandbox={sandbox} />}
        {activeTab === "channels"  && <ChannelsPanel sandbox={sandbox} />}
      </div>
    </div>
  );
}
