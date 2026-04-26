"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Key,
  Loader2,
  Settings2,
  Shield,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/hooks/use-agents-store";
import type { AgentRuntimeInput, AgentRuntimePopulationStrategy } from "@/lib/agents/types";
import { hasMissingRequiredInputs, mergeRuntimeInputDefinitions } from "@/lib/agents/runtime-inputs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Helpers ───────────────────────────────────────────────────────────────

function getStrategy(input: AgentRuntimeInput): AgentRuntimePopulationStrategy {
  return input.populationStrategy ?? "user_required";
}

function isEffectivelyFilled(input: AgentRuntimeInput): boolean {
  return (input.value?.trim().length ?? 0) > 0 || (input.defaultValue?.trim().length ?? 0) > 0;
}

export function getSetupSaveState({
  missingRequiredCount,
  saving,
}: {
  missingRequiredCount: number;
  saving: boolean;
}): { disabled: boolean; label: string; ready: boolean } {
  const missingCount = Math.max(0, missingRequiredCount);
  if (missingCount > 0) {
    return {
      disabled: true,
      label: `${missingCount} required input${missingCount === 1 ? "" : "s"} remaining`,
      ready: false,
    };
  }

  return {
    disabled: saving,
    label: "All set",
    ready: true,
  };
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

  if (input.inputType === "select" && input.options?.length) {
    return (
      <div className="relative mt-3">
        <select
          value={input.value || input.defaultValue || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 pr-8 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus-breathe"
        >
          {!input.value && !input.defaultValue && (
            <option value="">Select...</option>
          )}
          {input.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
      </div>
    );
  }

  if (input.inputType === "number") {
    return (
      <input
        type="number"
        value={input.value || input.defaultValue || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={input.example || input.key}
        className="mt-3 h-11 w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus-breathe"
      />
    );
  }

  return (
    <input
      type="text"
      value={input.value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={input.example || input.defaultValue || input.key}
      className="mt-3 h-11 w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus-breathe"
    />
  );
}

// ─── Input card ────────────────────────────────────────────────────────────

function InputCard({
  input,
  onChange,
  badge,
}: {
  input: AgentRuntimeInput;
  onChange: (value: string) => void;
  badge?: { label: string; color: string };
}) {
  const filled = isEffectivelyFilled(input);
  const isDefaulted = !input.value?.trim() && !!input.defaultValue?.trim();

  return (
    <div
      className={`warmth-hover rounded-2xl border px-5 py-4 transition-colors ${
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
          {input.description && !input.description.endsWith("required at runtime.") && (
            <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">
              {input.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge && (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em]"
              style={{
                borderColor: `${badge.color}33`,
                color: badge.color,
              }}
            >
              <Sparkles className="h-3 w-3" />
              {badge.label}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] ${
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
            {filled ? (isDefaulted ? "Default" : "Set") : "Needed"}
          </span>
        </div>
      </div>
      <RuntimeInputField input={input} onChange={onChange} />
      {input.defaultValue && input.inputType !== "boolean" && input.inputType !== "select" && (
        <p className="mt-1.5 text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
          Default: <span className="font-mono">{input.defaultValue}</span>
        </p>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function AgentSetupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPage = searchParams.get("next");
  const targetSandboxId = searchParams.get("sandbox");

  const { agents, fetchAgent, updateAgentConfig } = useAgentsStore();
  const agent = agents.find((a) => a.id === id);

  const [fetchAttempted, setFetchAttempted] = useState(false);
  const [inputs, setInputs] = useState<AgentRuntimeInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [allRequiredJustFilled, setAllRequiredJustFilled] = useState(false);
  const inferAttempted = useRef(false);

  // Fetch agent if not in local store
  useEffect(() => {
    if (!agent && !fetchAttempted) {
      setFetchAttempted(true);
      fetchAgent(id);
    }
  }, [agent, fetchAttempted, fetchAgent, id]);

  // Seed local form state
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

  // AI auto-population for ai_inferred variables
  useEffect(() => {
    if (!agent || inferAttempted.current || inputs.length === 0) return;

    const inferrable = inputs.filter(
      (input) => getStrategy(input) === "ai_inferred" && !input.value?.trim(),
    );
    if (inferrable.length === 0) return;

    inferAttempted.current = true;
    setInferring(true);

    fetch(`${API_BASE}/api/agents/${agent.id}/infer-inputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        variables: inferrable.map((v) => ({
          key: v.key,
          label: v.label,
          description: v.description,
          example: v.example,
          options: v.options,
        })),
      }),
    })
      .then((r) => r.json())
      .then((data: { values: Record<string, string> }) => {
        if (data.values && Object.keys(data.values).length > 0) {
          setInputs((prev) =>
            prev.map((input) =>
              data.values[input.key] && !input.value?.trim()
                ? { ...input, value: data.values[input.key] }
                : input,
            ),
          );
        }
      })
      .catch(() => {})
      .finally(() => setInferring(false));
  }, [agent, inputs]);

  const updateInput = useCallback((key: string, value: string) => {
    setInputs((prev) =>
      prev.map((input) => (input.key === key ? { ...input, value } : input)),
    );
  }, []);

  // Split inputs by strategy
  const { userRequired, autoConfigured } = useMemo(() => {
    const userRequired: AgentRuntimeInput[] = [];
    const autoConfigured: AgentRuntimeInput[] = [];
    for (const input of inputs) {
      const strategy = getStrategy(input);
      if (strategy === "user_required") {
        userRequired.push(input);
      } else {
        autoConfigured.push(input);
      }
    }
    return { userRequired, autoConfigured };
  }, [inputs]);

  // Count truly missing user_required inputs
  const missingRequiredCount = userRequired.filter(
    (input) =>
      input.required &&
      !input.value?.trim() &&
      !(input.defaultValue?.trim()),
  ).length;
  const saveState = getSetupSaveState({ missingRequiredCount, saving });

  // Spark animation when all required filled
  useEffect(() => {
    if (missingRequiredCount === 0 && userRequired.length > 0) {
      setAllRequiredJustFilled(true);
      const timer = setTimeout(() => setAllRequiredJustFilled(false), 600);
      return () => clearTimeout(timer);
    }
  }, [missingRequiredCount, userRequired.length]);

  const handleSave = useCallback(async () => {
    if (!agent) return;
    if (missingRequiredCount > 0) return;
    setSaving(true);
    try {
      const resolvedInputs = inputs.map((input) => ({
        ...input,
        value: input.value?.trim() || input.defaultValue || "",
      }));

      await updateAgentConfig(agent.id, {
        skillGraph: agent.skillGraph,
        workflow: agent.workflow,
        agentRules: agent.agentRules,
        runtimeInputs: resolvedInputs,
        toolConnections: agent.toolConnections,
        triggers: agent.triggers,
        improvements: agent.improvements,
      });

      if (targetSandboxId) {
        try {
          await fetch(`${API_BASE}/api/sandboxes/${targetSandboxId}/runtime-env`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runtime_inputs: resolvedInputs }),
          });
        } catch {
          // Non-fatal
        }
      }

      const dest = nextPage === "deploy" ? `/agents/${id}/deploy` : `/agents/${id}/chat`;
      router.push(dest);
    } catch {
      // Stay on page
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

  const autoFilledCount = autoConfigured.filter((i) => isEffectivelyFilled(i)).length;

  return (
    <div className="flex h-full flex-col bg-[var(--background)] stage-enter">
      {/* ── Header with gradient ── */}
      <div className="shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 gradient-drift opacity-[0.07]" />
        <div className="relative border-b border-[var(--border-default)] bg-[var(--card-color)]/80 backdrop-blur-sm px-6 py-5 md:px-8">
          <div className="mx-auto flex max-w-2xl items-center gap-4">
            <button
              onClick={() => router.push("/agents")}
              className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {agent.avatar ? (
              <span className="text-3xl soul-pulse" role="img" aria-label={agent.name}>
                {agent.avatar}
              </span>
            ) : (
              <div className="h-10 w-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center soul-pulse">
                <Settings2 className="h-5 w-5 text-[var(--primary)]" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-sora font-semibold text-[var(--text-primary)]">
                Almost ready
              </h1>
              <p className="truncate text-sm font-satoshi-regular text-[var(--text-secondary)]">
                {agent.name} needs a few things before it can start working
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Form body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8">
        <div className="mx-auto max-w-2xl space-y-8">

          {/* ── Required Section ── */}
          {userRequired.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Key className="h-4 w-4 text-[var(--primary)]" />
                <h2 className="text-sm font-satoshi-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Required to Start
                </h2>
                <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] bg-[var(--background)] border border-[var(--border-stroke)] rounded-full px-2 py-0.5">
                  {userRequired.length}
                </span>
              </div>
              <p className="mb-4 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                These credentials are unique to your account. The agent can&apos;t function without them.
              </p>
              <div className="space-y-3">
                {userRequired.map((input) => (
                  <InputCard
                    key={input.key}
                    input={input}
                    onChange={(value) => updateInput(input.key, value)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── No required inputs message ── */}
          {userRequired.length === 0 && autoConfigured.length > 0 && (
            <div className="rounded-2xl border border-[var(--success)]/20 bg-[var(--success)]/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
                <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                  No credentials needed
                </p>
              </div>
              <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                All settings have been auto-configured. You can start using the agent right away.
              </p>
            </div>
          )}

          {/* ── Auto-configured Section (collapsed) ── */}
          {autoConfigured.length > 0 && (
            <section>
              <button
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex w-full items-center gap-2 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] px-4 py-3 text-left transition-colors hover:bg-[var(--background)]"
              >
                <Sparkles className="h-4 w-4 text-[var(--secondary)]" />
                <span className="flex-1 text-sm font-satoshi-bold text-[var(--text-primary)]">
                  Smart Defaults
                </span>
                <span className="text-xs font-satoshi-medium text-[var(--text-tertiary)]">
                  {inferring ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Auto-configuring...
                    </span>
                  ) : (
                    `${autoFilledCount} of ${autoConfigured.length} auto-configured`
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${
                    advancedOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {advancedOpen && (
                <div className="mt-3 space-y-3 stage-enter">
                  {autoConfigured.map((input) => {
                    const strategy = getStrategy(input);
                    const badge =
                      strategy === "ai_inferred"
                        ? { label: "AI", color: "#7b5aff" }
                        : { label: "Default", color: "#ae00d0" };
                    return (
                      <InputCard
                        key={input.key}
                        input={input}
                        onChange={(value) => updateInput(input.key, value)}
                        badge={badge}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] px-6 py-4 md:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => router.push("/agents")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            {!saveState.ready && (
              <p className="text-xs font-satoshi-medium text-[var(--text-tertiary)]">
                {saveState.label}
              </p>
            )}
            {saveState.ready && userRequired.length > 0 && (
              <p className="text-xs font-satoshi-medium text-[var(--success)]">
                {saveState.label}
              </p>
            )}
            <Button
              onClick={handleSave}
              disabled={saveState.disabled}
              title={!saveState.ready ? saveState.label : undefined}
              className={`gap-2 ${allRequiredJustFilled ? "spark" : ""} ${
                saveState.ready ? "gradient-drift" : ""
              }`}
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
