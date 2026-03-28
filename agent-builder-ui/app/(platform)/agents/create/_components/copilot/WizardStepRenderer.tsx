"use client";

/**
 * WizardStepRenderer — renders the active wizard phase from the CoPilot store.
 *
 * Reuses existing step components (StepConnectTools, StepChooseSkills,
 * StepSetTriggers) with hideFooter=true and live change callbacks
 * that write back to the CoPilot store.
 */

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useCoPilotStore, PHASE_ORDER, type CoPilotPhase } from "@/lib/openclaw/copilot-state";
import {
  buildCoPilotReviewAgentSnapshot,
  buildCoPilotReviewData,
  countSkillAvailability,
  getSelectedUnresolvedSkillIds,
  hasPurposeMetadata,
  resolveCoPilotToolResearchUseCase,
} from "@/lib/openclaw/copilot-flow";
import { applyAcceptedImprovementsToConfig } from "@/app/(platform)/agents/create/create-session-config";
import { sendToArchitectStreaming } from "@/lib/openclaw/api";
import { buildSoulContent } from "@/lib/openclaw/agent-config";
import { StepChooseSkills } from "../configure/StepChooseSkills";
import { StepConfigureChannels } from "../configure/StepConfigureChannels";
import { StepConnectTools } from "../configure/StepConnectTools";
import { StepDiscovery } from "../configure/StepDiscovery";
import { StepRuntimeInputs } from "../configure/StepRuntimeInputs";
import { StepSetTriggers } from "../configure/StepSetTriggers";
import { buildSkillMarkdown } from "../../_config/generate-skills";
import {
  CheckCircle2, ChevronRight, Layers, Plug, Zap, FileText, Rocket, Lock, Hammer,
  MessageSquare, Radio, Bot, Loader2, Play,
} from "lucide-react";

const PHASE_META: Record<CoPilotPhase, { label: string; icon: typeof Layers }> = {
  purpose: { label: "Purpose", icon: FileText },
  discovery: { label: "Discovery", icon: MessageSquare },
  skills: { label: "Skills", icon: Layers },
  tools: { label: "Tools", icon: Plug },
  runtime_inputs: { label: "Runtime Inputs", icon: Zap },
  triggers: { label: "Triggers", icon: Zap },
  channels: { label: "Channels", icon: Radio },
  review: { label: "Review", icon: Rocket },
};

interface WizardStepRendererProps {
  embedded?: boolean;
  onComplete?: () => void;
  canComplete?: boolean;
  isCompleting?: boolean;
  completeLabel?: string;
  onDiscoveryComplete?: () => void;
}

interface TestChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
}

export function WizardStepRenderer({
  embedded = false,
  onComplete,
  canComplete = false,
  isCompleting = false,
  completeLabel = "Complete",
  onDiscoveryComplete,
}: WizardStepRendererProps) {
  const store = useCoPilotStore();
  const { phase } = store;
  const phaseIdx = PHASE_ORDER.indexOf(phase);
  const purposeReady = hasPurposeMetadata(store.name, store.description);
  const discoveryUnlocked = purposeReady;
  const stepsUnlocked = purposeReady && store.skillGenerationStatus === "ready" && (store.skillGraph?.length ?? 0) > 0;
  const unresolvedSelectedSkills = getSelectedUnresolvedSkillIds(
    store.selectedSkillIds,
    store.skillAvailability,
  );
  const nextDisabled = phase === "purpose"
    ? !discoveryUnlocked
    : phase === "discovery"
    ? !stepsUnlocked
    : phase === "review"
    ? true
    : false;
  const isReviewPhase = phase === "review";

  const noop = () => {};

  // ── Auto-populate Tools/Triggers/Channels from skill graph when entering each phase ──
  // Each phase populates its data locally from the skill graph — no LLM call needed.
  const autoPopulatedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!stepsUnlocked || !store.skillGraph) return;
    const key = `${phase}-${store.skillGraph.length}`;
    if (autoPopulatedRef.current.has(key)) return;
    autoPopulatedRef.current.add(key);

    if (phase === "tools" && store.connectedTools.length === 0) {
      // Auto-detect tools from skill graph external_api fields
      const { detectToolHintIds } = require("@/lib/openclaw/builder-hint-normalization");
      const toolIds: string[] = detectToolHintIds(store.skillGraph);
      if (toolIds.length > 0) {
        // Import tool catalog to build connection drafts
        const { buildConnectToolCatalog } = require("@/app/(platform)/agents/create/_components/configure/connect-tool-catalog");
        const catalog = buildConnectToolCatalog({
          skillGraph: store.skillGraph,
          agentUseCase: store.description,
          connections: [],
        });
        // Pre-select detected tools as connection drafts
        const drafts = catalog
          .filter((t: { id: string }) => toolIds.includes(t.id))
          .map((t: { id: string; name: string; description?: string }) => ({
            toolId: t.id,
            name: t.name,
            description: t.description || "",
            status: "available" as const,
            authKind: "none" as const,
            connectorType: "mcp" as const,
            configSummary: [],
          }));
        if (drafts.length > 0) {
          store.connectTools(drafts);
        }
      }
    }

    if (phase === "triggers" && store.triggers.length === 0) {
      // Auto-detect triggers from agent rules (schedule, webhook patterns)
      const rules = store.agentRules;
      const hasCron = rules.some((r) => /schedule|cron|daily|hourly|weekly/i.test(r));
      const hasWebhook = rules.some((r) => /webhook|http post/i.test(r));
      // Also check skill descriptions
      const skillText = store.skillGraph.map((n) => `${n.name} ${n.description ?? ""}`).join(" ").toLowerCase();
      const triggers: Array<{ id: string; title: string; kind: string; status: string; description: string; schedule?: string }> = [];
      if (hasCron || skillText.includes("schedule") || skillText.includes("daily") || skillText.includes("cron")) {
        triggers.push({ id: "cron-schedule", title: "Scheduled Run", kind: "schedule", status: "supported", description: "Runs on a cron schedule" });
      }
      if (hasWebhook || skillText.includes("webhook")) {
        triggers.push({ id: "webhook-post", title: "Webhook Trigger", kind: "webhook", status: "supported", description: "Triggered by incoming HTTP POST" });
      }
      if (triggers.length > 0) {
        store.setTriggers(triggers as never[]);
      }
    }

    if (phase === "channels" && store.channels.length === 0) {
      // Auto-detect channels from skill graph
      const { detectChannelHintIds } = require("@/lib/openclaw/builder-hint-normalization");
      const channelIds: string[] = detectChannelHintIds(store.skillGraph, { content: store.description } as never);
      if (channelIds.length > 0) {
        const { buildChannelSelections } = require("@/app/(platform)/agents/create/_components/configure/channel-catalog");
        store.setChannels(buildChannelSelections(new Set(channelIds)));
      }
    }
  }, [phase, stepsUnlocked, store]);

  return (
    <div
      data-testid={embedded ? "copilot-config-stepper" : undefined}
      className={`flex flex-col overflow-hidden ${
        embedded
          ? "min-h-[480px] rounded-[inherit] bg-[var(--card-color)]"
          : "h-full"
      }`}
    >
      {/* ── Stepper header ───────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 px-4 py-3 border-b border-[var(--border-default)] bg-[var(--card-color)] overflow-x-auto">
        {PHASE_ORDER.map((p, i) => {
          const meta = PHASE_META[p];
          const Icon = meta.icon;
          const isActive = p === phase;
          const isDone = i < phaseIdx;
          const isLocked = p === "discovery"
            ? !discoveryUnlocked
            : p !== "purpose" && !stepsUnlocked;

          return (
            <button
              key={p}
              onClick={() => {
                if (!isLocked) {
                  store.setPhase(p);
                }
              }}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-satoshi-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/30"
                  : isDone
                  ? "text-[var(--success)] bg-[var(--success)]/5"
                  : isLocked
                  ? "text-[var(--text-tertiary)]/50 cursor-not-allowed"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {isLocked ? (
                <Lock className="h-3 w-3" />
              ) : isDone ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              {meta.label}
              {i < PHASE_ORDER.length - 1 && (
                <ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]/30 ml-1" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Active step content ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Show building indicator for phases that need skill data but don't have it yet */}
        {phase !== "purpose" && phase !== "discovery" && phase !== "review" && !stepsUnlocked && (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-4">
              <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">
              Building your agent...
            </p>
            <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)] max-w-[240px] leading-relaxed">
              The architect is generating skills, tools, and configuration. This section will unlock when ready.
            </p>
          </div>
        )}

        {phase === "purpose" && (
          <PurposeStep />
        )}

        {phase === "discovery" && (
          <StepDiscovery
            questions={store.discoveryQuestions}
            answers={store.discoveryAnswers}
            documents={store.discoveryDocuments}
            status={store.discoveryStatus}
            onAnswer={(questionId, answer) => store.setDiscoveryAnswer(questionId, answer)}
            onDocSectionEdit={(docType, sectionIndex, content) =>
              store.updateDiscoveryDocSection(docType, sectionIndex, content)
            }
            onContinue={() => {
              onDiscoveryComplete?.();
              store.advancePhase();
            }}
            onSkip={() => {
              store.skipDiscovery();
              onDiscoveryComplete?.();
              store.advancePhase();
            }}
          />
        )}

        {phase === "skills" && stepsUnlocked && (
          <StepChooseSkills
            onContinue={(ids) => { store.selectSkills(ids); store.advancePhase(); }}
            onCancel={noop}
            onSkip={() => store.advancePhase()}
            stepLabel="Choose Skills"
            skillGraph={store.skillGraph}
            skillAvailability={store.skillAvailability}
            hideFooter
            initialSelected={store.selectedSkillIds}
            onSelectionChange={(ids) => store.selectSkills(ids)}
            onBuildSkill={(skillId) => {
              const node = store.skillGraph?.find((n) => n.skill_id === skillId);
              store.markSkillBuilt(skillId, node ? buildSkillMarkdown(node) : undefined);
            }}
          />
        )}

        {phase === "tools" && stepsUnlocked && (
          <StepConnectTools
            onContinue={(tools) => { store.connectTools(tools); store.advancePhase(); }}
            onCancel={noop}
            onSkip={() => store.advancePhase()}
            stepLabel="Connect Tools"
            skillGraph={store.skillGraph}
            hideFooter
            initialConnected={store.connectedTools}
            initialCredentialDrafts={store.credentialDrafts}
            onConnectionChange={(tools) => store.connectTools(tools)}
            onCredentialDraftChange={(drafts) => store.setCredentialDrafts(drafts)}
            agentUseCase={resolveCoPilotToolResearchUseCase(store.description)}
          />
        )}

        {phase === "runtime_inputs" && stepsUnlocked && (
          <StepRuntimeInputs
            runtimeInputs={store.runtimeInputs}
            onContinue={(runtimeInputs) => { store.setRuntimeInputs(runtimeInputs); store.advancePhase(); }}
            onCancel={noop}
            onSkip={() => store.advancePhase()}
            stepLabel="Runtime Inputs"
            onChange={(runtimeInputs) => store.setRuntimeInputs(runtimeInputs)}
            hideFooter
          />
        )}

        {phase === "triggers" && stepsUnlocked && (
          <StepSetTriggers
            onContinue={(triggers) => { store.setTriggers(triggers); store.advancePhase(); }}
            onCancel={noop}
            onSkip={() => store.advancePhase()}
            stepLabel="Set Triggers"
            agentRules={store.agentRules}
            initialSelected={store.triggers}
            hideFooter
            onSelectionChange={(triggers) => store.setTriggers(triggers)}
          />
        )}

        {phase === "channels" && stepsUnlocked && (
          <StepConfigureChannels
            initialSelected={store.channels}
            discoveryAnswers={store.discoveryAnswers}
            hideFooter
            onSelectionChange={(channels) => store.setChannels(channels)}
            onContinue={(channels) => { store.setChannels(channels); store.advancePhase(); }}
            onCancel={noop}
            onSkip={() => store.advancePhase()}
          />
        )}

        {phase === "review" && (
          <ReviewSummary />
        )}
      </div>

      {/* ── Phase navigation footer ──────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-[var(--border-default)] bg-[var(--card-color)]">
        <button
          onClick={() => store.goBackPhase()}
          disabled={phaseIdx === 0}
          className="px-4 py-2 text-xs font-satoshi-medium text-[var(--text-secondary)] border border-[var(--border-stroke)] rounded-lg hover:bg-[var(--color-light)] disabled:opacity-30 transition-colors"
        >
          Back
        </button>
        <div className="flex items-center gap-2">
          {/* Build & Next — only on skills phase when skills exist */}
          {phase === "skills" && (store.skillGraph?.length ?? 0) > 0 && (
            <button
              onClick={() => {
                store.buildAllSkills(buildSkillMarkdown);
                store.advancePhase();
              }}
              disabled={store.builtSkillIds.length === store.selectedSkillIds.length}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 disabled:opacity-30 transition-colors"
            >
              <Hammer className="h-3 w-3" />
              {store.builtSkillIds.length > 0 && store.builtSkillIds.length === store.selectedSkillIds.length
                ? "All Built"
                : "Build & Next"}
            </button>
          )}
          <button
            onClick={() => {
              if (isReviewPhase) {
                onComplete?.();
                return;
              }
              if (phase === "discovery") {
                onDiscoveryComplete?.();
              }
              store.advancePhase();
            }}
            disabled={isReviewPhase ? !onComplete || !canComplete || isCompleting : phaseIdx >= PHASE_ORDER.length - 1 || nextDisabled}
            className={`px-4 py-2 text-xs font-satoshi-bold rounded-lg transition-colors ${
              phase === "skills" && (store.skillGraph?.length ?? 0) > 0
                ? "text-[var(--text-secondary)] border border-[var(--border-stroke)] hover:bg-[var(--color-light)] disabled:opacity-30"
                : "text-white bg-[var(--primary)] hover:opacity-90 disabled:opacity-30"
            }`}
          >
            {isReviewPhase
              ? (isCompleting ? "Deploying…" : completeLabel)
              : phase === "purpose" && store.discoveryStatus === "loading"
              ? "Preparing questions…"
              : phase === "discovery" && store.skillGenerationStatus === "loading"
              ? "Generating skills…"
              : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Purpose Step (inline) ──────────────────────────────────────────────────

function PurposeStep() {
  const store = useCoPilotStore();
  const purposeReady = hasPurposeMetadata(store.name, store.description);
  const availabilityCounts = countSkillAvailability(store.skillAvailability);
  const unresolvedSelectedSkills = getSelectedUnresolvedSkillIds(
    store.selectedSkillIds,
    store.skillAvailability,
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">Agent Name</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          Give your agent a name. The architect will suggest one if you describe your use case in the chat.
        </p>
        <input
          type="text"
          value={store.name}
          onChange={(e) => store.updateFields({ name: e.target.value })}
          placeholder="e.g., Google Ads Manager"
          className="w-full px-3 py-2 text-sm border border-[var(--border-stroke)] rounded-lg bg-white focus:border-[var(--primary)]/40 outline-none transition-colors"
        />
      </div>

      <div>
        <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">Description</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          What should this agent do? Be as specific as you like — or just describe it in the chat.
        </p>
        <textarea
          value={store.description}
          onChange={(e) => store.updateFields({ description: e.target.value })}
          placeholder="e.g., Manages Google Ads campaigns, optimizes bids, and generates weekly performance reports..."
          rows={4}
          className="w-full px-3 py-2 text-sm border border-[var(--border-stroke)] rounded-lg bg-white focus:border-[var(--primary)]/40 outline-none transition-colors resize-none"
        />
      </div>

      {store.systemName && (
        <div className="px-3 py-2 rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/15">
          <p className="text-xs font-satoshi-medium text-[var(--primary)]">
            System name: <span className="font-mono">{store.systemName}</span>
          </p>
        </div>
      )}

      {!purposeReady && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">Purpose unlocks the rest of the builder</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            Add both a name and a description. The architect will then ask a few questions to understand what you need before generating skills.
          </p>
        </div>
      )}

      {purposeReady && store.discoveryStatus === "loading" && (
        <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--primary)]">Preparing discovery questions</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            The architect is analyzing your description to create tailored intake questions.
          </p>
        </div>
      )}

      {purposeReady && (store.discoveryStatus === "ready" || store.discoveryStatus === "skipped") && store.skillGenerationStatus !== "ready" && store.skillGenerationStatus !== "loading" && (
        <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--primary)]">Ready for discovery</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            Click Next to answer a few questions, or the architect will make reasonable assumptions.
          </p>
        </div>
      )}

      {store.skillGenerationStatus === "loading" && (
        <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--primary)]">Generating required skills</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            The architect is translating your requirements into skills and checking the registry.
          </p>
        </div>
      )}

      {store.skillGenerationStatus === "error" && store.skillGenerationError && (
        <div className="rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/10 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--error)]">Skill generation failed</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            {store.skillGenerationError}
          </p>
        </div>
      )}

      {purposeReady && store.skillGenerationStatus === "ready" && (
        <div className="rounded-xl border border-[var(--success)]/20 bg-[var(--success)]/10 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--success)]">Skills ready</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            {store.skillGraph?.length ?? 0} required skill{(store.skillGraph?.length ?? 0) === 1 ? "" : "s"} generated.
            {" "}
            {availabilityCounts.registry_match > 0 ? `${availabilityCounts.registry_match} matched the registry. ` : ""}
            {availabilityCounts.native > 0 ? `${availabilityCounts.native} are native capabilities. ` : ""}
            {availabilityCounts.custom_built > 0 ? `${availabilityCounts.custom_built} are already marked as custom-built. ` : ""}
            {unresolvedSelectedSkills.length > 0
              ? `${unresolvedSelectedSkills.length} still need a custom build before deploy.`
              : "Deploy is unblocked once you finish the rest of the flow."}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Review Summary (inline) ────────────────────────────────────────────────

function ReviewSummary() {
  const store = useCoPilotStore();
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [testMessages, setTestMessages] = useState<TestChatMessage[]>([]);
  const [testInput, setTestInput] = useState("");
  const [testStatus, setTestStatus] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testSessionId, setTestSessionId] = useState(() => uuidv4());
  const unresolvedSelectedSkills = getSelectedUnresolvedSkillIds(
    store.selectedSkillIds,
    store.skillAvailability,
  );
  const reviewData = buildCoPilotReviewData({
    selectedSkillIds: store.selectedSkillIds,
    totalSkillCount: store.skillGraph?.length ?? 0,
    agentRules: store.agentRules,
    runtimeInputs: store.runtimeInputs,
    connectedTools: store.connectedTools,
    triggers: store.triggers,
    channels: store.channels,
  });
  const readinessMessages: string[] = [];

  if (reviewData.toolItems.some((tool) => tool.status === "missing_secret")) {
    readinessMessages.push("Add credentials for every required connector before deploy.");
  }
  if (reviewData.toolItems.some((tool) => tool.status === "unsupported")) {
    readinessMessages.push("Replace or remove manual-setup tools before deploy.");
  }
  if (reviewData.runtimeInputItems.some((input) => input.required && input.statusLabel === "Missing value")) {
    readinessMessages.push("Fill every required runtime input before deploy.");
  }
  if (reviewData.triggerItems.some((trigger) => trigger.status === "unsupported")) {
    readinessMessages.push("Remove unsupported triggers or add at least one runtime-backed trigger.");
  }

  const reviewAgentSnapshot = buildCoPilotReviewAgentSnapshot({
    name: store.name,
    description: store.description,
    systemName: store.systemName,
    selectedSkillIds: store.selectedSkillIds,
    skillGraph: store.skillGraph,
    workflow: store.workflow,
    agentRules: store.agentRules,
    runtimeInputs: store.runtimeInputs,
    connectedTools: store.connectedTools,
    triggers: store.triggers,
    improvements: store.improvements,
  });
  const testAgentLabel = reviewAgentSnapshot.name || "New Agent";

  const closeTestPanel = () => {
    setTestPanelOpen(false);
    setTestMessages([]);
    setTestInput("");
    setTestStatus("");
    setTestError(null);
    setIsTesting(false);
    setTestSessionId(uuidv4());
  };

  const handleTestMessage = async () => {
    const message = testInput.trim();
    if (!message || isTesting) return;

    setTestMessages((current) => [
      ...current,
      { id: uuidv4(), role: "user", content: message },
    ]);
    setTestInput("");
    setIsTesting(true);
    setTestError(null);
    setTestStatus("Connecting to test agent...");

    try {
      const response = await sendToArchitectStreaming(
        testSessionId,
        message,
        {
          onStatus: (_phase, statusMessage) => {
            setTestStatus(statusMessage);
          },
        },
        {
          mode: "test",
          soulOverride: buildSoulContent(reviewAgentSnapshot),
        },
      );

      setTestMessages((current) => [
        ...current,
        {
          id: uuidv4(),
          role: "agent",
          content:
            response.content ||
            ("error" in response && typeof response.error === "string"
              ? response.error
              : "No response received."),
        },
      ]);
      setTestStatus("");
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unable to run test chat.";
      setTestError(messageText);
      setTestMessages((current) => [
        ...current,
        {
          id: uuidv4(),
          role: "agent",
          content: `Test chat failed: ${messageText}`,
        },
      ]);
      setTestStatus("");
      setTestSessionId(uuidv4());
    } finally {
      setIsTesting(false);
    }
  };

  // Derive env vars from skills + rules
  const skillEnvVars = store.skillGraph?.flatMap((n) => n.requires_env ?? []) ?? [];
  const ruleEnvVars = store.agentRules
    .filter((r) => r.toLowerCase().startsWith("requires env"))
    .flatMap((r) => r.replace(/requires env[:\s]*/i, "").split(",").map((s) => s.trim()).filter(Boolean));
  const allEnvVars = [...new Set([...skillEnvVars, ...ruleEnvVars])];

  return (
    <div className="p-6 space-y-5">
      <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Review Your Agent</h3>

      {/* ── Identity card ── */}
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center text-base shrink-0">
            {"🤖"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-satoshi-bold text-[var(--text-primary)] truncate">
              {store.name || store.systemName || "Unnamed Agent"}
            </p>
            {store.description && (
              <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] leading-snug line-clamp-2">
                {store.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Skills summary ── */}
      {store.skillGraph && store.skillGraph.length > 0 && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
          <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Skills ({store.selectedSkillIds.length} selected)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {store.skillGraph.filter((n) => store.selectedSkillIds.includes(n.skill_id)).map((node) => (
              <span key={node.skill_id} className="inline-flex items-center gap-1 text-[10px] font-satoshi-medium text-[var(--text-secondary)] bg-[var(--primary)]/8 border border-[var(--primary)]/15 px-2 py-0.5 rounded-full">
                {node.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Workflow summary ── */}
      {store.workflow && store.workflow.steps.length > 0 && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
          <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Workflow
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {store.workflow.steps.map((step, i) => (
              <span key={step.id ?? i} className="inline-flex items-center gap-1">
                <span className="text-[10px] font-satoshi-medium text-[var(--text-secondary)]">{step.skill}</span>
                {i < (store.workflow?.steps.length ?? 0) - 1 && (
                  <span className="text-[var(--text-tertiary)] text-[10px]">{"\u2192"}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Env variables ── */}
      {allEnvVars.length > 0 && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
          <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Environment Variables
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allEnvVars.map((v) => (
              <span key={v} className="inline-flex items-center text-[9px] font-mono text-[var(--text-secondary)] bg-[var(--border-default)]/40 border border-[var(--border-stroke)] px-1.5 py-0.5 rounded">
                {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {unresolvedSelectedSkills.length > 0 && (
        <div className="rounded-xl border border-[var(--warning)]/20 bg-[var(--warning)]/10 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--warning)]">
            Deploy is blocked until these skills are built or deselected: {unresolvedSelectedSkills.join(", ")}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3 space-y-3">
        <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
          Deploy readiness
        </p>
        <div className="space-y-1.5">
          <ReadinessItem
            ok={(store.skillGraph?.length ?? 0) > 0}
            label="Skills defined"
            detail={`${store.selectedSkillIds.length} of ${store.skillGraph?.length ?? 0} selected`}
          />
          <ReadinessItem
            ok={reviewData.toolItems.length > 0}
            label="Tools identified"
            detail={reviewData.toolItems.length > 0 ? `${reviewData.toolItems.length} tool${reviewData.toolItems.length !== 1 ? "s" : ""} — connection happens post-deploy` : "No tools needed"}
            variant={reviewData.toolItems.length === 0 ? "info" : undefined}
          />
          <ReadinessItem
            ok={!reviewData.runtimeInputItems.some((i) => i.required && i.statusLabel === "Missing value")}
            label="Runtime inputs"
            detail={reviewData.deploySummary.runtimeInputSummary}
            variant={reviewData.runtimeInputItems.some((i) => i.required && i.statusLabel === "Missing value") ? "warn" : undefined}
          />
          <ReadinessItem
            ok={store.triggers.length > 0}
            label="Trigger configured"
            detail={reviewData.deploySummary.triggerSummary}
            variant={store.triggers.length === 0 ? "info" : undefined}
          />
          <ReadinessItem
            ok={store.channels.length > 0}
            label={store.channels.length > 0 ? `${store.channels.length} channel${store.channels.length !== 1 ? "s" : ""} planned` : "No channels"}
            detail={store.channels.length > 0 ? "Setup after deploy" : "Web chat only"}
            variant="info"
          />
        </div>
        {readinessMessages.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-[var(--border-default)] pt-2">
            {readinessMessages.map((message) => (
              <p
                key={message}
                className="text-xs font-satoshi-regular text-[var(--text-tertiary)]"
              >
                {message}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <SummaryRow label="Name" value={store.name || store.systemName || "(not set)"} />
        <SummaryRow label="Description" value={store.description || "(not set)"} />
        <SummaryRow label="Skills" value={reviewData.skillSummary} />
        <SummaryRow label="Rules" value={reviewData.ruleSummary} />
      </div>

      <div>
        <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          Tool connections
        </p>
        {reviewData.toolItems.length === 0 ? (
          <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">No tools connected.</p>
        ) : (
          <div className="space-y-3">
            {reviewData.toolItems.map((tool) => (
              <div key={tool.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{tool.name}</p>
                    <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">{tool.description}</p>
                  </div>
                  <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    {tool.statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{tool.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          Runtime inputs
        </p>
        {reviewData.runtimeInputItems.length === 0 ? (
          <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">No runtime inputs required.</p>
        ) : (
          <div className="space-y-3">
            {reviewData.runtimeInputItems.map((input) => (
              <div key={input.key} className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{input.label}</p>
                    <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">{input.key}</p>
                  </div>
                  <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    {input.statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{input.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          Triggers
        </p>
        {reviewData.triggerItems.length === 0 ? (
          <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">No triggers set.</p>
        ) : (
          <div className="space-y-3">
            {reviewData.triggerItems.map((trigger) => (
              <div key={trigger.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{trigger.text}</p>
                    <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                      {trigger.kind}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    {trigger.statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{trigger.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          Channels
        </p>
        {store.channels.length === 0 ? (
          <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">Web chat only — no messaging channels selected.</p>
        ) : (
          <div className="space-y-3">
            {store.channels.map((channel) => (
              <div key={channel.kind} className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{channel.label}</p>
                    <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">{channel.description}</p>
                  </div>
                  <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    {channel.status === "planned" ? "Configure after deploy" : channel.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          Improvements
        </p>
        {store.improvements.length === 0 ? (
          <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">No builder improvements recorded.</p>
        ) : (
          <div className="space-y-3">
            {store.improvements.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{item.title}</p>
                  <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">{item.summary}</p>
                <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{item.rationale}</p>
                <div className="mt-3 flex items-center gap-2">
                  {(["accepted", "dismissed"] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        const nextImprovements = store.improvements.map((entry) => (
                          entry.id === item.id ? { ...entry, status } : entry
                        ));

                        store.setImprovements(nextImprovements);

                        if (status === "accepted") {
                          const projected = applyAcceptedImprovementsToConfig({
                            toolConnections: store.connectedTools,
                            improvements: nextImprovements,
                          });
                          store.connectTools(projected.toolConnections);
                        }
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-satoshi-medium transition-colors ${
                        item.status === status
                          ? "bg-[var(--primary)] text-white"
                          : "border border-[var(--border-stroke)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {status === "accepted" ? "Accept" : "Dismiss"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <Bot className="h-4 w-4" />
              <span className="text-base font-satoshi-bold">Test Agent</span>
            </div>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
              Run a quick review chat as {testAgentLabel} before deployment. Test messages use an isolated builder session and do not change the main architect history.
            </p>
          </div>
          <button
            onClick={() => {
              if (testPanelOpen) {
                closeTestPanel();
                return;
              }

              setTestPanelOpen(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border-stroke)] px-4 text-sm font-satoshi-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--color-light)]"
          >
            <Play className="h-4 w-4" />
            {testPanelOpen ? "Close Test Panel" : "Test Agent"}
          </button>
        </div>

        {testPanelOpen && (
          <div className="mt-5 space-y-4 border-t border-[var(--border-default)] pt-5">
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--background-muted)] p-4">
              <p className="text-xs font-satoshi-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Testing as {testAgentLabel}
              </p>
              <div className="mt-3 max-h-72 space-y-3 overflow-y-auto">
                {testMessages.length === 0 ? (
                  <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                    Ask a sample question to verify the current agent draft before you deploy it.
                  </p>
                ) : (
                  testMessages.map((entry) => (
                    <div
                      key={entry.id}
                      className={`rounded-2xl px-4 py-3 text-sm ${
                        entry.role === "user"
                          ? "bg-[var(--primary)] text-white"
                          : "border border-[var(--border-default)] bg-[var(--card-color)] text-[var(--text-primary)]"
                      }`}
                    >
                      {entry.content}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="copilot-review-test-input"
                className="text-sm font-satoshi-medium text-[var(--text-primary)]"
              >
                Test prompt
              </label>
              <textarea
                id="copilot-review-test-input"
                value={testInput}
                onChange={(event) => setTestInput(event.target.value)}
                placeholder="Ask what this agent can do, or give it a sample task."
                className="min-h-24 w-full rounded-2xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
              />
            </div>

            {(testStatus || testError) && (
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                {testStatus && (
                  <div className="flex items-center gap-2">
                    {isTesting && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{testStatus}</span>
                  </div>
                )}
                {!testStatus && testError && <span>{testError}</span>}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={closeTestPanel}
                className="inline-flex h-10 items-center rounded-lg border border-[var(--border-stroke)] px-4 text-sm font-satoshi-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-light)]"
              >
                Reset
              </button>
              <button
                onClick={handleTestMessage}
                disabled={isTesting || !testInput.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-satoshi-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isTesting && <Loader2 className="h-4 w-4 animate-spin" />}
                Send Test Message
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadinessItem({
  ok,
  label,
  detail,
  variant,
}: {
  ok: boolean;
  label: string;
  detail: string;
  variant?: "info" | "warn";
}) {
  const icon = ok
    ? "text-[var(--success)]"
    : variant === "warn"
    ? "text-[var(--warning)]"
    : "text-[var(--text-tertiary)]";
  const symbol = ok ? "\u2713" : variant === "warn" ? "\u26A0" : "\u2139";

  return (
    <div className="flex items-start gap-2">
      <span className={`text-xs font-satoshi-bold mt-0.5 w-4 text-center shrink-0 ${icon}`}>
        {symbol}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">{label}</span>
        <span className="text-xs font-satoshi-regular text-[var(--text-tertiary)] ml-1.5">{detail}</span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-sm font-satoshi-regular text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
