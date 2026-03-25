"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Rocket, CheckCircle2, XCircle, Loader2, Terminal } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/hooks/use-agents-store";
import { pushAgentConfig } from "@/lib/openclaw/agent-config";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type DeployPhase = "idle" | "deploying" | "success" | "error";

interface LogLine {
  id: number;
  text: string;
}

export default function DeployAgentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { agents, addSandboxToAgent } = useAgentsStore();
  const agent = agents.find((a) => a.id === id);

  const [phase, setPhase] = useState<DeployPhase>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const logEndRef = useRef<HTMLDivElement>(null);
  const logCounter = useRef(0);
  // Ref to track success state inside SSE closures (avoids stale closure issue)
  const succeededRef = useRef(false);

  const addLog = (text: string) => {
    setLogs((prev) => [...prev, { id: logCounter.current++, text }]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const startDeploy = async () => {
    if (!agent) return;
    setPhase("deploying");
    setLogs([]);
    setSandboxId(null);
    setErrorMsg("");
    succeededRef.current = false;

    addLog("Initiating deployment...");

    try {
      // Step 1: Create sandbox
      const createRes = await fetch(`${API_BASE}/api/sandboxes/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandbox_name: agent.name }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        throw new Error(`Failed to create sandbox: ${err}`);
      }

      const { stream_id } = await createRes.json();
      addLog(`Sandbox provisioning started (stream: ${stream_id})`);

      // Step 2: Stream SSE progress
      const eventSource = new EventSource(`${API_BASE}/api/sandboxes/stream/${stream_id}`);

      eventSource.addEventListener("log", (e) => {
        const data = JSON.parse(e.data);
        addLog(data.message ?? String(data));
      });

      eventSource.addEventListener("result", async (e) => {
        const data = JSON.parse(e.data);
        const sid = data.sandbox_id as string;
        setSandboxId(sid);
        addLog(`Sandbox ready: ${sid}`);
        addLog("Pushing agent configuration...");

        // Push the agent's skill graph and rules into the sandbox
        try {
          const applyResult = await pushAgentConfig(sid, agent);
          for (const step of applyResult.steps) addLog(step.message);
          if (!applyResult.ok) {
            addLog(`Agent configuration failed: ${applyResult.detail ?? "unknown error"}`);
            eventSource.close();
            setErrorMsg(applyResult.detail ?? "Agent configuration failed");
            setPhase("error");
            return;
          }

          await addSandboxToAgent(id, sid);
          addLog("Agent configuration complete.");
        } catch (error) {
          addLog("Agent configuration failed.");
          eventSource.close();
          setErrorMsg(error instanceof Error ? error.message : "Agent configuration failed");
          setPhase("error");
          return;
        }

        // Only mark success after config apply succeeds and the sandbox is attached.
        succeededRef.current = true;
      });

      eventSource.addEventListener("approved", () => {
        addLog("Device paired successfully.");
        eventSource.close();
        succeededRef.current = true;
        setPhase("success");
      });

      eventSource.addEventListener("done", () => {
        eventSource.close();
        succeededRef.current = true;
        setPhase("success");
      });

      eventSource.addEventListener("error", (e) => {
        const data = JSON.parse((e as MessageEvent).data ?? "{}");
        eventSource.close();
        if (!succeededRef.current) {
          setErrorMsg(data.message ?? "Deployment failed");
          setPhase("error");
        }
      });

      eventSource.onerror = () => {
        eventSource.close();
        // Use ref (not state) to avoid stale closure — state is async, ref is synchronous
        if (succeededRef.current) {
          setPhase("success");
        } else {
          setErrorMsg("Connection to deployment stream lost");
          setPhase("error");
        }
      };
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--text-tertiary)]">Agent not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 md:px-8 py-4 shrink-0 border-b border-[var(--border-default)]">
        <button
          onClick={() => router.push("/agents")}
          className="p-1 rounded-lg hover:bg-[var(--color-light)] transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5 text-[var(--text-secondary)]" />
        </button>
        <div>
          <h1 className="text-lg font-satoshi-bold text-[var(--text-primary)]">
            Deploy Agent
          </h1>
          <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
            {agent.name}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-8 py-8">
        <div className="max-w-2xl mx-auto">

          {/* Agent summary card */}
          <div className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] mb-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center text-2xl shrink-0">
              {agent.avatar}
            </div>
            <div className="min-w-0">
              <p className="text-base font-satoshi-bold text-[var(--text-primary)]">{agent.name}</p>
              <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                {agent.description}
              </p>
              <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] mt-1">
                {agent.skills.length} skill{agent.skills.length !== 1 ? "s" : ""} · {agent.triggerLabel}
              </p>
            </div>
            {(agent.sandboxIds?.length ?? 0) > 0 && (
              <span className="ml-auto shrink-0 text-xs font-satoshi-medium text-[var(--success)] bg-[var(--success)]/8 border border-[var(--success)]/20 px-2.5 py-1 rounded-full">
                {agent.sandboxIds.length} existing deployment{agent.sandboxIds.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Idle state */}
          {phase === "idle" && (
            <div className="flex flex-col items-center text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-5">
                <Rocket className="h-7 w-7 text-[var(--primary)]" />
              </div>
              <h2 className="text-lg font-satoshi-bold text-[var(--text-primary)] mb-2">
                Deploy to a new sandbox
              </h2>
              <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mb-1 max-w-md leading-relaxed">
                This will spin up a new Docker container running the OpenClaw gateway with your agent configuration.
              </p>
              <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)] mb-8">
                Deployment takes approximately 60 seconds.
              </p>
              <Button
                variant="primary"
                className="h-11 px-8 gap-2 rounded-lg"
                onClick={startDeploy}
              >
                <Rocket className="h-4 w-4" />
                Deploy Agent
              </Button>
            </div>
          )}

          {/* Deploying state */}
          {(phase === "deploying" || phase === "success" || phase === "error") && (
            <div>
              {/* Status header */}
              <div className="flex items-center gap-3 mb-5">
                {phase === "deploying" && (
                  <>
                    <div className="w-8 h-8 flex items-center justify-center">
                      <Image
                        src="/assets/logos/favicon.svg"
                        alt="Deploying"
                        width={28}
                        height={28}
                        className="animate-spin"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">Deploying...</p>
                      <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">This may take up to 60 seconds</p>
                    </div>
                  </>
                )}
                {phase === "success" && (
                  <>
                    <CheckCircle2 className="h-7 w-7 text-[var(--success)] shrink-0" />
                    <div>
                      <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">Deployment successful</p>
                      <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                        Sandbox ID: {sandboxId}
                      </p>
                    </div>
                  </>
                )}
                {phase === "error" && (
                  <>
                    <XCircle className="h-7 w-7 text-[var(--error)] shrink-0" />
                    <div>
                      <p className="text-sm font-satoshi-bold text-[var(--error)]">Deployment failed</p>
                      <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">{errorMsg}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Log terminal */}
              <div className="rounded-xl border border-[var(--border-stroke)] bg-[#0f0f0f] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
                  <Terminal className="h-3.5 w-3.5 text-white/40" />
                  <span className="text-xs font-mono text-white/40">deployment log</span>
                  {phase === "deploying" && (
                    <Loader2 className="h-3 w-3 text-white/40 animate-spin ml-auto" />
                  )}
                </div>
                <div className="p-4 max-h-72 overflow-y-auto font-mono text-xs leading-5">
                  {logs.map((line) => (
                    <div key={line.id} className="text-green-400/80">
                      <span className="text-white/20 mr-2 select-none">›</span>
                      {line.text}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>

              {/* Success actions */}
              {phase === "success" && (
                <div className="flex items-center gap-3 mt-6 justify-end">
                  <Button
                    variant="tertiary"
                    className="h-10 px-5"
                    onClick={() => router.push("/agents")}
                  >
                    Back to Agents
                  </Button>
                  <Button
                    variant="primary"
                    className="h-10 px-6 gap-2"
                    onClick={() => router.push(`/agents/${id}/chat`)}
                  >
                    <Rocket className="h-4 w-4" />
                    Chat with Agent
                  </Button>
                </div>
              )}

              {/* Error actions */}
              {phase === "error" && (
                <div className="flex items-center gap-3 mt-6 justify-end">
                  <Button
                    variant="tertiary"
                    className="h-10 px-5"
                    onClick={() => router.push("/agents")}
                  >
                    Back to Agents
                  </Button>
                  <Button
                    variant="primary"
                    className="h-10 px-6 gap-2"
                    onClick={() => {
                      setPhase("idle");
                      setLogs([]);
                    }}
                  >
                    Retry Deployment
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
