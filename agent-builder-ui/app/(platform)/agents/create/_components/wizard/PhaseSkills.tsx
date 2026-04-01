"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  AlertCircle,
  FileText,
  ChevronRight,
  X,
  Check,
  Hammer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWizard } from "./WizardContext";
import {
  generateSkillsFromArchitect,
  buildSkillMarkdown,
} from "../../_config/generate-skills";

type PhaseStatus = "idle" | "generating" | "success" | "error";

export function PhaseSkills() {
  const { state, setGeneratedSkills, updateSkills, markSkillsBuilt } = useWizard();

  const [status, setStatus] = useState<PhaseStatus>(
    state.generatedNodes.length > 0 ? "success" : "idle"
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [previewSkillId, setPreviewSkillId] = useState<string | null>(null);
  const [isBuildingAll, setIsBuildingAll] = useState(false);

  const handleBuildAllSkills = useCallback(async () => {
    setIsBuildingAll(true);
    try {
      // Determine which skills to build
      const targetIds = new Set(
        state.selectedSkillIds.length > 0
          ? state.selectedSkillIds
          : state.generatedNodes.map((n) => n.skill_id),
      );

      // Generate real SKILL.md content for each skill node
      const builtSkills = state.generatedNodes
        .filter((node) => targetIds.has(node.skill_id))
        .map((node) => ({
          skillId: node.skill_id,
          skill_md: buildSkillMarkdown(node),
        }));

      // Store the built content on the nodes — this will be passed to the backend during deploy
      markSkillsBuilt(builtSkills);
    } finally {
      setIsBuildingAll(false);
    }
  }, [state.selectedSkillIds, state.generatedNodes, markSkillsBuilt]);

  const handleGenerate = useCallback(async () => {
    setStatus("generating");
    setErrorMessage("");
    setStatusMessage("Connecting to architect agent...");

    try {
      const result = await generateSkillsFromArchitect(
        state.name,
        state.description,
        {
          onStatus: (message) => setStatusMessage(message),
        }
      );
      setGeneratedSkills(result.nodes, result.workflow, result.agentRules);
      setStatus("success");
      setStatusMessage("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMessage(msg);
      setStatus("error");
      setStatusMessage("");
    }
  }, [state.name, state.description, setGeneratedSkills]);

  const toggleSkill = (skillId: string) => {
    const next = state.selectedSkillIds.includes(skillId)
      ? state.selectedSkillIds.filter((id) => id !== skillId)
      : [...state.selectedSkillIds, skillId];
    updateSkills(next);
  };

  const previewNode = state.generatedNodes.find((n) => n.skill_id === previewSkillId);

  // ─── Idle state: Generate button ────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-md text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/5 border border-[var(--primary)]/15 flex items-center justify-center mx-auto">
            <Sparkles className="h-7 w-7 text-[var(--primary)]" />
          </div>
          <div>
            <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)] mb-2">
              Generate Skills
            </h2>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
              The architect agent will analyze your description and generate the skills your agent needs to run.
            </p>
          </div>

          {/* Show the description for context */}
          <div className="text-left bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-3">
            <p className="text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
              Your agent
            </p>
            <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
              {state.name || "New Agent"}
            </p>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
              {state.description || "No description provided"}
            </p>
          </div>

          <Button
            variant="primary"
            className="h-12 px-8 gap-2 text-base"
            onClick={handleGenerate}
            disabled={!state.description.trim()}
          >
            <Sparkles className="h-4 w-4" />
            Generate Skills
          </Button>

          {!state.description.trim() && (
            <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
              Go back and add a description to enable skill generation
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Generating state: Loading spinner ──────────────────────────────────────
  if (status === "generating") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-md text-center space-y-5">
          <Loader2 className="h-10 w-10 text-[var(--primary)] animate-spin mx-auto" />
          <div>
            <h2 className="text-lg font-satoshi-bold text-[var(--text-primary)] mb-1">
              Generating skills...
            </h2>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
              {statusMessage || "Analyzing your agent requirements"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-md text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center mx-auto">
            <AlertCircle className="h-6 w-6 text-[var(--error)]" />
          </div>
          <div>
            <h2 className="text-lg font-satoshi-bold text-[var(--text-primary)] mb-2">
              Unable to generate skills
            </h2>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mb-1">
              {errorMessage}
            </p>
            <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
              Make sure the OpenClaw gateway is running and try again.
            </p>
          </div>
          <Button
            variant="primary"
            className="h-10 px-6 gap-2"
            onClick={handleGenerate}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ─── Success state: Skill cards ─────────────────────────────────────────────
  const selectedCount = state.selectedSkillIds.length;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Title */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 shrink-0 mt-0.5">
                <Image src="/assets/logos/favicon.svg" alt="Skills" width={36} height={36} />
              </div>
              <div>
                <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
                  Generated Skills
                </h2>
                <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
                  {state.generatedNodes.length} skills generated — deselect any you don&apos;t need
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="primary"
                size="sm"
                className="gap-1.5"
                onClick={handleBuildAllSkills}
                disabled={isBuildingAll || state.builtSkillIds.length === state.selectedSkillIds.length}
              >
                {isBuildingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Hammer className="h-3.5 w-3.5" />
                )}
                {state.builtSkillIds.length > 0 && state.builtSkillIds.length === state.selectedSkillIds.length
                  ? "All Built"
                  : "Build All Skills"}
              </Button>
              <Button
                variant="tertiary"
                size="sm"
                className="gap-1.5"
                onClick={handleGenerate}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </div>
          </div>

          {/* Skill cards */}
          <div className="space-y-3">
            {state.generatedNodes.map((node) => {
              const isSelected = state.selectedSkillIds.includes(node.skill_id);
              return (
                <div
                  key={node.skill_id}
                  className={`flex items-center gap-4 bg-[var(--card-color)] border-2 rounded-xl px-5 py-4 transition-all ${
                    isSelected
                      ? "border-[var(--primary)] shadow-[0_0_0_3px_rgba(174,0,208,0.08)]"
                      : "border-[var(--border-stroke)] opacity-60"
                  }`}
                >
                  {/* Toggle button */}
                  <button
                    onClick={() => toggleSkill(node.skill_id)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-[var(--primary)] border-[var(--primary)]"
                          : "bg-[var(--background)] border-[var(--border-default)]"
                      }`}
                    >
                      {isSelected ? (
                        <Check className="h-4 w-4 text-white" />
                      ) : (
                        <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-satoshi-bold ${
                          isSelected ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
                        }`}>
                          {node.name}
                        </p>
                        {state.builtSkillIds.includes(node.skill_id) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-satoshi-bold bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20">
                            Built
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                        {node.description || node.skill_id}
                      </p>
                      {node.requires_env && node.requires_env.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {node.requires_env.map((env) => (
                            <span
                              key={env}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--background)] border border-[var(--border-default)] text-[var(--text-tertiary)]"
                            >
                              {env}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Preview button */}
                  <button
                    onClick={() => setPreviewSkillId(
                      previewSkillId === node.skill_id ? null : node.skill_id
                    )}
                    className="p-2 rounded-lg hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0 cursor-pointer"
                    title="Preview SKILL.md"
                  >
                    <ChevronRight className={`h-4 w-4 transition-transform ${
                      previewSkillId === node.skill_id ? "rotate-90" : ""
                    }`} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Selection summary */}
          {selectedCount > 0 && (
            <p className="mt-4 text-sm font-satoshi-medium text-[var(--text-secondary)]">
              {selectedCount} of {state.generatedNodes.length} skill{selectedCount !== 1 ? "s" : ""} selected
            </p>
          )}
        </div>
      </div>

      {/* SKILL.md Preview panel (slide-in from right) */}
      {previewNode && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/20"
            onClick={() => setPreviewSkillId(null)}
          />
          <div className="w-full max-w-lg bg-[var(--card-color)] border-l border-[var(--border-default)] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
              <div>
                <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                  {previewNode.name}
                </p>
                <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                  SKILL.md preview
                </p>
              </div>
              <button
                onClick={() => setPreviewSkillId(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="px-5 py-4 text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
              {buildSkillMarkdown(previewNode)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
