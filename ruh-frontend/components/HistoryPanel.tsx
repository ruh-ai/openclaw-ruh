"use client";

import { useEffect, useState, useCallback } from "react";
import type { SandboxRecord } from "./SandboxSidebar";
import type { Conversation } from "./ChatPanel";
import { apiFetch } from "@/lib/api/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ChatBubbleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

interface Props {
  sandbox: SandboxRecord;
  activeConvId: string | null;
  onOpenConversation: (conv: Conversation) => void;
}

interface ConversationPage {
  items: Conversation[];
  next_cursor: string | null;
  has_more: boolean;
}

export default function HistoryPanel({ sandbox, activeConvId, onOpenConversation }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async (cursor?: string | null) => {
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const url = new URL(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations`);
      url.searchParams.set("limit", "20");
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const res = await apiFetch(url.toString());
      if (!res.ok) return;

      const page = (await res.json()) as ConversationPage;
      setConversations((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sandbox.sandbox_id]);

  useEffect(() => { load(); }, [load]);

  // Listen for renames from the chat panel
  const refreshOne = useCallback((id: string, name: string) => {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, name } : c));
  }, []);
  useEffect(() => {
    function handler(e: Event) {
      const { id, name } = (e as CustomEvent).detail;
      refreshOne(id, name);
    }
    window.addEventListener("conv:renamed", handler);
    return () => window.removeEventListener("conv:renamed", handler);
  }, [refreshOne]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const response = await apiFetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }

  async function commitRename(id: string) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    await apiFetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, name } : c));
    setEditingId(null);
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-[#eff0f3] flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Chat History</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => load(null)}
          className="text-[11px] text-gray-400 hover:text-[#ae00d0] transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-xs text-gray-400">Loading history…</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-10 h-10 rounded-2xl bg-[#fdf4ff] flex items-center justify-center mb-3 text-[#ae00d0]">
              <ChatBubbleIcon />
            </div>
            <p className="text-sm text-gray-500 font-medium">No conversations yet</p>
            <p className="text-xs text-gray-400 mt-1">Start a chat and it will appear here.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto md:ml-8 lg:ml-16 py-4 px-4 md:px-0 space-y-1.5">
            {conversations.map((c) => {
              const isActive = c.id === activeConvId;
              return (
                <div
                  key={c.id}
                  onClick={() => onOpenConversation(c)}
                  className={`group relative flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                    isActive
                      ? "bg-[#fdf4ff] border border-[#ae00d0]/20"
                      : "hover:bg-gray-50 border border-transparent"
                  }`}
                >
                  {/* Icon */}
                  <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${
                    isActive ? "bg-[#ae00d0]/10 text-[#ae00d0]" : "bg-gray-100 text-gray-400"
                  }`}>
                    <ChatBubbleIcon />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {editingId === c.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => commitRename(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(c.id);
                          if (e.key === "Escape") setEditingId(null);
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-white border border-[#ae00d0] rounded px-2 py-0.5 text-sm text-gray-900 focus:outline-none"
                      />
                    ) : (
                      <>
                        <p className={`text-sm font-medium truncate ${isActive ? "text-[#ae00d0]" : "text-gray-800"}`}>
                          {c.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-gray-400">{timeAgo(c.updated_at)}</span>
                          <span className="text-[11px] text-gray-300">·</span>
                          <span className="text-[11px] text-gray-400">{c.message_count} msg{c.message_count !== 1 ? "s" : ""}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  {editingId !== c.id && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditName(c.name); }}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 text-xs transition-colors"
                        title="Rename"
                      >✎</button>
                      <button
                        onClick={(e) => handleDelete(e, c.id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 text-xs transition-colors"
                        title="Delete"
                      >✕</button>
                    </div>
                  )}

                  {/* Active indicator */}
                  {isActive && (
                    <div className="shrink-0 self-center">
                      <span className="text-[10px] font-medium text-[#ae00d0] bg-[#ae00d0]/10 px-2 py-0.5 rounded-full">Active</span>
                    </div>
                  )}
                </div>
              );
            })}
            {hasMore && (
              <div className="pt-3">
                <button
                  onClick={() => load(nextCursor)}
                  disabled={loadingMore || !nextCursor}
                  className="w-full rounded-xl border border-[#eff0f3] px-4 py-2 text-xs text-gray-500 hover:text-[#ae00d0] hover:border-[#ae00d0]/30 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
