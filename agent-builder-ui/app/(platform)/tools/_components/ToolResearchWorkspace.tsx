"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, ExternalLink, Loader2, Sparkles, Terminal, Waypoints, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildSupportedToolsContext } from "@/app/(platform)/agents/create/_config/mcp-tool-registry";
import {
  researchToolIntegration,
  type ToolIntegrationMethod,
  type ToolResearchResult,
} from "@/lib/tools/tool-integration";

interface ToolResearchWorkspaceProps {
  initialToolName?: string;
  initialUseCase?: string;
  title?: string;
  description?: string;
  initialResult?: ToolResearchResult | null;
  readOnlyToolName?: boolean;
  compact?: boolean;
  autoResearch?: boolean;
  onRecommendation?: (result: ToolResearchResult) => void;
}

export function ToolResearchWorkspace({
  initialToolName = "",
  initialUseCase = "",
  title = "Research a tool integration",
  description = "Ask the architect whether this tool should be integrated through MCP, a direct API wrapper, or a CLI workflow.",
  initialResult = null,
  readOnlyToolName = false,
  compact = false,
  autoResearch = false,
  onRecommendation,
}: ToolResearchWorkspaceProps) {
  const [toolName, setToolName] = useState(initialToolName);
  const [useCase, setUseCase] = useState(initialUseCase);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ToolResearchResult | null>(initialResult);
  const autoKeyRef = useRef<string>("");

  const supportedToolsContext = useMemo(() => buildSupportedToolsContext(), []);

  const runResearch = async () => {
    if (!toolName.trim()) return;

    setIsLoading(true);
    setError(null);
    setStatusMessage("Researching integration options...");

    try {
      const recommendation = await researchToolIntegration(
        {
          toolName: toolName.trim(),
          useCase: useCase.trim() || undefined,
          supportedToolsContext,
        },
        {
          onStatus: (_phase, message) => {
            setStatusMessage(message);
          },
        },
      );

      setResult(recommendation);
      setStatusMessage("");
      onRecommendation?.(recommendation);
    } catch (researchError) {
      setError(
        researchError instanceof Error
          ? researchError.message
          : "The architect could not produce a structured integration recommendation.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setResult(initialResult);
  }, [initialResult]);

  useEffect(() => {
    if (result) {
      onRecommendation?.(result);
    }
  }, [onRecommendation, result]);

  useEffect(() => {
    const key = `${initialToolName}::${initialUseCase}`;
    if (!autoResearch || !initialToolName.trim() || autoKeyRef.current === key || initialResult) {
      return;
    }
    autoKeyRef.current = key;
    void runResearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResearch, initialResult, initialToolName, initialUseCase]);

  return (
    <div className={`space-y-4 ${compact ? "" : "max-w-5xl mx-auto w-full"}`}>
      <div className={`${compact ? "" : "rounded-2xl border border-[var(--border-default)] bg-[var(--card-color)] p-6"}`}>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--primary)]/10 p-2.5 text-[var(--primary)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className={`${compact ? "text-base" : "text-2xl"} font-satoshi-bold text-[var(--text-primary)]`}>
              {title}
            </h1>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
              {description}
            </p>
          </div>
        </div>

        <div className={`mt-5 grid gap-4 ${compact ? "grid-cols-1" : "md:grid-cols-[1.1fr_1.4fr]"}`}>
          <div className="space-y-2">
            <label className="text-xs font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Tool or service
            </label>
            {readOnlyToolName ? (
              <div className="rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 py-2.5 text-sm font-satoshi-medium text-[var(--text-primary)]">
                {toolName}
              </div>
            ) : (
              <input
                value={toolName}
                onChange={(event) => setToolName(event.target.value)}
                placeholder="GitHub, Stripe, Google Ads, Linear, Figma..."
                className="h-11 w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Agent use case
            </label>
            <textarea
              value={useCase}
              onChange={(event) => setUseCase(event.target.value)}
              placeholder="What should the agent do with this tool?"
              rows={compact ? 3 : 4}
              className="w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 py-2.5 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            className="h-10 gap-2"
            disabled={!toolName.trim() || isLoading}
            onClick={() => void runResearch()}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Research Best Integration
          </Button>
          {statusMessage && (
            <p className="text-xs font-satoshi-medium text-[var(--text-tertiary)]">
              {statusMessage}
            </p>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/10 px-3 py-2.5 text-sm font-satoshi-regular text-[var(--error)]">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className={`${compact ? "space-y-4" : "grid gap-4 md:grid-cols-[1.1fr_1fr]"}`}>
          <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--card-color)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Recommendation
                </p>
                <h2 className="mt-1 text-lg font-satoshi-bold text-[var(--text-primary)]">
                  {result.toolName}
                </h2>
              </div>
              <MethodBadge method={result.recommendedMethod} />
            </div>

            <p className="mt-4 text-sm font-satoshi-medium text-[var(--text-primary)]">
              {result.summary}
            </p>
            <p className="mt-2 text-sm font-satoshi-regular text-[var(--text-secondary)]">
              {result.rationale}
            </p>

            {(result.recommendedPackage || result.recommendedToolId) && (
              <div className="mt-4 space-y-2 rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] p-3">
                {result.recommendedPackage && (
                  <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                    Package or command: <span className="font-mono text-[var(--text-primary)]">{result.recommendedPackage}</span>
                  </p>
                )}
                {result.recommendedToolId && (
                  <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                    One-click builder support: <span className="font-mono text-[var(--text-primary)]">{result.recommendedToolId}</span>
                  </p>
                )}
              </div>
            )}

            {result.requiredCredentials.length > 0 && (
              <SectionCard icon={Wrench} title="Credentials">
                {result.requiredCredentials.map((credential) => (
                  <li key={credential.name} className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                    <span className="font-mono text-[var(--text-primary)]">{credential.name}</span>
                    {credential.reason ? ` — ${credential.reason}` : ""}
                  </li>
                ))}
              </SectionCard>
            )}

            {result.sources.length > 0 && (
              <SectionCard icon={BookOpen} title="Sources">
                {result.sources.map((source) => (
                  <li key={source.url} className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                    >
                      {source.title}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
              </SectionCard>
            )}
          </div>

          <div className="space-y-4">
            <SectionCard icon={Waypoints} title="Setup Steps">
              {result.setupSteps.map((step) => (
                <li key={step} className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                  {step}
                </li>
              ))}
            </SectionCard>

            <SectionCard icon={Terminal} title="Agent Integration Steps">
              {result.integrationSteps.map((step) => (
                <li key={step} className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                  {step}
                </li>
              ))}
            </SectionCard>

            <SectionCard icon={Sparkles} title="Validation Steps">
              {result.validationSteps.map((step) => (
                <li key={step} className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                  {step}
                </li>
              ))}
            </SectionCard>

            {result.alternatives.length > 0 && (
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--card-color)] p-5">
                <p className="text-xs font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Alternatives
                </p>
                <div className="mt-3 space-y-3">
                  {result.alternatives.map((alternative) => (
                    <div
                      key={`${alternative.method}-${alternative.summary}`}
                      className="rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                          {alternative.method.toUpperCase()}
                        </p>
                        <MethodBadge method={alternative.method} subtle />
                      </div>
                      <p className="mt-2 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                        {alternative.summary}
                      </p>
                      {alternative.pros.length > 0 && (
                        <p className="mt-2 text-xs font-satoshi-medium text-[var(--text-secondary)]">
                          Pros: {alternative.pros.join(" · ")}
                        </p>
                      )}
                      {alternative.cons.length > 0 && (
                        <p className="mt-1 text-xs font-satoshi-medium text-[var(--text-secondary)]">
                          Cons: {alternative.cons.join(" · ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MethodBadge({
  method,
  subtle = false,
}: {
  method: ToolIntegrationMethod;
  subtle?: boolean;
}) {
  const palette =
    method === "api"
      ? "bg-sky-500/10 text-sky-700 border-sky-500/20"
      : method === "cli"
      ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
      : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-satoshi-bold uppercase tracking-wider ${
        subtle ? palette : palette
      }`}
    >
      {method}
    </span>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--card-color)] p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--primary)]" />
        <p className="text-xs font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          {title}
        </p>
      </div>
      <ol className="mt-3 space-y-2 pl-4 list-decimal">
        {children}
      </ol>
    </div>
  );
}
