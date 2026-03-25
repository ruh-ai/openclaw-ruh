"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Image from "next/image";
import { BotMessage } from "./_components/BotMessage";
import { UserMessage } from "./_components/UserMessage";
import { ChatInput } from "./_components/ChatInput";
import { ReviewAgent } from "./_components/review/ReviewAgent";
import { ConfigureAgent } from "./_components/configure/ConfigureAgent";
import { Button } from "@/components/ui/button";
import { AgentConfigPanel } from "./_components/AgentConfigPanel";
import { useOpenClawChat } from "@/hooks/use-openclaw-chat";
import { useAgentsStore } from "@/hooks/use-agents-store";
import { pushAgentConfig } from "@/lib/openclaw/agent-config";

export default function CreateAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingAgentId = searchParams.get("agentId");

  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"chat" | "review" | "configure">("chat");
  const [pendingInput, setPendingInput] = useState<string>("");
  const [hotPushStatus, setHotPushStatus] = useState<"idle" | "pushing" | "done" | "error">("idle");
  const [hotPushCount, setHotPushCount] = useState(0);
  const [hotPushSummary, setHotPushSummary] = useState<string>("");
  // Panel overrides — user edits in the config panel take precedence over architect output
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [rulesOverride, setRulesOverride] = useState<string[] | null>(null);

  const {
    messages,
    isLoading,
    statusMessage,
    skillGraph,
    workflow,
    systemName,
    agentRules,
    sendMessage,
    initialize,
    reset,
  } = useOpenClawChat();

  const { agents, saveAgent, persistAgentEdits } = useAgentsStore();
  const existingAgent = editingAgentId ? agents.find((a) => a.id === editingAgentId) ?? null : null;

  // On mount: seed with existing agent data when editing, or reset to a fresh session
  // when creating new. This prevents stale persisted state (old errors, old skill graphs)
  // from a previous session bleeding into a new one.
  useEffect(() => {
    if (existingAgent) {
      initialize(existingAgent);
    } else {
      reset();
    }
    // Only run once when the agent is first loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAgentId]);

  const deriveTriggerLabel = (rules: string[], graph: typeof skillGraph) => {
    const scheduleRule = rules.find(
      (r) => r.toLowerCase().includes("schedule") || r.toLowerCase().includes("cron")
    );
    return scheduleRule || (graph?.some((n) =>
      (n.name + n.description).toLowerCase().includes("slack")
    ) ? "On message received" : "Manual trigger");
  };

  const deriveAvatar = (name: string) =>
    name.includes("slack") ? "💬"
    : name.includes("github") || name.includes("code") ? "💻"
    : name.includes("data") || name.includes("ingest") ? "📊"
    : name.includes("email") || name.includes("mail") ? "📧"
    : name.includes("report") ? "📋"
    : "🤖";

  const handleComplete = useCallback(async () => {
    const effectiveRules = rulesOverride ?? (agentRules.length > 0 ? agentRules : (existingAgent?.agentRules ?? []));
    const effectiveGraph = skillGraph ?? existingAgent?.skillGraph ?? null;
    const effectiveName = nameOverride ?? systemName ?? existingAgent?.name ?? "New Agent";

    const triggerLabel = deriveTriggerLabel(effectiveRules, effectiveGraph);
    const avatar = deriveAvatar(effectiveName.toLowerCase());
    const description =
      effectiveRules.find((r) => r.toLowerCase().includes("schedule")) ||
      (effectiveGraph && effectiveGraph.length > 0
        ? `Runs ${effectiveGraph.length} skills: ${effectiveGraph.map((n) => n.name).join(", ")}`
        : "AI agent");

    const updatedFields = {
      name: effectiveName,
      avatar,
      description: description || "AI agent",
      skills: effectiveGraph?.map((n) => n.name) ?? existingAgent?.skills ?? [],
      triggerLabel,
      skillGraph: effectiveGraph ?? undefined,
      workflow: workflow ?? existingAgent?.workflow ?? undefined,
      agentRules: effectiveRules.length > 0 ? effectiveRules : undefined,
    };

    if (existingAgent) {
      const savedAgent = await persistAgentEdits(existingAgent.id, updatedFields);

      // Hot-push updated config to all running sandboxes
      const sandboxIds = savedAgent.sandboxIds ?? [];
      if (sandboxIds.length > 0) {
        setHotPushStatus("pushing");
        setHotPushCount(sandboxIds.length);
        setHotPushSummary("");
        try {
          const results = await Promise.all(
            sandboxIds.map(async (sid) => ({
              sandboxId: sid,
              result: await pushAgentConfig(sid, savedAgent),
            }))
          );
          const failedSandboxIds = results
            .filter(({ result }) => !result.ok)
            .map(({ sandboxId }) => sandboxId);
          const succeededCount = results.length - failedSandboxIds.length;

          if (failedSandboxIds.length === 0) {
            setHotPushStatus("done");
            setHotPushSummary(`${results.length} instance${results.length !== 1 ? "s" : ""} updated`);
          } else {
            setHotPushStatus("error");
            setHotPushSummary(
              `${succeededCount} updated, ${failedSandboxIds.length} failed (${failedSandboxIds.join(", ")})`
            );
          }
        } catch {
          setHotPushStatus("error");
          setHotPushSummary("Config push failed before all running instances could be updated");
        }
        // Brief pause so the user sees the status before navigating
        await new Promise((r) => setTimeout(r, 1200));
      }
    } else {
      await saveAgent({ ...updatedFields, status: "active" });
    }

    reset();
    router.push("/agents");
  }, [systemName, skillGraph, agentRules, workflow, existingAgent, nameOverride, rulesOverride, saveAgent, persistAgentEdits, reset, router]);

  // When user clicks an option chip in a clarification, pre-fill and send
  const handleSelectOption = useCallback(
    (text: string) => {
      setPendingInput(text);
    },
    []
  );

  // Auto-scroll to bottom on new messages or status changes
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [messages, isLoading, statusMessage]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (view === "review") {
    const reviewGraph = skillGraph ?? existingAgent?.skillGraph ?? null;
    const reviewName = nameOverride ?? systemName ?? existingAgent?.name ?? null;
    const reviewRules = rulesOverride ?? (agentRules.length > 0 ? agentRules : (existingAgent?.agentRules ?? []));
    const reviewWorkflow = workflow ?? existingAgent?.workflow ?? null;
    return (
      <ReviewAgent
        onBack={() => setView("chat")}
        onConfirm={() => setView("configure")}
        skillGraph={reviewGraph}
        workflow={reviewWorkflow}
        systemName={reviewName}
        agentRules={reviewRules}
      />
    );
  }

  if (view === "configure") {
    return (
      <div className="relative flex flex-col h-full">
        <ConfigureAgent
          agentName={systemName || existingAgent?.name || "New Agent"}
          onBack={() => setView("review")}
          onComplete={handleComplete}
          onCancel={() => router.push("/agents")}
          skillGraph={skillGraph ?? existingAgent?.skillGraph}
          agentRules={agentRules.length > 0 ? agentRules : existingAgent?.agentRules}
        />
        {/* Hot-push status overlay */}
        {hotPushStatus !== "idle" && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center px-6 pb-6 pointer-events-none">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg bg-[var(--card-color)] border-[var(--border-stroke)]">
              {hotPushStatus === "pushing" && (
                <>
                  <Loader2 className="h-4 w-4 text-[var(--primary)] animate-spin shrink-0" />
                  <span className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                    Updating {hotPushCount} running instance{hotPushCount !== 1 ? "s" : ""}...
                  </span>
                </>
              )}
              {hotPushStatus === "done" && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[var(--success)] shrink-0" />
                  <span className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                    {hotPushSummary || `${hotPushCount} instance${hotPushCount !== 1 ? "s" : ""} updated`}
                  </span>
                </>
              )}
              {hotPushStatus === "error" && (
                <>
                  <AlertCircle className="h-4 w-4 text-[var(--error)] shrink-0" />
                  <span className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                    {hotPushSummary || "Config push failed — instances may need a redeploy"}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const effectivePanelRules = rulesOverride ?? (agentRules.length > 0 ? agentRules : (existingAgent?.agentRules ?? []));
  const effectivePanelName = nameOverride ?? systemName ?? existingAgent?.name ?? null;
  const effectivePanelTrigger = deriveTriggerLabel(effectivePanelRules, skillGraph ?? existingAgent?.skillGraph ?? null);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 md:px-8 py-4 shrink-0 border-b border-border-default">
        <button
          onClick={() => router.push("/agents")}
          className="p-1 rounded-lg hover:bg-[var(--color-light,#f5f5f5)] transition-colors cursor-pointer"
          aria-label="Back to agents"
        >
          <ChevronLeft className="h-5 w-5 text-text-secondary" />
        </button>
        <div>
          <h1 className="text-lg font-satoshi-bold text-text-primary">
            {existingAgent ? "Improve Agent" : "Create New Agent"}
          </h1>
          {existingAgent && (
            <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
              {existingAgent.name}
            </p>
          )}
        </div>
      </div>

      {/* Body: chat (left) + config panel (right) */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Chat column ── */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Chat area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-0">
            <div className="max-w-2xl mx-auto md:ml-8 py-6 space-y-6">
              {messages.map((msg, index) =>
                msg.role === "architect" ? (
                  <BotMessage
                    key={msg.id}
                    message={msg}
                    animate={index > 0}
                    onSelectOption={handleSelectOption}
                  />
                ) : (
                  <UserMessage key={msg.id} message={msg.content} />
                )
              )}

              {/* Skill graph ready — show proceed card */}
              {skillGraph && (
                <div className="animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
                      <Image
                        src="/assets/logos/favicon.svg"
                        alt="Ruh AI"
                        width={32}
                        height={32}
                        className="rounded-full"
                      />
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-sm font-satoshi-regular text-text-primary leading-relaxed mb-4">
                        Skill graph {existingAgent ? "updated" : "generated"} with{" "}
                        <strong>{skillGraph.length} skills</strong>. Check the panel on the right, then proceed to review.
                      </p>
                      <div className="flex items-center justify-end">
                        <Button
                          variant="primary"
                          className="h-10 px-5 gap-1.5 rounded-lg"
                          onClick={() => setView("review")}
                        >
                          {existingAgent ? "Review Changes" : "Proceed to Review"}
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading / status indicator */}
              {isLoading && (
                <div className="flex items-center gap-3 pl-0 animate-fadeIn">
                  <div className="shrink-0 w-8 h-8 flex items-center justify-center">
                    <Image
                      src="/assets/logos/favicon.svg"
                      alt="Ruh AI"
                      width={28}
                      height={28}
                      className="animate-spin"
                    />
                  </div>
                  <span className="text-sm font-satoshi-regular text-text-tertiary">
                    {statusMessage || "Thinking..."}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Input area */}
          <div className="shrink-0 px-4 md:px-0 pb-6 pt-3">
            <div className="max-w-2xl mx-auto md:ml-8">
              <ChatInput
                onSend={sendMessage}
                disabled={isLoading}
                placeholder={
                  skillGraph
                    ? "Ask follow-up questions or proceed to review"
                    : existingAgent
                    ? `What would you like to change about ${existingAgent.name}?`
                    : "Describe your agent idea..."
                }
                prefillValue={pendingInput}
                onPrefillConsumed={() => setPendingInput("")}
              />
            </div>
          </div>
        </div>

        {/* ── Config panel column ── */}
        <div className="hidden lg:flex w-72 xl:w-80 shrink-0 flex-col overflow-hidden">
          <AgentConfigPanel
            skillGraph={skillGraph ?? existingAgent?.skillGraph ?? null}
            workflow={workflow ?? existingAgent?.workflow ?? null}
            systemName={effectivePanelName}
            agentRules={effectivePanelRules}
            triggerLabel={effectivePanelTrigger}
            existingAgent={existingAgent}
            isLoading={isLoading}
            onNameChange={setNameOverride}
            onRulesChange={setRulesOverride}
          />
        </div>

      </div>
    </div>
  );
}
