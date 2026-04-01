"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Link2, Loader2, Unlink, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SkillGraphNode } from "@/lib/openclaw/types";
import {
  reconcileToolConnections,
  type CredentialSummary,
  type ToolResearchResult,
} from "@/lib/tools/tool-integration";
import {
  deleteToolCredentials,
  fetchCredentialSummary,
  toolSupportsDirectConnection,
} from "../../_config/mcp-tool-registry";
import {
  buildConnectToolCatalog,
  getCredentialBackedToolIds,
} from "./connect-tool-catalog";
import { ConnectToolsSidebar, ToolIcon } from "./ConnectToolsSidebar";
import type { ToolConnectionDraft, ToolCredentialDrafts, ToolItem } from "./types";

function statusLabel(tool: ToolItem): string {
  switch (tool.status) {
    case "configured":
      return "Configured";
    case "missing_secret":
      return "Missing credentials";
    case "unsupported":
      return "Manual integration";
    default:
      return "Available";
  }
}

interface StepConnectToolsProps {
  onContinue: (connectedTools: ToolConnectionDraft[]) => void;
  onCancel: () => void;
  onSkip: () => void;
  stepLabel: string;
  skillGraph?: SkillGraphNode[] | null;
  hideFooter?: boolean;
  initialConnected?: ToolConnectionDraft[];
  initialCredentialDrafts?: ToolCredentialDrafts;
  onConnectionChange?: (connections: ToolConnectionDraft[]) => void;
  onCredentialDraftChange?: (drafts: ToolCredentialDrafts) => void;
  agentId?: string | null;
  agentUseCase?: string;
}

export function StepConnectTools({
  onContinue,
  onCancel,
  onSkip,
  stepLabel,
  skillGraph,
  hideFooter,
  initialConnected,
  initialCredentialDrafts,
  onConnectionChange,
  onCredentialDraftChange,
  agentId,
  agentUseCase,
}: StepConnectToolsProps) {
  const [toolConnections, setToolConnections] = useState<ToolConnectionDraft[]>(initialConnected ?? []);
  const [credentialDrafts, setCredentialDrafts] = useState<ToolCredentialDrafts>(initialCredentialDrafts ?? {});
  const [credentialSummary, setCredentialSummary] = useState<CredentialSummary[]>([]);
  const [sidebarTool, setSidebarTool] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [disconnectingToolId, setDisconnectingToolId] = useState<string | null>(null);
  const [latestRecommendation, setLatestRecommendation] = useState<ToolResearchResult | null>(null);

  const credentialBackedToolIds = useMemo(() => getCredentialBackedToolIds(), []);

  useEffect(() => {
    setToolConnections(initialConnected ?? []);
  }, [initialConnected]);

  useEffect(() => {
    setCredentialDrafts(initialCredentialDrafts ?? {});
  }, [initialCredentialDrafts]);

  useEffect(() => {
    if (!agentId) {
      setCredentialSummary([]);
      return;
    }

    let cancelled = false;
    void fetchCredentialSummary(agentId).then((summary) => {
      if (!cancelled) {
        setCredentialSummary(summary);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const effectiveConnections = useMemo(
    () =>
      reconcileToolConnections(toolConnections, credentialSummary, {
        credentialBackedToolIds,
      }),
    [credentialBackedToolIds, credentialSummary, toolConnections],
  );

  const tools = useMemo(
    () =>
      buildConnectToolCatalog({
        skillGraph,
        agentUseCase,
        connections: effectiveConnections,
        latestRecommendation,
      }),
    [agentUseCase, effectiveConnections, latestRecommendation, skillGraph],
  );

  const hasConnected = effectiveConnections.length > 0;

  const publishConnections = (nextConnections: ToolConnectionDraft[]) => {
    setToolConnections(nextConnections);
    onConnectionChange?.(
      reconcileToolConnections(nextConnections, credentialSummary, {
        credentialBackedToolIds,
      }),
    );
  };

  const publishCredentialDrafts = (nextDrafts: ToolCredentialDrafts) => {
    setCredentialDrafts(nextDrafts);
    onCredentialDraftChange?.(nextDrafts);
  };

  const handleConnectionSaved = (
    connection: ToolConnectionDraft,
    nextDraft?: Record<string, string> | null,
    sourceToolId?: string,
  ) => {
    setActionError(null);

    const nextConnections = [
      ...effectiveConnections.filter(
        (item) =>
          item.toolId !== connection.toolId &&
          item.toolId !== sourceToolId,
      ),
      connection,
    ];
    publishConnections(nextConnections);

    if (nextDraft) {
      publishCredentialDrafts({
        ...Object.fromEntries(
          Object.entries(credentialDrafts).filter(([toolId]) => toolId !== sourceToolId),
        ),
        [connection.toolId]: nextDraft,
      });
    } else {
      const { [connection.toolId]: _removed, [sourceToolId ?? ""]: _replaced, ...rest } = credentialDrafts;
      void _removed;
      void _replaced;
      publishCredentialDrafts(rest);
    }

    setSidebarTool(null);
  };

  const handleDisconnect = async (toolId: string) => {
    setActionError(null);

    if (agentId && toolSupportsDirectConnection(toolId)) {
      setDisconnectingToolId(toolId);
      const result = await deleteToolCredentials(agentId, toolId);
      setDisconnectingToolId(null);
      if (!result.ok) {
        setActionError("Failed to remove the saved credentials for this tool.");
        return;
      }
      const summary = await fetchCredentialSummary(agentId);
      setCredentialSummary(summary);
    }

    publishConnections(effectiveConnections.filter((item) => item.toolId !== toolId));
    const { [toolId]: _removed, ...rest } = credentialDrafts;
    publishCredentialDrafts(rest);
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
        <div className="mx-auto max-w-2xl">
          <p className="mb-4 text-xs font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {stepLabel}
          </p>

          <div className="mb-6 flex items-start gap-3">
            <div className="mt-0.5 h-9 w-9 shrink-0">
              <Image
                src="/assets/logos/favicon.svg"
                alt="Configure"
                width={36}
                height={36}
              />
            </div>
            <div>
              <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
                Connect Tools
              </h2>
              <p className="mt-0.5 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                Research the best integration path first, then connect only the tools the product can support truthfully.
              </p>
            </div>
          </div>

          {actionError && (
            <div className="mb-4 rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/10 px-3 py-2.5 text-sm font-satoshi-regular text-[var(--error)]">
              {actionError}
            </div>
          )}

          <div className="space-y-3">
            {tools.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center gap-4 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] px-5 py-4 transition-all hover:border-[var(--border-default)]"
              >
                <ToolIcon name={tool.name} size={36} />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                    {tool.name}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
                    {tool.description}
                  </p>
                  <p className="mt-1 text-[11px] font-satoshi-medium text-[var(--text-tertiary)]">
                    {statusLabel(tool)}
                    {tool.connectorType ? ` · ${tool.connectorType.toUpperCase()}` : ""}
                  </p>
                </div>

                {tool.connected ? (
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={disconnectingToolId === tool.id}
                    onClick={() => void handleDisconnect(tool.id)}
                  >
                    {disconnectingToolId === tool.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unlink className="h-3.5 w-3.5" />
                    )}
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => setSidebarTool(tool.id)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Research & Connect
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!hideFooter && (
        <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] px-6 py-4 md:px-8">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Button variant="tertiary" className="h-10 px-6" onClick={onCancel}>
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              <Button variant="tertiary" className="h-10 px-5" onClick={onSkip}>
                Skip this step
              </Button>
              <Button
                variant="primary"
                className="h-10 gap-1.5 px-6"
                disabled={!hasConnected}
                onClick={() => onContinue(effectiveConnections)}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {sidebarTool && (() => {
        const tool = tools.find((item) => item.id === sidebarTool);
        if (!tool) return null;

        return (
          <ConnectToolsSidebar
            toolId={tool.id}
            toolName={tool.name}
            toolDescription={tool.description}
            toolConnection={effectiveConnections.find((item) => item.toolId === tool.id) ?? null}
            credentialDraft={credentialDrafts[tool.id]}
            agentId={agentId ?? null}
            agentUseCase={agentUseCase}
            onRecommendation={setLatestRecommendation}
            onClose={() => setSidebarTool(null)}
            onSave={(connection, nextDraft) => handleConnectionSaved(connection, nextDraft, tool.id)}
          />
        );
      })()}
    </>
  );
}
