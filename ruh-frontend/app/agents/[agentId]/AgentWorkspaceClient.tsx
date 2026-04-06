"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Key,
  Loader2,
  Sparkles,
} from "lucide-react";

import ChatPanel, { type Conversation } from "@/components/ChatPanel";
import HistoryPanel from "@/components/HistoryPanel";
import MissionControlPanel from "@/components/MissionControlPanel";
import type { SandboxRecord } from "@/components/SandboxSidebar";
import { apiFetch } from "@/lib/api/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type WorkspaceTab = "chat" | "history" | "mission-control";

const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "history", label: "History" },
  { id: "mission-control", label: "Mission Control" },
];

// ── Types ──────────────────────────────────────────────────────────────────

interface AgentRecord {
  id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  status?: string | null;
  runtime_inputs?: RuntimeInput[];
}

interface RuntimeInput {
  key: string;
  label: string;
  description: string;
  required: boolean;
  value: string;
  populationStrategy?: string;
  inputType?: string;
  defaultValue?: string;
  example?: string;
  options?: string[];
  group?: string;
}

interface AgentLaunchResponse {
  launched: boolean;
  sandboxId: string;
  agent: AgentRecord;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getStrategy(input: RuntimeInput): string {
  return input.populationStrategy ?? "user_required";
}

function isFilled(input: RuntimeInput): boolean {
  return (input.value?.trim().length ?? 0) > 0 || (input.defaultValue?.trim().length ?? 0) > 0;
}

function hasMissingRequired(inputs: RuntimeInput[]): boolean {
  return inputs.some(
    (i) => i.required && getStrategy(i) === "user_required" && !isFilled(i),
  );
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as {
      detail?: string;
      error?: string;
      message?: string;
    };
    return payload.detail || payload.error || payload.message || fallback;
  } catch {
    return fallback;
  }
}

// ── Setup Panel ────────────────────────────────────────────────────────────

function SetupPanel({
  agent,
  onComplete,
}: {
  agent: AgentRecord;
  onComplete: () => void;
}) {
  const allInputs = agent.runtime_inputs ?? [];
  const [inputs, setInputs] = useState<RuntimeInput[]>(() =>
    allInputs.map((i) => ({ ...i })),
  );
  const [saving, setSaving] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const inferAttempted = useRef(false);

  // AI inference for ai_inferred variables
  useEffect(() => {
    if (inferAttempted.current) return;
    const inferrable = inputs.filter(
      (i) => getStrategy(i) === "ai_inferred" && !isFilled(i),
    );
    if (inferrable.length === 0) return;

    inferAttempted.current = true;
    setInferring(true);

    apiFetch(`${API_URL}/api/agents/${agent.id}/infer-inputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
              data.values[input.key] && !isFilled(input)
                ? { ...input, value: data.values[input.key] }
                : input,
            ),
          );
        }
      })
      .catch(() => {})
      .finally(() => setInferring(false));
  }, [agent.id, inputs]);

  const updateInput = useCallback((key: string, value: string) => {
    setInputs((prev) =>
      prev.map((input) => (input.key === key ? { ...input, value } : input)),
    );
  }, []);

  const userRequired = inputs.filter((i) => getStrategy(i) === "user_required");
  const autoConfigured = inputs.filter((i) => getStrategy(i) !== "user_required");
  const missingCount = userRequired.filter(
    (i) => i.required && !isFilled(i),
  ).length;
  const autoFilledCount = autoConfigured.filter((i) => isFilled(i)).length;

  const handleSave = async () => {
    setSaving(true);
    try {
      const resolved = inputs.map((i) => ({
        key: i.key,
        value: i.value?.trim() || i.defaultValue || "",
      }));

      await apiFetch(`${API_URL}/api/agents/${agent.id}/customer-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtimeInputValues: resolved }),
      });

      onComplete();
    } catch {
      // Stay on setup
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-[#eff0f3] bg-white/95 backdrop-blur px-6 py-5">
        <div className="mx-auto max-w-2xl flex items-center gap-4">
          <Link
            href="/"
            className="rounded-lg p-1.5 text-[#827f82] hover:bg-[#f3f4f6] hover:text-[#121212] transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {agent.avatar && (
            <span className="text-3xl">{agent.avatar}</span>
          )}
          <div>
            <h1 className="text-lg font-semibold text-[#121212]">Almost ready</h1>
            <p className="text-sm text-[#4b5563]">
              {agent.name} needs a few things before it can start
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Required Section */}
          {userRequired.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Key className="h-4 w-4 text-[#ae00d0]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#121212]">
                  Required to Start
                </h2>
                <span className="text-[10px] font-medium text-[#827f82] bg-[#f9f7f9] border border-[#e5e7eb] rounded-full px-2 py-0.5">
                  {userRequired.length}
                </span>
              </div>
              <p className="mb-4 text-sm text-[#4b5563]">
                These credentials are unique to your account. The agent can&apos;t function without them.
              </p>
              <div className="space-y-3">
                {userRequired.map((input) => (
                  <InputCard
                    key={input.key}
                    input={input}
                    onChange={(v) => updateInput(input.key, v)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* All set */}
          {userRequired.length === 0 && autoConfigured.length > 0 && (
            <div className="rounded-2xl border border-[#22c55e]/20 bg-[#22c55e]/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#22c55e]" />
                <p className="text-sm font-bold text-[#121212]">No credentials needed</p>
              </div>
              <p className="mt-1 text-sm text-[#4b5563]">
                All settings have been auto-configured. You can start right away.
              </p>
            </div>
          )}

          {/* Auto-configured */}
          {autoConfigured.length > 0 && (
            <section>
              <button
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex w-full items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f9f7f9]"
              >
                <Sparkles className="h-4 w-4 text-[#7b5aff]" />
                <span className="flex-1 text-sm font-bold text-[#121212]">Smart Defaults</span>
                <span className="text-xs text-[#827f82]">
                  {inferring ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Auto-configuring...
                    </span>
                  ) : (
                    `${autoFilledCount} of ${autoConfigured.length} auto-configured`
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 text-[#827f82] transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </button>
              {advancedOpen && (
                <div className="mt-3 space-y-3">
                  {autoConfigured.map((input) => (
                    <InputCard
                      key={input.key}
                      input={input}
                      onChange={(v) => updateInput(input.key, v)}
                      badge={
                        getStrategy(input) === "ai_inferred"
                          ? { label: "AI", color: "#7b5aff" }
                          : { label: "Default", color: "#ae00d0" }
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[#eff0f3] bg-white px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#4b5563] hover:text-[#121212]"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex items-center gap-3">
            {missingCount > 0 && (
              <p className="text-xs text-[#827f82]">
                {missingCount} required input{missingCount === 1 ? "" : "s"} remaining
              </p>
            )}
            {missingCount === 0 && userRequired.length > 0 && (
              <p className="text-xs text-[#22c55e] font-medium">All set</p>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#ae00d0] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#9400b4] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Save &amp; Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Type-aware input field ─────────────────────────────────────────────────

function RuntimeInputField({
  input,
  onChange,
}: {
  input: RuntimeInput;
  onChange: (value: string) => void;
}) {
  const effectiveValue = input.value || input.defaultValue || "";

  if (input.inputType === "boolean") {
    const isOn = effectiveValue === "true" || effectiveValue === "1" || effectiveValue === "yes";
    return (
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-[#4b5563]">{isOn ? "Enabled" : "Disabled"}</span>
        <button
          type="button"
          onClick={() => onChange(isOn ? "false" : "true")}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            isOn ? "bg-[#ae00d0]" : "bg-[#e2e2e2]"
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
          className="h-11 w-full appearance-none rounded-xl border border-[#e2e2e2] bg-[#f9f7f9] px-3 pr-8 text-sm text-[#121212] outline-none focus:border-[#ae00d0]"
        >
          {!input.value && !input.defaultValue && <option value="">Select...</option>}
          {input.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#827f82] pointer-events-none" />
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
        className="mt-3 h-11 w-full rounded-xl border border-[#e2e2e2] bg-[#f9f7f9] px-3 text-sm text-[#121212] outline-none focus:border-[#ae00d0]"
      />
    );
  }

  return (
    <input
      type="text"
      value={input.value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={input.example || input.defaultValue || input.key}
      className="mt-3 h-11 w-full rounded-xl border border-[#e2e2e2] bg-[#f9f7f9] px-3 text-sm text-[#121212] outline-none focus:border-[#ae00d0]"
    />
  );
}

// ── Input Card ─────────────────────────────────────────────────────────────

function InputCard({
  input,
  onChange,
  badge,
}: {
  input: RuntimeInput;
  onChange: (value: string) => void;
  badge?: { label: string; color: string };
}) {
  const filled = isFilled(input);
  const isDefaulted = !input.value?.trim() && !!input.defaultValue?.trim();

  return (
    <div
      className={`rounded-2xl border px-5 py-4 transition-colors ${
        filled
          ? "border-[#e2e2e2] bg-white"
          : "border-[#f59e0b]/30 bg-[#f59e0b]/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#121212]">
            {input.label || input.key}
            {input.required && !filled && (
              <span className="ml-1 text-[#ef4444]">*</span>
            )}
          </p>
          {input.description && !input.description.endsWith("required at runtime.") && (
            <p className="mt-1 text-xs text-[#4b5563] leading-relaxed">
              {input.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge && (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ borderColor: `${badge.color}33`, color: badge.color }}
            >
              <Sparkles className="h-3 w-3" />
              {badge.label}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
              filled
                ? isDefaulted
                  ? "border-[#ae00d0]/20 text-[#ae00d0]"
                  : "border-[#22c55e]/20 text-[#22c55e]"
                : "border-[#f59e0b]/20 text-[#f59e0b]"
            }`}
          >
            {filled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {filled ? (isDefaulted ? "Default" : "Set") : "Needed"}
          </span>
        </div>
      </div>
      <RuntimeInputField input={input} onChange={onChange} />
      {input.defaultValue && input.inputType !== "boolean" && input.inputType !== "select" && (
        <p className="mt-1.5 text-[10px] text-[#827f82]">
          Default: <span className="font-mono">{input.defaultValue}</span>
        </p>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function AgentWorkspaceClient({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [sandbox, setSandbox] = useState<SandboxRecord | null>(null);
  const [phase, setPhase] = useState<"loading" | "setup" | "launching" | "ready" | "error">("loading");
  const [launchMode, setLaunchMode] = useState<"launching" | "reusing">("launching");
  const [error, setError] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("chat");
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  const launchAgent = useCallback(async () => {
    setPhase("launching");
    setError(null);

    try {
      const launchResponse = await apiFetch(`${API_URL}/api/agents/${agentId}/launch`, {
        method: "POST",
      });

      if (!launchResponse.ok) {
        throw new Error(
          await readErrorMessage(launchResponse, "Could not prepare this agent workspace."),
        );
      }

      const launchPayload = (await launchResponse.json()) as AgentLaunchResponse;
      const sandboxesResponse = await apiFetch(`${API_URL}/api/sandboxes`);

      if (!sandboxesResponse.ok) {
        throw new Error(
          await readErrorMessage(sandboxesResponse, "Could not load the runtime sandbox."),
        );
      }

      const sandboxes = (await sandboxesResponse.json()) as SandboxRecord[];
      const matchedSandbox = sandboxes.find(
        (candidate) => candidate.sandbox_id === launchPayload.sandboxId,
      );

      if (!matchedSandbox) {
        throw new Error("Launched sandbox was not found.");
      }

      setAgent(launchPayload.agent);
      setSandbox(matchedSandbox);
      setLaunchMode(launchPayload.launched ? "launching" : "reusing");
      setPhase("ready");
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not prepare this agent workspace.",
      );
      setPhase("error");
    }
  }, [agentId]);

  // Initial load: fetch agent, check for missing inputs
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPhase("loading");
      try {
        const agentResponse = await apiFetch(`${API_URL}/api/agents/${agentId}`);
        if (!agentResponse.ok) {
          throw new Error(await readErrorMessage(agentResponse, "Agent not found."));
        }

        const agentData = (await agentResponse.json()) as AgentRecord;
        if (cancelled) return;

        setAgent(agentData);

        const runtimeInputs = agentData.runtime_inputs ?? [];
        if (hasMissingRequired(runtimeInputs)) {
          setPhase("setup");
        } else {
          // No setup needed — launch directly
          await launchAgent();
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Could not load agent.",
          );
          setPhase("error");
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [agentId, launchAgent]);

  const handleSetupComplete = () => {
    launchAgent();
  };

  const handleOpenConversation = (conversation: Conversation) => {
    setActiveConversation(conversation);
    setWorkspaceTab("chat");
  };

  const handleNewChat = () => {
    setActiveConversation(null);
  };

  const handleConversationCreated = (conversation: Conversation) => {
    setActiveConversation(conversation);
  };

  const title = agent?.name || "Agent workspace";
  const subtitle =
    agent?.description ||
    "Your dedicated runtime workspace launches this agent.";

  // ── Setup phase ──
  if (phase === "setup" && agent) {
    return (
      <main className="flex h-screen flex-col overflow-hidden bg-[#f9f7f9] text-[#121212]">
        <SetupPanel agent={agent} onComplete={handleSetupComplete} />
      </main>
    );
  }

  // ── Loading / Launching / Ready / Error ──
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#f9f7f9] text-[#121212]">
      <header className="shrink-0 border-b border-[#eff0f3] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-5 lg:px-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <Link
                href="/"
                className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b5aff] transition hover:text-[#ae00d0]"
              >
                ← Back to workspace index
              </Link>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#121212]">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-7 text-[#4b5563]">{subtitle}</p>
            </div>

            <div className="grid gap-3 rounded-[24px] border border-[#ede7f3] bg-[#faf7fc] p-4 text-sm text-[#4b5563] sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#827f82]">
                  Runtime
                </p>
                <p className="mt-1 font-semibold text-[#121212]">
                  {phase === "ready"
                    ? launchMode === "launching"
                      ? "Freshly launched"
                      : "Existing sandbox reused"
                    : "Preparing..."}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#827f82]">
                  Sandbox ID
                </p>
                <p className="mt-1 font-mono text-xs font-semibold text-[#121212]">
                  {sandbox?.sandbox_id || "pending"}
                </p>
              </div>
            </div>
          </div>

          {phase === "ready" ? (
            <div className="flex flex-wrap items-center gap-2">
              {WORKSPACE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setWorkspaceTab(tab.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    workspaceTab === tab.id
                      ? "bg-[#fdf4ff] text-[#ae00d0]"
                      : "text-[#4b5563] hover:bg-[#f3f4f6] hover:text-[#121212]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {(phase === "loading" || phase === "launching") ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="rounded-[28px] border border-[#e8e0ef] bg-white px-8 py-10 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fdf4ff]">
                <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-[#ae00d0]" />
              </div>
              <p className="mt-4 text-lg font-semibold text-[#121212]">
                {phase === "loading" ? "Loading agent..." : "Preparing agent workspace..."}
              </p>
              <p className="mt-2 max-w-md text-sm leading-7 text-[#4b5563]">
                The customer runtime launches on demand for this agent route, then the
                existing sandbox-backed workspace panels mount against that sandbox.
              </p>
            </div>
          </div>
        ) : phase === "error" ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="max-w-xl rounded-[28px] border border-[#f2c7cf] bg-[#fff7f8] px-8 py-8 text-center text-[#8a3340] shadow-sm">
              <p className="text-lg font-semibold">Could not open this workspace</p>
              <p className="mt-3 text-sm leading-7">{error}</p>
              <Link
                href="/"
                className="mt-6 inline-flex items-center rounded-[18px] bg-white px-4 py-2 text-sm font-semibold text-[#8a3340] ring-1 ring-inset ring-[#f0c0c8] transition hover:bg-[#fff1f3]"
              >
                Return to workspace index
              </Link>
            </div>
          </div>
        ) : sandbox ? (
          <>
            {workspaceTab === "chat" ? (
              <ChatPanel
                sandbox={sandbox}
                conversation={activeConversation}
                onNewChat={handleNewChat}
                onConversationCreated={handleConversationCreated}
              />
            ) : null}
            {workspaceTab === "history" ? (
              <HistoryPanel
                sandbox={sandbox}
                activeConvId={activeConversation?.id ?? null}
                onOpenConversation={handleOpenConversation}
              />
            ) : null}
            {workspaceTab === "mission-control" ? (
              <MissionControlPanel sandbox={sandbox} />
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
