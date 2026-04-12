"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Globe,
  Loader2,
  Play,
  RefreshCw,
  ServerCrash,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const IS_LOCAL = API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1");

interface PreviewPanelProps {
  sandboxId: string | null;
  conversationId: string | null;
  isAgentRunning: boolean;
  /** Ports detected as running dev servers from agent SSE output */
  detectedPorts: number[];
}

interface PortInfo {
  ports: Record<number, number>; // container port → host port
  active: number[];
}

export default function PreviewPanel({
  sandboxId,
  conversationId,
  isAgentRunning,
  detectedPorts,
}: PreviewPanelProps) {
  const [portInfo, setPortInfo] = useState<PortInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch port info from backend
  const fetchPorts = useCallback(async () => {
    if (!sandboxId) return;
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/preview/ports`);
      if (!res.ok) throw new Error("Failed to fetch preview ports");
      const data = (await res.json()) as PortInfo;
      setPortInfo(data);

      // Auto-select first active port if none selected
      if (data.active.length > 0 && !selectedPort) {
        setSelectedPort(data.active[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [sandboxId, selectedPort]);

  // Initial fetch + poll while agent is running or no active ports yet
  useEffect(() => {
    if (!sandboxId) return;
    setLoading(true);
    fetchPorts().finally(() => setLoading(false));
  }, [sandboxId, fetchPorts]);

  // Poll while agent is running (always — server may start at any point)
  useEffect(() => {
    if (!sandboxId || !isAgentRunning) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(fetchPorts, 5_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sandboxId, isAgentRunning, fetchPorts]);

  // Final poll after agent stops (catch servers that started in the last moments)
  const prevAgentRunning = useRef(isAgentRunning);
  useEffect(() => {
    if (prevAgentRunning.current && !isAgentRunning && sandboxId) {
      const timer = setTimeout(fetchPorts, 2000);
      prevAgentRunning.current = isAgentRunning;
      return () => clearTimeout(timer);
    }
    prevAgentRunning.current = isAgentRunning;
  }, [isAgentRunning, sandboxId, fetchPorts]);

  // Auto-select from SSE-detected ports
  useEffect(() => {
    if (detectedPorts.length > 0 && !selectedPort) {
      setSelectedPort(detectedPorts[0]);
      fetchPorts();
    }
  }, [detectedPorts, selectedPort, fetchPorts]);

  // Merge detected + discovered active ports
  const allActivePorts = [
    ...new Set([...(portInfo?.active ?? []), ...detectedPorts]),
  ].sort((a, b) => a - b);

  // Auto-reselect when selected port dies and new ports are available
  useEffect(() => {
    if (allActivePorts.length > 0 && selectedPort && !allActivePorts.includes(selectedPort)) {
      setSelectedPort(allActivePorts[0]);
      setIframeKey(prev => prev + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allActivePorts.length, selectedPort]);

  const handleRefresh = useCallback(() => {
    setIframeKey(prev => prev + 1);
    fetchPorts();
  }, [fetchPorts]);

  // Build the proxy URL for the iframe.
  // In production, use the same-origin rewrite path so the iframe loads from
  // builder.codezero2pi.com (avoiding cross-origin and mixed-content issues).
  // In local dev, hit the backend directly for simplicity.
  const proxyUrl = sandboxId && selectedPort
    ? IS_LOCAL
      ? `${API_BASE}/api/sandboxes/${sandboxId}/preview/proxy/${selectedPort}/`
      : `/api/sandbox-preview/${sandboxId}/proxy/${selectedPort}/`
    : null;

  // Empty state
  if (!sandboxId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Play className="h-7 w-7 text-[var(--primary)]/20" />
        <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
          No sandbox connected
        </p>
      </div>
    );
  }

  if (loading && !portInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="h-5 w-5 text-[var(--primary)]/40 animate-spin" />
        <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
          Checking for dev servers...
        </p>
      </div>
    );
  }

  if (allActivePorts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-8">
        <Globe className="h-7 w-7 text-[var(--primary)]/20" />
        <p className="text-[10px] font-satoshi-bold text-[var(--text-secondary)] text-center">
          No dev servers detected
        </p>
        <p className="text-[10px] font-mono text-[var(--text-tertiary)] text-center leading-relaxed">
          Ask the agent to start a web server and the preview will appear here.
          <br />
          <span className="text-[var(--text-tertiary)]/60">
            Supported ports: 3000-3002, 4173, 5173-5174, 8000, 8080
          </span>
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-[10px] font-satoshi-bold text-[var(--text-secondary)] hover:bg-[var(--color-light)] transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-default)] bg-[var(--background)]">
        {/* Port selector */}
        {allActivePorts.length > 1 ? (
          <select
            value={selectedPort ?? ""}
            onChange={(e) => {
              setSelectedPort(parseInt(e.target.value, 10));
              setIframeKey(prev => prev + 1);
            }}
            className="rounded-md border border-[var(--border-default)] bg-[var(--background)] px-2 py-0.5 text-[10px] font-mono text-[var(--text-primary)]"
          >
            {allActivePorts.map((p) => (
              <option key={p} value={p}>
                :{p}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
            :{selectedPort}
          </span>
        )}

        {/* URL display */}
        <div className="flex-1 rounded-md border border-[var(--border-default)] bg-[var(--color-light)] px-2 py-0.5 text-[10px] font-mono text-[var(--text-tertiary)] truncate">
          localhost:{selectedPort}
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={handleRefresh}
          title="Refresh preview"
          className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>

        {/* Open in new tab */}
        {proxyUrl && (
          <a
            href={proxyUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Preview iframe */}
      {proxyUrl ? (
        <iframe
          key={iframeKey}
          src={proxyUrl}
          className="flex-1 w-full border-0 bg-white"
          title={`Preview localhost:${selectedPort}`}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <ServerCrash className="h-5 w-5 text-[var(--warning)]/40" />
          <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
            Unable to connect to preview
          </p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="shrink-0 px-3 py-1 bg-[var(--error)]/10 text-[var(--error)] text-[10px] font-mono">
          {error}
        </div>
      )}
    </div>
  );
}
