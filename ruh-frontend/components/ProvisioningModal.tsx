"use client";

/**
 * ProvisioningModal — Shows live SSE progress during agent installation.
 *
 * When a v3 agent is installed from the marketplace, the backend provisions
 * a sandbox, clones the GitHub repo, installs dependencies, runs migrations,
 * and starts services. This modal shows each step in real-time.
 */

import { useEffect, useRef, useState } from "react";
// Simple icon components (lucide-react not available in ruh-frontend)
const Spinner = () => <span className="inline-block h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />;
const Check = () => <span className="inline-block text-green-600">&#10003;</span>;
const Cross = () => <span className="inline-block text-red-600">&#10007;</span>;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ProvisioningModalProps {
  agentId: string;
  streamId: string;
  agentName: string;
  onComplete: () => void;
  onClose: () => void;
}

type Phase = "connecting" | "provisioning" | "cloning" | "installing" | "migrating" | "starting" | "ready" | "error";

const PHASE_LABELS: Record<Phase, string> = {
  connecting: "Connecting...",
  provisioning: "Provisioning container...",
  cloning: "Cloning template from GitHub...",
  installing: "Installing dependencies...",
  migrating: "Running database migrations...",
  starting: "Starting services...",
  ready: "Agent ready!",
  error: "Setup failed",
};

function inferPhase(message: string): Phase | null {
  const lower = message.toLowerCase();
  if (lower.includes("clone") || lower.includes("template")) return "cloning";
  if (lower.includes("npm install") || lower.includes("dependencies") || lower.includes("installing")) return "installing";
  if (lower.includes("migrat") || lower.includes("database") || lower.includes("postgresql")) return "migrating";
  if (lower.includes("starting") || lower.includes("service") || lower.includes("backend") || lower.includes("health")) return "starting";
  if (lower.includes("complete") || lower.includes("ready") || lower.includes("all services")) return "ready";
  if (lower.includes("fail") || lower.includes("error") || lower.includes("abort")) return "error";
  return null;
}

export function ProvisioningModal({
  agentId,
  streamId,
  agentName,
  onComplete,
  onClose,
}: ProvisioningModalProps) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = `${API_URL}/api/agents/${agentId}/forge/stream/${streamId}`;
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.addEventListener("log", (event) => {
      try {
        const data = JSON.parse(event.data);
        const message = data.message ?? String(event.data);
        setLogs((prev) => [...prev, message]);

        const inferred = inferPhase(message);
        if (inferred) setPhase(inferred);
      } catch {
        setLogs((prev) => [...prev, event.data]);
      }
    });

    eventSource.addEventListener("result", () => {
      setPhase("provisioning");
    });

    eventSource.addEventListener("approved", () => {
      // Device pairing done — clone/setup starts next
    });

    eventSource.addEventListener("done", () => {
      setPhase("ready");
      eventSource.close();
      setTimeout(onComplete, 1500);
    });

    eventSource.addEventListener("error", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data ?? "{}");
        setError(data.message ?? "Provisioning failed");
      } catch {
        setError("Connection lost during provisioning");
      }
      setPhase("error");
      eventSource.close();
    });

    eventSource.onerror = () => {
      // SSE reconnect or stream ended
    };

    return () => {
      eventSource.close();
    };
  }, [agentId, streamId, onComplete]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const isComplete = phase === "ready";
  const isFailed = phase === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">
              Installing {agentName}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {PHASE_LABELS[phase]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span className="text-gray-400">&times;</span>
          </button>
        </div>

        {/* Progress phases */}
        <div className="px-5 py-3 flex items-center gap-2 text-[10px] font-medium text-gray-400 border-b border-gray-50">
          {(["provisioning", "cloning", "installing", "migrating", "starting", "ready"] as Phase[]).map((p) => {
            const phases: Phase[] = ["provisioning", "cloning", "installing", "migrating", "starting", "ready"];
            const currentIdx = phases.indexOf(phase);
            const thisIdx = phases.indexOf(p);
            const isDone = thisIdx < currentIdx || phase === "ready";
            const isActive = thisIdx === currentIdx;
            return (
              <div
                key={p}
                className={`flex items-center gap-1 ${
                  isDone ? "text-green-600" : isActive ? "text-purple-600" : "text-gray-300"
                }`}
              >
                {isDone ? (
                  <Check />
                ) : isActive ? (
                  <Spinner />
                ) : (
                  <div className="h-3 w-3 rounded-full border border-current" />
                )}
                <span className="hidden sm:inline">{p}</span>
              </div>
            );
          })}
        </div>

        {/* Logs */}
        <div className="px-5 py-3 max-h-60 overflow-y-auto bg-gray-50/50">
          <div className="space-y-1">
            {logs.map((log, i) => (
              <p key={i} className="text-[11px] font-mono text-gray-600 leading-relaxed">
                {log}
              </p>
            ))}
            <div ref={logEndRef} />
          </div>
          {logs.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
              <Spinner />
              Connecting to provisioning stream...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100">
          {isComplete && (
            <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
              <Check />
              Agent installed and running. Redirecting...
            </div>
          )}
          {isFailed && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-red-600 font-medium">
                <Cross />
                {error ?? "Installation failed"}
              </div>
              <button
                onClick={onClose}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Close and retry later
              </button>
            </div>
          )}
          {!isComplete && !isFailed && (
            <p className="text-[10px] text-gray-400">
              This may take 2-5 minutes. Do not close this window.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
