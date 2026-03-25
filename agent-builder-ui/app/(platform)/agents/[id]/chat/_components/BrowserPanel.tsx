"use client";

import { useState, useRef, useEffect } from "react";
import {
  Globe,
  ExternalLink,
  Image as ImageIcon,
  Monitor,
  RefreshCw,
  Loader2,
  MousePointerClick,
  ShieldAlert,
  CircleCheckBig,
} from "lucide-react";
import type {
  BrowserTakeoverState,
  BrowserWorkspaceItem,
  BrowserWorkspaceItemKind,
} from "@/lib/openclaw/browser-workspace";

// ─── Types ─────────────────────────────────────────────────────────────────

interface BrowserPanelProps {
  items: BrowserWorkspaceItem[];
  isLoading: boolean;
  previewUrl?: string | null;
  takeover?: BrowserTakeoverState | null;
  onResumeTakeover?: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url.slice(0, 40); }
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

// ─── ScreenshotCard ────────────────────────────────────────────────────────

function ScreenshotCard({ item }: { item: BrowserWorkspaceItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-1.5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ImageIcon className="h-3 w-3 text-white/20 shrink-0" />
        <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest truncate flex-1">
          {item.label || "Screenshot"}
        </span>
        <span className="text-[9px] font-mono text-white/15 shrink-0">
          {timeAgo(item.timestamp)}
        </span>
      </div>

      {/* Image */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full rounded-lg overflow-hidden border border-white/5 hover:border-white/15 transition-colors cursor-pointer"
      >
        <img
          src={item.url}
          alt={item.label}
          className={`w-full object-contain bg-zinc-900/80 ${
            expanded ? "max-h-[600px]" : "max-h-[200px]"
          } transition-all duration-200`}
        />
      </button>
    </div>
  );
}

// ─── UrlCard ───────────────────────────────────────────────────────────────

function UrlCard({ item }: { item: BrowserWorkspaceItem }) {
  const url = item.url ?? item.label;
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-zinc-900/80 border border-white/5 px-3 py-2.5">
      <Globe className="h-3.5 w-3.5 text-blue-400/50 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono text-blue-300/80 truncate">{url}</p>
        <p className="text-[9px] font-mono text-white/20">{getHostname(url)}</p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1 rounded hover:bg-white/5 transition-colors shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink className="h-3 w-3 text-white/20 hover:text-white/50" />
      </a>
    </div>
  );
}

function ActionCard({ item }: { item: BrowserWorkspaceItem }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-zinc-900/80 border border-white/5 px-3 py-2.5">
      <MousePointerClick className="h-3.5 w-3.5 text-blue-300/50 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-mono text-white/75">{item.label}</p>
        {item.detail && (
          <p className="mt-1 text-[10px] font-mono text-white/30 whitespace-pre-wrap">
            {item.detail}
          </p>
        )}
      </div>
      <span className="text-[9px] font-mono text-white/15 shrink-0">
        {timeAgo(item.timestamp)}
      </span>
    </div>
  );
}

function iconForItem(kind: BrowserWorkspaceItemKind) {
  switch (kind) {
    case "navigation":
      return <Globe className="h-3.5 w-3.5 text-blue-400/50 shrink-0" />;
    case "action":
      return <MousePointerClick className="h-3.5 w-3.5 text-blue-300/50 shrink-0" />;
    case "preview":
      return <Monitor className="h-3.5 w-3.5 text-emerald-300/50 shrink-0" />;
    default:
      return <Globe className="h-3.5 w-3.5 text-blue-400/50 shrink-0" />;
  }
}

function ActivityCard({ item }: { item: BrowserWorkspaceItem }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-zinc-900/80 border border-white/5 px-3 py-2.5">
      {iconForItem(item.kind)}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono text-blue-300/80 truncate">{item.label}</p>
        {item.url && (
          <p className="text-[9px] font-mono text-white/20 truncate">{item.url}</p>
        )}
        {item.detail && (
          <p className="mt-1 text-[10px] font-mono text-white/30 whitespace-pre-wrap">
            {item.detail}
          </p>
        )}
      </div>
      <span className="text-[9px] font-mono text-white/15 shrink-0">
        {timeAgo(item.timestamp)}
      </span>
    </div>
  );
}

function TakeoverBanner({
  takeover,
  onResume,
}: {
  takeover: BrowserTakeoverState;
  onResume?: () => void;
}) {
  const requested = takeover.status === "requested";

  return (
    <div className={`rounded-xl border px-3.5 py-3 ${
      requested
        ? "border-amber-400/20 bg-amber-500/10"
        : "border-emerald-400/20 bg-emerald-500/10"
    }`}>
      <div className="flex items-start gap-3">
        {requested ? (
          <ShieldAlert className="h-4 w-4 text-amber-300/70 shrink-0 mt-0.5" />
        ) : (
          <CircleCheckBig className="h-4 w-4 text-emerald-300/70 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-satoshi-bold text-white/90">
            {requested ? "Operator takeover needed" : "Operator resumed browser run"}
          </p>
          <p className="mt-1 text-[10px] font-mono text-white/55 whitespace-pre-wrap">
            {takeover.reason}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <span className="text-[9px] font-mono text-white/30">
            {timeAgo(takeover.updatedAt)}
          </span>
          {requested && onResume && (
            <button
              onClick={onResume}
              className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-satoshi-bold text-amber-100 transition-colors hover:bg-amber-300/15"
            >
              {takeover.actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PreviewFrame ──────────────────────────────────────────────────────────

function PreviewFrame({ url }: { url: string }) {
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* URL bar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <Globe className="h-3 w-3 text-white/20 shrink-0" />
        <span className="text-[10px] font-mono text-white/40 truncate flex-1">{url}</span>
        <button
          onClick={() => { setLoading(true); iframeRef.current?.contentWindow?.location.reload(); }}
          className="p-0.5 rounded hover:bg-white/5 transition-colors"
        >
          <RefreshCw className="h-3 w-3 text-white/20" />
        </button>
      </div>

      {/* Iframe */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]">
            <Loader2 className="h-5 w-5 text-white/15 animate-spin" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={url}
          className="w-full h-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  );
}

// ─── BrowserPanel ──────────────────────────────────────────────────────────

export default function BrowserPanel({
  items,
  isLoading,
  previewUrl,
  takeover,
  onResumeTakeover,
}: BrowserPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"activity" | "preview">("activity");

  const hasPreview = Boolean(previewUrl);

  // Deduplicate items by normalized URL
  const seen = new Set<string>();
  const allItems = items
    .filter((i) => i.kind !== "preview")
    .filter(i => {
      const rawKey = i.url ?? `${i.kind}:${i.label}:${i.detail ?? ""}`;
      const key = rawKey.replace(/[.),"'`]+$/, "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  // Auto-scroll when new items arrive
  useEffect(() => {
    if (scrollRef.current && mode === "activity") {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }, [allItems.length, mode]);

  // Switch to preview mode when preview becomes available
  useEffect(() => {
    if (hasPreview && allItems.length === 0) setMode("preview");
  }, [hasPreview, allItems.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle — only show when preview is available */}
      {hasPreview && (
        <div className="shrink-0 flex items-center gap-0.5 px-4 py-2 border-b border-white/5">
          {(["activity", "preview"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono capitalize transition-colors ${
                mode === m
                  ? "bg-white/12 text-white/80"
                  : "text-white/25 hover:text-white/50"
              }`}
            >
              {m === "activity" ? "Screenshots" : "Live Preview"}
            </button>
          ))}
        </div>
      )}

      {/* Preview mode */}
      {mode === "preview" && previewUrl && (
        <PreviewFrame url={previewUrl} />
      )}

      {/* Activity mode */}
      {mode === "activity" && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {takeover && (
            <TakeoverBanner takeover={takeover} onResume={onResumeTakeover} />
          )}

          {allItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Globe className="h-7 w-7 text-white/8 mb-3" />
              <p className="text-[10px] font-mono text-white/15">No browser activity yet</p>
            </div>
          ) : (
            allItems.map(item => (
              <div key={item.id}>
                {item.kind === "screenshot" && <ScreenshotCard item={item} />}
                {item.kind === "navigation" && item.url && <UrlCard item={item} />}
                {item.kind === "action" && <ActionCard item={item} />}
                {item.kind === "preview" && <ActivityCard item={item} />}
                {!["screenshot", "navigation", "action", "preview"].includes(item.kind) && (
                  <ActivityCard item={item} />
                )}
              </div>
            ))
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-1.5 text-white/15 font-mono text-[11px]">
              <Globe className="h-3 w-3 text-blue-400/30 animate-pulse" />
              <span className="animate-pulse">browsing…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
