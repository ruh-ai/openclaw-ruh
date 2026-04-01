"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Rocket, CheckCircle2, XCircle, Loader2, Terminal } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/hooks/use-agents-store";
import { pushAgentConfig } from "@/lib/openclaw/agent-config";
import {
  buildReviewRuntimeInputItems,
  buildDeployConfigSummary,
  buildReviewToolItems,
  buildReviewTriggerItems,
} from "@/lib/agents/operator-config-summary";
import { shouldAutoStartCreateDeploy, buildReflectHref } from "@/lib/agents/deploy-handoff";
import { hasMissingRequiredInputs } from "@/lib/agents/runtime-inputs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type DeployPhase = "idle" | "deploying" | "success" | "error";

interface LogLine {
  id: number;
  text: string;
}

interface ProvisionedWebhook {
  triggerId: string;
  title: string;
  url: string;
  secret: string;
  secretLastFour: string;
}

export default function DeployAgentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { agents, addSandboxToAgent, promoteForge, getForgeStatus, fetchAgent } = useAgentsStore();
  const agent = agents.find((a) => a.id === id);

  const [phase, setPhase] = useState<DeployPhase>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [provisionedWebhooks, setProvisionedWebhooks] = useState<ProvisionedWebhook[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logCounter = useRef(0);
  // Ref to track success state inside SSE closures (avoids stale closure issue)
  const succeededRef = useRef(false);
  const autoStartTriggeredRef = useRef(false);

  const handoffSource = searchParams.get("source");
  const autoStartParam = searchParams.get("autoStart");
  const isCreateHandoff = handoffSource === "create";
  const shouldAutoStartFromCreate = shouldAutoStartCreateDeploy(handoffSource, autoStartParam);

  const addLog = (text: string) => {
    setLogs((prev) => [...prev, { id: logCounter.current++, text }]);
  };

  // Fetch fresh agent data from backend on mount to get latest forge_sandbox_id
  const [agentFetched, setAgentFetched] = useState(false);
  useEffect(() => {
    if (id && fetchAgent) {
      fetchAgent(id).catch(() => {}).finally(() => setAgentFetched(true));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Runtime inputs are optional during initial deploy — users can configure them later.
  // The setup page is accessible from the agent settings for post-deploy configuration.

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const startDeploy = useCallback(async () => {
    if (!agent) return;
    setPhase("deploying");
    setLogs([]);
    setSandboxId(null);
    setErrorMsg("");
    setProvisionedWebhooks([]);
    succeededRef.current = false;

    addLog("Initiating deployment...");

    try {
      // Fast path: if agent has a forge sandbox that's running, promote it directly
      if (agent.forgeSandboxId) {
        addLog("Forge sandbox detected — checking health...");
        try {
          const forgeHealth = await getForgeStatus(id);
          if (forgeHealth.active && forgeHealth.forge_sandbox_id) {
            const sid = forgeHealth.forge_sandbox_id;
            setSandboxId(sid);
            addLog(`Forge sandbox healthy: ${sid}`);
            addLog("Pushing agent configuration...");

            const applyResult = await pushAgentConfig(sid, agent);
            for (const step of applyResult.steps) addLog(step.message);
            if (!applyResult.ok) {
              throw new Error(applyResult.detail ?? "Agent configuration failed");
            }
            setProvisionedWebhooks(applyResult.webhooks ?? []);

            addLog("Promoting forge sandbox to production...");
            await promoteForge(id);
            await fetchAgent(id);
            addLog("Agent deployed successfully (promoted from forge).");
            succeededRef.current = true;
            setPhase("success");
            return;
          }
          addLog("Forge sandbox not healthy — falling back to new sandbox creation.");
        } catch (forgeErr) {
          addLog(`Forge promote failed: ${forgeErr instanceof Error ? forgeErr.message : String(forgeErr)}. Creating new sandbox.`);
        }
      }

      // Standard path: Create a new sandbox from scratch
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
          setProvisionedWebhooks(applyResult.webhooks ?? []);

          await addSandboxToAgent(id, sid);
          await fetchAgent(id);
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
        if (succeededRef.current) {
          setPhase("success");
          return;
        }
        // SSE dropped (HMR, network blip, etc.) — poll backend to check if
        // the sandbox was actually created despite the stream dropping.
        addLog("Stream interrupted — checking if sandbox was created...");
        (async () => {
          try {
            // Wait a moment for backend to finish
            await new Promise(r => setTimeout(r, 3000));
            // Fetch the agent from backend to see if a sandbox was assigned
            const agentRes = await fetch(`${API_BASE}/api/agents/${id}`);
            if (!agentRes.ok) throw new Error("Agent not found");
            const agentData = await agentRes.json();
            const sids: string[] = agentData.sandbox_ids ?? [];
            if (sids.length > 0) {
              const sid = sids[sids.length - 1];
              setSandboxId(sid);
              addLog(`Sandbox found: ${sid} — stream dropped but creation succeeded.`);
              addLog("Pushing agent configuration...");
              const applyResult = await pushAgentConfig(sid, agent);
              for (const step of applyResult.steps) addLog(step.message);
              if (applyResult.ok) {
                await addSandboxToAgent(id, sid);
                addLog("Agent configuration complete.");
                succeededRef.current = true;
                setPhase("success");
                return;
              }
            }
            // Also check if there's a new sandbox from the stream_id
            // by looking at recently created sandboxes
            const sbRes = await fetch(`${API_BASE}/api/sandboxes`);
            if (sbRes.ok) {
              const sandboxes = await sbRes.json();
              const recent = sandboxes.find((s: Record<string, unknown>) =>
                s.sandbox_name === agent.name && s.sandbox_state === "running"
              );
              if (recent) {
                const sid = recent.sandbox_id as string;
                setSandboxId(sid);
                addLog(`Found matching sandbox: ${sid}`);
                addLog("Pushing agent configuration...");
                const applyResult = await pushAgentConfig(sid, agent);
                for (const step of applyResult.steps) addLog(step.message);
                if (applyResult.ok) {
                  await addSandboxToAgent(id, sid);
                  addLog("Agent configuration complete (recovered from stream drop).");
                  succeededRef.current = true;
                  setPhase("success");
                  return;
                }
              }
            }
            setErrorMsg("Connection lost and no sandbox found — try again");
            setPhase("error");
          } catch {
            setErrorMsg("Connection to deployment stream lost");
            setPhase("error");
          }
        })();
      };
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [addSandboxToAgent, agent, fetchAgent, getForgeStatus, id, promoteForge]);

  useEffect(() => {
    if (!agent || phase !== "idle" || !shouldAutoStartFromCreate || autoStartTriggeredRef.current) {
      return;
    }
    autoStartTriggeredRef.current = true;
    void startDeploy();
  }, [agent, phase, shouldAutoStartFromCreate, startDeploy]);

  // Auto-navigate to reflect stage after successful create-handoff deployment
  useEffect(() => {
    if (phase !== "success" || !isCreateHandoff) return;
    const timer = setTimeout(() => {
      router.push(buildReflectHref(id));
    }, 3000);
    return () => clearTimeout(timer);
  }, [phase, isCreateHandoff, id, router]);

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--text-tertiary)]">Agent not found.</p>
      </div>
    );
  }

  const deploySummary = buildDeployConfigSummary(agent);
  const runtimeInputItems = buildReviewRuntimeInputItems(agent.runtimeInputs);
  const toolItems = buildReviewToolItems(agent.toolConnections);
  const triggerItems = buildReviewTriggerItems(agent.triggers);
  const createHandoffMessage = isCreateHandoff
    ? deploySummary.readinessLabel === "Ready to deploy"
      ? "Agent saved from create flow. Starting the first deployment with the saved config shown below."
      : "Agent saved from create flow. Review the saved blockers below before starting the first deployment."
    : null;
  const channelItems = agent.channels ?? [];

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
          {createHandoffMessage && (
            <div
              data-testid="deploy-handoff-banner"
              className="mb-6 rounded-2xl border border-[var(--primary)]/20 bg-[var(--primary)]/6 px-5 py-4"
            >
              <p className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                {createHandoffMessage}
              </p>
            </div>
          )}

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
                {agent.skills.length} skill{agent.skills.length !== 1 ? "s" : ""} · {deploySummary.triggerSummary}
              </p>
            </div>
            {(agent.sandboxIds?.length ?? 0) > 0 && (
              <span className="ml-auto shrink-0 text-xs font-satoshi-medium text-[var(--success)] bg-[var(--success)]/8 border border-[var(--success)]/20 px-2.5 py-1 rounded-full">
                {agent.sandboxIds.length} existing deployment{agent.sandboxIds.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="grid gap-4 mb-8 md:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-5">
              <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Deploy readiness
              </p>
              <p className="mt-3 text-base font-satoshi-bold text-[var(--text-primary)]">
                {deploySummary.readinessLabel}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-5">
              <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Tool state
              </p>
              <p className="mt-3 text-base font-satoshi-bold text-[var(--text-primary)]">
                {deploySummary.toolSummary}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-5">
              <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Runtime input state
              </p>
              <p className="mt-3 text-base font-satoshi-bold text-[var(--text-primary)]">
                {deploySummary.runtimeInputSummary}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-5">
              <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Trigger state
              </p>
              <p className="mt-3 text-base font-satoshi-bold text-[var(--text-primary)]">
                {deploySummary.triggerSummary}
              </p>
            </div>
          </div>

          <div className="grid gap-4 mb-8 md:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-5">
              <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Saved runtime inputs
              </p>
              <div className="mt-3 space-y-3">
                {runtimeInputItems.length === 0 ? (
                  <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                    No persisted runtime inputs.
                  </p>
                ) : runtimeInputItems.map((input) => (
                  <div key={input.key} className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{input.label}</p>
                      <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {input.statusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{input.key}</p>
                    <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{input.detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-5">
              <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Saved tool connections
              </p>
              <div className="mt-3 space-y-3">
                {toolItems.length === 0 ? (
                  <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                    No persisted tool connections.
                  </p>
                ) : toolItems.map((tool) => (
                  <div key={tool.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{tool.name}</p>
                      <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {tool.statusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">{tool.description}</p>
                    <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{tool.detail}</p>
                    {tool.planNotes.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {tool.planNotes.map((note) => (
                          <li
                            key={`${tool.id}-${note}`}
                            className="text-xs font-satoshi-regular text-[var(--text-secondary)]"
                          >
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}
                    {tool.sources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tool.sources.slice(0, 2).map((source) => (
                          <a
                            key={`${tool.id}-${source.url}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-satoshi-medium text-[var(--primary)] hover:underline"
                          >
                            {source.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-5">
              <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Saved triggers
              </p>
              <div className="mt-3 space-y-3">
                {triggerItems.length === 0 ? (
                  <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                    No persisted triggers.
                  </p>
                ) : triggerItems.map((trigger) => (
                  <div key={trigger.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{trigger.text}</p>
                      <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {trigger.statusLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{trigger.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-5">
              <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Planned channels
              </p>
              <div className="mt-3 space-y-3">
                {channelItems.length === 0 ? (
                  <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                    Web chat only. No messaging channels were selected in the builder.
                  </p>
                ) : channelItems.map((channel) => (
                  <div key={channel.kind} className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{channel.label}</p>
                      <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {channel.status === "planned" ? "Planned" : channel.status === "configured" ? "Configured" : "Unsupported"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{channel.description}</p>
                    <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-secondary)]">
                      {channel.status === "planned"
                        ? "Complete bot credentials and pairing after deploy from the runtime channel setup surface."
                        : channel.status === "configured"
                        ? "Runtime channel configuration is already present for this saved plan."
                        : "This channel still needs manual setup outside the builder flow."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {(agent.improvements?.filter((item) => item.status === "accepted").length ?? 0) > 0 && (
            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-5 mb-8">
              <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Accepted Improvements
              </p>
              <div className="mt-3 space-y-3">
                {agent.improvements?.filter((item) => item.status === "accepted").map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3">
                    <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{item.title}</p>
                    <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">{item.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                        {isCreateHandoff && " · Redirecting to build summary..."}
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

              {provisionedWebhooks.length > 0 && (
                <div className="mt-6 rounded-2xl border border-[var(--primary)]/20 bg-[var(--primary)]/6 p-5">
                  <p className="text-xs font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                    Signed webhook details
                  </p>
                  <div className="mt-3 space-y-3">
                    {provisionedWebhooks.map((webhook) => (
                      <div
                        key={webhook.triggerId}
                        className="rounded-xl border border-[var(--border-default)] bg-white/70 px-4 py-3"
                      >
                        <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{webhook.title}</p>
                        <p className="mt-2 break-all font-mono text-xs text-[var(--text-secondary)]">{webhook.url}</p>
                        <p className="mt-2 font-mono text-xs text-[var(--text-primary)]">
                          Secret: {webhook.secret}
                        </p>
                        <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                          The full secret is only shown for this deploy run. Saved agent reads keep only the masked suffix ending in {webhook.secretLastFour}.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                  {isCreateHandoff && (
                    <Button
                      variant="tertiary"
                      className="h-10 px-5"
                      onClick={() => router.push(buildReflectHref(id))}
                    >
                      View Build Summary
                    </Button>
                  )}
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
