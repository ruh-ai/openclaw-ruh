"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SandboxRecord } from "./SandboxSidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OAModel {
  id: string;
  owned_by?: string;
}

interface ToolCall {
  id: string;
  name: string;
  args: string;   // accumulated JSON arguments string
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tool_calls?: ToolCall[];  // present for assistant messages that invoked tools
}

interface Conversation {
  id: string;
  sandbox_id: string;
  name: string;
  model: string;
  openclaw_session_key: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

// ── ConversationList ──────────────────────────────────────────────────────────

function ConversationList({
  sandboxId,
  activeId,
  model,
  onSelect,
  onNew,
}: {
  sandboxId: string;
  activeId: string | null;
  model: string;
  onSelect: (c: Conversation) => void;
  onNew: (c: Conversation) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandboxId}/conversations`);
      if (res.ok) setConversations(await res.json());
    } finally {
      setLoading(false);
    }
  }, [sandboxId]);

  useEffect(() => { load(); }, [load]);

  async function handleNew() {
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandboxId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Conversation", model }),
      });
      const conv: Conversation = await res.json();
      setConversations((prev) => [conv, ...prev]);
      onNew(conv);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await fetch(`${API_URL}/api/sandboxes/${sandboxId}/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) onNew({ id: "", sandbox_id: sandboxId, name: "", model, openclaw_session_key: "", created_at: "", updated_at: "", message_count: 0 });
  }

  async function commitRename(id: string) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    await fetch(`${API_URL}/api/sandboxes/${sandboxId}/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, name } : c));
    setEditingId(null);
  }

  // Called by parent to update name in list after auto-naming
  // (exposed via a simple refresh)
  const refreshOne = useCallback((id: string, name: string) => {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, name } : c));
  }, []);

  // Expose refresh to parent via window event
  useEffect(() => {
    function handler(e: Event) {
      const { id, name } = (e as CustomEvent).detail;
      refreshOne(id, name);
    }
    window.addEventListener("conv:renamed", handler);
    return () => window.removeEventListener("conv:renamed", handler);
  }, [refreshOne]);

  return (
    <div className="flex flex-col h-full border-r border-gray-800 bg-gray-900/50">
      {/* Header */}
      <div className="shrink-0 px-3 py-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conversations</span>
        <button
          onClick={handleNew}
          disabled={creating}
          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 font-medium flex items-center gap-1"
          title="New conversation"
        >
          {creating ? "…" : "+ New"}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <p className="text-xs text-gray-600 px-3 py-3">Loading…</p>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-gray-600">No conversations yet.</p>
            <button onClick={handleNew} className="mt-1 text-xs text-blue-400 hover:text-blue-300">
              Start one →
            </button>
          </div>
        ) : (
          conversations.map((c) => {
            const isActive = c.id === activeId;
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c)}
                className={`group relative flex flex-col px-3 py-2.5 cursor-pointer transition-colors ${
                  isActive ? "bg-blue-600/15 border-r-2 border-blue-500" : "hover:bg-gray-800/50"
                }`}
              >
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
                    className="w-full bg-gray-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                  />
                ) : (
                  <>
                    <p className={`text-xs font-medium truncate pr-10 ${isActive ? "text-white" : "text-gray-300"}`}>
                      {c.name}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {c.message_count} msg{c.message_count !== 1 ? "s" : ""} ·{" "}
                      {new Date(c.updated_at).toLocaleDateString()}
                    </p>
                    {/* Action buttons — appear on hover */}
                    <div className="absolute right-2 top-2.5 hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditName(c.name); }}
                        className="text-gray-600 hover:text-gray-300 text-[10px] p-0.5"
                        title="Rename"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, c.id)}
                        className="text-gray-700 hover:text-red-400 text-[10px] p-0.5"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── ContextMessages ───────────────────────────────────────────────────────────
// Shows a collapsible "[N previous messages — context]" label above the latest
// exchange, matching the pattern used by Claude Code.

function ContextMessages({ messages }: { messages: ChatMessage[] }) {
  // Split into "prior" (all but last assistant+user pair) and "recent"
  const splitIdx = messages.length > 2 ? messages.length - 2 : 0;
  const priorMessages = messages.slice(0, splitIdx);
  const recentMessages = messages.slice(splitIdx);

  const [collapsed, setCollapsed] = useState(true);

  if (priorMessages.length === 0) {
    return <>{messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}</>;
  }

  return (
    <>
      {/* Collapsible context indicator */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 py-1 group"
      >
        <div className="flex-1 h-px bg-gray-800 group-hover:bg-gray-700 transition-colors" />
        <span className="text-[11px] text-gray-500 group-hover:text-gray-400 transition-colors whitespace-nowrap select-none">
          {collapsed
            ? `↑ ${priorMessages.length} previous message${priorMessages.length !== 1 ? "s" : ""} — for context`
            : `↑ hide ${priorMessages.length} previous message${priorMessages.length !== 1 ? "s" : ""}`}
        </span>
        <div className="flex-1 h-px bg-gray-800 group-hover:bg-gray-700 transition-colors" />
      </button>

      {/* Prior messages (expanded) */}
      {!collapsed && priorMessages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

      {/* Always-visible recent messages */}
      {recentMessages.map((msg, i) => <MessageBubble key={splitIdx + i} msg={msg} />)}
    </>
  );
}

// ── AgentDetails ──────────────────────────────────────────────────────────────

function AgentDetails({
  sandbox,
  model,
  conversation,
}: {
  sandbox: SandboxRecord;
  model: OAModel | null;
  conversation: Conversation | null;
}) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => null);
  }, [sandbox.sandbox_id]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Agent Details</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <div>
          <span className="text-gray-500 block">Sandbox</span>
          <span className="text-white font-medium">{sandbox.sandbox_name}</span>
        </div>
        <div>
          <span className="text-gray-500 block">Status</span>
          <span className={`font-medium ${sandbox.approved ? "text-green-400" : "text-yellow-400"}`}>
            {sandbox.approved ? "Approved" : "Pending pairing"}
          </span>
        </div>
        <div>
          <span className="text-gray-500 block">Agent / Model</span>
          <span className="text-white font-mono truncate">{model?.id ?? "—"}</span>
        </div>
        <div>
          <span className="text-gray-500 block">Provider</span>
          <span className="text-white">{model?.owned_by ?? "—"}</span>
        </div>
        {conversation && (
          <>
            <div>
              <span className="text-gray-500 block">Session key</span>
              <span className="text-gray-400 font-mono text-[10px] truncate block" title={conversation.openclaw_session_key}>
                {conversation.openclaw_session_key}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Messages</span>
              <span className="text-white">{conversation.message_count}</span>
            </div>
          </>
        )}
        {status && "version" in status && (
          <div>
            <span className="text-gray-500 block">Gateway version</span>
            <span className="text-white font-mono">{String(status.version)}</span>
          </div>
        )}
      </div>
      {sandbox.dashboard_url && (
        <a
          href={sandbox.dashboard_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-3 transition-colors"
        >
          Open Dashboard ↗
        </a>
      )}
    </div>
  );
}

// ── ToolCallBubble ────────────────────────────────────────────────────────────

function ToolCallBubble({ tc, streaming = false }: { tc: ToolCall; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  let prettyArgs = tc.args;
  try { prettyArgs = JSON.stringify(JSON.parse(tc.args), null, 2); } catch { /* not yet complete JSON */ }

  return (
    <div className="flex justify-start">
      <div className="bg-gray-900 border border-gray-700/60 rounded-xl px-3.5 py-2 max-w-sm">
        <button
          onClick={() => tc.args && setExpanded((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          {/* bolt icon */}
          <span className={`text-xs ${streaming ? "text-yellow-400 animate-pulse" : "text-orange-400"}`}>⚡</span>
          <span className="text-xs text-gray-400 font-medium">
            {streaming ? "Tool" : "Tool output"}
          </span>
          <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
            {tc.name || "…"}
          </span>
          {tc.args && (
            <span className="text-gray-600 text-[10px] ml-auto">{expanded ? "▾" : "▸"}</span>
          )}
        </button>
        {expanded && prettyArgs && (
          <pre className="mt-2 text-[10px] text-gray-500 font-mono overflow-auto max-h-32 leading-relaxed">
            {prettyArgs}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <>
      {/* Tool calls attached to this message */}
      {msg.tool_calls?.map((tc, i) => (
        <ToolCallBubble key={i} tc={tc} streaming={false} />
      ))}
      {msg.content && (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap wrap-break-word ${
              isUser ? "bg-blue-600 text-white rounded-br-sm" : "bg-gray-800 text-gray-100 rounded-bl-sm"
            }`}
          >
            {msg.content}
          </div>
        </div>
      )}
    </>
  );
}

// ── ChatView ──────────────────────────────────────────────────────────────────

function ChatView({
  sandbox,
  conversation,
  models,
  selectedModel,
  modelsSynthetic,
  onModelsRetry,
  onModelChange,
}: {
  sandbox: SandboxRecord;
  conversation: Conversation | null;
  models: OAModel[];
  selectedModel: string;
  modelsSynthetic: boolean;
  onModelsRetry: () => void;
  onModelChange: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load history when conversation changes
  useEffect(() => {
    if (!conversation?.id) { setMessages([]); return; }
    setMessages([]);
    setStreamingContent("");
    setMessagesLoading(true);
    fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations/${conversation.id}/messages`)
      .then((r) => r.ok ? r.json() : [])
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }, [conversation?.id, sandbox.sandbox_id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending || !selectedModel || !conversation) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setStreamingContent("");
    let assistantContent = "";

    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMsg],
          stream: true,
          conversation_id: conversation.id,   // ← routes to openclaw_session_key
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errText}` }]);
        await saveMessages(conversation.id, [userMsg]);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const delta = JSON.parse(raw)?.choices?.[0]?.delta?.content ?? "";
            if (delta) { assistantContent += delta; setStreamingContent(assistantContent); }
          } catch { /* partial chunk */ }
        }
      }

      const assistantMsg: ChatMessage = { role: "assistant", content: assistantContent };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent("");

      // Persist both messages
      await saveMessages(conversation.id, [userMsg, assistantMsg]);

      // Auto-name after the first exchange
      if (messages.length === 0 && conversation.name === "New Conversation") {
        const autoName = text.slice(0, 45) + (text.length > 45 ? "…" : "");
        await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations/${conversation.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: autoName }),
        });
        // Notify ConversationList to refresh the displayed name
        window.dispatchEvent(new CustomEvent("conv:renamed", { detail: { id: conversation.id, name: autoName } }));
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
      setStreamingContent("");
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function saveMessages(convId: string, msgs: ChatMessage[]) {
    await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs }),
    }).catch(() => null);
  }

  const activeModel = models.find((m) => m.id === selectedModel) ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="shrink-0 px-5 py-2.5 border-b border-gray-800 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500">Agent</span>
        {models.length === 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">No agents</span>
            <button onClick={onModelsRetry} className="text-xs text-blue-400 hover:text-blue-300">Retry</button>
          </div>
        ) : (
          <>
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {models.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>
            {modelsSynthetic && (
              <span className="text-[10px] text-yellow-600" title="Gateway did not return a model list">default agent</span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${sandbox.approved ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`} />
          <span className="text-xs text-gray-500">{sandbox.sandbox_name}</span>
        </div>
      </div>

      {/* Agent details */}
      <div className="shrink-0 px-5 py-3">
        <AgentDetails sandbox={sandbox} model={activeModel} conversation={conversation} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-gray-600">Loading history…</span>
          </div>
        ) : !conversation ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-gray-600 text-sm">Select or create a conversation on the left.</p>
          </div>
        ) : messages.length === 0 && !sending ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-gray-600 text-sm">No messages yet.</p>
            <p className="text-gray-700 text-xs mt-1">Type a message below to start.</p>
          </div>
        ) : (
          <ContextMessages messages={messages} />
        )}
        {streamingContent && <MessageBubble msg={{ role: "assistant", content: streamingContent }} />}
        {sending && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-5 py-4 border-t border-gray-800">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={!conversation ? "Select a conversation first…" : `Message ${selectedModel || "agent"}… (Enter to send)`}
            disabled={sending || !selectedModel || !conversation}
            rows={1}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50"
            style={{ maxHeight: "8rem", overflowY: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim() || !selectedModel || !conversation}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl transition-colors text-sm font-medium shrink-0"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ChatPanel (root) ──────────────────────────────────────────────────────────

export default function ChatPanel({ sandbox }: { sandbox: SandboxRecord }) {
  const [models, setModels] = useState<OAModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsSynthetic, setModelsSynthetic] = useState(false);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  // Reset on sandbox change
  useEffect(() => {
    setModels([]);
    setSelectedModel("");
    setModelsLoading(true);
    setModelsSynthetic(false);
    setActiveConversation(null);
  }, [sandbox.sandbox_id]);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/models`);
      const data = await res.json();
      const list: OAModel[] = data.data ?? [];
      setModels(list);
      setModelsSynthetic(!!data._synthetic);
      if (list.length > 0) setSelectedModel(list[0].id);
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [sandbox.sandbox_id]);

  useEffect(() => { loadModels(); }, [loadModels]);

  return (
    <div className="flex h-full">
      {/* Conversation list — fixed width left panel */}
      <div className="w-52 shrink-0">
        <ConversationList
          sandboxId={sandbox.sandbox_id}
          activeId={activeConversation?.id ?? null}
          model={selectedModel || "openclaw-default"}
          onSelect={setActiveConversation}
          onNew={(c) => setActiveConversation(c.id ? c : null)}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 min-w-0">
        {modelsLoading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-gray-600">Loading agents…</span>
          </div>
        ) : (
          <ChatView
            sandbox={sandbox}
            conversation={activeConversation}
            models={models}
            selectedModel={selectedModel}
            modelsSynthetic={modelsSynthetic}
            onModelsRetry={loadModels}
            onModelChange={setSelectedModel}
          />
        )}
      </div>
    </div>
  );
}
