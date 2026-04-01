"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare, Trash2, ArrowUpRight, Plus, Loader2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedAgent } from "@/hooks/use-agents-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SandboxRecord {
  sandbox_id: string;
  sandbox_name: string;
}

interface ConversationRecord {
  id: string;
  name: string;
  model?: string;
  created_at?: string;
  updated_at?: string;
  message_count?: number;
}

interface ConversationPage {
  items: ConversationRecord[];
  next_cursor: string | null;
  has_more: boolean;
}

interface TabChatsProps {
  agent: SavedAgent;
  activeSandbox: SandboxRecord | null;
  onOpenConversation: (convId: string) => void;
  onNewChat: () => void;
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TabChats({ agent, activeSandbox, onOpenConversation, onNewChat }: TabChatsProps) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const fetchConversations = useCallback(async (cursor?: string | null) => {
    if (!activeSandbox) return;
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const url = new URL(`${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/conversations`);
      url.searchParams.set("limit", "20");
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error();
      const page = (await res.json()) as ConversationPage;
      setConversations((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeSandbox?.sandbox_id]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const deleteConversation = async (convId: string) => {
    if (!activeSandbox) return;
    setDeletingId(convId);
    try {
      await fetch(
        `${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/conversations/${convId}`,
        { method: "DELETE" }
      );
      setConversations((prev) => prev.filter((c) => c.id !== convId));
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const renameConversation = async (convId: string) => {
    if (!activeSandbox || !editingName.trim()) { setEditingId(null); return; }
    try {
      await fetch(
        `${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/conversations/${convId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editingName.trim() }),
        }
      );
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, name: editingName.trim() } : c))
      );
    } catch {
      // silently fail
    } finally {
      setEditingId(null);
    }
  };

  if (!activeSandbox) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)]">
          Select a sandbox to view its conversations.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border-default)]">
        <p className="text-xs font-satoshi-medium text-[var(--text-tertiary)]">
          {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
        </p>
        <Button
          variant="primary"
          className="h-7 px-3 gap-1.5 rounded-lg text-xs"
          onClick={onNewChat}
        >
          <Plus className="h-3 w-3" />
          New Chat
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 text-[var(--text-tertiary)] animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-3">
              <MessageSquare className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <p className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">No conversations yet</p>
            <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)] mb-4">
              Start a chat with {agent.name} to see history here.
            </p>
            <Button variant="primary" className="h-9 px-4 gap-2 rounded-lg text-xs" onClick={onNewChat}>
              <Plus className="h-3.5 w-3.5" />
              Start a Chat
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center gap-3 px-4 py-3 bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl hover:border-[var(--border-default)] transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-3.5 w-3.5 text-[var(--primary)]" />
                </div>

                <div className="flex-1 min-w-0">
                  {editingId === conv.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => renameConversation(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameConversation(conv.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full text-sm font-satoshi-medium text-[var(--text-primary)] bg-transparent border-b border-[var(--primary)] outline-none"
                    />
                  ) : (
                    <p
                      className="text-sm font-satoshi-medium text-[var(--text-primary)] truncate cursor-pointer hover:text-[var(--primary)] transition-colors"
                      onDoubleClick={() => { setEditingId(conv.id); setEditingName(conv.name); }}
                      title="Double-click to rename"
                    >
                      {conv.name || `Conversation ${conv.id.slice(0, 6)}`}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {(conv.updated_at ?? conv.created_at) && (
                      <div className="flex items-center gap-1">
                        <Clock3 className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />
                        <span className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)]">
                          {timeAgo(conv.updated_at ?? conv.created_at)}
                        </span>
                      </div>
                    )}
                    {conv.message_count != null && conv.message_count > 0 && (
                      <span className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)]">
                        · {conv.message_count} msg{conv.message_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => onOpenConversation(conv.id)}
                    className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-satoshi-medium text-[var(--text-secondary)] border border-[var(--border-stroke)] hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] transition-all"
                  >
                    Open
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => deleteConversation(conv.id)}
                    disabled={deletingId === conv.id}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[var(--error)]/5 border border-transparent hover:border-[var(--error)]/20 transition-all disabled:opacity-40"
                  >
                    {deletingId === conv.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              </div>
            ))}
            {hasMore && (
              <Button
                variant="outline"
                className="h-9 px-4 rounded-xl text-xs"
                onClick={() => fetchConversations(nextCursor)}
                disabled={loadingMore || !nextCursor}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
