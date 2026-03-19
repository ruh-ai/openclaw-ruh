"use client";

import { useState, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface FormState {
  sandbox_name: string;
}

const defaultForm: FormState = {
  sandbox_name: "openclaw-gateway",
};

interface Props {
  onCreated?: () => void;
  onCancel?: () => void;
}

export default function SandboxForm({ onCreated, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);

  function appendLog(msg: string) {
    setLogs((prev) => [...prev, msg]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLogs([]);
    setErrorMsg("");
    setStatus("running");

    try {
      const res = await fetch(`${API_URL}/api/sandboxes/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Failed to initiate sandbox creation");
      }

      const { stream_id } = await res.json();
      const sse = new EventSource(`${API_URL}/api/sandboxes/stream/${stream_id}`);

      sse.addEventListener("log", (ev) => {
        appendLog(JSON.parse(ev.data).message);
      });

      sse.addEventListener("result", () => {
        onCreated?.();
      });

      sse.addEventListener("approved", (ev) => {
        appendLog(`Device approved: ${JSON.parse(ev.data).message}`);
      });

      sse.addEventListener("done", () => {
        setStatus("done");
        sse.close();
      });

      sse.addEventListener("error", (ev) => {
        const d = (ev as MessageEvent).data;
        setErrorMsg(d ? JSON.parse(d).message : "Connection lost");
        setStatus("error");
        sse.close();
      });

      sse.onerror = () => {
        if (status !== "done" && status !== "error") {
          setErrorMsg("SSE connection error");
          setStatus("error");
        }
        sse.close();
      };
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  const isRunning = status === "running";
  const isDone = status === "done";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-white">New Sandbox</h2>
        {onCancel && (
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-sm">
            ✕ Cancel
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pr-1">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Sandbox Name */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Sandbox Name</label>
            <input
              type="text"
              value={form.sandbox_name}
              onChange={(e) => setForm({ ...form, sandbox_name: e.target.value })}
              disabled={isRunning || isDone}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {status === "idle" || status === "error" ? (
            <button
              type="submit"
              disabled={isRunning}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
            >
              Create Sandbox
            </button>
          ) : null}
        </form>

        {/* Logs */}
        {logs.length > 0 && (
          <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-2">
              <span className="text-[10px] text-gray-500 font-mono font-medium tracking-wider">LOGS</span>
              {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
              {isDone && <span className="text-[10px] text-green-400">Done</span>}
            </div>
            <div className="max-h-60 overflow-y-auto p-3 font-mono text-[11px] text-gray-400 space-y-0.5">
              {logs.map((line, i) => (
                <div key={i} className="leading-relaxed">
                  <span className="text-gray-700 select-none mr-2">{String(i + 1).padStart(3, "0")}</span>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-3">
            <p className="text-red-400 text-xs font-medium mb-1">Error</p>
            <p className="text-red-300 text-xs">{errorMsg}</p>
            <button
              onClick={() => { setStatus("idle"); setErrorMsg(""); }}
              className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
            >
              Try again
            </button>
          </div>
        )}

        {isDone && (
          <div className="bg-green-950 border border-green-800 rounded-xl p-3 text-center">
            <p className="text-green-400 text-sm font-medium">Sandbox ready!</p>
            <p className="text-green-600 text-xs mt-1">Select it from the sidebar to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  );
}
