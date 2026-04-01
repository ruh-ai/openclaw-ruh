"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import type { SandboxRecord } from "./SandboxSidebar";
import { apiFetch } from "@/lib/api/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OAModel {
  id: string;
  owned_by?: string;
}

interface ToolCall {
  id: string;
  name: string;
  args: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tool_calls?: ToolCall[];
}

export interface Conversation {
  id: string;
  sandbox_id: string;
  name: string;
  model: string;
  openclaw_session_key: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface MessagePage {
  messages: ChatMessage[];
  next_cursor: number | null;
  has_more: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useElapsedSeconds(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return elapsed;
}

const PHASE_LABELS: Record<string, string> = {
  thinking:       "Thinking...",
  planning:       "Planning...",
  searching:      "Searching...",
  generating:     "Generating...",
  reviewing:      "Reviewing...",
  writing:        "Writing...",
  tool_execution: "Using a tool...",
  connecting:     "Connecting...",
  authenticated:  "Connected",
};

// ── Inline SVGs ───────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
    </svg>
  );
}

function PlusSmIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="M12 5v14"/>
    </svg>
  );
}

// ── ThinkingIndicator ─────────────────────────────────────────────────────────

function ThinkingIndicator({ statusMessage, elapsed }: { statusMessage: string; elapsed: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ae00d0] opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ae00d0]" />
      </span>
      <span className="text-sm text-gray-500">{statusMessage || "Thinking..."}</span>
      <span className="text-[11px] text-gray-400 tabular-nums ml-2">{elapsed}s</span>
    </div>
  );
}

// ── ToolCallBubble ────────────────────────────────────────────────────────────

function ToolCallBubble({ tc, streaming = false }: { tc: ToolCall; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  let prettyArgs = tc.args;
  try { prettyArgs = JSON.stringify(JSON.parse(tc.args), null, 2); } catch { /* partial */ }

  return (
    <div className="flex justify-start ml-11">
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 max-w-sm">
        <button onClick={() => tc.args && setExpanded((v) => !v)} className="flex items-center gap-2 w-full text-left">
          <span className={`text-xs ${streaming ? "text-yellow-500 animate-pulse" : "text-orange-500"}`}>⚡</span>
          <span className="text-xs text-gray-500 font-medium">{streaming ? "Tool" : "Tool output"}</span>
          <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-mono">{tc.name || "…"}</span>
          {tc.args && <span className="text-gray-400 text-[10px] ml-auto">{expanded ? "▾" : "▸"}</span>}
        </button>
        {expanded && prettyArgs && (
          <pre className="mt-2 text-[10px] text-gray-500 font-mono overflow-auto max-h-32 leading-relaxed">{prettyArgs}</pre>
        )}
      </div>
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg, sandboxName }: { msg: ChatMessage; sandboxName: string }) {
  const isUser = msg.role === "user";
  return (
    <>
      {msg.tool_calls?.map((tc, i) => <ToolCallBubble key={i} tc={tc} />)}
      {msg.content && (
        isUser ? (
          <div className="flex justify-end">
            <div className="bg-[#f3f4f6] text-sm text-gray-900 rounded-2xl px-4 py-2.5 max-w-[80%] whitespace-pre-wrap">
              {msg.content}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5">
              <Image src="/assets/logos/favicon.svg" alt={sandboxName} width={32} height={32} className="rounded-full" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        )
      )}
    </>
  );
}

// ── ContextMessages ───────────────────────────────────────────────────────────

function ContextMessages({ messages, sandboxName }: { messages: ChatMessage[]; sandboxName: string }) {
  const splitIdx = messages.length > 2 ? messages.length - 2 : 0;
  const priorMessages = messages.slice(0, splitIdx);
  const recentMessages = messages.slice(splitIdx);
  const [collapsed, setCollapsed] = useState(true);

  if (priorMessages.length === 0) {
    return <>{messages.map((msg, i) => <MessageBubble key={i} msg={msg} sandboxName={sandboxName} />)}</>;
  }
  return (
    <>
      <button onClick={() => setCollapsed((v) => !v)} className="w-full flex items-center gap-2 py-1 group">
        <div className="flex-1 h-px bg-gray-200 group-hover:bg-gray-300 transition-colors" />
        <span className="text-[11px] text-gray-400 group-hover:text-gray-600 whitespace-nowrap select-none">
          {collapsed ? `↑ ${priorMessages.length} earlier — for context` : `↑ hide ${priorMessages.length} earlier`}
        </span>
        <div className="flex-1 h-px bg-gray-200 group-hover:bg-gray-300 transition-colors" />
      </button>
      {!collapsed && priorMessages.map((msg, i) => <MessageBubble key={i} msg={msg} sandboxName={sandboxName} />)}
      {recentMessages.map((msg, i) => <MessageBubble key={splitIdx + i} msg={msg} sandboxName={sandboxName} />)}
    </>
  );
}

// ── ChatPanel ─────────────────────────────────────────────────────────────────

interface Props {
  sandbox: SandboxRecord;
  conversation: Conversation | null;
  onNewChat: () => void;
  onConversationCreated: (conv: Conversation) => void;
}

export default function ChatPanel({ sandbox, conversation, onNewChat, onConversationCreated }: Props) {
  const [models, setModels] = useState<OAModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsSynthetic, setModelsSynthetic] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesCursor, setMessagesCursor] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolCall[]>([]);
  const [statusMessage, setStatusMessage] = useState("Thinking...");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const elapsed = useElapsedSeconds(sending && !streamingContent);

  // Reset on sandbox change
  useEffect(() => {
    setModels([]);
    setSelectedModel("");
    setModelsLoading(true);
    setModelsSynthetic(false);
  }, [sandbox.sandbox_id]);

  // Fetch models
  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/models`);
      const data = await res.json();
      const list: OAModel[] = data.data ?? [];
      setModels(list);
      setModelsSynthetic(!!data._synthetic);
      if (list.length > 0) setSelectedModel(list[0].id);
    } catch { setModels([]); }
    finally { setModelsLoading(false); }
  }, [sandbox.sandbox_id]);

  useEffect(() => { loadModels(); }, [loadModels]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!conversation?.id) {
      setMessages([]);
      setMessagesHasMore(false);
      setMessagesCursor(null);
      return;
    }
    setMessages([]);
    setStreamingContent("");
    setMessagesLoading(true);
    apiFetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations/${conversation.id}/messages?limit=50`)
      .then((r) => r.ok ? r.json() : { messages: [], next_cursor: null, has_more: false })
      .then((page: MessagePage) => {
        setMessages(page.messages);
        setMessagesCursor(page.next_cursor);
        setMessagesHasMore(page.has_more);
      })
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }, [conversation?.id, sandbox.sandbox_id]);

  async function loadOlderMessages() {
    if (!conversation?.id || messagesCursor == null || messagesLoadingMore) return;
    setMessagesLoadingMore(true);
    try {
      const res = await apiFetch(
        `${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations/${conversation.id}/messages?limit=50&before=${messagesCursor}`,
      );
      if (!res.ok) return;
      const page = (await res.json()) as MessagePage;
      setMessages((prev) => [...page.messages, ...prev]);
      setMessagesCursor(page.next_cursor);
      setMessagesHasMore(page.has_more);
    } finally {
      setMessagesLoadingMore(false);
    }
  }

  // Auto-scroll
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [messages, streamingContent, sending]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  async function ensureConversation(): Promise<Conversation> {
    if (conversation) return conversation;
    const res = await apiFetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Conversation", model: selectedModel || "openclaw-default" }),
    });
    const conv: Conversation = await res.json();
    onConversationCreated(conv);
    return conv;
  }

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setStreamingContent("");
    setStreamingTools([]);
    setStatusMessage("Connecting...");
    let assistantContent = "";
    let currentSseEvent = "";
    let persistenceError: string | null = null;
    const toolCalls: ToolCall[] = [];

    try {
      const conv = await ensureConversation();

      // Use the WebSocket-bridged endpoint for full agent capabilities
      const res = await apiFetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/chat/ws`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          conversation_id: conv.id,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errText}` }]);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (line.startsWith("event: ")) {
            const evt = line.slice(7).trim();
            currentSseEvent = evt;
            // Handle named SSE events (status, error, persistence_error)
            if (PHASE_LABELS[evt]) setStatusMessage(PHASE_LABELS[evt]);
            continue;
          }
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break outer;
          try {
            const parsed = JSON.parse(raw);

            // Persistence error event from backend
            if (currentSseEvent === "persistence_error") {
              persistenceError = typeof parsed?.message === "string"
                ? parsed.message
                : "Assistant reply could not be saved to conversation history.";
              currentSseEvent = "";
              continue;
            }

            // Status/lifecycle event (from event: status)
            if (currentSseEvent === "status" && parsed.phase) {
              if (PHASE_LABELS[parsed.phase]) setStatusMessage(PHASE_LABELS[parsed.phase]);
              currentSseEvent = "";
              continue;
            }

            // Error event
            if (currentSseEvent === "error") {
              setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${parsed.message || "Unknown error"}` }]);
              currentSseEvent = "";
              break outer;
            }

            // Tool execution start: {tool: "name", input: "summary"}
            if (parsed.tool && !parsed.result) {
              const toolName = parsed.tool as string;
              const toolInput = (parsed.input as string) || "";
              const tc: ToolCall = { id: `tool-${toolCalls.length}`, name: toolName, args: toolInput };
              toolCalls.push(tc);
              setStreamingTools([...toolCalls]);
              setStatusMessage(`Using tool: ${toolName}...`);
              continue;
            }

            // Tool completion: {result: "Completed: toolname"}
            if (parsed.result && typeof parsed.result === "string" && parsed.result.startsWith("Completed:")) {
              setStatusMessage("Thinking...");
              continue;
            }

            // Inline phase update (legacy format)
            if (parsed.phase) {
              if (PHASE_LABELS[parsed.phase]) setStatusMessage(PHASE_LABELS[parsed.phase]);
              continue;
            }

            // OpenAI-compatible text delta: {choices: [{delta: {content: "..."}}]}
            const delta = parsed?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              assistantContent += delta;
              setStreamingContent(assistantContent);
              setStatusMessage("");
            }
            currentSseEvent = "";
          } catch { /* partial JSON chunk — ignore */ }
        }
      }

      setStreamingContent("");
      setStreamingTools([]);

      if (persistenceError) {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `Error: ${persistenceError}`,
        }]);
        return;
      }

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: assistantContent,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (messages.length === 0 && conv.name === "New Conversation") {
        const autoName = text.slice(0, 45) + (text.length > 45 ? "…" : "");
        await apiFetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/conversations/${conv.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: autoName }),
        });
        window.dispatchEvent(new CustomEvent("conv:renamed", { detail: { id: conv.id, name: autoName } }));
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
      setStreamingContent("");
      setStreamingTools([]);
    } finally {
      setSending(false);
      setStatusMessage("Thinking...");
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const canSend = !sending && !!input.trim();

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar: model selector + New Chat */}
      <div className="shrink-0 flex items-center justify-between px-6 py-2 border-b border-[#eff0f3]">
        <div className="flex items-center gap-2">
          {modelsLoading ? (
            <span className="text-[11px] text-gray-400">Loading agents…</span>
          ) : models.length === 0 ? (
            <span className="text-[11px] text-gray-400">
              No agents —{" "}
              <button onClick={loadModels} className="text-[#ae00d0] hover:text-[#9400b4]">Retry</button>
            </span>
          ) : (
            <span className="bg-gray-50 border border-gray-200 text-gray-600 text-[11px] rounded-lg px-2 py-1 font-mono">
              {selectedModel || models[0]?.id}
              {modelsSynthetic && <span className="text-yellow-600 ml-1">default</span>}
            </span>
          )}
        </div>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium text-gray-500 border border-gray-200 hover:bg-[#fdf4ff] hover:text-[#ae00d0] hover:border-[#ae00d0] transition-colors"
        >
          <PlusSmIcon />
          New Chat
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-0">
        <div className="max-w-3xl mx-auto md:ml-8 lg:ml-16 py-6 space-y-6">
          {messagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-xs text-gray-400">Loading history…</span>
            </div>
          ) : (
            <>
              {messagesHasMore && (
                <div className="flex justify-center">
                  <button
                    onClick={loadOlderMessages}
                    disabled={messagesLoadingMore}
                    className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:text-[#ae00d0] hover:border-[#ae00d0]/30 transition-colors disabled:opacity-50"
                  >
                    {messagesLoadingMore ? "Loading older messages…" : "Load older messages"}
                  </button>
                </div>
              )}
              {messages.length === 0 && !sending && (
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
                    <Image src="/assets/logos/favicon.svg" alt={sandbox.sandbox_name} width={32} height={32} className="rounded-full" />
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      Hi! I&apos;m <strong>{sandbox.sandbox_name}</strong>. How can I help you today?
                    </p>
                  </div>
                </div>
              )}

              <ContextMessages messages={messages} sandboxName={sandbox.sandbox_name} />

              {sending && streamingTools.length > 0 && streamingTools.map((tc, i) => (
                <ToolCallBubble key={tc.id} tc={tc} streaming={i === streamingTools.length - 1} />
              ))}

              {streamingContent && (
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5">
                    <Image src="/assets/logos/favicon.svg" alt={sandbox.sandbox_name} width={28} height={28} className="rounded-full animate-spin" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{streamingContent}</p>
                  </div>
                </div>
              )}

              {sending && !streamingContent && (
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5">
                    <Image src="/assets/logos/favicon.svg" alt={sandbox.sandbox_name} width={28} height={28} className="rounded-full opacity-60" />
                  </div>
                  <div className="flex-1 min-w-0 pt-1.5">
                    <ThinkingIndicator statusMessage={statusMessage} elapsed={elapsed} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 md:px-0 pb-6 pt-3">
        <div className="max-w-3xl mx-auto md:ml-8 lg:ml-16">
          <div className="relative flex items-end gap-2 border border-gray-200 rounded-2xl bg-white px-4 py-3 shadow-sm">
            <Image src="/assets/logos/favicon.svg" alt="" width={20} height={20} className="shrink-0 mb-1 opacity-40" />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message ${sandbox.sandbox_name}…`}
              disabled={sending}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none min-h-[24px] leading-relaxed disabled:opacity-50"
              style={{ maxHeight: "120px" }}
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-[#ae00d0] hover:text-white hover:border-[#ae00d0] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:hover:border-gray-200 transition-all shrink-0 mb-0.5"
            >
              <SendIcon />
            </button>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-2">
            {conversation
              ? <span className="font-medium text-gray-600">{conversation.name}</span>
              : "Start typing to create a new conversation"}
          </p>
        </div>
      </div>
    </div>
  );
}
