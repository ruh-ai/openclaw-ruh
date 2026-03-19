"use client";

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
}

export default function SandboxSidebar({ selectedId, onSelect, onNew, refreshKey }: Props) {
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
    await fetch(`${API_URL}/api/sandboxes/${id}`, { method: "DELETE" });
    setSandboxes((prev) => prev.filter((s) => s.sandbox_id !== id));
  }

  return (
    <aside className="flex flex-col h-full bg-gray-900 border-r border-gray-800">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold text-white">Sandboxes</span>
        <button
          onClick={onNew}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg transition-colors font-medium"
        >
          + New
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <p className="text-xs text-gray-600 px-4 py-3">Loading…</p>
        ) : sandboxes.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-gray-600">No sandboxes yet.</p>
            <button onClick={onNew} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
              Create one →
            </button>
          </div>
        ) : (
          sandboxes.map((s) => {
            const isSelected = s.sandbox_id === selectedId;
            return (
              <div
                key={s.sandbox_id}
                onClick={() => onSelect(s)}
                className={`group relative flex items-start gap-2.5 px-4 py-3 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-600/20 border-r-2 border-blue-500"
                    : "hover:bg-gray-800/60"
                }`}
              >
                {/* Status dot */}
                <span
                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    s.approved ? "bg-green-400" : "bg-yellow-400 animate-pulse"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate">{s.sandbox_name}</p>
                  <p className="text-[10px] text-gray-500 font-mono truncate">{s.sandbox_id.slice(0, 16)}…</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
                {/* Delete button — visible on hover */}
                <button
                  onClick={(e) => handleDelete(e, s.sandbox_id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-xs mt-0.5 shrink-0"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
