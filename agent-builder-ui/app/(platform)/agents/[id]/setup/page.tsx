"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/hooks/use-agents-store";
import type { AgentRuntimeInput } from "@/lib/agents/types";
import { hasMissingRequiredInputs, mergeRuntimeInputDefinitions } from "@/lib/agents/runtime-inputs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AgentSetupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPage = searchParams.get("next"); // "deploy" or "chat" (defaults to chat)
  const targetSandboxId = searchParams.get("sandbox"); // sandbox to push env to

  const { agents, fetchAgent, updateAgentConfig } = useAgentsStore();
  const agent = agents.find((a) => a.id === id);

  const [fetchAttempted, setFetchAttempted] = useState(false);
  const [inputs, setInputs] = useState<AgentRuntimeInput[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch agent if not in local store
  useEffect(() => {
    if (!agent && !fetchAttempted) {
      setFetchAttempted(true);
      fetchAgent(id);
    }
  }, [agent, fetchAttempted, fetchAgent, id]);

  // Seed local form state — derive from agent rules + skill graph + existing inputs
  useEffect(() => {
    if (agent) {
      const resolved = mergeRuntimeInputDefinitions({
        existing: agent.runtimeInputs,
        skillGraph: agent.skillGraph,
        agentRules: agent.agentRules,
      });
      setInputs(resolved);
    }
  }, [agent]);

  // If agent has no missing required inputs, redirect to destination
  useEffect(() => {
    if (agent && !hasMissingRequiredInputs(agent)) {
      const dest = nextPage === "deploy" ? `/agents/${id}/deploy` : `/agents/${id}/chat`;
      router.replace(dest);
    }
  }, [agent, id, nextPage, router]);

  const updateInput = useCallback((key: string, value: string) => {
    setInputs((prev) =>
      prev.map((input) => (input.key === key ? { ...input, value } : input)),
    );
  }, []);

  const missingRequiredCount = inputs.filter(
    (input) => input.required && input.value.trim().length === 0,
  ).length;

  const handleSave = useCallback(async () => {
    if (!agent) return;
    setSaving(true);
    try {
      // 1. Persist inputs to agent record in backend
      await updateAgentConfig(agent.id, {
        skillGraph: agent.skillGraph,
        workflow: agent.workflow,
        agentRules: agent.agentRules,
        runtimeInputs: inputs,
        toolConnections: agent.toolConnections,
        triggers: agent.triggers,
        improvements: agent.improvements,
      });

      // 2. Push runtime env to the target sandbox (passed via ?sandbox= param)
      if (targetSandboxId) {
        try {
          await fetch(`${API_BASE}/api/sandboxes/${targetSandboxId}/runtime-env`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runtime_inputs: inputs }),
          });
        } catch {
          // Non-fatal — sandbox may be stopped; env will be applied on next deploy
        }
      }

      const dest = nextPage === "deploy" ? `/agents/${id}/deploy` : `/agents/${id}/chat`;
      router.push(dest);
    } catch {
      // Stay on page so user can retry
    } finally {
      setSaving(false);
    }
  }, [agent, inputs, missingRequiredCount, updateAgentConfig, targetSandboxId, nextPage, id, router]);

  // Loading state
  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--background)]">
        {fetchAttempted ? (
          <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">Agent not found.</p>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border-default)] bg-[var(--card-color)] px-6 py-4 md:px-8">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            onClick={() => router.push("/agents")}
            className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {agent.avatar && (
            <span className="text-2xl" role="img" aria-label={agent.name}>
              {agent.avatar}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-satoshi-bold text-[var(--text-primary)]">
              {agent.name}
            </h1>
            {agent.description && (
              <p className="truncate text-xs font-satoshi-regular text-[var(--text-secondary)]">
                {agent.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-start gap-3">
            <div className="mt-0.5 h-9 w-9 shrink-0">
              <Image src="/assets/logos/favicon.svg" alt="Setup" width={36} height={36} />
            </div>
            <div>
              <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
                Agent Configuration
              </h2>
              <p className="mt-0.5 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                Configure runtime values for your agent. You can fill these now or skip and configure them later.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {inputs.map((input) => {
              const filled = input.value.trim().length > 0;
              return (
                <div
                  key={input.key}
                  className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                        {input.label}
                        {input.required && (
                          <span className="ml-1 text-[var(--error)]">*</span>
                        )}
                      </p>
                      <p className="mt-1 text-xs font-satoshi-medium text-[var(--text-tertiary)]">
                        {input.key}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      {filled ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-[var(--warning)]" />
                      )}
                      {filled ? "Provided" : "Missing"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                    {input.description}
                  </p>
                  <input
                    value={input.value}
                    onChange={(e) => updateInput(input.key, e.target.value)}
                    placeholder={input.key}
                    className="mt-3 h-11 w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] px-6 py-4 md:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => router.push("/agents")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Agents
          </Button>
          <div className="flex items-center gap-3">
            {missingRequiredCount > 0 && (
              <p className="text-xs font-satoshi-medium text-[var(--text-tertiary)]">
                {missingRequiredCount} input{missingRequiredCount === 1 ? "" : "s"} can be configured later
              </p>
            )}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Save &amp; Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
