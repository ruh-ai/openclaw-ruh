"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Settings2,
  Shield,
  Sliders,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/hooks/use-agents-store";
import type { AgentRuntimeInput } from "@/lib/agents/types";
import { hasMissingRequiredInputs, mergeRuntimeInputDefinitions } from "@/lib/agents/runtime-inputs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Group icons ────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, typeof Settings2> = {
  Authentication: Shield,
  Behavior: Sliders,
  "API Configuration": Zap,
};

function groupIcon(group: string) {
  return GROUP_ICONS[group] || Settings2;
}

// ─── Type-aware input rendering ─────────────────────────────────────────────

function RuntimeInputField({
  input,
  onChange,
}: {
  input: AgentRuntimeInput;
  onChange: (value: string) => void;
}) {
  const effectiveValue = input.value || input.defaultValue || "";
  const filled = effectiveValue.trim().length > 0;

  // Boolean toggle
  if (input.inputType === "boolean") {
    const isOn = effectiveValue === "true" || effectiveValue === "1" || effectiveValue === "yes";
    return (
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs font-satoshi-regular text-[var(--text-secondary)]">
          {isOn ? "Enabled" : "Disabled"}
        </span>
        <button
          type="button"
          onClick={() => onChange(isOn ? "false" : "true")}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            isOn ? "bg-[var(--primary)]" : "bg-[var(--border-stroke)]"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              isOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    );
  }

  // Select dropdown
  if (input.inputType === "select" && input.options?.length) {
    return (
      <div className="relative mt-3">
        <select
          value={input.value || input.defaultValue || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 pr-8 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
        >
          {!input.value && !input.defaultValue && (
            <option value="">Select…</option>
          )}
          {input.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
      </div>
    );
  }

  // Number input
  if (input.inputType === "number") {
    return (
      <input
        type="number"
        value={input.value || input.defaultValue || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={input.example || input.key}
        className="mt-3 h-11 w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
      />
    );
  }

  // Default: text input
  return (
    <input
      type="text"
      value={input.value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={input.example || input.defaultValue || input.key}
      className="mt-3 h-11 w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
    />
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

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
  // Pre-fill empty values with defaults so users can click "Save & Continue" immediately
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

  // Count truly missing — no value AND no default
  const missingRequiredCount = inputs.filter(
    (input) =>
      input.required &&
      input.value.trim().length === 0 &&
      !(input.defaultValue?.trim()),
  ).length;

  // Group inputs by their group field
  const groupedInputs = useMemo(() => {
    const groups = new Map<string, AgentRuntimeInput[]>();
    for (const input of inputs) {
      const group = input.group || "Configuration";
      const list = groups.get(group) ?? [];
      list.push(input);
      groups.set(group, list);
    }
    return groups;
  }, [inputs]);

  const handleSave = useCallback(async () => {
    if (!agent) return;
    setSaving(true);
    try {
      // Resolve values: use explicit value, fall back to default
      const resolvedInputs = inputs.map((input) => ({
        ...input,
        value: input.value.trim() || input.defaultValue || "",
      }));

      // 1. Persist inputs to agent record in backend
      await updateAgentConfig(agent.id, {
        skillGraph: agent.skillGraph,
        workflow: agent.workflow,
        agentRules: agent.agentRules,
        runtimeInputs: resolvedInputs,
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
            body: JSON.stringify({ runtime_inputs: resolvedInputs }),
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
  }, [agent, inputs, updateAgentConfig, targetSandboxId, nextPage, id, router]);

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
                {missingRequiredCount === 0
                  ? "All settings have defaults. You can continue or customize below."
                  : "Configure your agent's settings. Fields with defaults are pre-filled — adjust if needed."}
              </p>
            </div>
          </div>

          {/* Grouped inputs */}
          <div className="space-y-6">
            {Array.from(groupedInputs.entries()).map(([group, groupInputs]) => {
              const Icon = groupIcon(group);
              return (
                <div key={group}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="h-4 w-4 text-[var(--primary)]" />
                    <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                      {group}
                    </h3>
                    <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] bg-[var(--background)] border border-[var(--border-stroke)] rounded-full px-2 py-0.5">
                      {groupInputs.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {groupInputs.map((input) => {
                      const effectiveValue = input.value || input.defaultValue || "";
                      const filled = effectiveValue.trim().length > 0;
                      const isDefaulted = !input.value.trim() && !!input.defaultValue?.trim();
                      return (
                        <div
                          key={input.key}
                          className={`rounded-2xl border px-5 py-4 transition-colors ${
                            filled
                              ? "border-[var(--border-stroke)] bg-[var(--card-color)]"
                              : "border-[var(--warning)]/30 bg-[var(--warning)]/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                                {input.label}
                                {input.required && !filled && (
                                  <span className="ml-1 text-[var(--error)]">*</span>
                                )}
                              </p>
                              {/* Only show description if it's meaningful (not just repeating the label) */}
                              {input.description &&
                                !input.description.endsWith("required at runtime.") && (
                                  <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">
                                    {input.description}
                                  </p>
                                )}
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] ${
                                filled
                                  ? isDefaulted
                                    ? "border-[var(--primary)]/20 text-[var(--primary)]"
                                    : "border-[var(--success)]/20 text-[var(--success)]"
                                  : "border-[var(--warning)]/20 text-[var(--warning)]"
                              }`}
                            >
                              {filled ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <AlertCircle className="h-3.5 w-3.5" />
                              )}
                              {filled
                                ? isDefaulted
                                  ? "Default"
                                  : "Set"
                                : "Needed"}
                            </span>
                          </div>
                          <RuntimeInputField
                            input={input}
                            onChange={(value) => updateInput(input.key, value)}
                          />
                          {/* Show default hint for text inputs */}
                          {input.defaultValue && input.inputType !== "boolean" && input.inputType !== "select" && (
                            <p className="mt-1.5 text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
                              Default: <span className="font-mono">{input.defaultValue}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
