"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface SandboxRecord {
  sandbox_id: string;
  sandbox_name: string;
  sandbox_state: string;
  dashboard_url: string | null;
  preview_token: string | null;
  gateway_token: string | null;
  gateway_port: number;
  ssh_command: string;
  created_at: string;
  approved: boolean;
}

interface Props {
  selectedId: string | null;
  onSelect: (sandbox: SandboxRecord) => void;
  onNew: () => void;
  refreshKey: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

// Inline SVG icons (matching lucide style)
function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
      <line x1="6" x2="6.01" y1="6" y2="6"/>
      <line x1="6" x2="6.01" y1="18" y2="18"/>
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="M12 5v14"/>
    </svg>
  );
}

function PanelLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2"/>
      <path d="M9 3v18"/>
    </svg>
  );
}

export default function SandboxSidebar({ selectedId, onSelect, onNew, refreshKey, isCollapsed, onToggleCollapse }: Props) {
  const [sandboxes, setSandboxes] = useState<SandboxRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/sandboxes`);
      if (res.ok) setSandboxes(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const res = await fetch(`${API_URL}/api/sandboxes/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setSandboxes((prev) => prev.filter((s) => s.sandbox_id !== id));
  }

  return (
    <aside
      className="relative flex flex-col h-full border-r border-[#eff0f3] bg-[#fdfbff] transition-all duration-300 ease-in-out shrink-0"
      style={{ width: isCollapsed ? 61 : 243 }}
    >
      {/* Header — Logo + Collapse Toggle */}
      <div className="shrink-0 px-2.5">
        <div className="flex mt-3 mb-1">
          {!isCollapsed ? (
            <div className="flex items-center justify-between flex-1 pl-2">
              <Image
                src="/assets/logos/ruh-developer-logo.svg"
                alt="Ruh Developer"
                width={120}
                height={28}
                className="h-7 w-auto"
              />
              <button
                onClick={onToggleCollapse}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded"
                title="Collapse sidebar"
              >
                <PanelLeftIcon />
              </button>
            </div>
          ) : (
            <div className="flex flex-1 justify-center">
              <button
                onClick={onToggleCollapse}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded"
                title="Expand sidebar"
              >
                <Image
                  src="/assets/logos/favicon.svg"
                  alt="Ruh"
                  width={24}
                  height={24}
                  className="w-6 h-6"
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Nav section */}
      <div className="flex flex-col gap-1 mt-3 px-2.5">
        {/* New Sandbox button */}
        <div
          onClick={onNew}
          className={`h-8 px-2 gap-2 flex items-center group hover:bg-[#fdf4ff] rounded cursor-pointer ${isCollapsed ? "justify-center" : ""}`}
        >
          <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#ae00d0] shrink-0 transition-all duration-150 group-hover:scale-110">
            <PlusIcon className="text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-[#ae00d0] text-xs font-semibold">New Sandbox</span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 h-px bg-[#eff0f3]" />

      {/* Sandbox list */}
      <div className="flex-1 overflow-y-auto px-2.5 space-y-0.5">
        {loading ? (
          <div className={`flex items-center gap-2 px-2 py-2 ${isCollapsed ? "justify-center" : ""}`}>
            <ServerIcon className="text-gray-300 shrink-0" />
            {!isCollapsed && <span className="text-xs text-gray-300">Loading…</span>}
          </div>
        ) : sandboxes.length === 0 ? (
          !isCollapsed && (
            <div className="px-2 py-4 text-center">
              <p className="text-xs text-gray-400">No sandboxes yet.</p>
              <button onClick={onNew} className="mt-1 text-xs text-[#ae00d0] hover:text-[#9400b4]">
                Create one →
              </button>
            </div>
          )
        ) : (
          sandboxes.map((s) => {
            const isSelected = s.sandbox_id === selectedId;
            return (
              <div
                key={s.sandbox_id}
                onClick={() => onSelect(s)}
                title={isCollapsed ? s.sandbox_name : undefined}
                className={`group relative flex items-center gap-2.5 px-2 py-2 cursor-pointer rounded transition-colors ${
                  isSelected
                    ? "bg-[#fdf4ff]"
                    : "hover:bg-[#fdf4ff]"
                } ${isCollapsed ? "justify-center" : ""}`}
              >
                {/* Status dot + icon */}
                <div className="relative shrink-0">
                  <ServerIcon className={`${isSelected ? "text-[#ae00d0]" : "text-gray-400"} transition-colors`} />
                  <span
                    className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                      s.approved ? "bg-green-400" : "bg-yellow-400 animate-pulse"
                    }`}
                  />
                </div>

                {!isCollapsed && (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium truncate ${isSelected ? "text-[#ae00d0] font-semibold" : "text-gray-800"}`}>
                        {s.sandbox_name}
                      </p>
                      <p className="text-[10px] text-gray-400 font-mono truncate">{s.sandbox_id.slice(0, 12)}…</p>
                    </div>

                    <button
                      onClick={(e) => handleDelete(e, s.sandbox_id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-xs shrink-0"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
