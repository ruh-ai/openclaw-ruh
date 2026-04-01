"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Info, Loader2 } from "lucide-react";
import type { SavedAgent } from "@/hooks/use-agents-store";
import { useAgentsStore } from "@/hooks/use-agents-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getSharedCodexDisplayModel,
  isSharedCodexSandbox,
  sanitizeAgentModelForSandbox,
} from "@/lib/openclaw/shared-codex";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Provider metadata + model catalog helpers ──────────────────────────────
//
// Provider configuration remains local metadata, while model cards are loaded
// from the active sandbox when possible and fall back to a curated catalog when
// the gateway cannot provide a live model list.

interface ModelOption {
  id: string;
  label: string;
  note?: string;
}

type ProviderId = "anthropic" | "openai" | "gemini" | "ollama" | "openrouter";
type ModelSectionId = ProviderId | "other";

interface Provider {
  id: ProviderId;
  label: string;
  emoji: string;
  requiresApiKey: boolean;
  apiKeyLabel?: string;
  defaultModelId: string;
  defaultModelLabel: string;
  defaultBaseUrl?: string;
}

interface AvailableModel extends ModelOption {
  providerId: ModelSectionId;
  source: "live" | "fallback" | "saved";
}

interface SandboxModelsResponse {
  data?: Array<{ id?: string }>;
  _synthetic?: boolean;
}

interface ModelSection {
  id: ModelSectionId;
  label: string;
  emoji: string;
  models: AvailableModel[];
}

const OTHER_MODELS_SECTION = {
  id: "other" as const,
  label: "Other Models",
  emoji: "✨",
};

const PROVIDERS: Provider[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    emoji: "🤖",
    requiresApiKey: true,
    apiKeyLabel: "Anthropic API Key",
    defaultModelId: "claude-sonnet-4-6",
    defaultModelLabel: "Claude Sonnet 4.6",
  },
  {
    id: "openai",
    label: "OpenAI / Codex",
    emoji: "🟢",
    requiresApiKey: true,
    apiKeyLabel: "OpenAI API Key",
    defaultModelId: "gpt-4o",
    defaultModelLabel: "GPT-4o",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    emoji: "💙",
    requiresApiKey: true,
    apiKeyLabel: "Gemini API Key",
    defaultModelId: "gemini-2.5-pro",
    defaultModelLabel: "Gemini 2.5 Pro",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    emoji: "🧠",
    requiresApiKey: false,
    defaultModelId: "qwen3-coder:30b",
    defaultModelLabel: "Qwen3-Coder 30B",
    defaultBaseUrl: "http://host.docker.internal:11434/v1",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    emoji: "🔗",
    requiresApiKey: true,
    apiKeyLabel: "OpenRouter API Key",
    defaultModelId: "openrouter/auto",
    defaultModelLabel: "Auto (OpenRouter routing)",
  },
];

const FALLBACK_MODELS: Record<ProviderId, ModelOption[]> = {
  anthropic: [
    { id: "claude-opus-4-6", label: "Claude Opus 4.6", note: "Most capable" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "Recommended" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fastest" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", note: "Faster" },
    { id: "o3", label: "o3", note: "Reasoning" },
    { id: "o4-mini", label: "o4-mini", note: "Reasoning · Fast" },
    { id: "codex-mini-latest", label: "Codex Mini", note: "Code-first" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "Most capable" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", note: "Fastest" },
  ],
  ollama: [
    { id: "qwen3-coder:30b", label: "Qwen3-Coder 30B", note: "Default" },
    { id: "qwen3-coder:14b", label: "Qwen3-Coder 14B", note: "Lighter" },
    { id: "llama3.3:70b", label: "Llama 3.3 70B" },
    { id: "mistral", label: "Mistral" },
  ],
  openrouter: [
    { id: "openrouter/auto", label: "Auto (OpenRouter routing)", note: "Picks best available" },
  ],
};

function inferProviderId(modelId: string | undefined): ModelSectionId | null {
  if (!modelId) return null;

  const normalized = modelId.toLowerCase();
  if (normalized.startsWith("claude")) return "anthropic";
  if (
    normalized.startsWith("gpt-")
    || normalized.startsWith("o1")
    || normalized.startsWith("o3")
    || normalized.startsWith("o4")
    || normalized.includes("codex")
  ) {
    return "openai";
  }
  if (normalized.startsWith("gemini")) return "gemini";
  if (normalized.startsWith("openrouter/")) return "openrouter";
  if (
    normalized.includes(":")
    || normalized.startsWith("llama")
    || normalized.startsWith("mistral")
    || normalized.startsWith("qwen")
  ) {
    return "ollama";
  }
  return "other";
}

function findFallbackModel(modelId: string): ModelOption | undefined {
  for (const provider of PROVIDERS) {
    const match = FALLBACK_MODELS[provider.id].find((model) => model.id === modelId);
    if (match) return match;
  }
  return undefined;
}

function buildModelLabel(modelId: string): string {
  return findFallbackModel(modelId)?.label ?? modelId;
}

function makeAvailableModel(
  modelId: string,
  source: AvailableModel["source"],
  note?: string,
): AvailableModel {
  const fallback = findFallbackModel(modelId);
  return {
    id: modelId,
    label: fallback?.label ?? buildModelLabel(modelId),
    note: note ?? fallback?.note,
    providerId: inferProviderId(modelId) ?? "other",
    source,
  };
}

function buildFallbackCatalog(): AvailableModel[] {
  return PROVIDERS.flatMap((provider) =>
    FALLBACK_MODELS[provider.id].map((model) => ({
      ...model,
      providerId: provider.id,
      source: "fallback" as const,
    }))
  );
}

function normalizeLiveModels(data: SandboxModelsResponse, selectedModel?: string): AvailableModel[] {
  const ids = Array.isArray(data.data)
    ? data.data
        .map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
        .filter(Boolean)
    : [];

  const seen = new Set<string>();
  const models: AvailableModel[] = [];
  for (const modelId of ids) {
    if (seen.has(modelId)) continue;
    seen.add(modelId);
    models.push(makeAvailableModel(modelId, "live"));
  }

  if (selectedModel && !seen.has(selectedModel)) {
    models.unshift(makeAvailableModel(selectedModel, "saved", "Saved selection"));
  }

  return models;
}

function getModelSections(models: AvailableModel[]): ModelSection[] {
  const sections: ModelSection[] = PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    emoji: provider.emoji,
    models: models.filter((model) => model.providerId === provider.id),
  }));

  const otherModels = models.filter((model) => model.providerId === "other");
  if (otherModels.length > 0) {
    sections.push({
      ...OTHER_MODELS_SECTION,
      models: otherModels,
    });
  }

  return sections.filter((section) => section.models.length > 0);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface TabSettingsProps {
  agent: SavedAgent;
  activeSandbox: {
    sandbox_id: string;
    shared_codex_enabled?: boolean;
    shared_codex_model?: string | null;
  } | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

function getProviderForModel(modelId: string | undefined): Provider | null {
  if (!modelId) return null;
  const providerId = inferProviderId(modelId);
  if (!providerId || providerId === "other") return null;
  return PROVIDERS.find((provider) => provider.id === providerId) ?? null;
}

export function TabSettings({ agent, activeSandbox }: TabSettingsProps) {
  const { setAgentModel } = useAgentsStore();
  const activeSandboxId = activeSandbox?.sandbox_id ?? null;

  const selectedModel = sanitizeAgentModelForSandbox(agent.model, activeSandbox);
  const sharedCodexEnabled = isSharedCodexSandbox(activeSandbox);
  const sharedCodexModel = getSharedCodexDisplayModel(activeSandbox);
  const initialProvider = getProviderForModel(selectedModel)?.id ?? "openai";
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>(initialProvider);
  const [draftApiKeys, setDraftApiKeys] = useState<Record<string, string>>({});
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>(PROVIDERS.find((provider) => provider.id === "ollama")?.defaultBaseUrl ?? "http://host.docker.internal:11434/v1");
  const [isApplying, setIsApplying] = useState(false);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>(() => buildFallbackCatalog());
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsSynthetic, setModelsSynthetic] = useState(false);
  const [modelsMessage, setModelsMessage] = useState<string>("");
  const [applyState, setApplyState] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  const selectedProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.id === selectedProviderId) ?? PROVIDERS[1],
    [selectedProviderId]
  );

  const modelSections = useMemo(
    () => getModelSections(availableModels),
    [availableModels]
  );

  useEffect(() => {
    if (!activeSandboxId || sharedCodexEnabled) {
      setAvailableModels(buildFallbackCatalog());
      setModelsLoading(false);
      setModelsSynthetic(false);
      setModelsMessage("");
      return;
    }

    const controller = new AbortController();
    const sandboxId = activeSandboxId;

    async function loadModels() {
      setModelsLoading(true);
      setModelsSynthetic(false);
      setModelsMessage("");

      try {
        const response = await fetch(
          `${API_BASE}/api/sandboxes/${sandboxId}/models`,
          { signal: controller.signal }
        );
        const data = (await response.json().catch(() => ({}))) as SandboxModelsResponse;
        const liveModels = normalizeLiveModels(data, selectedModel);

        if (!response.ok || data._synthetic || liveModels.length === 0) {
          setAvailableModels(buildFallbackCatalog());
          setModelsSynthetic(true);
          setModelsMessage("Showing fallback curated models because live model discovery was unavailable.");
          return;
        }

        setAvailableModels(liveModels);
      } catch (error) {
        if (controller.signal.aborted) return;
        setAvailableModels(buildFallbackCatalog());
        setModelsSynthetic(true);
        setModelsMessage("Showing fallback curated models because the sandbox model list could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setModelsLoading(false);
      }
    }

    void loadModels();

    return () => controller.abort();
  }, [
    activeSandboxId,
    sharedCodexEnabled,
    selectedModel,
  ]);

  const handleSelect = (modelId: string) => {
    if (sharedCodexEnabled) return;
    // Toggle off if already selected
    if (selectedModel === modelId) {
      setAgentModel(agent.id, undefined);
    } else {
      setAgentModel(agent.id, modelId);
    }
  };

  const handleApplyProvider = async () => {
    if (sharedCodexEnabled) {
      setApplyState({
        type: "error",
        message: "This sandbox is pinned to shared Codex auth. Provider switching is disabled.",
      });
      return;
    }

    if (!activeSandbox) {
      setApplyState({ type: "error", message: "No active sandbox selected." });
      return;
    }

    const targetModel = getProviderForModel(selectedModel)?.id === selectedProvider.id
      ? selectedModel ?? selectedProvider.defaultModelId
      : selectedProvider.defaultModelId;

    const body: Record<string, string> = {
      provider: selectedProvider.id,
      model: targetModel,
    };

    const draftKey = (draftApiKeys[selectedProvider.id] ?? "").trim();
    if (selectedProvider.requiresApiKey) {
      if (!draftKey) {
        setApplyState({ type: "error", message: `${selectedProvider.apiKeyLabel ?? "API key"} is required.` });
        return;
      }
      body.apiKey = draftKey;
    }

    if (selectedProvider.id === "ollama") {
      body.ollamaBaseUrl = ollamaBaseUrl.trim() || (selectedProvider.defaultBaseUrl ?? "http://host.docker.internal:11434/v1");
      body.ollamaModel = targetModel;
    }

    setIsApplying(true);
    setApplyState({ type: "idle", message: "" });

    try {
      const res = await fetch(
        `${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/reconfigure-llm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.detail ?? "Failed to apply provider configuration"));
      }

      setAgentModel(agent.id, targetModel);
      setDraftApiKeys((state) => ({ ...state, [selectedProvider.id]: "" }));
      setApplyState({
        type: "success",
        message: `Provider applied and gateway restarted. Active model is now ${targetModel}.`,
      });
    } catch (error) {
      setApplyState({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to apply provider configuration",
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
      <div className="max-w-2xl">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-base font-satoshi-bold text-[var(--text-primary)] mb-1">
            LLM Provider & Model
          </h2>
          <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">
            Choose which model powers this agent. The selection applies to all new conversations.
          </p>
        </div>

        {/* Provider configuration */}
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--card-color)] p-5 mb-6">
          {sharedCodexEnabled && (
            <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[var(--primary)]/7 border border-[var(--primary)]/20">
              <CheckCircle2 className="h-4 w-4 text-[var(--primary)] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-satoshi-bold text-[var(--text-primary)]">
                  Shared Codex is managing this sandbox
                </p>
                <p className="text-[11px] font-satoshi-regular text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  The live gateway is locked to <span className="font-mono">{sharedCodexModel}</span>. Provider switching and per-sandbox credential changes are disabled for this sandbox.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">
                Configure Provider
              </h3>
              <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">
                Apply credentials to the live sandbox, restart the gateway, and keep the selected model aligned with the configured provider.
              </p>
            </div>
            {activeSandbox && (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)] bg-[var(--color-light)] rounded-full px-2.5 py-1">
                {activeSandbox.sandbox_id.slice(0, 8)}…
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {PROVIDERS.map((provider) => {
              const isSelectedProvider = provider.id === selectedProvider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => !sharedCodexEnabled && setSelectedProviderId(provider.id)}
                  disabled={sharedCodexEnabled}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                    isSelectedProvider
                      ? "border-[var(--primary)] bg-[var(--primary)]/5 ring-1 ring-[var(--primary)]/20"
                      : "border-[var(--border-stroke)] bg-[var(--color-light)] hover:border-[var(--border-default)]"
                  } ${sharedCodexEnabled ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <div>
                    <p className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                      {provider.label}
                    </p>
                    <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] mt-0.5">
                      Default model: {provider.defaultModelLabel}
                    </p>
                  </div>
                  <span className="text-base">{provider.emoji}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {selectedProvider.requiresApiKey ? (
              <div>
                <label
                  htmlFor={`${selectedProvider.id}-api-key`}
                  className="block text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2"
                >
                  {selectedProvider.apiKeyLabel}
                </label>
                <Input
                  id={`${selectedProvider.id}-api-key`}
                  aria-label={selectedProvider.apiKeyLabel}
                  type="password"
                  placeholder="Paste key for this sandbox only"
                  value={draftApiKeys[selectedProvider.id] ?? ""}
                  disabled={sharedCodexEnabled}
                  onChange={(event) =>
                    setDraftApiKeys((state) => ({
                      ...state,
                      [selectedProvider.id]: event.target.value,
                    }))
                  }
                  className="h-11 rounded-xl border-[var(--border-default)] bg-[var(--background)] text-sm"
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor="ollama-base-url"
                  className="block text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2"
                >
                  Ollama Base URL
                </label>
                <Input
                  id="ollama-base-url"
                  aria-label="Ollama Base URL"
                  value={ollamaBaseUrl}
                  disabled={sharedCodexEnabled}
                  onChange={(event) => setOllamaBaseUrl(event.target.value)}
                  className="h-11 rounded-xl border-[var(--border-default)] bg-[var(--background)] text-sm"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] leading-relaxed">
                Secrets stay in this form only long enough to submit the request. They are not persisted in local storage.
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleApplyProvider}
                disabled={isApplying || !activeSandbox || sharedCodexEnabled}
                className="rounded-xl px-4"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying…
                  </>
                ) : sharedCodexEnabled ? (
                  "Managed by Shared Codex"
                ) : (
                  "Apply & Restart"
                )}
              </Button>
            </div>
          </div>

          {applyState.type === "success" && (
            <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[var(--success)]/8 border border-[var(--success)]/20">
              <CheckCircle2 className="h-4 w-4 text-[var(--success)] shrink-0 mt-0.5" />
              <p className="text-xs font-satoshi-medium text-[var(--success)]">
                Provider applied. {applyState.message}
              </p>
            </div>
          )}

          {applyState.type === "error" && (
            <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[var(--error)]/8 border border-[var(--error)]/20">
              <AlertCircle className="h-4 w-4 text-[var(--error)] shrink-0 mt-0.5" />
              <p className="text-xs font-satoshi-medium text-[var(--error)]">
                {applyState.message}
              </p>
            </div>
          )}
        </div>

        {/* Model discovery state */}
        <div className="mb-6">
          {modelsLoading && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[var(--color-light)] border border-[var(--border-stroke)]">
              <Loader2 className="h-4 w-4 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-spin" />
              <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">
                Loading available models from the active sandbox.
              </p>
            </div>
          )}

          {!modelsLoading && modelsSynthetic && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[var(--warning)]/8 border border-[var(--warning)]/20">
              <Info className="h-4 w-4 text-[var(--warning)] shrink-0 mt-0.5" />
              <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">
                {modelsMessage}
              </p>
            </div>
          )}
        </div>

        {/* Provider sections */}
        <div className="space-y-6">
          {modelSections.map((section) => (
            <div key={section.id}>
              {/* Provider label */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-base">{section.emoji}</span>
                <span className="text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                  {section.label}
                </span>
              </div>

              {/* Model cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {section.models.map((model) => {
                  const isSelected = selectedModel === model.id;
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleSelect(model.id)}
                      disabled={sharedCodexEnabled}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "border-[var(--primary)] bg-[var(--primary)]/5 ring-1 ring-[var(--primary)]/20"
                          : "border-[var(--border-stroke)] bg-[var(--card-color)] hover:border-[var(--border-default)] hover:bg-[var(--color-light)]"
                      } ${sharedCodexEnabled ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-satoshi-medium truncate ${
                          isSelected ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
                        }`}>
                          {model.label}
                        </p>
                        {model.note && (
                          <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] mt-0.5">
                            {model.note}
                          </p>
                        )}
                        <p className="text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5 truncate opacity-60">
                          {model.id}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center shrink-0 ml-3">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Current selection summary */}
        {sharedCodexEnabled && sharedCodexModel && (
          <div className="mt-8 px-4 py-3 rounded-xl bg-[var(--success)]/8 border border-[var(--success)]/20">
            <p className="text-xs font-satoshi-medium text-[var(--success)]">
              Active model: <span data-testid="active-model-id" className="font-mono">{sharedCodexModel}</span>
            </p>
            <p className="text-[11px] font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
              This sandbox is pinned to shared Codex auth. New conversations will use the gateway default automatically.
            </p>
          </div>
        )}

        {!sharedCodexEnabled && selectedModel && (
          <div className="mt-8 px-4 py-3 rounded-xl bg-[var(--success)]/8 border border-[var(--success)]/20">
            <p className="text-xs font-satoshi-medium text-[var(--success)]">
              Active model: <span data-testid="active-model-id" className="font-mono">{selectedModel}</span>
            </p>
            <p className="text-[11px] font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
              This model will be used for all new conversations with {agent.name}.
            </p>
          </div>
        )}

        {!sharedCodexEnabled && !selectedModel && (
          <div className="mt-8 px-4 py-3 rounded-xl bg-[var(--color-light)] border border-[var(--border-stroke)]">
            <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
              No model selected — using gateway default (<span className="font-mono">openclaw-default</span>)
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
