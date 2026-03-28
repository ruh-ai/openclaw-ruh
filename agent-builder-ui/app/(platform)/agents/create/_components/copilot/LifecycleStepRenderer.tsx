"use client";

/**
 * LifecycleStepRenderer — renders the 7-stage agent development lifecycle.
 *
 * Think → Plan → Build → Review → Test → Ship → Reflect
 *
 * Each stage has a hard gate — user must approve before advancing.
 * Replaces the old WizardStepRenderer for the copilot mode.
 */

import { useState, useEffect, useRef } from "react";
import { useCoPilotStore, type CoPilotState, type CoPilotActions } from "@/lib/openclaw/copilot-state";
import { AGENT_DEV_STAGES, type AgentDevStage } from "@/lib/openclaw/types";
import {
  Lightbulb,
  Map,
  Hammer,
  ClipboardCheck,
  FlaskConical,
  Rocket,
  BookOpen,
  ChevronRight,
  Lock,
  CheckCircle2,
  Loader2,
  Zap,
  GitBranch,
  Wrench,
  Clock,
  MessageSquare,
  Key,
  Bot,
  Pencil,
  AlertTriangle,
  Play,
  RotateCcw,
  Timer,
  XCircle,
  Github,
  Save,
  ExternalLink,
  Database,
  ArrowRight,
} from "lucide-react";
import type {
  ArchitecturePlan,
  ArchitecturePlanSkill,
  ArchitecturePlanIntegration,
  ArchitecturePlanTrigger,
  ArchitecturePlanEnvVar,
  EvalTask,
  EvalTaskStatus,
  SkillGraphNode,
} from "@/lib/openclaw/types";
import { StepDiscovery } from "../configure/StepDiscovery";

const STAGE_META: Record<AgentDevStage, { label: string; icon: typeof Lightbulb; description: string }> = {
  think: { label: "Think", icon: Lightbulb, description: "Define requirements (PRD + TRD)" },
  plan: { label: "Plan", icon: Map, description: "Lock architecture" },
  build: { label: "Build", icon: Hammer, description: "Create skills & config" },
  review: { label: "Review", icon: ClipboardCheck, description: "Inspect configuration" },
  test: { label: "Test", icon: FlaskConical, description: "Run evaluations" },
  ship: { label: "Ship", icon: Rocket, description: "Deploy agent" },
  reflect: { label: "Reflect", icon: BookOpen, description: "Build summary" },
};

// ─── Elapsed timer for async waits ──────────────────────────────────────────

function useElapsedTime(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      startRef.current = Date.now();
      return;
    }
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  return elapsed;
}

function ElapsedTimer({ active, estimate }: { active: boolean; estimate: string }) {
  const elapsed = useElapsedTime(active);
  if (!active) return null;
  return (
    <p className="mt-2 text-[10px] font-mono text-[var(--text-tertiary)]">
      {elapsed}s elapsed — {estimate}
    </p>
  );
}

// ─── Stage-aware placeholder text ───────────────────────────────────────────

export function getStageInputPlaceholder(devStage: string | undefined, isBuilderMode: boolean, agentName: string): string {
  if (!isBuilderMode) return `Message ${agentName}…`;
  switch (devStage) {
    case "think": return "Describe what your agent should do...";
    case "plan": return "Waiting for architecture plan...";
    case "build": return "Build in progress — you can refine requirements here...";
    case "review": return "Ask the architect to modify skills, tools, or triggers...";
    case "test": return "Review test results or ask questions...";
    case "ship": return "Ready to deploy. Click Deploy Agent to proceed.";
    case "reflect": return "Review the build summary.";
    default: return "Describe your agent idea…";
  }
}

interface LifecycleStepRendererProps {
  embedded?: boolean;
  onComplete?: () => void;
  canComplete?: boolean;
  isCompleting?: boolean;
  onDiscoveryComplete?: () => void;
  onPlanApproved?: () => void;
  onRetryBuild?: () => void;
  onDone?: () => void;
}

export function LifecycleStepRenderer({
  embedded = false,
  onComplete,
  canComplete = false,
  isCompleting = false,
  onDiscoveryComplete,
  onPlanApproved,
  onRetryBuild,
  onDone,
}: LifecycleStepRendererProps) {
  const store = useCoPilotStore();
  const { devStage } = store;

  const stageIdx = AGENT_DEV_STAGES.indexOf(devStage);

  // Determine which stages are unlocked
  const isStageUnlocked = (stage: AgentDevStage): boolean => {
    const idx = AGENT_DEV_STAGES.indexOf(stage);
    if (idx === 0) return true; // Think always unlocked
    if (idx <= stageIdx) return true; // Current and past stages
    // Future stages locked unless previous stage is approved
    return false;
  };

  const isStageActive = (stage: AgentDevStage) => stage === devStage;

  const isStageDone = (stage: AgentDevStage): boolean => {
    const idx = AGENT_DEV_STAGES.indexOf(stage);
    return idx < stageIdx;
  };

  const isStageLoading = (stage: AgentDevStage): boolean => {
    switch (stage) {
      case "think": return store.thinkStatus === "generating";
      case "plan": return store.planStatus === "generating";
      case "build": return store.buildStatus === "building";
      case "test": return store.evalStatus === "running";
      case "ship": return store.deployStatus === "running";
      default: return false;
    }
  };

  const anyStageLoading = AGENT_DEV_STAGES.some((s) => isStageLoading(s));

  return (
    <div
      className={`flex flex-col overflow-hidden ${
        embedded
          ? "min-h-[480px] rounded-[inherit] bg-[var(--card-color)]"
          : "h-full"
      }`}
    >
      {/* ── Stage stepper header ──────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-0.5 px-3 py-2.5 border-b border-[var(--border-default)] bg-[var(--card-color)] overflow-x-auto">
        {AGENT_DEV_STAGES.map((stage, i) => {
          const meta = STAGE_META[stage];
          const Icon = meta.icon;
          const active = isStageActive(stage);
          const done = isStageDone(stage);
          const locked = !isStageUnlocked(stage);
          const loading = isStageLoading(stage);

          return (
            <button
              key={stage}
              onClick={() => {
                if (!locked && !anyStageLoading) store.setDevStage(stage);
              }}
              disabled={locked || anyStageLoading}
              title={meta.description}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-satoshi-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/30"
                  : done
                  ? "text-[var(--success)] bg-[var(--success)]/5"
                  : locked
                  ? "text-[var(--text-tertiary)]/40 cursor-not-allowed"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : locked ? (
                <Lock className="h-3 w-3" />
              ) : done ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              {meta.label}
              {i < AGENT_DEV_STAGES.length - 1 && (
                <ChevronRight className="h-2.5 w-2.5 text-[var(--text-tertiary)]/30 ml-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Stage content ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {devStage === "think" && (
          <StageThinkPlaceholder
            store={store}
            onDiscoveryComplete={onDiscoveryComplete}
          />
        )}
        {devStage === "plan" && (
          <StagePlan
            store={store}
            onPlanApproved={onPlanApproved}
          />
        )}
        {devStage === "build" && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Building Agent</h3>
              <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)] leading-relaxed">
                The architect is creating SOUL.md, skill files, and configuration. Watch the terminal for progress.
              </p>
            </div>

            {store.buildStatus === "building" && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-4">
                  <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />
                </div>
                <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                  Generating skills and configuration...
                </p>
                <ElapsedTimer active estimate="usually takes 10–30 seconds" />
              </div>
            )}

            {store.buildStatus === "done" && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 rounded-2xl bg-[var(--success)]/8 border border-[var(--success)]/15 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
                </div>
                <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                  Build complete. Advancing to review...
                </p>
                {store.skillGraph && store.skillGraph.length > 0 && (
                  <p className="mt-1 text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
                    {store.skillGraph.length} skill{store.skillGraph.length !== 1 ? "s" : ""} created
                    {store.connectedTools.length > 0 && ` · ${store.connectedTools.length} integration${store.connectedTools.length !== 1 ? "s" : ""}`}
                    {store.triggers.length > 0 && ` · ${store.triggers.length} trigger${store.triggers.length !== 1 ? "s" : ""}`}
                  </p>
                )}
              </div>
            )}

            {store.buildStatus === "failed" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-satoshi-medium text-red-600">Build failed</p>
                      {store.skillGenerationError && (
                        <p className="mt-1 text-[10px] text-red-500/80">{store.skillGenerationError}</p>
                      )}
                    </div>
                  </div>
                </div>
                {onRetryBuild && (
                  <div className="flex justify-end">
                    <button
                      onClick={onRetryBuild}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry Build
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {devStage === "review" && (
          <StageReview
            store={store}
            onApprove={() => store.advanceDevStage()}
          />
        )}
        {devStage === "test" && (
          <StageTest
            store={store}
            onApprove={() => store.advanceDevStage()}
          />
        )}
        {devStage === "ship" && (
          <StageShip
            store={store}
            onComplete={onComplete}
            isCompleting={isCompleting}
          />
        )}
        {devStage === "reflect" && (
          <StageReflect store={store} onDone={onDone} />
        )}
      </div>

      {/* ── Footer navigation ────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-[var(--border-default)] bg-[var(--card-color)]">
        <button
          onClick={() => store.goBackDevStage()}
          disabled={stageIdx === 0}
          className="px-3 py-1.5 text-xs font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] disabled:opacity-30 transition-colors"
        >
          Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)]">
            {stageIdx + 1} / {AGENT_DEV_STAGES.length}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Think stage (wraps existing StepDiscovery) ─────────────────────────────

function StageThinkPlaceholder({
  store,
  onDiscoveryComplete,
}: {
  store: CoPilotState & CoPilotActions;
  onDiscoveryComplete?: () => void;
}) {
  // Map thinkStatus to discoveryStatus for StepDiscovery compatibility.
  // If thinkStatus is "generating", show loading. If "ready", show documents.
  const effectiveStatus = store.thinkStatus === "generating" ? "loading" as const
    : store.discoveryDocuments ? "ready" as const
    : store.discoveryStatus;

  return (
    <StepDiscovery
      questions={store.discoveryQuestions}
      answers={store.discoveryAnswers}
      documents={store.discoveryDocuments}
      status={effectiveStatus}
      onAnswer={(questionId: string, answer: string | string[]) =>
        store.setDiscoveryAnswer(questionId, answer)
      }
      onDocSectionEdit={(docType: "prd" | "trd", sectionIndex: number, content: string) =>
        store.updateDiscoveryDocSection(docType, sectionIndex, content)
      }
      onContinue={() => {
        store.setThinkStatus("approved");
        onDiscoveryComplete?.();
      }}
      onSkip={() => {
        store.skipDiscovery();
        store.setThinkStatus("approved");
        onDiscoveryComplete?.();
      }}
    />
  );
}

// ─── Plan stage — displays the architecture plan for review/editing ──────────

function StagePlan({
  store,
  onPlanApproved,
}: {
  store: CoPilotState & CoPilotActions;
  onPlanApproved?: () => void;
}) {
  const plan = store.architecturePlan;
  const status = store.planStatus;

  // Waiting for architect to generate the plan
  const planLoading = status === "generating" || (status === "idle" && !plan);
  if (planLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-4">
          <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />
        </div>
        <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
          Generating architecture plan...
        </p>
        <p className="mt-1 text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
          The architect is designing skills, integrations, and triggers from your requirements.
        </p>
        <ElapsedTimer active estimate="usually takes 20–60 seconds" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6">
        <p className="text-xs text-[var(--text-tertiary)]">No architecture plan available yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Skills */}
      <PlanSection
        icon={<Zap className="h-3.5 w-3.5" />}
        title="Skills"
        count={plan.skills.length}
      >
        <div className="space-y-2">
          {plan.skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      </PlanSection>

      {/* Workflow */}
      {plan.workflow.steps.length > 0 && (
        <PlanSection
          icon={<GitBranch className="h-3.5 w-3.5" />}
          title="Workflow"
          count={plan.workflow.steps.length}
        >
          <div className="flex flex-wrap gap-1.5">
            {plan.workflow.steps.map((step, i) => (
              <div
                key={i}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-satoshi-medium border ${
                  step.parallel
                    ? "bg-amber-500/5 border-amber-500/20 text-amber-600"
                    : "bg-[var(--card-color)] border-[var(--border-default)] text-[var(--text-secondary)]"
                }`}
              >
                {step.parallel && <span className="text-amber-500">∥</span>}
                {step.skillId}
                {i < plan.workflow.steps.length - 1 && !step.parallel && (
                  <ChevronRight className="h-2.5 w-2.5 text-[var(--text-tertiary)]/40" />
                )}
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* Integrations */}
      {plan.integrations.length > 0 && (
        <PlanSection
          icon={<Wrench className="h-3.5 w-3.5" />}
          title="Integrations"
          count={plan.integrations.length}
        >
          <div className="space-y-1.5">
            {plan.integrations.map((intg) => (
              <div
                key={intg.toolId}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                    {intg.name}
                  </span>
                  <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                    {intg.method}
                  </span>
                </div>
                {intg.envVars.length > 0 && (
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {intg.envVars.length} env var{intg.envVars.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* Triggers */}
      {plan.triggers.length > 0 && (
        <PlanSection
          icon={<Clock className="h-3.5 w-3.5" />}
          title="Triggers"
          count={plan.triggers.length}
        >
          <div className="space-y-1.5">
            {plan.triggers.map((trigger) => (
              <div
                key={trigger.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div>
                  <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                    {trigger.description}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                      {trigger.type}
                    </span>
                    <code className="text-[10px] text-[var(--text-tertiary)]">
                      {trigger.config}
                    </code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* Channels */}
      {plan.channels.length > 0 && (
        <PlanSection
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          title="Channels"
          count={plan.channels.length}
        >
          <div className="flex flex-wrap gap-1.5">
            {plan.channels.map((ch) => (
              <span
                key={ch}
                className="px-2 py-1 rounded-md text-[10px] font-satoshi-medium bg-[var(--card-color)] border border-[var(--border-default)] text-[var(--text-secondary)]"
              >
                {ch}
              </span>
            ))}
          </div>
        </PlanSection>
      )}

      {/* Env Vars */}
      {plan.envVars.length > 0 && (
        <PlanSection
          icon={<Key className="h-3.5 w-3.5" />}
          title="Environment Variables"
          count={plan.envVars.length}
        >
          <div className="space-y-1">
            {plan.envVars.map((ev) => (
              <div
                key={ev.key}
                className="flex items-start justify-between px-3 py-1.5 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div>
                  <code className="text-[10px] font-mono font-medium text-[var(--text-primary)]">
                    {ev.key}
                  </code>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                    {ev.description}
                  </p>
                </div>
                {ev.required && (
                  <span className="text-[10px] text-red-400 font-satoshi-medium shrink-0 ml-2">
                    required
                  </span>
                )}
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* Sub-agents */}
      {plan.subAgents.length > 0 && (
        <PlanSection
          icon={<Bot className="h-3.5 w-3.5" />}
          title="Sub-Agents"
          count={plan.subAgents.length}
        >
          <div className="space-y-1.5">
            {plan.subAgents.map((sa) => (
              <div
                key={sa.id}
                className="px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                    {sa.name}
                  </span>
                  <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                    {sa.type}
                  </span>
                  <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                    {(sa.autonomy ?? "").replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{sa.description}</p>
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* Action bar */}
      {status === "ready" && (
        <div className="pt-2 space-y-3">
          <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
            <p className="text-xs font-satoshi-medium text-[var(--primary)]">
              Architecture plan ready. Review the sections above, then approve to start building skills.
            </p>
            <p className="mt-1 text-[10px] text-[var(--primary)]/70">
              Skills will be generated from this plan. You can iterate on them in the Review stage.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => onPlanApproved?.()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" />
              Approve & Start Build
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plan section wrapper ────────────────────────────────────────────────────

function PlanSection({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-default)]">
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        <span className="text-xs font-satoshi-bold text-[var(--text-primary)]">{title}</span>
        <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// ─── Skill card ──────────────────────────────────────────────────────────────

function SkillCard({ skill }: { skill: ArchitecturePlanSkill }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]">
      <div className="flex items-center gap-2">
        <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
          {skill.name}
        </span>
        {skill.toolType && (
          <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
            {skill.toolType}
          </span>
        )}
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
        {skill.description}
      </p>
      {skill.dependencies.length > 0 && (
        <div className="flex items-center gap-1 mt-1.5">
          <span className="text-[9px] text-[var(--text-tertiary)]">depends on:</span>
          {skill.dependencies.map((dep) => (
            <span
              key={dep}
              className="text-[9px] font-mono text-[var(--primary)] bg-[var(--primary)]/5 px-1 py-0.5 rounded"
            >
              {dep}
            </span>
          ))}
        </div>
      )}
      {skill.envVars.length > 0 && (
        <div className="flex items-center gap-1 mt-1">
          <Key className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />
          {skill.envVars.map((ev) => (
            <code key={ev} className="text-[9px] font-mono text-[var(--text-tertiary)]">
              {ev}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Review stage — inspect the full built configuration ────────────────────

function StageReview({
  store,
  onApprove,
}: {
  store: CoPilotState & CoPilotActions;
  onApprove: () => void;
}) {
  const plan = store.architecturePlan;
  const skillGraph = store.skillGraph;
  const builtSkillIds = store.builtSkillIds;
  const connectedTools = store.connectedTools;
  const triggers = store.triggers;
  const channels = store.channels;
  const runtimeInputs = store.runtimeInputs;
  const agentRules = store.agentRules;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (section: string) =>
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));

  // Merge plan data with runtime data from configure steps
  const skills = plan?.skills ?? [];
  const integrations = plan?.integrations ?? [];
  const planTriggers = plan?.triggers ?? [];
  const envVars = plan?.envVars ?? [];
  const subAgents = plan?.subAgents ?? [];
  const workflow = plan?.workflow;
  const planChannels = plan?.channels ?? [];

  // Count built vs total skills
  const totalSkills = skillGraph?.length ?? skills.length;
  const builtCount = builtSkillIds.length;

  // Merge trigger sources: plan triggers + runtime trigger selections
  const allTriggerIds = new Set([
    ...planTriggers.map((t) => t.id),
    ...triggers.map((t) => t.id),
  ]);

  const hasContent = skills.length > 0 || (skillGraph && skillGraph.length > 0);

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/8 border border-amber-500/15 flex items-center justify-center mb-4">
          <ClipboardCheck className="h-5 w-5 text-amber-500" />
        </div>
        <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
          No configuration to review yet
        </p>
        <p className="mt-1 text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
          Complete the Build stage first to populate the review.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Agent Identity */}
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)] truncate">
              {store.name || "Unnamed Agent"}
            </h3>
            <p className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] truncate">
              {store.description || "No description"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-satoshi-medium text-[var(--success)] bg-[var(--success)]/10 px-2 py-0.5 rounded-full">
              {builtCount}/{totalSkills} skills built
            </span>
          </div>
        </div>
      </div>

      {/* Skills */}
      <ReviewSection
        icon={<Zap className="h-3.5 w-3.5" />}
        title="Skills"
        count={totalSkills}
        badge={builtCount === totalSkills ? "All built" : `${builtCount} built`}
        badgeColor={builtCount === totalSkills ? "success" : "warning"}
        expanded={expanded.skills !== false}
        onToggle={() => toggle("skills")}
      >
        <div className="space-y-1.5">
          {(skillGraph ?? skills.map((s) => ({ skill_id: s.id, name: s.name, description: s.description } as SkillGraphNode))).map((node) => {
            const planSkill = skills.find((s) => s.id === node.skill_id);
            const isBuilt = builtSkillIds.includes(node.skill_id);
            return (
              <div
                key={node.skill_id}
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div className="mt-0.5">
                  {isBuilt ? (
                    <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                  ) : (
                    <Clock className="h-3 w-3 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                      {node.name}
                    </span>
                    {planSkill?.toolType && (
                      <span className="text-[9px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                        {planSkill.toolType}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                    {node.description ?? planSkill?.description}
                  </p>
                  {planSkill?.envVars && planSkill.envVars.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <Key className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />
                      {planSkill.envVars.map((ev) => (
                        <code key={ev} className="text-[9px] font-mono text-[var(--text-tertiary)]">
                          {ev}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ReviewSection>

      {/* Workflow */}
      {workflow && workflow.steps.length > 0 && (
        <ReviewSection
          icon={<GitBranch className="h-3.5 w-3.5" />}
          title="Workflow"
          count={workflow.steps.length}
          expanded={expanded.workflow !== false}
          onToggle={() => toggle("workflow")}
        >
          <div className="flex flex-wrap gap-1.5">
            {workflow.steps.map((step, i) => (
              <div
                key={i}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-satoshi-medium border ${
                  step.parallel
                    ? "bg-amber-500/5 border-amber-500/20 text-amber-600"
                    : "bg-[var(--card-color)] border-[var(--border-default)] text-[var(--text-secondary)]"
                }`}
              >
                {step.parallel && <span className="text-amber-500">∥</span>}
                {step.skillId}
                {i < workflow.steps.length - 1 && !step.parallel && (
                  <ChevronRight className="h-2.5 w-2.5 text-[var(--text-tertiary)]/40" />
                )}
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      {/* Integrations / Connected Tools */}
      {(integrations.length > 0 || connectedTools.length > 0) && (
        <ReviewSection
          icon={<Wrench className="h-3.5 w-3.5" />}
          title="Integrations"
          count={integrations.length || connectedTools.length}
          expanded={expanded.integrations !== false}
          onToggle={() => toggle("integrations")}
        >
          <div className="space-y-1.5">
            {integrations.map((intg) => {
              const connected = connectedTools.find((t) => t.toolId === intg.toolId);
              return (
                <div
                  key={intg.toolId}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                      {intg.name}
                    </span>
                    <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                      {intg.method}
                    </span>
                    {connected && (
                      <span className={`text-[9px] font-satoshi-medium px-1.5 py-0.5 rounded ${
                        connected.status === "configured"
                          ? "text-[var(--success)] bg-[var(--success)]/10"
                          : connected.status === "missing_secret"
                          ? "text-amber-500 bg-amber-500/10"
                          : "text-[var(--text-tertiary)] bg-[var(--bg-subtle)]"
                      }`}>
                        {connected.status === "configured" ? "Connected" : connected.status === "missing_secret" ? "Needs credentials" : connected.status}
                      </span>
                    )}
                  </div>
                  {intg.envVars.length > 0 && (
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {intg.envVars.length} env var{intg.envVars.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              );
            })}
            {/* Show connected tools not in the plan */}
            {connectedTools
              .filter((t) => !integrations.some((intg) => intg.toolId === t.toolId))
              .map((tool) => (
                <div
                  key={tool.toolId}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                      {tool.name ?? tool.toolId}
                    </span>
                    <span className={`text-[9px] font-satoshi-medium px-1.5 py-0.5 rounded ${
                      tool.status === "configured"
                        ? "text-[var(--success)] bg-[var(--success)]/10"
                        : "text-amber-500 bg-amber-500/10"
                    }`}>
                      {tool.status === "configured" ? "Connected" : tool.status}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </ReviewSection>
      )}

      {/* Triggers */}
      {(planTriggers.length > 0 || triggers.length > 0) && (
        <ReviewSection
          icon={<Clock className="h-3.5 w-3.5" />}
          title="Triggers"
          count={allTriggerIds.size}
          expanded={expanded.triggers !== false}
          onToggle={() => toggle("triggers")}
        >
          <div className="space-y-1.5">
            {planTriggers.map((trigger) => (
              <div
                key={trigger.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div>
                  <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                    {trigger.description}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                      {trigger.type}
                    </span>
                    <code className="text-[10px] text-[var(--text-tertiary)]">
                      {trigger.config}
                    </code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      {/* Channels */}
      {(planChannels.length > 0 || channels.length > 0) && (
        <ReviewSection
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          title="Channels"
          count={planChannels.length || channels.length}
          expanded={expanded.channels !== false}
          onToggle={() => toggle("channels")}
        >
          <div className="flex flex-wrap gap-1.5">
            {(planChannels.length > 0 ? planChannels : channels.map((ch) => ch.label || ch.kind)).map((ch) => (
              <span
                key={typeof ch === "string" ? ch : ch}
                className="px-2 py-1 rounded-md text-[10px] font-satoshi-medium bg-[var(--card-color)] border border-[var(--border-default)] text-[var(--text-secondary)]"
              >
                {typeof ch === "string" ? ch : ch}
              </span>
            ))}
          </div>
        </ReviewSection>
      )}

      {/* Environment Variables */}
      {envVars.length > 0 && (
        <ReviewSection
          icon={<Key className="h-3.5 w-3.5" />}
          title="Environment Variables"
          count={envVars.length}
          expanded={expanded.envVars !== false}
          onToggle={() => toggle("envVars")}
        >
          <div className="space-y-1">
            {envVars.map((ev) => (
              <div
                key={ev.key}
                className="flex items-start justify-between px-3 py-1.5 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div>
                  <code className="text-[10px] font-mono font-medium text-[var(--text-primary)]">
                    {ev.key}
                  </code>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                    {ev.description}
                  </p>
                </div>
                {ev.required && (
                  <span className="text-[10px] text-red-400 font-satoshi-medium shrink-0 ml-2">
                    required
                  </span>
                )}
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      {/* Sub-Agents */}
      {subAgents.length > 0 && (
        <ReviewSection
          icon={<Bot className="h-3.5 w-3.5" />}
          title="Sub-Agents"
          count={subAgents.length}
          expanded={expanded.subAgents !== false}
          onToggle={() => toggle("subAgents")}
        >
          <div className="space-y-1.5">
            {subAgents.map((sa) => (
              <div
                key={sa.id}
                className="px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                    {sa.name}
                  </span>
                  <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                    {sa.type}
                  </span>
                  <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                    {(sa.autonomy ?? "").replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{sa.description}</p>
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      {/* Agent Rules */}
      {agentRules.length > 0 && (
        <ReviewSection
          icon={<Pencil className="h-3.5 w-3.5" />}
          title="Agent Rules"
          count={agentRules.length}
          expanded={expanded.rules ?? false}
          onToggle={() => toggle("rules")}
        >
          <div className="space-y-1">
            {agentRules.map((rule, i) => (
              <div
                key={i}
                className="px-3 py-1.5 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                  {rule}
                </p>
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      {/* Runtime Inputs */}
      {runtimeInputs.length > 0 && (
        <ReviewSection
          icon={<Key className="h-3.5 w-3.5" />}
          title="Runtime Inputs"
          count={runtimeInputs.length}
          expanded={expanded.runtimeInputs ?? false}
          onToggle={() => toggle("runtimeInputs")}
        >
          <div className="space-y-1">
            {runtimeInputs.map((input) => (
              <div
                key={input.key}
                className="flex items-start justify-between px-3 py-1.5 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div>
                  <code className="text-[10px] font-mono font-medium text-[var(--text-primary)]">
                    {input.key}
                  </code>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                    {input.label}
                  </p>
                </div>
                {input.required && (
                  <span className="text-[10px] text-red-400 font-satoshi-medium shrink-0 ml-2">
                    required
                  </span>
                )}
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      {/* Approve action */}
      <div className="pt-2 space-y-3">
        <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
          <p className="text-xs font-satoshi-medium text-[var(--primary)]">
            Configuration ready for review. Inspect all sections above, then approve to proceed to testing.
          </p>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
          >
            <CheckCircle2 className="h-3 w-3" />
            Approve Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Test stage — eval task runner ─────────────────────────────────────────

const EVAL_STATUS_CONFIG: Record<EvalTaskStatus, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  pending: { icon: Clock, color: "text-[var(--text-tertiary)]", bg: "bg-[var(--bg-subtle)]", label: "Pending" },
  running: { icon: Loader2, color: "text-[var(--primary)]", bg: "bg-[var(--primary)]/10", label: "Running" },
  pass: { icon: CheckCircle2, color: "text-[var(--success)]", bg: "bg-[var(--success)]/10", label: "Pass" },
  fail: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Fail" },
  manual: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10", label: "Manual" },
};

function StageTest({
  store,
  onApprove,
}: {
  store: CoPilotState & CoPilotActions;
  onApprove: () => void;
}) {
  const { evalTasks, evalStatus, skillGraph, agentRules, sessionId, workflow, discoveryDocuments, architecturePlan } = store;
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [generating, setGenerating] = useState<"quick" | "ai" | null>(null);

  const passCount = evalTasks.filter((t) => t.status === "pass").length;
  const failCount = evalTasks.filter((t) => t.status === "fail").length;
  const pendingCount = evalTasks.filter((t) => t.status === "pending").length;
  const runningCount = evalTasks.filter((t) => t.status === "running").length;
  const manualCount = evalTasks.filter((t) => t.status === "manual").length;
  const totalCount = evalTasks.length;
  const allDone = totalCount > 0 && pendingCount === 0 && runningCount === 0;
  const hasFailures = failCount > 0;

  // Cleanup abort controller on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleGenerateQuick = async () => {
    setGenerating("quick");
    const { generateDeterministicScenarios } = await import("@/lib/openclaw/eval-scenario-generator");
    const scenarios = generateDeterministicScenarios({
      skillGraph, workflow, agentRules, discoveryDocuments, architecturePlan,
    });
    store.setEvalTasks(scenarios);
    store.setEvalStatus("ready");
    setGenerating(null);
  };

  const handleGenerateAI = async () => {
    setGenerating("ai");
    try {
      const { generateLLMScenarios, generateDeterministicScenarios } = await import("@/lib/openclaw/eval-scenario-generator");
      const scenarios = await generateLLMScenarios(sessionId, { skillGraph, agentRules, discoveryDocuments });
      if (scenarios.length > 0) {
        store.setEvalTasks(scenarios);
      } else {
        // Fallback to deterministic if LLM returns nothing
        store.setEvalTasks(generateDeterministicScenarios({
          skillGraph, workflow, agentRules, discoveryDocuments, architecturePlan,
        }));
      }
      store.setEvalStatus("ready");
    } catch {
      // Fallback to deterministic on error
      const { generateDeterministicScenarios } = await import("@/lib/openclaw/eval-scenario-generator");
      store.setEvalTasks(generateDeterministicScenarios({
        skillGraph, workflow, agentRules, discoveryDocuments, architecturePlan,
      }));
      store.setEvalStatus("ready");
    }
    setGenerating(null);
  };

  const handleRunTasks = async (filter: "pending" | "fail") => {
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(null);

    const { runEvalSuite } = await import("@/lib/openclaw/eval-runner");
    const tasksToRun = evalTasks.filter((t) => t.status === filter);

    await runEvalSuite(tasksToRun, {
      sessionId,
      store,
      skillGraph,
      agentRules,
      signal: controller.signal,
      onProgress: (current, total, title) => setProgress({ current, total, title }),
    });

    setProgress(null);
    abortRef.current = null;
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
  };

  // Empty state — generate scenarios
  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-4">
          <FlaskConical className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
          No evaluation tasks yet
        </p>
        <p className="mt-1 text-[10px] font-satoshi-regular text-[var(--text-tertiary)] text-center max-w-xs">
          Generate test scenarios based on your agent&apos;s skills and requirements.
        </p>
        {generating ? (
          <div className="mt-4 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 text-[var(--primary)] animate-spin" />
            <span className="text-xs font-satoshi-medium text-[var(--primary)]">
              {generating === "ai" ? "AI generating scenarios..." : "Generating..."}
            </span>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleGenerateQuick}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-[var(--primary)] bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-lg hover:bg-[var(--primary)]/15 transition-colors"
            >
              <Zap className="h-3 w-3" />
              Quick Generate
            </button>
            <button
              onClick={handleGenerateAI}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
            >
              <Bot className="h-3 w-3" />
              AI Generate
            </button>
          </div>
        )}
        <button
          onClick={onApprove}
          className="mt-3 text-[10px] font-satoshi-regular text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          Skip tests →
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Summary bar */}
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center">
              <FlaskConical className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <div>
              <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                Agent Evaluation
              </h3>
              <p className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
                {totalCount} test{totalCount !== 1 ? "s" : ""} defined
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {passCount > 0 && (
              <span className="text-[10px] font-satoshi-medium text-[var(--success)] bg-[var(--success)]/10 px-2 py-0.5 rounded-full">
                {passCount} passed
              </span>
            )}
            {failCount > 0 && (
              <span className="text-[10px] font-satoshi-medium text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                {failCount} failed
              </span>
            )}
            {manualCount > 0 && (
              <span className="text-[10px] font-satoshi-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                {manualCount} manual
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {pendingCount > 0 && evalStatus !== "running" && (
        <div className="flex justify-end">
          <button
            onClick={() => handleRunTasks("pending")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-satoshi-bold text-[var(--primary)] bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-lg hover:bg-[var(--primary)]/15 transition-colors"
          >
            <Play className="h-3 w-3" />
            Run All Tests
          </button>
        </div>
      )}

      {/* Running indicator with progress */}
      {evalStatus === "running" && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 text-[var(--primary)] animate-spin" />
            <p className="text-xs font-satoshi-medium text-[var(--primary)]">
              {progress
                ? `Running ${progress.current}/${progress.total}: ${progress.title}`
                : `Running evaluations... ${runningCount} in progress`}
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
          >
            <XCircle className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}

      {/* Eval task list */}
      <div className="space-y-2">
        {evalTasks.map((task) => (
          <EvalTaskCard key={task.id} task={task} />
        ))}
      </div>

      {/* Results & action */}
      {allDone && (
        <div className="pt-2 space-y-3">
          <div className={`rounded-xl border px-4 py-3 ${
            hasFailures
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-[var(--primary)]/20 bg-[var(--primary)]/5"
          }`}>
            <p className={`text-xs font-satoshi-medium ${
              hasFailures ? "text-amber-600" : "text-[var(--primary)]"
            }`}>
              {hasFailures
                ? `${failCount} test${failCount !== 1 ? "s" : ""} failed. Review the results above. You can still proceed or re-run tests.`
                : "All tests passed. Approve to proceed to deployment."}
            </p>
          </div>
          <div className="flex items-center justify-between">
            {hasFailures && (
              <button
                onClick={() => handleRunTasks("fail")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Re-run Failed
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={onApprove}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" />
              {hasFailures ? "Approve with Failures" : "Approve Tests"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Eval task card ────────────────────────────────────────────────────────

function EvalTaskCard({ task }: { task: EvalTask }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = EVAL_STATUS_CONFIG[task.status];
  const StatusIcon = cfg.icon;
  const confidencePct = task.confidence != null ? Math.round(task.confidence * 100) : null;
  const confidenceColor = task.confidence != null
    ? task.confidence >= 0.7 ? "text-[var(--success)]" : task.confidence >= 0.4 ? "text-amber-500" : "text-red-500"
    : "";

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 overflow-hidden">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors"
      >
        <div className={`w-6 h-6 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
          <StatusIcon className={`h-3 w-3 ${cfg.color} ${task.status === "running" ? "animate-spin" : ""}`} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-xs font-satoshi-medium text-[var(--text-primary)] truncate">
              {task.title}
            </span>
            <span className={`text-[9px] font-satoshi-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            {confidencePct != null && (
              <span className={`text-[9px] font-mono ${confidenceColor}`}>
                {confidencePct}%
              </span>
            )}
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">
            {task.expectedBehavior}
          </p>
        </div>
        {task.duration != null && (
          <div className="flex items-center gap-1 shrink-0">
            <Timer className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
              {(task.duration / 1000).toFixed(1)}s
            </span>
          </div>
        )}
        <ChevronRight
          className={`h-3 w-3 text-[var(--text-tertiary)] transition-transform shrink-0 ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[var(--border-default)]">
          <div className="pt-2">
            <span className="text-[9px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
              Test Input
            </span>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed bg-[var(--card-color)] rounded-lg px-3 py-2 border border-[var(--border-default)]">
              {task.input || "(empty input)"}
            </p>
          </div>
          <div>
            <span className="text-[9px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
              Expected Behavior
            </span>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed bg-[var(--card-color)] rounded-lg px-3 py-2 border border-[var(--border-default)]">
              {task.expectedBehavior}
            </p>
          </div>
          {task.response && (
            <div>
              <span className="text-[9px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                Agent Response
              </span>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed bg-[var(--card-color)] rounded-lg px-3 py-2 border border-[var(--border-default)] max-h-40 overflow-y-auto">
                {task.response}
              </p>
            </div>
          )}
          {task.reasons && task.reasons.length > 0 && (
            <div>
              <span className="text-[9px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                Scoring Rationale
              </span>
              <ul className="mt-1 space-y-0.5">
                {task.reasons.map((reason, i) => (
                  <li key={i} className="text-[10px] text-[var(--text-tertiary)] flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">•</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {task.toolsUsed && task.toolsUsed.length > 0 && (
            <div>
              <span className="text-[9px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                Tools Used
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {task.toolsUsed.map((tool) => (
                  <span
                    key={tool}
                    className="text-[9px] font-mono text-[var(--primary)] bg-[var(--primary)]/5 px-1.5 py-0.5 rounded"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ship stage — deploy + GitHub export ──────────────────────────────────

type ShipStep = "save" | "deploy" | "github";
type ShipStepStatus = "pending" | "running" | "done" | "failed" | "skipped";

interface ShipStepConfig {
  id: ShipStep;
  label: string;
  description: string;
  icon: typeof Save;
}

const SHIP_STEPS: ShipStepConfig[] = [
  { id: "save", label: "Save Agent", description: "Persist agent configuration to the database", icon: Save },
  { id: "deploy", label: "Deploy to Sandbox", description: "Push config to the agent's runtime container", icon: Database },
  { id: "github", label: "Push to GitHub", description: "Export agent template to a GitHub repository", icon: Github },
];

function StageShip({
  store,
  onComplete,
  isCompleting = false,
}: {
  store: CoPilotState & CoPilotActions;
  onComplete?: () => void;
  isCompleting?: boolean;
}) {
  const [stepStatuses, setStepStatuses] = useState<Record<ShipStep, ShipStepStatus>>({
    save: "pending",
    deploy: "pending",
    github: "pending",
  });
  const [githubRepo, setGithubRepo] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [skipGithub, setSkipGithub] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const allDone = SHIP_STEPS.every(
    (s) => stepStatuses[s.id] === "done" || stepStatuses[s.id] === "skipped",
  );

  const handleDeploy = async () => {
    setDeploying(true);
    setGithubError(null);

    // Step 1: Save agent
    setStepStatuses((prev) => ({ ...prev, save: "running" }));
    try {
      store.setDeployStatus("running");
      // Trigger the page-level onComplete which handles save + deploy
      onComplete?.();
      setStepStatuses((prev) => ({ ...prev, save: "done" }));
    } catch {
      setStepStatuses((prev) => ({ ...prev, save: "failed" }));
      setDeploying(false);
      return;
    }

    // Step 2: Deploy (the actual deploy is handled by onComplete callback)
    setStepStatuses((prev) => ({ ...prev, deploy: "running" }));
    // Simulate waiting for deploy completion
    await new Promise((r) => setTimeout(r, 2000));
    setStepStatuses((prev) => ({ ...prev, deploy: "done" }));

    // Step 3: GitHub export
    if (skipGithub || !githubToken || !githubRepo) {
      setStepStatuses((prev) => ({ ...prev, github: "skipped" }));
      store.setDeployStatus("done");
      setDeploying(false);
      return;
    }

    setStepStatuses((prev) => ({ ...prev, github: "running" }));
    try {
      // Build skill files from skillGraph
      const skills: Record<string, string> = {};
      for (const node of store.skillGraph ?? []) {
        if (node.skill_md) {
          skills[node.skill_id] = node.skill_md;
        }
      }

      // Build SOUL.md content inline
      const soulLines = [
        `# ${store.name || "Agent"}`,
        "",
        store.description ? `> ${store.description}` : "",
        "",
        "## Rules",
        ...store.agentRules.map((r) => `- ${r}`),
        "",
        "## Skills",
        ...(store.skillGraph ?? []).map((s) => `- **${s.name}**: ${s.description ?? ""}`),
      ];

      // Config file
      const configContent = JSON.stringify(
        {
          name: store.name,
          description: store.description,
          skills: (store.skillGraph ?? []).map((s) => s.skill_id),
          triggers: store.triggers.map((t) => ({ id: t.id, kind: t.kind, title: t.title })),
          channels: store.channels.map((c) => c.kind),
          runtimeInputs: store.runtimeInputs.map((r) => ({ key: r.key, required: r.required })),
        },
        null,
        2,
      );

      const res = await fetch("/api/openclaw/github-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubToken,
          repo: githubRepo,
          agentName: store.name || "Agent",
          soulContent: soulLines.join("\n"),
          skills,
          config: { ".openclaw/config.yml": configContent },
        }),
      });

      const result = await res.json();
      if (result.ok) {
        setStepStatuses((prev) => ({ ...prev, github: "done" }));
        setGithubRepoUrl(result.repoUrl);
      } else {
        setStepStatuses((prev) => ({ ...prev, github: "failed" }));
        setGithubError(result.error ?? "GitHub export failed");
      }
    } catch (err) {
      setStepStatuses((prev) => ({ ...prev, github: "failed" }));
      setGithubError(err instanceof Error ? err.message : "GitHub export failed");
    }

    store.setDeployStatus("done");
    setDeploying(false);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center">
            <Rocket className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <div>
            <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">
              Ship Agent
            </h3>
            <p className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
              Save, deploy, and push template to GitHub
            </p>
          </div>
        </div>
      </div>

      {/* Deploy steps */}
      <div className="space-y-2">
        {SHIP_STEPS.map((step, i) => {
          const status = stepStatuses[step.id];
          const StepIcon = step.icon;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                status === "done"
                  ? "border-[var(--success)]/20 bg-[var(--success)]/5"
                  : status === "running"
                  ? "border-[var(--primary)]/20 bg-[var(--primary)]/5"
                  : status === "failed"
                  ? "border-red-500/20 bg-red-500/5"
                  : status === "skipped"
                  ? "border-[var(--border-default)] bg-[var(--bg-subtle)]/30 opacity-50"
                  : "border-[var(--border-default)] bg-[var(--card-color)]"
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                status === "done" ? "bg-[var(--success)]/10" :
                status === "running" ? "bg-[var(--primary)]/10" :
                status === "failed" ? "bg-red-500/10" :
                "bg-[var(--bg-subtle)]"
              }`}>
                {status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 text-[var(--primary)] animate-spin" />
                ) : status === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                ) : status === "failed" ? (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                ) : status === "skipped" ? (
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                ) : (
                  <StepIcon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-satoshi-medium ${
                    status === "done" ? "text-[var(--success)]" :
                    status === "running" ? "text-[var(--primary)]" :
                    status === "failed" ? "text-red-500" :
                    "text-[var(--text-primary)]"
                  }`}>
                    {step.label}
                  </span>
                  {status === "skipped" && (
                    <span className="text-[9px] font-satoshi-medium text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
                      Skipped
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                  {step.description}
                </p>
              </div>
              <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)]">
                {i + 1}/{SHIP_STEPS.length}
              </span>
            </div>
          );
        })}
      </div>

      {/* GitHub config (only show before deploy starts) */}
      {!deploying && !allDone && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-[var(--text-secondary)]" />
              <span className="text-xs font-satoshi-bold text-[var(--text-primary)]">
                GitHub Template Export
              </span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={skipGithub}
                onChange={(e) => setSkipGithub(e.target.checked)}
                className="w-3 h-3 rounded border-[var(--border-default)] accent-[var(--primary)]"
              />
              <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)]">
                Skip
              </span>
            </label>
          </div>
          {!skipGithub && (
            <div className="space-y-2">
              <div>
                <label className="block text-[10px] font-satoshi-medium text-[var(--text-tertiary)] mb-1">
                  Repository (owner/repo)
                </label>
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  placeholder="myorg/customer-support-agent"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/30"
                />
              </div>
              <div>
                <label className="block text-[10px] font-satoshi-medium text-[var(--text-tertiary)] mb-1">
                  Personal Access Token
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/30"
                />
                <p className="text-[9px] text-[var(--text-tertiary)] mt-1">
                  Needs <code className="font-mono">repo</code> scope. Will create the repo if it doesn&apos;t exist.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GitHub error */}
      {githubError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5">
          <p className="text-xs font-satoshi-medium text-red-500">{githubError}</p>
        </div>
      )}

      {/* GitHub success link */}
      {githubRepoUrl && stepStatuses.github === "done" && (
        <a
          href={githubRepoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--success)]/20 bg-[var(--success)]/5 hover:bg-[var(--success)]/10 transition-colors"
        >
          <Github className="h-4 w-4 text-[var(--success)]" />
          <span className="text-xs font-satoshi-medium text-[var(--success)]">
            Template pushed to {githubRepo}
          </span>
          <ExternalLink className="h-3 w-3 text-[var(--success)] ml-auto" />
        </a>
      )}

      {/* Action buttons */}
      {!deploying && !allDone && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleDeploy}
            disabled={isCompleting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 disabled:opacity-30 transition-colors"
          >
            <Rocket className="h-3 w-3" />
            {isCompleting ? "Deploying..." : "Deploy Agent"}
          </button>
        </div>
      )}

      {/* All done — advance to reflect */}
      {allDone && (
        <div className="pt-2 space-y-3">
          <div className="rounded-xl border border-[var(--success)]/20 bg-[var(--success)]/5 px-4 py-3">
            <p className="text-xs font-satoshi-medium text-[var(--success)]">
              Agent shipped successfully. Review the build summary to finish.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => store.advanceDevStage()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" />
              View Build Summary
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Collapsible review section ─────────────────────────────────────────────

function ReviewSection({
  icon,
  title,
  count,
  badge,
  badgeColor,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  badge?: string;
  badgeColor?: "success" | "warning";
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-[var(--border-default)] hover:bg-[var(--bg-subtle)] transition-colors"
      >
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        <span className="text-xs font-satoshi-bold text-[var(--text-primary)]">{title}</span>
        <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded-full">
          {count}
        </span>
        {badge && (
          <span className={`text-[9px] font-satoshi-medium ml-auto mr-2 px-1.5 py-0.5 rounded ${
            badgeColor === "success"
              ? "text-[var(--success)] bg-[var(--success)]/10"
              : "text-amber-500 bg-amber-500/10"
          }`}>
            {badge}
          </span>
        )}
        <ChevronRight
          className={`h-3 w-3 text-[var(--text-tertiary)] transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>
      {expanded && <div className="p-3">{children}</div>}
    </div>
  );
}

// ─── Generic placeholder for stages not yet fully implemented ────────────────

function StagePlaceholder({
  title,
  description,
  status,
  loading = false,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  status: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">{title}</h3>
        <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)] leading-relaxed">
          {description}
        </p>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-4">
            <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />
          </div>
          <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
            Processing...
          </p>
        </div>
      )}

      {!loading && status === "ready" && (
        <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
          <p className="text-xs font-satoshi-medium text-[var(--primary)]">
            Ready for your review. Inspect the content above and click the action button when satisfied.
          </p>
        </div>
      )}

      {actionLabel && onAction && !loading && (
        <div className="flex justify-end">
          <button
            onClick={onAction}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
          >
            <CheckCircle2 className="h-3 w-3" />
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Reflect stage — Build Summary ──────────────────────────────────────────

function StageReflect({
  store,
  onDone,
}: {
  store: CoPilotState & CoPilotActions;
  onDone?: () => void;
}) {
  const report = store.buildReport;
  const skills = store.skillGraph ?? [];
  const selectedIds = new Set(store.selectedSkillIds);
  const activeSkills = skills.filter((s) => selectedIds.size === 0 || selectedIds.has(s.skill_id));
  const builtCount = store.builtSkillIds.length;
  const workflow = store.workflow;
  const triggers = store.triggers;
  const channels = store.channels;
  const tools = store.connectedTools;
  const rules = store.agentRules;

  const stats = [
    { label: "Skills", value: report?.skillCount ?? activeSkills.length, icon: Zap },
    { label: "Integrations", value: report?.integrationCount ?? tools.length, icon: Wrench },
    { label: "Triggers", value: report?.triggerCount ?? triggers.length, icon: Clock },
    { label: "Sub-Agents", value: report?.subAgentCount ?? 0, icon: Bot },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Build Summary</h3>
        <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)] leading-relaxed">
          {report?.agentName ?? store.name ?? "Agent"} has been deployed. Here&apos;s what was built.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] p-3 text-center"
          >
            <stat.icon className="h-4 w-4 text-[var(--primary)] mx-auto mb-1.5" />
            <p className="text-lg font-satoshi-bold text-[var(--text-primary)]">{stat.value}</p>
            <p className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Skills list */}
      {activeSkills.length > 0 && (
        <div>
          <p className="text-xs font-satoshi-bold text-[var(--text-secondary)] mb-2">Skills ({builtCount} built)</p>
          <div className="space-y-1.5">
            {activeSkills.map((skill) => (
              <div
                key={skill.skill_id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)]"
              >
                <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${store.builtSkillIds.includes(skill.skill_id) ? "text-[var(--success)]" : "text-[var(--text-tertiary)]"}`} />
                <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">{skill.name}</span>
                {skill.source && (
                  <span className="ml-auto text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">{skill.source}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow */}
      {workflow && workflow.steps && workflow.steps.length > 0 && (
        <div>
          <p className="text-xs font-satoshi-bold text-[var(--text-secondary)] mb-2">Workflow</p>
          <div className="flex flex-wrap gap-1.5">
            {workflow.steps.map((step, i) => (
              <span
                key={`${step.id}-${i}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--border-default)] bg-[var(--card-color)] text-[10px] font-satoshi-medium text-[var(--text-secondary)]"
              >
                {step.skill.replace(/_/g, " ")}
                {i < workflow.steps.length - 1 && <ChevronRight className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Triggers */}
      {triggers.length > 0 && (
        <div>
          <p className="text-xs font-satoshi-bold text-[var(--text-secondary)] mb-2">Triggers</p>
          <div className="space-y-1.5">
            {triggers.map((trigger) => (
              <div
                key={trigger.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)]"
              >
                <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">{trigger.title || trigger.id}</span>
                <span className="ml-auto text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">{trigger.kind}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Channels */}
      {channels.length > 0 && (
        <div>
          <p className="text-xs font-satoshi-bold text-[var(--text-secondary)] mb-2">Channels</p>
          <div className="flex flex-wrap gap-2">
            {channels.map((ch) => (
              <span
                key={ch.kind}
                className="px-2.5 py-1 rounded-full border border-[var(--border-default)] bg-[var(--card-color)] text-[10px] font-satoshi-medium text-[var(--text-secondary)]"
              >
                {ch.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rules */}
      {rules.length > 0 && (
        <div>
          <p className="text-xs font-satoshi-bold text-[var(--text-secondary)] mb-2">Agent Rules ({rules.length})</p>
          <ul className="space-y-1">
            {rules.slice(0, 5).map((rule, i) => (
              <li key={i} className="text-xs font-satoshi-regular text-[var(--text-tertiary)] leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-[var(--text-tertiary)]">
                {rule.length > 120 ? `${rule.slice(0, 120)}…` : rule}
              </li>
            ))}
            {rules.length > 5 && (
              <li className="text-xs font-satoshi-regular text-[var(--text-tertiary)] pl-3">
                +{rules.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Done action */}
      <div className="flex justify-end pt-2">
        <button
          onClick={() => onDone?.()}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
        >
          <CheckCircle2 className="h-3 w-3" />
          Done
        </button>
      </div>
    </div>
  );
}
