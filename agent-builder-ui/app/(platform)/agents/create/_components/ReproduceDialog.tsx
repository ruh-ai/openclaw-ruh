"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Loader2,
  Github,
  Copy,
} from "lucide-react";

interface ReproduceDialogProps {
  onClose: () => void;
}

type ReproduceStep = "form" | "provisioning" | "error";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function ReproduceDialog({ onClose }: ReproduceDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [step, setStep] = useState<ReproduceStep>("form");
  const [log, setLog] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const handleReproduce = useCallback(async () => {
    if (!name.trim() || !repoUrl.trim()) return;
    setStep("provisioning");
    setLog(["Creating agent from template..."]);
    setErrorMsg("");

    try {
      // 1. Call reproduce endpoint
      const createRes = await fetch(`${API_BASE}/api/agents/reproduce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          repo_url: repoUrl.trim(),
          github_token: githubToken.trim() || undefined,
        }),
      });
      if (!createRes.ok) throw new Error("Failed to create agent");
      const { agent_id, stream_id } = (await createRes.json()) as {
        agent_id: string;
        stream_id: string;
      };

      setLog((prev) => [...prev, "Provisioning container..."]);

      // 2. Stream SSE progress
      const sseRes = await fetch(
        `${API_BASE}/api/agents/${agent_id}/forge/stream/${stream_id}`,
      );
      if (!sseRes.ok || !sseRes.body)
        throw new Error("Failed to open provisioning stream");

      const reader = sseRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const block of events) {
            if (!block.trim()) continue;
            let eventName = "";
            const dataLines: string[] = [];
            for (const line of block.split("\n")) {
              if (line.startsWith("event: "))
                eventName = line.slice(7).trim();
              else if (line.startsWith("data: "))
                dataLines.push(line.slice(6));
            }
            const dataStr = dataLines.join("\n");
            if (!eventName || !dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr) as Record<string, unknown>;
              if (eventName === "log") {
                setLog((prev) => [
                  ...prev,
                  String(parsed.message ?? ""),
                ]);
              } else if (eventName === "error") {
                throw new Error(
                  String(parsed.message ?? "Provisioning failed"),
                );
              }
            } catch (e) {
              if (
                e instanceof Error &&
                (e.message.includes("failed") || e.message.includes("Failed"))
              )
                throw e;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      setLog((prev) => [...prev, "Agent ready — opening..."]);
      // Navigate to the agent's create page (chat with reproduced agent)
      router.push(`/agents/create?agentId=${agent_id}`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to reproduce agent",
      );
      setStep("error");
    }
  }, [name, repoUrl, githubToken, router]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-stroke)]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[var(--secondary)]/10">
              <Copy className="h-4 w-4 text-[var(--secondary)]" />
            </div>
            <div>
              <h2 className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                Reproduce from Template
              </h2>
              <p className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
                Clone a GitHub repo into a new agent
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-light)] transition-colors"
          >
            <X className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {step === "form" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Google Ads Manager"
                  className="w-full px-3 py-2 text-sm font-satoshi-regular rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-breathe focus:outline-none transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                  GitHub Repository URL
                </label>
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/agent-template"
                    className="flex-1 px-3 py-2 text-sm font-satoshi-regular rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-breathe focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                  GitHub Token{" "}
                  <span className="text-[var(--text-tertiary)]">
                    (optional, for private repos)
                  </span>
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 text-sm font-satoshi-regular rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-breathe focus:outline-none transition-colors"
                />
              </div>
            </>
          )}

          {step === "provisioning" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="h-6 w-6 text-[var(--primary)] animate-spin" />
                <p className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                  Reproducing agent...
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] p-3 space-y-1 max-h-40 overflow-y-auto">
                {log.map((line, i) => (
                  <p
                    key={i}
                    className="text-[10px] font-mono text-[var(--text-secondary)] leading-relaxed"
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center py-4 gap-3">
              <p className="text-sm font-satoshi-bold text-[var(--error)]">
                Reproduction failed
              </p>
              <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] text-center">
                {errorMsg}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-stroke)]">
          {step === "form" && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-satoshi-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--color-light)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReproduce}
                disabled={!name.trim() || !repoUrl.trim()}
                className="flex items-center gap-2 px-5 py-2 text-sm font-satoshi-bold text-white rounded-xl bg-[var(--secondary)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Copy className="h-3.5 w-3.5" />
                Reproduce
              </button>
            </>
          )}
          {step === "error" && (
            <>
              <button
                onClick={() => setStep("form")}
                className="px-4 py-2 text-sm font-satoshi-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--color-light)] transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-satoshi-bold text-white rounded-xl bg-[var(--primary)] hover:opacity-90 transition-all"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
