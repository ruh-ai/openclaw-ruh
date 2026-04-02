"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { X, ExternalLink, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolResearchWorkspace } from "@/app/(platform)/tools/_components/ToolResearchWorkspace";
import {
  buildToolResearchPlan,
  buildToolResearchResultFromPlan,
  type ToolResearchResult,
} from "@/lib/tools/tool-integration";
import type { ToolConnectionDraft } from "./types";
import {
  areRequiredCredentialsFilled,
  getToolDefinition,
  getToolRuntimeInputGuidance,
  saveToolCredentials,
  toolSupportsDirectConnection,
  type McpCredentialField,
} from "../../_config/mcp-tool-registry";

interface ConnectToolsSidebarProps {
  toolId: string;
  toolName: string;
  toolDescription: string;
  toolConnection: ToolConnectionDraft | null;
  credentialDraft?: Record<string, string>;
  agentId: string | null;
  agentUseCase?: string;
  onRecommendation?: (result: ToolResearchResult) => void;
  onClose: () => void;
  onSave: (connection: ToolConnectionDraft, credentialDraft?: Record<string, string> | null) => void;
}

export function ConnectToolsSidebar({
  toolId,
  toolName,
  toolDescription,
  toolConnection,
  credentialDraft,
  agentId,
  agentUseCase,
  onRecommendation,
  onClose,
  onSave,
}: ConnectToolsSidebarProps) {
  const [values, setValues] = useState<Record<string, string>>(credentialDraft ?? {});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [recommendation, setRecommendation] = useState<ToolResearchResult | null>(
    buildToolResearchResultFromPlan(toolConnection?.researchPlan, toolName),
  );

  const recommendedToolId =
    recommendation?.recommendedToolId && getToolDefinition(recommendation.recommendedToolId)
      ? recommendation.recommendedToolId
      : null;
  const resolvedToolId = recommendedToolId ?? toolId;
  const toolDef = getToolDefinition(resolvedToolId);
  const supportsDirectConnection = toolSupportsDirectConnection(resolvedToolId);
  const fields = toolDef?.credentials ?? [];
  const runtimeInputGuidance = getToolRuntimeInputGuidance(resolvedToolId);

  useEffect(() => {
    setValues(credentialDraft ?? {});
  }, [credentialDraft]);

  useEffect(() => {
    setRecommendation(buildToolResearchResultFromPlan(toolConnection?.researchPlan, toolName));
  }, [toolConnection?.researchPlan, toolName]);

  useEffect(() => {
    if (recommendation) {
      onRecommendation?.(recommendation);
    }
  }, [onRecommendation, recommendation]);

  const allFilled = areRequiredCredentialsFilled(resolvedToolId, values);

  const buildConfigSummary = (result?: ToolResearchResult | null) => {
    const summary: string[] = [];

    if (result?.summary) {
      summary.push(result.summary);
    }
    if (result?.recommendedPackage) {
      summary.push(`Recommended package or command: ${result.recommendedPackage}`);
    }
    if (supportsDirectConnection) {
      summary.push(agentId ? "Credentials stored securely" : "Credentials saved for first agent save");
    } else {
      summary.push("Manual integration still required");
    }

    return summary.slice(0, 4);
  };

  const buildConnection = (result?: ToolResearchResult | null): ToolConnectionDraft => {
    const nextRecommendedToolId =
      result?.recommendedToolId && getToolDefinition(result.recommendedToolId)
        ? result.recommendedToolId
        : null;
    const nextToolId = nextRecommendedToolId ?? toolId;
    const nextToolDef = getToolDefinition(nextToolId);
    const nextSupportsDirectConnection = toolSupportsDirectConnection(nextToolId);

    return {
      toolId: nextToolId,
      name: nextToolDef?.name ?? toolName,
      description: nextToolDef?.description ?? toolDescription,
      status: nextSupportsDirectConnection ? "configured" : "unsupported",
      authKind: nextSupportsDirectConnection ? (nextToolDef?.authKind ?? "none") : "none",
      connectorType: nextSupportsDirectConnection ? "mcp" : result?.recommendedMethod ?? toolConnection?.connectorType ?? "api",
      configSummary: buildConfigSummary(result),
      researchPlan: result
        ? buildToolResearchPlan(result, toolName)
        : toolConnection?.researchPlan,
    };
  };

  const handleSave = async () => {
    if (supportsDirectConnection && !allFilled) return;

    if (!supportsDirectConnection) {
      if (!recommendation) {
        setError("Run the research step first so the agent can recommend the right integration method.");
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onSave(buildConnection(recommendation), null);
      }, 250);
      return;
    }

    if (!agentId) {
      setSuccess(true);
      setTimeout(() => {
        onSave(buildConnection(recommendation), values);
      }, 250);
      return;
    }

    setSaving(true);
    setError(null);
    const result = await saveToolCredentials(agentId, resolvedToolId, values);
    setSaving(false);

    if (result.ok) {
      setSuccess(true);
      setTimeout(() => {
        onSave(buildConnection(recommendation), null);
      }, 600);
    } else {
      setError(result.error || "Failed to save credentials");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-[var(--card-color)] border-l border-[var(--border-default)] shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
          <h2 className="text-lg font-satoshi-bold text-[var(--text-primary)]">
            Connect {toolName}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Logos */}
          <div
            className="warmth-hover bg-[var(--background)] border border-[var(--border-default)] rounded-xl p-4 mb-6"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty("--mouse-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
              e.currentTarget.style.setProperty("--mouse-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8">
                <Image src="/assets/logos/favicon.svg" alt="RUH" width={32} height={32} />
              </div>
              <div className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]" />
                <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]" />
                <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]" />
              </div>
              <ToolIcon name={toolName} size={32} />
            </div>
          </div>

          {/* MCP info */}
          {toolDef && (
            <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)] mb-5">
              Connects via MCP server: <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--background)] border border-[var(--border-default)]">{toolDef.mcpPackage}</code>
            </p>
          )}

          <ToolResearchWorkspace
            title={`Research ${toolName}`}
            description="The architect compares MCP vs API vs CLI and recommends the best path for this tool in your current agent workflow."
            initialToolName={toolName}
            initialUseCase={agentUseCase}
            initialResult={buildToolResearchResultFromPlan(toolConnection?.researchPlan, toolName)}
            readOnlyToolName
            compact
            autoResearch
            onRecommendation={setRecommendation}
          />

          {!supportsDirectConnection && (
            <div className="mt-5 rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-3 py-3">
              <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                One-click connection is not supported yet
              </p>
              <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                Save the architect&apos;s recommendation so the agent keeps the integration plan, but do not claim the tool is configured until a direct connector exists.
              </p>
            </div>
          )}

          {supportsDirectConnection && (
            <div className="mt-5 space-y-4">
              {fields.map((field) => (
                <CredentialInput
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ""}
                  showPassword={showPassword[field.key] ?? false}
                  onTogglePassword={() =>
                    setShowPassword((p) => ({ ...p, [field.key]: !p[field.key] }))
                  }
                  onChange={(val) => setValues((p) => ({ ...p, [field.key]: val }))}
                />
              ))}
            </div>
          )}

          {runtimeInputGuidance && (
            <div className="mt-5 rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-3 py-3">
              <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                {runtimeInputGuidance.title}
              </p>
              <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                {runtimeInputGuidance.description}
              </p>
            </div>
          )}

          {supportsDirectConnection && (
            <div className="mt-6 space-y-3">
              <div>
                <h3 className="mb-1 text-sm font-satoshi-bold text-[var(--text-primary)]">
                  Encrypted at rest
                </h3>
                <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                  Credentials are encrypted with AES-256-GCM before storage. They are only decrypted when pushed to your agent&apos;s sandbox.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[var(--error)]/10 border border-[var(--error)]/20">
              <AlertCircle className="h-4 w-4 text-[var(--error)] shrink-0 mt-0.5" />
              <p className="text-xs font-satoshi-regular text-[var(--error)]">{error}</p>
            </div>
          )}

          {success && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/20">
              <CheckCircle2 className="h-4 w-4 text-[var(--success)] shrink-0" />
              <p className="text-xs font-satoshi-medium text-[var(--success)]">
                {supportsDirectConnection ? "Credentials saved and encrypted" : "Manual integration plan saved"}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--border-default)]">
          <Button
            variant="primary"
            className="w-full h-11 gap-2"
            disabled={(supportsDirectConnection && !allFilled) || saving || success}
            onClick={handleSave}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </>
            ) : (
              supportsDirectConnection ? (agentId ? "Save Credentials" : "Save Draft") : "Save Manual Plan"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Credential Input Component ───────────────────────────────────────────────

function CredentialInput({
  field,
  value,
  showPassword,
  onTogglePassword,
  onChange,
}: {
  field: McpCredentialField;
  value: string;
  showPassword: boolean;
  onTogglePassword: () => void;
  onChange: (val: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-satoshi-medium text-[var(--text-primary)]">
          {field.label}
        </label>
        {field.helpUrl && (
          <a
            href={field.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-satoshi-medium text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
          >
            Get token <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>

      {field.type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="focus-breathe w-full px-3 py-2.5 rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)] resize-none"
        />
      ) : (
        <div className="relative">
          <input
            type={field.type === "password" && !showPassword ? "password" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="focus-breathe w-full h-10 px-3 pr-10 rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] text-sm font-mono text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)]"
          />
          {field.type === "password" && (
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      )}

      {field.helpText && (
        <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)]">
          {field.helpText}
        </p>
      )}
    </div>
  );
}

// ─── Tool Icon (kept from original) ──────────────────────────────────────────

function ToolIcon({ name, size = 24 }: { name: string; size?: number }) {
  const s = size;
  const iconMap: Record<string, ReactNode> = {
    Jira: (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#2684FF" />
        <path d="M22.3 9.7h-6.1c0 1.7 1.4 3.1 3.1 3.1h1.1v1c0 1.7 1.4 3.1 3.1 3.1V10.8c0-.6-.5-1.1-1.2-1.1z" fill="#fff" />
        <path d="M19.2 12.8h-6.1c0 1.7 1.4 3.1 3.1 3.1h1.1v1c0 1.7 1.4 3.1 3.1 3.1v-6.1c0-.6-.5-1.1-1.2-1.1z" fill="#fff" opacity="0.8" />
        <path d="M16.1 15.9H10c0 1.7 1.4 3.1 3.1 3.1h1.1v1c0 1.7 1.4 3.1 3.1 3.1v-6.1c0-.6-.5-1.1-1.2-1.1z" fill="#fff" opacity="0.6" />
      </svg>
    ),
    Github: (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#24292e" />
        <path fillRule="evenodd" clipRule="evenodd" d="M16 7C11.03 7 7 11.03 7 16c0 3.98 2.58 7.35 6.15 8.54.45.08.61-.2.61-.43v-1.5c-2.5.54-3.03-1.2-3.03-1.2-.41-1.04-1-1.31-1-1.31-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.37 2.1.97 2.61.75.08-.58.31-.97.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.15.09-2.39 0 0 .75-.24 2.47.93a8.6 8.6 0 014.5 0c1.72-1.17 2.47-.93 2.47-.93.49 1.24.19 2.16.09 2.39.58.63.93 1.44.93 2.42 0 3.46-2.1 4.22-4.11 4.44.32.28.61.83.61 1.67v2.47c0 .24.16.52.62.43A9.01 9.01 0 0025 16c0-4.97-4.03-9-9-9z" fill="#fff" />
      </svg>
    ),
    "Zoho CRM": (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#fff" stroke="#e5e5e5" />
        <circle cx="10" cy="16" r="2.5" fill="#E42527" />
        <circle cx="16" cy="16" r="2.5" fill="#F0A922" />
        <circle cx="22" cy="16" r="2.5" fill="#00923F" />
      </svg>
    ),
    Slack: (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#4A154B" />
        <rect x="10" y="7" width="3.5" height="10.5" rx="1.75" fill="#E01E5A" />
        <rect x="10" y="19.5" width="3.5" height="5.5" rx="1.75" fill="#E01E5A" />
        <rect x="18.5" y="14.5" width="3.5" height="10.5" rx="1.75" fill="#36C5F0" />
        <rect x="7" y="14.5" width="5.5" height="3.5" rx="1.75" fill="#36C5F0" />
        <rect x="18.5" y="7" width="3.5" height="5.5" rx="1.75" fill="#2EB67D" />
        <rect x="14" y="14.5" width="5.5" height="3.5" rx="1.75" fill="#2EB67D" />
        <rect x="7" y="10.5" width="10.5" height="3.5" rx="1.75" fill="#ECB22E" />
        <rect x="19.5" y="10.5" width="5.5" height="3.5" rx="1.75" fill="#ECB22E" />
      </svg>
    ),
    Notion: (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#fff" stroke="#e5e5e5" />
        <path d="M10 9h8.5l5 5v10a1 1 0 01-1 1H10a1 1 0 01-1-1V10a1 1 0 011-1z" fill="#fff" stroke="#1a1a1a" strokeWidth="1.5" />
        <path d="M18.5 9v5h5" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    "Google Workspace": (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#fff" stroke="#e5e5e5" />
        <path d="M23.5 16.2c0-.6-.1-1.2-.2-1.7H16v3.2h4.2c-.2 1-.8 1.8-1.7 2.4v2h2.7c1.6-1.5 2.3-3.6 2.3-5.9z" fill="#4285F4" />
        <path d="M16 24c2.2 0 4-.7 5.3-2l-2.7-2c-.7.5-1.6.8-2.6.8-2 0-3.7-1.4-4.3-3.2H8.9v2c1.3 2.5 3.8 4.4 7.1 4.4z" fill="#34A853" />
        <path d="M11.7 17.6c-.2-.5-.3-1-.3-1.6s.1-1.1.3-1.6v-2H8.9c-.6 1.2-.9 2.5-.9 3.6s.3 2.4.9 3.6l2.8-2z" fill="#FBBC05" />
        <path d="M16 11.2c1.1 0 2.1.4 2.9 1.1l2.2-2.2C19.7 8.7 18 8 16 8c-3.3 0-5.8 1.9-7.1 4.4l2.8 2c.6-1.8 2.3-3.2 4.3-3.2z" fill="#EA4335" />
      </svg>
    ),
    Linear: (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#5E6AD2" />
        <path d="M8 20.5L19.5 9H23l-15 15v-3.5zM8 14.5L17.5 5H21L8 18v-3.5zM14 25l9-9v3.5L17.5 25H14z" fill="white" />
      </svg>
    ),
    "Google Ads": (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#fff" stroke="#e5e5e5" />
        <path d="M8 21l6-12 3.5 7L11.5 28z" fill="#FBBC04" />
        <path d="M17.5 16l6-12 3 6-6 12z" fill="#4285F4" />
        <circle cx="11" cy="24" r="3" fill="#34A853" />
      </svg>
    ),
  };

  return <>{iconMap[name] || <div className="w-8 h-8 rounded-md bg-[var(--border-muted)]" />}</>;
}

export { ToolIcon };
