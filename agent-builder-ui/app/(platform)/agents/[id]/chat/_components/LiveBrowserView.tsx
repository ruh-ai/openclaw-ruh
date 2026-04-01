"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Loader2,
  Monitor,
  Maximize2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BrowserAction {
  type: "click" | "input" | "scroll" | "navigate" | "hover";
  label?: string;
  x?: number;
  y?: number;
  timestamp: number;
}

interface LiveBrowserViewProps {
  sandboxId: string;
  apiBase?: string;
  /** Whether the agent is actively controlling the browser */
  isAgentActive?: boolean;
  /** Current browser action for visual indicators */
  currentAction?: BrowserAction | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POLL_INTERVAL_MS = 750;
const ACTION_DISPLAY_MS = 2000;

// ─── Component ──────────────────────────────────────────────────────────────

export default function LiveBrowserView({
  sandboxId,
  apiBase = API_BASE,
  isAgentActive = false,
  currentAction = null,
}: LiveBrowserViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleAction, setVisibleAction] = useState<BrowserAction | null>(null);

  // Show action indicator briefly then fade
  useEffect(() => {
    if (!currentAction) return;
    setVisibleAction(currentAction);
    const timer = setTimeout(() => setVisibleAction(null), ACTION_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [currentAction]);

  // Poll screenshots
  useEffect(() => {
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (stopped) return;
      try {
        const url = `${apiBase}/api/sandboxes/${sandboxId}/browser/screenshot?t=${Date.now()}`;
        const res = await fetch(url);
        if (stopped) return;
        if (!res.ok) {
          setError(`Screenshot failed (${res.status})`);
          setConnected(false);
          timeoutId = setTimeout(poll, 3000);
          return;
        }
        const blob = await res.blob();
        if (stopped) return;
        // Only update if we got a real image (not the 1x1 fallback)
        if (blob.size > 200) {
          const objectUrl = URL.createObjectURL(blob);
          if (imgRef.current) {
            const prev = imgRef.current.src;
            imgRef.current.src = objectUrl;
            // Revoke previous blob URL after a short delay
            if (prev.startsWith("blob:")) {
              setTimeout(() => URL.revokeObjectURL(prev), 100);
            }
          }
          setConnected(true);
          setError(null);
        } else {
          setConnected(false);
          setError("Display not available");
        }
      } catch (err) {
        if (!stopped) {
          setConnected(false);
          setError(err instanceof Error ? err.message : "Connection failed");
        }
      }
      if (!stopped) {
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
    return () => {
      stopped = true;
      clearTimeout(timeoutId);
    };
  }, [sandboxId, apiBase]);

  const handleFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen?.();
  }, []);

  const actionLabel = visibleAction?.label
    ?? (visibleAction?.type === "click" ? "Clicking"
    : visibleAction?.type === "input" ? "Typing"
    : visibleAction?.type === "scroll" ? "Scrolling"
    : visibleAction?.type === "navigate" ? "Navigating"
    : visibleAction?.type === "hover" ? "Hovering"
    : null);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            connected ? "bg-green-400" :
            error ? "bg-red-400" :
            "bg-yellow-400 animate-pulse"
          }`} />
          <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">
            {connected ? "Live" : error ? "Error" : "Connecting"}
          </span>
        </div>

        {/* Agent control indicator */}
        {isAgentActive && connected && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-400/20">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[9px] font-mono text-blue-400/80 uppercase tracking-wider">Agent Control</span>
          </div>
        )}

        <div className="flex-1" />

        <button onClick={handleFullscreen} className="p-1 rounded hover:bg-white/5 transition-colors text-white/20 hover:text-white/50" title="Fullscreen">
          <Maximize2 className="h-3 w-3" />
        </button>
      </div>

      {/* Screenshot display */}
      <div
        ref={containerRef}
        className={`flex-1 relative min-h-0 bg-[#0d0d0d] overflow-hidden transition-all duration-300 ${
          isAgentActive && connected ? "ring-2 ring-blue-400/40 ring-inset" : ""
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="Browser view"
          className={`w-full h-full object-contain transition-opacity duration-200 ${connected ? "opacity-100" : "opacity-0"}`}
        />

        {/* Click indicator dot */}
        {visibleAction && visibleAction.x != null && visibleAction.y != null && (
          <div
            className="absolute pointer-events-none"
            style={{ left: `${visibleAction.x}%`, top: `${visibleAction.y}%`, transform: "translate(-50%, -50%)" }}
          >
            <span className="block h-4 w-4 rounded-full bg-orange-400/80 animate-ping" />
            <span className="absolute inset-0 m-auto block h-2 w-2 rounded-full bg-orange-400" />
          </div>
        )}

        {/* Action label overlay */}
        {actionLabel && connected && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 border border-white/10 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
              <span className="text-[10px] font-mono text-white/70">{actionLabel}</span>
            </div>
          </div>
        )}

        {!connected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {error ? (
              <>
                <Monitor className="h-7 w-7 text-white/8 mb-3" />
                <p className="text-[10px] font-mono text-white/20">{error}</p>
              </>
            ) : (
              <>
                <Loader2 className="h-6 w-6 text-white/15 animate-spin mb-3" />
                <p className="text-[10px] font-mono text-white/20">Connecting to browser...</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
