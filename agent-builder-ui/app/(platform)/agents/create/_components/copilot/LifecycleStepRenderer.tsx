"use client";

/**
 * LifecycleStepRenderer — renders the 7-stage agent development lifecycle.
 *
 * Think → Plan → Build → Review → Test → Ship → Reflect
 *
 * Each stage has a hard gate — user must approve before advancing.
 * Replaces the old WizardStepRenderer for the copilot mode.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useCoPilotStore, type CoPilotState, type CoPilotActions, type BuildActivityItem, type BuildProgress, type ThinkActivityItem, type PlanActivityItem } from "@/lib/openclaw/copilot-state";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";
import { BranchDiffPanel } from "../BranchDiffPanel";
import { FeatureBriefCard } from "../FeatureBriefCard";
import { AGENT_DEV_STAGES, type AgentDevStage, type StageStatus } from "@/lib/openclaw/types";
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
  FileText,
  RefreshCw,
  TrendingUp,
  Diff,
  Terminal,
  Search,
  Compass,
  Layers,
  Target,
  UserCheck,
} from "lucide-react";
import type {
  ArchitecturePlan,
  ArchitecturePlanSkill,
  ArchitecturePlanIntegration,
  ArchitecturePlanTrigger,
  ArchitecturePlanEnvVar,
  EvalTask,
  EvalTaskStatus,
  EvalLoopState,
  SkillGraphNode,
  ToolCallTrace,
  SkillMutation,
} from "@/lib/openclaw/types";
import type { EvalLoopProgress } from "@/lib/openclaw/eval-loop";
import { getTestStageContainerState as resolveTestStageContainerState } from "@/lib/openclaw/test-stage-readiness";
import type { ArtifactTarget } from "@/lib/openclaw/stage-context";
import { StepDiscovery } from "../configure/StepDiscovery";
import { MeetYourEmployee } from "../MeetYourEmployee";
import { ArtifactActionBar } from "./ArtifactActionBar";
import { BuildReportPanel } from "./BuildReportPanel";
import { approveManualEvalTasks, resolveEvalReviewState, resolveReviewSkillNodes } from "@/lib/openclaw/copilot-flow";

export { getTestStageContainerState } from "@/lib/openclaw/test-stage-readiness";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const STAGE_META: Record<AgentDevStage, { label: string; icon: typeof Lightbulb; description: string }> = {
  reveal: { label: "Meet", icon: UserCheck, description: "Meet your digital employee" },
  think: { label: "Think", icon: Lightbulb, description: "Define requirements (PRD + TRD)" },
  plan: { label: "Plan", icon: Map, description: "Lock architecture" },
  build: { label: "Build", icon: Hammer, description: "Create skills & config" },
  review: { label: "Review", icon: ClipboardCheck, description: "Inspect configuration" },
  test: { label: "Test", icon: FlaskConical, description: "Run evaluations" },
  ship: { label: "Ship", icon: Rocket, description: "Deploy agent" },
  reflect: { label: "Reflect", icon: BookOpen, description: "Build summary" },
};

const FEATURE_STAGE_META: Record<AgentDevStage, { label: string; description: string }> = {
  reveal:  { label: "Meet",           description: "Meet your digital employee" },
  think:   { label: "Discover",       description: "Analyze feature requirements" },
  plan:    { label: "Plan Changes",   description: "Design the delta" },
  build:   { label: "Build Feature",  description: "Create new skills & config" },
  review:  { label: "Review Diff",    description: "Inspect branch changes" },
  test:    { label: "Test Feature",   description: "Validate new capabilities" },
  ship:    { label: "Merge",          description: "Create PR & merge to main" },
  reflect: { label: "Summary",        description: "Feature summary" },
};

interface ArtifactActionHandlers {
  requestChanges: (target: ArtifactTarget) => void;
  regenerate: (target: ArtifactTarget) => void;
  compare: (target: ArtifactTarget) => void;
  explain: (target: ArtifactTarget) => void;
  openFiles: (target: ArtifactTarget) => void;
}

function getStageIndex(stage: AgentDevStage): number {
  return AGENT_DEV_STAGES.indexOf(stage);
}

export function isLifecycleStageUnlocked(
  stage: AgentDevStage,
  maxUnlockedDevStage: AgentDevStage,
): boolean {
  const idx = getStageIndex(stage);
  const unlockedIdx = getStageIndex(maxUnlockedDevStage);
  if (idx === 0) return true;
  return idx <= unlockedIdx;
}

export function isLifecycleStageDone(
  stage: AgentDevStage,
  maxUnlockedDevStage: AgentDevStage,
  statuses?: Partial<{
    devStage: AgentDevStage;
    thinkStatus: StageStatus;
    planStatus: StageStatus;
    buildStatus: StageStatus;
    evalStatus: StageStatus;
    deployStatus: StageStatus;
  }>,
): boolean {
  if (statuses) {
    const currentStage = statuses.devStage ?? "think";
    switch (stage) {
      case "think":
        return statuses.thinkStatus === "approved" || statuses.thinkStatus === "done";
      case "plan":
        return statuses.planStatus === "approved" || statuses.planStatus === "done";
      case "build":
        return statuses.buildStatus === "done";
      case "review":
        return getStageIndex(currentStage) > getStageIndex("review");
      case "test":
        return statuses.evalStatus === "done" || getStageIndex(currentStage) > getStageIndex("test");
      case "ship":
        return statuses.deployStatus === "done" || getStageIndex(currentStage) > getStageIndex("ship");
      case "reflect":
        return false;
      default:
        return false;
    }
  }
  const idx = getStageIndex(stage);
  const unlockedIdx = getStageIndex(maxUnlockedDevStage);
  return idx < unlockedIdx;
}

export function formatWorkflowStepLabel(step: unknown, index: number): string {
  if (typeof step === "string") return step.trim().replace(/_/g, " ") || `Step ${index + 1}`;
  if (!step || typeof step !== "object") return `Step ${index + 1}`;

  const record = step as Record<string, unknown>;
  const raw = [
    record.skill,
    record.skillId,
    record.node_id,
    record.nodeId,
    record.name,
    record.id,
    record.step,
    record.action,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  return typeof raw === "string" ? raw.trim().replace(/_/g, " ") : `Step ${index + 1}`;
}

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

// ─── Think phase SVG animations ───────────────────────────────────────────

function SvgReadingDescription() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Open book */}
      <path d="M30,85 L60,75 L90,85 L90,35 L60,25 L30,35 Z" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.3" />
      <line x1="60" y1="25" x2="60" y2="75" stroke="var(--primary)" strokeWidth="1" opacity="0.2" />
      {/* Text lines being scanned */}
      {[38, 45, 52, 59, 66].map((y, i) => (
        <g key={y}>
          <rect x="35" y={y} width="20" height="1.5" rx="0.75" fill="var(--primary)" opacity="0.15" />
          <rect x="65" y={y} width="20" height="1.5" rx="0.75" fill="var(--primary)" opacity="0.15" />
          {/* Highlight sweep */}
          <rect x="35" y={y} width="20" height="1.5" rx="0.75" fill="var(--primary)" opacity="0">
            <animate attributeName="opacity" values="0;0.6;0" dur="2.5s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
          </rect>
          <rect x="65" y={y} width="20" height="1.5" rx="0.75" fill="var(--primary)" opacity="0">
            <animate attributeName="opacity" values="0;0.6;0" dur="2.5s" begin={`${i * 0.4 + 0.2}s`} repeatCount="indefinite" />
          </rect>
        </g>
      ))}
      {/* Scanning eye */}
      <ellipse cx="60" cy="18" rx="8" ry="5" fill="none" stroke="var(--primary)" strokeWidth="1.2" opacity="0.5">
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
      </ellipse>
      <circle cx="60" cy="18" r="2.5" fill="var(--primary)" opacity="0.6">
        <animate attributeName="cx" values="57;63;57" dur="2.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function SvgUnderstandingPurpose() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Central lightbulb */}
      <path d="M52,55 Q52,35 60,30 Q68,35 68,55" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.5">
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
      </path>
      <rect x="53" y="55" width="14" height="4" rx="1" fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0.4" />
      <rect x="55" y="59" width="10" height="3" rx="1" fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0.3" />
      {/* Radiating insight lines */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        const x1 = 60 + Math.cos(rad) * 22;
        const y1 = 42 + Math.sin(rad) * 22;
        const x2 = 60 + Math.cos(rad) * 32;
        const y2 = 42 + Math.sin(rad) * 32;
        return (
          <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="var(--primary)" strokeWidth="1" strokeLinecap="round" opacity="0">
            <animate attributeName="opacity" values="0;0.5;0" dur="2s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
          </line>
        );
      })}
      {/* Thought bubbles floating up */}
      {[{ cx: 40, delay: 0 }, { cx: 80, delay: 1 }, { cx: 55, delay: 2 }].map(({ cx, delay }, i) => (
        <circle key={i} cx={cx} cy="80" r="3" fill="var(--primary)" opacity="0">
          <animate attributeName="cy" values="80;15" dur="4s" begin={`${delay}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.4;0" dur="4s" begin={`${delay}s`} repeatCount="indefinite" />
          <animate attributeName="r" values="2;4;2" dur="4s" begin={`${delay}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

function SvgResearchingDomain() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Magnifying glass */}
      <circle cx="52" cy="50" r="18" fill="none" stroke="var(--primary)" strokeWidth="2" opacity="0.4">
        <animate attributeName="opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <line x1="65" y1="63" x2="82" y2="80" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
      {/* Knowledge nodes inside lens */}
      {[
        { cx: 44, cy: 44 }, { cx: 60, cy: 44 }, { cx: 44, cy: 56 }, { cx: 60, cy: 56 }, { cx: 52, cy: 50 },
      ].map(({ cx, cy }, i) => (
        <circle key={i} cx={cx} cy={cy} r="2.5" fill="var(--primary)" opacity="0.2">
          <animate attributeName="opacity" values="0.2;0.7;0.2" dur="1.8s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* Connecting lines between nodes */}
      <g stroke="var(--primary)" strokeWidth="0.6" opacity="0.15">
        <line x1="44" y1="44" x2="60" y2="44" />
        <line x1="44" y1="44" x2="52" y2="50" />
        <line x1="60" y1="44" x2="52" y2="50" />
        <line x1="44" y1="56" x2="52" y2="50" />
        <line x1="60" y1="56" x2="52" y2="50" />
      </g>
      {/* Data particles flowing in from edges */}
      {[0, 1, 2, 3].map((i) => {
        const startX = [15, 105, 15, 105][i];
        const startY = [25, 25, 85, 85][i];
        return (
          <circle key={i} cx={startX} cy={startY} r="1.5" fill="var(--primary)" opacity="0">
            <animate attributeName="cx" values={`${startX};52`} dur="2.5s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${startY};50`} dur="2.5s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.6;0" dur="2.5s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
          </circle>
        );
      })}
    </svg>
  );
}

function SvgDraftingPrd() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Document outline with "PRD" badge */}
      <rect x="28" y="18" width="64" height="84" rx="4" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.25" />
      {/* PRD badge */}
      <rect x="40" y="24" width="40" height="12" rx="2" fill="var(--primary)" opacity="0.12" />
      <text x="60" y="33" textAnchor="middle" fill="var(--primary)" fontSize="7" fontWeight="bold" opacity="0.6">PRD</text>
      {/* Sections being filled */}
      {[
        { y: 44, w: 48, delay: 0 },
        { y: 52, w: 36, delay: 0.6 },
        { y: 60, w: 44, delay: 1.2 },
        { y: 68, w: 40, delay: 1.8 },
        { y: 76, w: 32, delay: 2.4 },
        { y: 84, w: 50, delay: 3.0 },
      ].map(({ y, w, delay }, i) => (
        <rect key={i} x="36" y={y} width="0" height="2.5" rx="1" fill="var(--primary)" opacity="0.5">
          <animate attributeName="width" values={`0;${w}`} dur="0.8s" begin={`${delay}s`} fill="freeze" />
        </rect>
      ))}
      {/* Writing cursor */}
      <rect x="36" y="90" width="2" height="6" fill="var(--primary)">
        <animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="x" values="36;76;36" dur="6s" repeatCount="indefinite" />
      </rect>
      {/* Sparkle when section completes */}
      <circle cx="82" cy="26" r="0" fill="var(--primary)" opacity="0">
        <animate attributeName="r" values="0;3;0" dur="1.5s" begin="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.6;0" dur="1.5s" begin="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function SvgDraftingTrd() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Document outline with "TRD" badge */}
      <rect x="28" y="18" width="64" height="84" rx="4" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.25" />
      {/* TRD badge */}
      <rect x="40" y="24" width="40" height="12" rx="2" fill="var(--primary)" opacity="0.12" />
      <text x="60" y="33" textAnchor="middle" fill="var(--primary)" fontSize="7" fontWeight="bold" opacity="0.6">TRD</text>
      {/* Architecture diagram being drawn */}
      <rect x="36" y="44" width="20" height="12" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1" strokeDasharray="60" strokeDashoffset="60" opacity="0.6">
        <animate attributeName="stroke-dashoffset" values="60;0" dur="1s" fill="freeze" />
      </rect>
      <rect x="64" y="44" width="20" height="12" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1" strokeDasharray="60" strokeDashoffset="60" opacity="0.6">
        <animate attributeName="stroke-dashoffset" values="60;0" dur="1s" begin="0.5s" fill="freeze" />
      </rect>
      <line x1="56" y1="50" x2="64" y2="50" stroke="var(--primary)" strokeWidth="1" opacity="0">
        <animate attributeName="opacity" values="0;0.5" dur="0.3s" begin="1.2s" fill="freeze" />
      </line>
      <rect x="50" y="64" width="20" height="12" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1" strokeDasharray="60" strokeDashoffset="60" opacity="0.6">
        <animate attributeName="stroke-dashoffset" values="60;0" dur="1s" begin="1.5s" fill="freeze" />
      </rect>
      {/* Arrows connecting boxes */}
      <line x1="46" y1="56" x2="56" y2="64" stroke="var(--primary)" strokeWidth="0.8" opacity="0">
        <animate attributeName="opacity" values="0;0.4" dur="0.3s" begin="2s" fill="freeze" />
      </line>
      <line x1="74" y1="56" x2="64" y2="64" stroke="var(--primary)" strokeWidth="0.8" opacity="0">
        <animate attributeName="opacity" values="0;0.4" dur="0.3s" begin="2.2s" fill="freeze" />
      </line>
      {/* Code lines at bottom */}
      {[82, 88, 94].map((y, i) => (
        <rect key={y} x="36" y={y} width="0" height="1.5" rx="0.75" fill="var(--primary)" opacity="0.4">
          <animate attributeName="width" values={`0;${30 + i * 8}`} dur="0.6s" begin={`${2.5 + i * 0.3}s`} fill="freeze" />
        </rect>
      ))}
      {/* Gear icon spinning */}
      <g transform="translate(84, 78)">
        <animateTransform attributeName="transform" type="rotate" from="0 84 78" to="360 84 78" dur="4s" repeatCount="indefinite" additive="sum" />
        <path d="M0,-7 L2,-3 L6,-3 L3,0 L4,5 L0,2 L-4,5 L-3,0 L-6,-3 L-2,-3 Z"
          fill="none" stroke="var(--primary)" strokeWidth="0.8" opacity="0.4" />
        <circle r="2" fill="var(--primary)" opacity="0.2" />
      </g>
    </svg>
  );
}

function SvgFinalizingDocs() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Two documents side by side */}
      <rect x="18" y="25" width="38" height="50" rx="3" fill="none" stroke="var(--primary)" strokeWidth="1.2" opacity="0.3">
        <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
      </rect>
      <rect x="64" y="25" width="38" height="50" rx="3" fill="none" stroke="var(--primary)" strokeWidth="1.2" opacity="0.3">
        <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" begin="0.5s" repeatCount="indefinite" />
      </rect>
      {/* Doc labels */}
      <text x="37" y="37" textAnchor="middle" fill="var(--primary)" fontSize="6" fontWeight="bold" opacity="0.4">PRD</text>
      <text x="83" y="37" textAnchor="middle" fill="var(--primary)" fontSize="6" fontWeight="bold" opacity="0.4">TRD</text>
      {/* Content lines on each doc */}
      {[44, 50, 56, 62].map((y, i) => (
        <g key={y}>
          <rect x="24" y={y} width={18 + (i % 2) * 6} height="1.5" rx="0.75" fill="var(--primary)" opacity="0.2" />
          <rect x="70" y={y} width={20 - (i % 2) * 4} height="1.5" rx="0.75" fill="var(--primary)" opacity="0.2" />
        </g>
      ))}
      {/* Checkmarks appearing */}
      <path d="M30,82 L35,87 L44,78" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="25" strokeDashoffset="25" opacity="0">
        <animate attributeName="stroke-dashoffset" values="25;0" dur="0.6s" begin="0.5s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.7" dur="0.3s" begin="0.5s" fill="freeze" />
      </path>
      <path d="M76,82 L81,87 L90,78" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="25" strokeDashoffset="25" opacity="0">
        <animate attributeName="stroke-dashoffset" values="25;0" dur="0.6s" begin="1s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.7" dur="0.3s" begin="1s" fill="freeze" />
      </path>
      {/* Connecting bridge between docs */}
      <path d="M56,50 Q60,45 64,50" fill="none" stroke="var(--primary)" strokeWidth="1" strokeDasharray="3 2" opacity="0">
        <animate attributeName="opacity" values="0;0.4;0" dur="2s" begin="1.5s" repeatCount="indefinite" />
      </path>
      {/* Celebration sparkles */}
      {[{ cx: 20, cy: 22 }, { cx: 100, cy: 22 }, { cx: 60, cy: 95 }].map(({ cx, cy }, i) => (
        <circle key={i} cx={cx} cy={cy} r="0" fill="var(--primary)" opacity="0">
          <animate attributeName="r" values="0;3;0" dur="1.2s" begin={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.5;0" dur="1.2s" begin={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

const THINK_PHASES: { at: number; label: string; Svg: () => React.ReactNode }[] = [
  { at: 0, label: "Reading your description...", Svg: SvgReadingDescription },
  { at: 5, label: "Understanding the agent's purpose...", Svg: SvgUnderstandingPurpose },
  { at: 15, label: "Researching domain knowledge...", Svg: SvgResearchingDomain },
  { at: 30, label: "Drafting Product Requirements...", Svg: SvgDraftingPrd },
  { at: 60, label: "Drafting Technical Requirements...", Svg: SvgDraftingTrd },
  { at: 100, label: "Finalizing documents...", Svg: SvgFinalizingDocs },
  { at: 150, label: "Still thinking — thorough analysis takes time...", Svg: SvgResearchingDomain },
  { at: 240, label: "Almost ready — wrapping up requirements...", Svg: SvgFinalizingDocs },
];

// Map real Think events to the matching SVG phase
function thinkPhaseFromEvent(item: ThinkActivityItem): typeof THINK_PHASES[number] | null {
  const l = item.label.toLowerCase();
  if (l.includes("browser") || l.includes("search") || l.includes("fetch") || l.includes("navigate")) return THINK_PHASES[2]; // Research
  if (l.includes("terminal") || l.includes("exec") || l.includes("shell")) return THINK_PHASES[2]; // Research
  if (l.includes("prd") || l.includes("product req")) return THINK_PHASES[3]; // Drafting PRD
  if (l.includes("trd") || l.includes("technical req") || l.includes("architecture")) return THINK_PHASES[4]; // Drafting TRD
  if (item.type === "research") return THINK_PHASES[2]; // Research (tool_start)
  if (item.type === "tool") return THINK_PHASES[2]; // Research (tool_end)
  if (item.type === "identity") return THINK_PHASES[1]; // Understanding
  return null;
}

// ─── Think milestones for the journey tracker ──────────────────────────

const THINK_MILESTONES = [
  { id: "read", label: "Read", icon: FileText },
  { id: "understand", label: "Understand", icon: Lightbulb },
  { id: "research", label: "Research", icon: Search },
  { id: "prd", label: "PRD", icon: FileText },
  { id: "trd", label: "TRD", icon: Layers },
  { id: "finalize", label: "Finalize", icon: CheckCircle2 },
] as const;

function thinkMilestoneIndexFromEvent(item: ThinkActivityItem): number {
  const l = item.label.toLowerCase();
  if (l.includes("finaliz")) return 5;
  if (l.includes("trd") || l.includes("technical req")) return 4;
  if (l.includes("prd") || l.includes("product req")) return 3;
  if (l.includes("browser") || l.includes("search") || l.includes("fetch") || l.includes("navigate") || l.includes("terminal") || l.includes("exec") || item.type === "research" || item.type === "tool") return 2;
  if (item.type === "identity" || l.includes("purpose") || l.includes("understand")) return 1;
  return 0;
}

function ThinkActivityPanel({
  thinkActivity,
  thinkStep,
  researchFindings,
}: {
  thinkActivity: ThinkActivityItem[];
  thinkStep?: string;
  researchFindings?: Array<{ id: string; title: string; summary: string; source?: string }>;
}) {
  const elapsed = useElapsedTime(true);
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll activity feed
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [thinkActivity.length, researchFindings?.length]);

  // Determine current milestone — prefer thinkStep (v4 data-driven) over time-based
  const lastEvent = thinkActivity.length > 0 ? thinkActivity[thinkActivity.length - 1] : null;
  let activeMilestone = 0;

  // v4: data-driven milestones from thinkStep
  if (thinkStep && thinkStep !== "idle") {
    switch (thinkStep) {
      case "research": activeMilestone = 2; break;
      case "prd": activeMilestone = 3; break;
      case "trd": activeMilestone = 4; break;
      case "complete": activeMilestone = 5; break;
    }
  } else if (lastEvent) {
    // v3 fallback: derive from activity events
    activeMilestone = thinkMilestoneIndexFromEvent(lastEvent);
  } else {
    // Last resort: time-based (legacy)
    if (elapsed >= 100) activeMilestone = 5;
    else if (elapsed >= 60) activeMilestone = 4;
    else if (elapsed >= 30) activeMilestone = 3;
    else if (elapsed >= 15) activeMilestone = 2;
    else if (elapsed >= 5) activeMilestone = 1;
  }

  // Track max milestone reached (never regress)
  const maxMilestoneRef = useRef(0);
  if (activeMilestone > maxMilestoneRef.current) maxMilestoneRef.current = activeMilestone;
  const maxReached = maxMilestoneRef.current;

  // Prefer real events to drive the SVG; fall back to time-based
  const eventPhase = lastEvent ? thinkPhaseFromEvent(lastEvent) : null;
  let currentPhase = THINK_PHASES[0];
  if (eventPhase) {
    currentPhase = eventPhase;
  } else {
    for (const phase of THINK_PHASES) {
      if (elapsed >= phase.at) currentPhase = phase;
    }
  }

  const { Svg } = currentPhase;
  const displayLabel = lastEvent ? lastEvent.label : currentPhase.label;
  const researchCount = thinkActivity.filter((e) => e.type === "research" || e.type === "tool").length;

  return (
    <div className="flex flex-col h-full">
      {/* ── Journey Milestone Bar ─────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          {THINK_MILESTONES.map((ms, i) => {
            const Icon = ms.icon;
            const done = i < maxReached;
            const active = i === activeMilestone;
            return (
              <div key={ms.id} className="flex items-center gap-0.5">
                <div className={`flex flex-col items-center gap-1 ${
                  active ? "scale-110" : ""
                } transition-transform`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                    done
                      ? "bg-[var(--success)]/15 border border-[var(--success)]/30"
                      : active
                        ? "bg-[var(--primary)]/15 border border-[var(--primary)]/40 shadow-sm shadow-[var(--primary)]/20"
                        : "bg-[var(--background)] border border-[var(--border-stroke)]"
                  }`}>
                    {done ? (
                      <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                    ) : active ? (
                      <Icon className="h-3 w-3 text-[var(--primary)] animate-pulse" />
                    ) : (
                      <Icon className="h-3 w-3 text-[var(--text-tertiary)]/40" />
                    )}
                  </div>
                  <span className={`text-[8px] font-satoshi-medium ${
                    done ? "text-[var(--success)]"
                    : active ? "text-[var(--primary)]"
                    : "text-[var(--text-tertiary)]/50"
                  }`}>{ms.label}</span>
                </div>
                {i < THINK_MILESTONES.length - 1 && (
                  <div className={`w-4 h-px mx-0.5 mt-[-12px] ${
                    i < maxReached ? "bg-[var(--success)]/40" : "bg-[var(--border-stroke)]"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Hero: Animation + Current Action ──────────────────── */}
      <div className="shrink-0 flex flex-col items-center gap-2 px-4 pb-2">
        <div key={currentPhase.at} className="typewriter-word">
          <Svg />
        </div>
        <p key={displayLabel} className="text-xs font-satoshi-medium text-[var(--text-secondary)] typewriter-word text-center">
          {displayLabel}
        </p>
      </div>

      {/* ── Stats Row ─────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-center gap-4 px-4 py-2 border-y border-[var(--border-default)] bg-[var(--background)]/50">
        <div className="flex items-center gap-1.5">
          <Search className="h-3 w-3 text-[var(--primary)]" />
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
            {researchFindings?.length ?? researchCount} finding{(researchFindings?.length ?? researchCount) !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="w-px h-3 bg-[var(--border-stroke)]" />
        <div className="flex items-center gap-1.5">
          <Lightbulb className="h-3 w-3 text-[var(--primary)]" />
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
            {thinkActivity.length} event{thinkActivity.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="w-px h-3 bg-[var(--border-stroke)]" />
        <div className="flex items-center gap-1.5">
          <Timer className="h-3 w-3 text-[var(--text-tertiary)]" />
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
            {elapsed}s
          </span>
        </div>
      </div>

      {/* ── Research Findings Cards (v4) ──────────────────────── */}
      {researchFindings && researchFindings.length > 0 && (
        <div className="shrink-0 px-4 py-2 space-y-1.5 max-h-32 overflow-y-auto border-b border-[var(--border-default)]">
          {researchFindings.map((finding) => (
            <div key={finding.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-[var(--primary)]/5 border border-[var(--primary)]/10 animate-fadeIn">
              <Search className="h-3 w-3 text-[var(--primary)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-satoshi-medium text-[var(--text-primary)] truncate">{finding.title}</p>
                <p className="text-[9px] text-[var(--text-tertiary)] line-clamp-2">{finding.summary}</p>
                {finding.source && (
                  <p className="text-[8px] text-[var(--text-tertiary)]/60 truncate mt-0.5">{finding.source}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Live Activity Feed ────────────────────────────────── */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {thinkActivity.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-[10px] text-[var(--text-tertiary)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing your description and researching requirements...
          </div>
        ) : (
          thinkActivity.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-0.5 animate-fadeIn">
              {item.type === "research" ? (
                <div className="w-4 h-4 rounded-full bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                  <Search className="h-2.5 w-2.5 text-[var(--primary)]" />
                </div>
              ) : item.type === "tool" ? (
                <div className="w-4 h-4 rounded-full bg-[var(--warning)]/10 flex items-center justify-center shrink-0">
                  <Terminal className="h-2.5 w-2.5 text-[var(--warning)]" />
                </div>
              ) : item.type === "identity" ? (
                <div className="w-4 h-4 rounded-full bg-[var(--success)]/10 flex items-center justify-center shrink-0">
                  <Lightbulb className="h-2.5 w-2.5 text-[var(--success)]" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full bg-[var(--text-tertiary)]/8 flex items-center justify-center shrink-0">
                  <FileText className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />
                </div>
              )}
              <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate">
                {item.type === "research" ? `⊛ ${item.label}` : item.label}
              </span>
              <span className="text-[9px] font-mono text-[var(--text-tertiary)]/50 shrink-0 ml-auto">
                {Math.round((Date.now() - item.timestamp) / 1000)}s ago
              </span>
            </div>
          ))
        )}
        {thinkActivity.length > 0 && (
          <div className="flex items-center gap-2 py-0.5">
            <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />
            <span className="text-[10px] font-mono text-[var(--primary)]">
              Thinking...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Build phase SVG animations ───────────────────────────────────────────

function SvgConnecting() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Pulsing concentric rings */}
      <circle cx="60" cy="60" r="8" fill="var(--primary)" opacity="0.9">
        <animate attributeName="r" values="8;10;8" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="60" cy="60" r="20" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.5">
        <animate attributeName="r" values="18;28;18" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="60" cy="60" r="35" fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0.3">
        <animate attributeName="r" values="32;42;32" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.05;0.3" dur="2.5s" repeatCount="indefinite" />
      </circle>
      {/* Orbiting dots */}
      <circle cx="60" cy="60" r="3" fill="var(--primary)" opacity="0.7">
        <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="3s" repeatCount="indefinite" />
        <animate attributeName="cx" values="60;85;60;35;60" dur="3s" repeatCount="indefinite" />
        <animate attributeName="cy" values="35;60;85;60;35" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function SvgAnalyzing() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Brain network nodes */}
      <g opacity="0.8">
        <circle cx="60" cy="35" r="5" fill="var(--primary)"><animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" /></circle>
        <circle cx="35" cy="55" r="4" fill="var(--primary)"><animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" begin="0.3s" repeatCount="indefinite" /></circle>
        <circle cx="85" cy="55" r="4" fill="var(--primary)"><animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" begin="0.6s" repeatCount="indefinite" /></circle>
        <circle cx="45" cy="80" r="4" fill="var(--primary)"><animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" begin="0.9s" repeatCount="indefinite" /></circle>
        <circle cx="75" cy="80" r="4" fill="var(--primary)"><animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" begin="1.2s" repeatCount="indefinite" /></circle>
      </g>
      {/* Connecting lines that pulse */}
      <g stroke="var(--primary)" strokeWidth="1" fill="none" opacity="0.3">
        <line x1="60" y1="35" x2="35" y2="55"><animate attributeName="opacity" values="0.1;0.5;0.1" dur="2s" repeatCount="indefinite" /></line>
        <line x1="60" y1="35" x2="85" y2="55"><animate attributeName="opacity" values="0.1;0.5;0.1" dur="2s" begin="0.4s" repeatCount="indefinite" /></line>
        <line x1="35" y1="55" x2="45" y2="80"><animate attributeName="opacity" values="0.1;0.5;0.1" dur="2s" begin="0.8s" repeatCount="indefinite" /></line>
        <line x1="85" y1="55" x2="75" y2="80"><animate attributeName="opacity" values="0.1;0.5;0.1" dur="2s" begin="1.2s" repeatCount="indefinite" /></line>
        <line x1="45" y1="80" x2="75" y2="80"><animate attributeName="opacity" values="0.1;0.5;0.1" dur="2s" begin="0.6s" repeatCount="indefinite" /></line>
        <line x1="35" y1="55" x2="85" y2="55"><animate attributeName="opacity" values="0.1;0.5;0.1" dur="2s" begin="1s" repeatCount="indefinite" /></line>
      </g>
      {/* Scanning beam */}
      <line x1="20" y1="60" x2="100" y2="60" stroke="var(--primary)" strokeWidth="0.5" opacity="0.2">
        <animate attributeName="y1" values="25;95;25" dur="3s" repeatCount="indefinite" />
        <animate attributeName="y2" values="25;95;25" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
      </line>
    </svg>
  );
}

function SvgPlanning() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Blueprint grid */}
      <g stroke="var(--primary)" strokeWidth="0.3" opacity="0.15">
        {[30, 45, 60, 75, 90].map((y) => <line key={`h${y}`} x1="20" y1={y} x2="100" y2={y} />)}
        {[30, 45, 60, 75, 90].map((x) => <line key={`v${x}`} x1={x} y1="20" x2={x} y2="100" />)}
      </g>
      {/* Drawing rectangles that appear one by one */}
      <rect x="30" y="30" width="25" height="15" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="80" strokeDashoffset="80">
        <animate attributeName="stroke-dashoffset" values="80;0" dur="1.5s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.8" dur="0.5s" fill="freeze" />
      </rect>
      <rect x="65" y="30" width="25" height="15" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="80" strokeDashoffset="80">
        <animate attributeName="stroke-dashoffset" values="80;0" dur="1.5s" begin="0.5s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.8" dur="0.5s" begin="0.5s" fill="freeze" />
      </rect>
      <rect x="30" y="55" width="60" height="15" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="150" strokeDashoffset="150">
        <animate attributeName="stroke-dashoffset" values="150;0" dur="1.5s" begin="1s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.8" dur="0.5s" begin="1s" fill="freeze" />
      </rect>
      <rect x="30" y="80" width="18" height="12" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="60" strokeDashoffset="60">
        <animate attributeName="stroke-dashoffset" values="60;0" dur="1.5s" begin="1.5s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.8" dur="0.5s" begin="1.5s" fill="freeze" />
      </rect>
      <rect x="55" y="80" width="18" height="12" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="60" strokeDashoffset="60">
        <animate attributeName="stroke-dashoffset" values="60;0" dur="1.5s" begin="2s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.8" dur="0.5s" begin="2s" fill="freeze" />
      </rect>
      {/* Connecting arrows */}
      <g stroke="var(--primary)" strokeWidth="0.8" opacity="0" fill="none" markerEnd="url(#arrowhead)">
        <line x1="42" y1="45" x2="42" y2="55"><animate attributeName="opacity" values="0;0.6" dur="0.3s" begin="2.5s" fill="freeze" /></line>
        <line x1="78" y1="45" x2="78" y2="55"><animate attributeName="opacity" values="0;0.6" dur="0.3s" begin="2.7s" fill="freeze" /></line>
        <line x1="42" y1="70" x2="39" y2="80"><animate attributeName="opacity" values="0;0.6" dur="0.3s" begin="2.9s" fill="freeze" /></line>
        <line x1="78" y1="70" x2="64" y2="80"><animate attributeName="opacity" values="0;0.6" dur="0.3s" begin="3.1s" fill="freeze" /></line>
      </g>
    </svg>
  );
}

function SvgWritingSoul() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Document shape */}
      <rect x="30" y="20" width="60" height="80" rx="4" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.3" />
      {/* Text lines being written */}
      <g>
        <rect x="40" y="35" width="0" height="2" rx="1" fill="var(--primary)" opacity="0.7">
          <animate attributeName="width" values="0;40" dur="0.8s" fill="freeze" />
        </rect>
        <rect x="40" y="45" width="0" height="2" rx="1" fill="var(--primary)" opacity="0.5">
          <animate attributeName="width" values="0;30" dur="0.8s" begin="0.6s" fill="freeze" />
        </rect>
        <rect x="40" y="55" width="0" height="2" rx="1" fill="var(--primary)" opacity="0.5">
          <animate attributeName="width" values="0;35" dur="0.8s" begin="1.2s" fill="freeze" />
        </rect>
        <rect x="40" y="65" width="0" height="2" rx="1" fill="var(--primary)" opacity="0.5">
          <animate attributeName="width" values="0;25" dur="0.8s" begin="1.8s" fill="freeze" />
        </rect>
        <rect x="40" y="75" width="0" height="2" rx="1" fill="var(--primary)" opacity="0.5">
          <animate attributeName="width" values="0;38" dur="0.8s" begin="2.4s" fill="freeze" />
        </rect>
      </g>
      {/* Cursor blink */}
      <rect x="40" y="83" width="2" height="8" fill="var(--primary)">
        <animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="x" values="40;78;40" dur="6s" repeatCount="indefinite" />
      </rect>
      {/* Soul sparkle */}
      <circle cx="75" cy="28" r="2" fill="var(--primary)" opacity="0">
        <animate attributeName="opacity" values="0;0.8;0" dur="2s" begin="3s" repeatCount="indefinite" />
        <animate attributeName="r" values="1;4;1" dur="2s" begin="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function SvgGeneratingSkills() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Central skill node */}
      <circle cx="60" cy="60" r="12" fill="var(--primary)" opacity="0.15" />
      <circle cx="60" cy="60" r="8" fill="var(--primary)" opacity="0.3">
        <animate attributeName="r" values="8;10;8" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Skill nodes spawning outward */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const tx = 60 + Math.cos(rad) * 35;
        const ty = 60 + Math.sin(rad) * 35;
        return (
          <g key={angle}>
            <line x1="60" y1="60" x2={tx} y2={ty} stroke="var(--primary)" strokeWidth="1" opacity="0" strokeDasharray="4 3">
              <animate attributeName="opacity" values="0;0.4" dur="0.5s" begin={`${i * 0.4}s`} fill="freeze" />
            </line>
            <circle cx={tx} cy={ty} r="0" fill="var(--primary)" opacity="0.7">
              <animate attributeName="r" values="0;6" dur="0.6s" begin={`${i * 0.4}s`} fill="freeze" />
            </circle>
            <circle cx={tx} cy={ty} r="6" fill="none" stroke="var(--primary)" strokeWidth="0.8" opacity="0">
              <animate attributeName="opacity" values="0;0.3;0" dur="2s" begin={`${i * 0.4 + 0.6}s`} repeatCount="indefinite" />
              <animate attributeName="r" values="6;12;6" dur="2s" begin={`${i * 0.4 + 0.6}s`} repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

function SvgConfiguringTools() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Gear 1 */}
      <g transform="translate(45, 50)">
        <animateTransform attributeName="transform" type="rotate" from="0 45 50" to="360 45 50" dur="6s" repeatCount="indefinite" additive="sum" />
        <path d="M0,-18 L4,-7 L15,-7 L6,0 L10,12 L0,5 L-10,12 L-6,0 L-15,-7 L-4,-7 Z"
          fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.6" />
        <circle r="5" fill="var(--primary)" opacity="0.3" />
      </g>
      {/* Gear 2 */}
      <g transform="translate(78, 65)">
        <animateTransform attributeName="transform" type="rotate" from="360 78 65" to="0 78 65" dur="4s" repeatCount="indefinite" additive="sum" />
        <path d="M0,-12 L3,-5 L10,-5 L4,0 L7,8 L0,4 L-7,8 L-4,0 L-10,-5 L-3,-5 Z"
          fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.5" />
        <circle r="3.5" fill="var(--primary)" opacity="0.3" />
      </g>
      {/* Connection sparks */}
      <circle cx="58" cy="58" r="1.5" fill="var(--primary)">
        <animate attributeName="opacity" values="0;1;0" dur="0.6s" repeatCount="indefinite" />
      </circle>
      {/* Plug symbol */}
      <g transform="translate(60, 90)" opacity="0.4">
        <rect x="-8" y="-3" width="16" height="6" rx="1" fill="none" stroke="var(--primary)" strokeWidth="1" />
        <line x1="-3" y1="-6" x2="-3" y2="-3" stroke="var(--primary)" strokeWidth="1.5" />
        <line x1="3" y1="-6" x2="3" y2="-3" stroke="var(--primary)" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

function SvgTriggers() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Clock face */}
      <circle cx="60" cy="55" r="30" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.3" />
      <circle cx="60" cy="55" r="2" fill="var(--primary)" opacity="0.6" />
      {/* Clock hands */}
      <line x1="60" y1="55" x2="60" y2="35" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
        <animateTransform attributeName="transform" type="rotate" from="0 60 55" to="360 60 55" dur="8s" repeatCount="indefinite" />
      </line>
      <line x1="60" y1="55" x2="75" y2="55" stroke="var(--primary)" strokeWidth="1" strokeLinecap="round" opacity="0.4">
        <animateTransform attributeName="transform" type="rotate" from="0 60 55" to="360 60 55" dur="60s" repeatCount="indefinite" />
      </line>
      {/* Hour markers */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        return (
          <circle key={angle} cx={60 + Math.cos(rad) * 26} cy={55 + Math.sin(rad) * 26} r="1.2" fill="var(--primary)" opacity="0.3" />
        );
      })}
      {/* Lightning bolt (trigger) */}
      <g transform="translate(88, 75)" opacity="0">
        <animate attributeName="opacity" values="0;0.8;0" dur="2s" repeatCount="indefinite" />
        <path d="M0,-10 L-5,2 L0,0 L-2,10 L5,-2 L0,0 Z" fill="var(--primary)" />
      </g>
    </svg>
  );
}

function SvgAssembling() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Pieces coming together */}
      <g>
        {/* Top-left piece */}
        <rect x="35" y="35" width="20" height="20" rx="3" fill="var(--primary)" opacity="0.3">
          <animate attributeName="x" values="15;35" dur="1.5s" fill="freeze" />
          <animate attributeName="y" values="15;35" dur="1.5s" fill="freeze" />
          <animate attributeName="opacity" values="0.1;0.3" dur="1.5s" fill="freeze" />
        </rect>
        {/* Top-right piece */}
        <rect x="65" y="35" width="20" height="20" rx="3" fill="var(--primary)" opacity="0.4">
          <animate attributeName="x" values="90;65" dur="1.5s" begin="0.3s" fill="freeze" />
          <animate attributeName="y" values="15;35" dur="1.5s" begin="0.3s" fill="freeze" />
          <animate attributeName="opacity" values="0.1;0.4" dur="1.5s" begin="0.3s" fill="freeze" />
        </rect>
        {/* Bottom-left piece */}
        <rect x="35" y="65" width="20" height="20" rx="3" fill="var(--primary)" opacity="0.5">
          <animate attributeName="x" values="15;35" dur="1.5s" begin="0.6s" fill="freeze" />
          <animate attributeName="y" values="90;65" dur="1.5s" begin="0.6s" fill="freeze" />
          <animate attributeName="opacity" values="0.1;0.5" dur="1.5s" begin="0.6s" fill="freeze" />
        </rect>
        {/* Bottom-right piece */}
        <rect x="65" y="65" width="20" height="20" rx="3" fill="var(--primary)" opacity="0.6">
          <animate attributeName="x" values="90;65" dur="1.5s" begin="0.9s" fill="freeze" />
          <animate attributeName="y" values="90;65" dur="1.5s" begin="0.9s" fill="freeze" />
          <animate attributeName="opacity" values="0.1;0.6" dur="1.5s" begin="0.9s" fill="freeze" />
        </rect>
      </g>
      {/* Merge flash */}
      <circle cx="60" cy="60" r="0" fill="var(--primary)" opacity="0">
        <animate attributeName="r" values="0;30;0" dur="1s" begin="2s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.2;0" dur="1s" begin="2s" fill="freeze" />
      </circle>
      {/* Checkmark draws in */}
      <path d="M48,60 L56,68 L74,50" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="40" strokeDashoffset="40" opacity="0">
        <animate attributeName="stroke-dashoffset" values="40;0" dur="0.6s" begin="2.5s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.8" dur="0.3s" begin="2.5s" fill="freeze" />
      </path>
    </svg>
  );
}

function SvgStillWorking() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Orbiting particles */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx="60" cy="60" r="3" fill="var(--primary)" opacity={0.2 + i * 0.1}>
          <animateTransform attributeName="transform" type="rotate"
            from={`${i * 60} 60 60`} to={`${i * 60 + 360} 60 60`}
            dur={`${3 + i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="cx" values={`${60 + Math.cos((i * 60 * Math.PI) / 180) * (20 + i * 3)}`}
            dur="0.01s" fill="freeze" />
          <animate attributeName="cy" values={`${60 + Math.sin((i * 60 * Math.PI) / 180) * (20 + i * 3)}`}
            dur="0.01s" fill="freeze" />
        </circle>
      ))}
      {/* Center pulse */}
      <circle cx="60" cy="60" r="6" fill="var(--primary)" opacity="0.4">
        <animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.2;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Outer ring breathing */}
      <circle cx="60" cy="60" r="45" fill="none" stroke="var(--primary)" strokeWidth="0.5" opacity="0.15">
        <animate attributeName="r" values="42;48;42" dur="4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// ─── Plan phase SVG animations ───────────────────────────────────────────

function SvgAnalyzingRequirements() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Document stack with scanning line */}
      <rect x="30" y="20" width="60" height="80" rx="4" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.25" />
      <rect x="34" y="24" width="52" height="72" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0.15" />
      {/* Content lines */}
      {[34, 42, 50, 58, 66, 74, 82].map((y, i) => (
        <rect key={y} x="38" y={y} width={30 + (i % 3) * 8} height="2" rx="1" fill="var(--primary)" opacity="0.12" />
      ))}
      {/* Scanning highlight bar */}
      <rect x="34" y="24" width="52" height="6" rx="1" fill="var(--primary)" opacity="0.15">
        <animate attributeName="y" values="24;90;24" dur="3s" repeatCount="indefinite" />
      </rect>
      {/* Extracted nodes floating to the right */}
      {[{ cy: 35, delay: 0 }, { cy: 55, delay: 1 }, { cy: 75, delay: 2 }].map(({ cy, delay }, i) => (
        <circle key={i} cx="96" cy={cy} r="0" fill="var(--primary)" opacity="0">
          <animate attributeName="r" values="0;4;4;0" dur="3s" begin={`${delay}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.5;0.5;0" dur="3s" begin={`${delay}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

function SvgDesigningSkills() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Central node */}
      <circle cx="60" cy="60" r="12" fill="var(--primary)" opacity="0.15" stroke="var(--primary)" strokeWidth="1.5" />
      {/* Lightning bolt */}
      <path d="M57,54 L63,54 L60,60 L64,60 L57,68 L59,62 L55,62 Z" fill="var(--primary)" opacity="0.5" />
      {/* Orbiting skill nodes */}
      {[0, 72, 144, 216, 288].map((angle, i) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        const cx = 60 + Math.cos(rad) * 38;
        const cy = 60 + Math.sin(rad) * 38;
        return (
          <g key={i}>
            <line x1="60" y1="60" x2={cx} y2={cy} stroke="var(--primary)" strokeWidth="0.8" strokeDasharray="3 2" opacity="0">
              <animate attributeName="opacity" values="0;0.3" dur="0.5s" begin={`${i * 0.4}s`} fill="freeze" />
            </line>
            <circle cx={cx} cy={cy} r="0" fill="var(--primary)" opacity="0">
              <animate attributeName="r" values="0;8" dur="0.6s" begin={`${i * 0.4}s`} fill="freeze" />
              <animate attributeName="opacity" values="0;0.25" dur="0.6s" begin={`${i * 0.4}s`} fill="freeze" />
            </circle>
            <circle cx={cx} cy={cy} r="0" fill="var(--primary)" opacity="0">
              <animate attributeName="r" values="0;3" dur="0.6s" begin={`${i * 0.4}s`} fill="freeze" />
              <animate attributeName="opacity" values="0;0.6" dur="0.6s" begin={`${i * 0.4}s`} fill="freeze" />
            </circle>
          </g>
        );
      })}
      {/* Pulse on center */}
      <circle cx="60" cy="60" r="12" fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0.4">
        <animate attributeName="r" values="12;20;12" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function SvgMappingIntegrations() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* API connection lines */}
      {[
        { x1: 20, y1: 30, x2: 60, y2: 60 },
        { x1: 100, y1: 30, x2: 60, y2: 60 },
        { x1: 20, y1: 90, x2: 60, y2: 60 },
        { x1: 100, y1: 90, x2: 60, y2: 60 },
      ].map(({ x1, y1, x2, y2 }, i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--primary)" strokeWidth="1" strokeDasharray="4 3" opacity="0">
          <animate attributeName="opacity" values="0;0.35;0.35;0" dur="3s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
        </line>
      ))}
      {/* Central hub */}
      <rect x="48" y="48" width="24" height="24" rx="6" fill="var(--primary)" opacity="0.15" stroke="var(--primary)" strokeWidth="1.5">
        <animate attributeName="opacity" values="0.1;0.25;0.1" dur="2s" repeatCount="indefinite" />
      </rect>
      {/* Endpoint nodes */}
      {[{ cx: 20, cy: 30 }, { cx: 100, cy: 30 }, { cx: 20, cy: 90 }, { cx: 100, cy: 90 }].map(({ cx, cy }, i) => (
        <g key={i}>
          <rect x={cx - 10} y={cy - 8} width="20" height="16" rx="3" fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0">
            <animate attributeName="opacity" values="0;0.4" dur="0.5s" begin={`${i * 0.5}s`} fill="freeze" />
          </rect>
          {/* Data flowing to center */}
          <circle cx={cx} cy={cy} r="2" fill="var(--primary)" opacity="0">
            <animate attributeName="cx" values={`${cx};60`} dur="1.5s" begin={`${i * 0.5 + 0.5}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${cy};60`} dur="1.5s" begin={`${i * 0.5 + 0.5}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.5;0" dur="1.5s" begin={`${i * 0.5 + 0.5}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </svg>
  );
}

function SvgPlanningWorkflow() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Flowchart boxes drawing themselves */}
      {[
        { x: 40, y: 15, w: 40, h: 18, delay: 0 },
        { x: 15, y: 50, w: 35, h: 18, delay: 0.8 },
        { x: 70, y: 50, w: 35, h: 18, delay: 1.2 },
        { x: 40, y: 85, w: 40, h: 18, delay: 2.0 },
      ].map(({ x, y, w, h, delay }, i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="4" fill="none" stroke="var(--primary)" strokeWidth="1.5"
          strokeDasharray="120" strokeDashoffset="120" opacity="0.5">
          <animate attributeName="stroke-dashoffset" values="120;0" dur="0.8s" begin={`${delay}s`} fill="freeze" />
        </rect>
      ))}
      {/* Connecting arrows */}
      {[
        { d: "M50,33 L32,50", delay: 0.6 },
        { d: "M70,33 L87,50", delay: 1.0 },
        { d: "M32,68 L50,85", delay: 1.6 },
        { d: "M87,68 L70,85", delay: 2.0 },
      ].map(({ d, delay }, i) => (
        <path key={i} d={d} fill="none" stroke="var(--primary)" strokeWidth="1" markerEnd="url(#arrowhead)" opacity="0">
          <animate attributeName="opacity" values="0;0.4" dur="0.3s" begin={`${delay}s`} fill="freeze" />
        </path>
      ))}
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <path d="M0,0 L6,2 L0,4" fill="var(--primary)" opacity="0.4" />
        </marker>
      </defs>
      {/* Pulse on completion */}
      <circle cx="60" cy="60" r="0" fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0">
        <animate attributeName="r" values="0;50" dur="2s" begin="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0" dur="2s" begin="2.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function SvgAssemblingPlan() {
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {/* Blueprint grid */}
      <rect x="20" y="20" width="80" height="80" rx="4" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.2" />
      {[40, 60, 80].map((pos) => (
        <g key={pos}>
          <line x1={pos} y1="20" x2={pos} y2="100" stroke="var(--primary)" strokeWidth="0.5" opacity="0.1" />
          <line x1="20" y1={pos} x2="100" y2={pos} stroke="var(--primary)" strokeWidth="0.5" opacity="0.1" />
        </g>
      ))}
      {/* Pieces assembling into center */}
      {[
        { fromX: 10, fromY: 10, toX: 30, toY: 30, delay: 0 },
        { fromX: 110, fromY: 10, toX: 70, toY: 30, delay: 0.4 },
        { fromX: 10, fromY: 110, toX: 30, toY: 70, delay: 0.8 },
        { fromX: 110, fromY: 110, toX: 70, toY: 70, delay: 1.2 },
        { fromX: 60, fromY: 5, toX: 50, toY: 50, delay: 1.6 },
      ].map(({ fromX, fromY, toX, toY, delay }, i) => (
        <rect key={i} x={fromX} y={fromY} width="20" height="20" rx="3" fill="var(--primary)" opacity="0">
          <animate attributeName="x" values={`${fromX};${toX}`} dur="0.8s" begin={`${delay}s`} fill="freeze" />
          <animate attributeName="y" values={`${fromY};${toY}`} dur="0.8s" begin={`${delay}s`} fill="freeze" />
          <animate attributeName="opacity" values="0;0.2" dur="0.8s" begin={`${delay}s`} fill="freeze" />
        </rect>
      ))}
      {/* Completion checkmark */}
      <path d="M48,60 L55,67 L72,50" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="40" strokeDashoffset="40" opacity="0">
        <animate attributeName="stroke-dashoffset" values="40;0" dur="0.6s" begin="2.5s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.6" dur="0.3s" begin="2.5s" fill="freeze" />
      </path>
    </svg>
  );
}

const PLAN_PHASES: { at: number; label: string; Svg: () => React.ReactNode }[] = [
  { at: 0, label: "Analyzing requirements documents...", Svg: SvgAnalyzingRequirements },
  { at: 8, label: "Designing skills & capabilities...", Svg: SvgDesigningSkills },
  { at: 20, label: "Mapping integrations & tools...", Svg: SvgMappingIntegrations },
  { at: 35, label: "Planning workflow & triggers...", Svg: SvgPlanningWorkflow },
  { at: 55, label: "Assembling architecture plan...", Svg: SvgAssemblingPlan },
  { at: 90, label: "Refining plan details...", Svg: SvgDesigningSkills },
  { at: 150, label: "Still planning — complex agents take time...", Svg: SvgPlanningWorkflow },
];

const PLAN_MILESTONES = [
  { id: "analyze", label: "Analyze", icon: Search },
  { id: "skills", label: "Skills", icon: Zap },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "workflow", label: "Workflow", icon: GitBranch },
  { id: "triggers", label: "Triggers", icon: Clock },
  { id: "assemble", label: "Assemble", icon: Target },
] as const;

function PlanActivityPanel({
  planActivity,
  planStep,
}: {
  planActivity: PlanActivityItem[];
  planStep?: string;
}) {
  const elapsed = useElapsedTime(true);
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll feed
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [planActivity.length]);

  // Determine active milestone — prefer real planStep, fall back to time
  const MILESTONE_MAP: Record<string, number> = {
    skills: 1, workflow: 2, data: 3, api: 3, dashboard: 4, envvars: 4, complete: 5,
  };
  let activeMilestone = 0;
  if (planStep && planStep !== "idle" && MILESTONE_MAP[planStep] !== undefined) {
    activeMilestone = MILESTONE_MAP[planStep];
  } else if (planActivity.length > 0) {
    // Derive from last activity event
    const lastType = planActivity[planActivity.length - 1].type;
    const typeMap: Record<string, number> = {
      skills: 1, workflow: 2, data_schema: 3, api_endpoints: 3, dashboard_pages: 4, env_vars: 4, complete: 5,
    };
    activeMilestone = typeMap[lastType] ?? 0;
  } else {
    // Time-based fallback
    if (elapsed >= 55) activeMilestone = 5;
    else if (elapsed >= 35) activeMilestone = 4;
    else if (elapsed >= 25) activeMilestone = 3;
    else if (elapsed >= 15) activeMilestone = 2;
    else if (elapsed >= 8) activeMilestone = 1;
  }

  const maxMilestoneRef = useRef(0);
  if (activeMilestone > maxMilestoneRef.current) maxMilestoneRef.current = activeMilestone;
  const maxReached = maxMilestoneRef.current;

  // Phase label — use real activity or time-based
  const lastActivity = planActivity.length > 0 ? planActivity[planActivity.length - 1] : null;
  let displayLabel = "Analyzing requirements documents...";
  if (lastActivity) {
    displayLabel = lastActivity.label;
  } else {
    for (const phase of PLAN_PHASES) {
      if (elapsed >= phase.at) displayLabel = phase.label;
    }
  }

  // Stats
  const totalDecisions = planActivity.length;
  const skillCount = planActivity.find((a) => a.type === "skills")?.count ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* ── Journey Milestone Bar ─────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          {PLAN_MILESTONES.map((ms, i) => {
            const Icon = ms.icon;
            const done = i < maxReached;
            const active = i === activeMilestone;
            return (
              <div key={ms.id} className="flex items-center gap-0.5">
                <div className={`flex flex-col items-center gap-1 ${
                  active ? "scale-110" : ""
                } transition-transform`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                    done
                      ? "bg-[var(--success)]/15 border border-[var(--success)]/30"
                      : active
                        ? "bg-[var(--primary)]/15 border border-[var(--primary)]/40 shadow-sm shadow-[var(--primary)]/20"
                        : "bg-[var(--background)] border border-[var(--border-stroke)]"
                  }`}>
                    {done ? (
                      <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                    ) : active ? (
                      <Icon className="h-3 w-3 text-[var(--primary)] animate-pulse" />
                    ) : (
                      <Icon className="h-3 w-3 text-[var(--text-tertiary)]/40" />
                    )}
                  </div>
                  <span className={`text-[8px] font-satoshi-medium ${
                    done ? "text-[var(--success)]"
                    : active ? "text-[var(--primary)]"
                    : "text-[var(--text-tertiary)]/50"
                  }`}>{ms.label}</span>
                </div>
                {i < PLAN_MILESTONES.length - 1 && (
                  <div className={`w-4 h-px mx-0.5 mt-[-12px] ${
                    i < maxReached ? "bg-[var(--success)]/40" : "bg-[var(--border-stroke)]"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Current Action Label ──────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-center gap-2 px-4 py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
        <p className="text-xs font-satoshi-medium text-[var(--text-secondary)] text-center">
          {displayLabel}
        </p>
      </div>

      {/* ── Stats Row ─────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-center gap-4 px-4 py-2 border-y border-[var(--border-default)] bg-[var(--background)]/50">
        <div className="flex items-center gap-1.5">
          <Map className="h-3 w-3 text-[var(--primary)]" />
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
            {totalDecisions} decision{totalDecisions !== 1 ? "s" : ""}
          </span>
        </div>
        {skillCount > 0 && (
          <>
            <div className="w-px h-3 bg-[var(--border-stroke)]" />
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-[var(--primary)]" />
              <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                {skillCount} skill{skillCount !== 1 ? "s" : ""}
              </span>
            </div>
          </>
        )}
        <div className="w-px h-3 bg-[var(--border-stroke)]" />
        <div className="flex items-center gap-1.5">
          <Timer className="h-3 w-3 text-[var(--text-tertiary)]" />
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
            {elapsed}s
          </span>
        </div>
      </div>

      {/* ── Live Activity Feed ────────────────────────────────── */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        {planActivity.length === 0 ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />
            <span className="text-[10px] font-mono text-[var(--primary)]">
              Waiting for architect decisions...
            </span>
          </div>
        ) : (
          planActivity.map((item) => {
            const iconMap: Record<string, typeof Zap> = {
              skills: Zap, workflow: GitBranch, data_schema: Database,
              api_endpoints: Wrench, dashboard_pages: Compass, env_vars: Lock, complete: Target,
            };
            const Icon = iconMap[item.type] ?? Compass;
            return (
              <div key={item.id} className="flex items-start gap-2 py-1 stage-enter">
                <Icon className="h-3 w-3 text-[var(--primary)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-satoshi-medium text-[var(--text-primary)]">
                    {item.label}
                  </p>
                  {item.count > 0 && (
                    <p className="text-[9px] font-mono text-[var(--text-tertiary)]">
                      {item.count} item{item.count !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Build phase config ──────────────────────────────────────────────────

const BUILD_PHASES: { at: number; label: string; Svg: () => React.ReactNode }[] = [
  { at: 0, label: "Connecting to architect agent...", Svg: SvgConnecting },
  { at: 5, label: "Analyzing requirements...", Svg: SvgAnalyzing },
  { at: 15, label: "Planning workspace structure...", Svg: SvgPlanning },
  { at: 30, label: "Writing SOUL.md — agent personality...", Svg: SvgWritingSoul },
  { at: 50, label: "Generating skill files...", Svg: SvgGeneratingSkills },
  { at: 90, label: "Configuring tools & integrations...", Svg: SvgConfiguringTools },
  { at: 130, label: "Setting up triggers & schedules...", Svg: SvgTriggers },
  { at: 170, label: "Assembling skill graph...", Svg: SvgAssembling },
  { at: 210, label: "Still working — complex agents take time...", Svg: SvgStillWorking },
  { at: 300, label: "Almost there — architect is thorough...", Svg: SvgStillWorking },
];

// Map real event types to the matching SVG phase
function phaseFromEvent(item: BuildActivityItem): typeof BUILD_PHASES[number] | null {
  if (item.label.includes("SOUL")) return BUILD_PHASES[3]; // Writing SOUL.md
  if (item.type === "skill") return BUILD_PHASES[4]; // Generating skills
  if (item.label.includes("tool") || item.label.includes("integration")) return BUILD_PHASES[5]; // Tools
  if (item.label.includes("trigger") || item.label.includes("cron")) return BUILD_PHASES[6]; // Triggers
  if (item.type === "file") return BUILD_PHASES[4]; // Generic file → skills phase
  return null;
}

// ─── Build milestones for the journey tracker ────────────────────────────

const BUILD_MILESTONES = [
  { id: "manifest", label: "Manifest", icon: FileText },
  { id: "connect", label: "Connect", icon: Zap },
  { id: "soul", label: "Soul", icon: Bot },
  { id: "skills", label: "Skills", icon: GitBranch },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "triggers", label: "Triggers", icon: Clock },
  { id: "assemble", label: "Assemble", icon: Diff },
] as const;

function milestoneIndexFromEvent(item: BuildActivityItem): number {
  const l = item.label.toLowerCase();
  if (l.includes("agents.md") || l.includes("manifest")) return 0;
  if (l.includes("soul")) return 2;
  if (item.type === "skill") return 3;
  if (l.includes("tool") || l.includes("integration") || l.includes("mcp")) return 4;
  if (l.includes("trigger") || l.includes("cron") || l.includes("schedule")) return 5;
  if (l.includes("assemble") || l.includes("graph") || l.includes("workflow")) return 6;
  if (item.type === "file") return 3; // generic file → skills phase
  return 1; // default to connect
}

function BuildActivityPanel({
  buildActivity,
  buildProgress,
}: {
  buildActivity: BuildActivityItem[];
  buildProgress: BuildProgress | null;
}) {
  const elapsed = useElapsedTime(true);
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll activity feed
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [buildActivity.length]);

  // Determine current milestone from events or time
  const lastEvent = buildActivity.length > 0 ? buildActivity[buildActivity.length - 1] : null;
  let activeMilestone = 0;
  if (lastEvent) {
    activeMilestone = milestoneIndexFromEvent(lastEvent);
  } else {
    // Time-based fallback (indices shifted for Manifest milestone at 0)
    if (elapsed >= 150) activeMilestone = 6;
    else if (elapsed >= 110) activeMilestone = 5;
    else if (elapsed >= 70) activeMilestone = 4;
    else if (elapsed >= 40) activeMilestone = 3;
    else if (elapsed >= 20) activeMilestone = 2;
    else if (elapsed >= 5) activeMilestone = 1;
  }

  // Track max milestone reached (never regress)
  const maxMilestoneRef = useRef(0);
  if (activeMilestone > maxMilestoneRef.current) maxMilestoneRef.current = activeMilestone;
  const maxReached = maxMilestoneRef.current;

  // Prefer real events to drive the SVG; fall back to time-based
  const eventPhase = lastEvent ? phaseFromEvent(lastEvent) : null;
  let currentPhase = BUILD_PHASES[0];
  if (eventPhase) {
    currentPhase = eventPhase;
  } else {
    for (const phase of BUILD_PHASES) {
      if (elapsed >= phase.at) currentPhase = phase;
    }
  }

  const { Svg } = currentPhase;
  const displayLabel = lastEvent
    ? lastEvent.type === "skill"
      ? `Creating skill: ${lastEvent.label}`
      : lastEvent.type === "file"
        ? `Writing: ${lastEvent.label}`
        : lastEvent.label
    : currentPhase.label;

  const fileCount = buildActivity.filter((e) => e.type === "file").length;
  const skillCount = buildProgress?.completed ?? buildActivity.filter((e) => e.type === "skill").length;
  const totalSkills = buildProgress?.total;

  return (
    <div className="flex flex-col h-full">
      {/* ── Journey Milestone Bar ─────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          {BUILD_MILESTONES.map((ms, i) => {
            const Icon = ms.icon;
            const done = i < maxReached;
            const active = i === activeMilestone;
            return (
              <div key={ms.id} className="flex items-center gap-0.5">
                <div className={`flex flex-col items-center gap-1 ${
                  active ? "scale-110" : ""
                } transition-transform`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                    done
                      ? "bg-[var(--success)]/15 border border-[var(--success)]/30"
                      : active
                        ? "bg-[var(--primary)]/15 border border-[var(--primary)]/40 shadow-sm shadow-[var(--primary)]/20"
                        : "bg-[var(--background)] border border-[var(--border-stroke)]"
                  }`}>
                    {done ? (
                      <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                    ) : active ? (
                      <Icon className="h-3 w-3 text-[var(--primary)] animate-pulse" />
                    ) : (
                      <Icon className="h-3 w-3 text-[var(--text-tertiary)]/40" />
                    )}
                  </div>
                  <span className={`text-[8px] font-satoshi-medium ${
                    done ? "text-[var(--success)]"
                    : active ? "text-[var(--primary)]"
                    : "text-[var(--text-tertiary)]/50"
                  }`}>{ms.label}</span>
                </div>
                {i < BUILD_MILESTONES.length - 1 && (
                  <div className={`w-4 h-px mx-0.5 mt-[-12px] ${
                    i < maxReached ? "bg-[var(--success)]/40" : "bg-[var(--border-stroke)]"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Hero: Animation + Current Action ──────────────────── */}
      <div className="shrink-0 flex flex-col items-center gap-2 px-4 pb-2">
        <div key={currentPhase.at} className="typewriter-word">
          <Svg />
        </div>
        <p key={displayLabel} className="text-xs font-satoshi-medium text-[var(--text-secondary)] typewriter-word text-center">
          {displayLabel}
        </p>
      </div>

      {/* ── Stats Row ─────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-center gap-4 px-4 py-2 border-y border-[var(--border-default)] bg-[var(--background)]/50">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3 w-3 text-[var(--primary)]" />
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
            {skillCount}{totalSkills ? `/${totalSkills}` : ""} skills
          </span>
        </div>
        <div className="w-px h-3 bg-[var(--border-stroke)]" />
        <div className="flex items-center gap-1.5">
          <FileText className="h-3 w-3 text-[var(--primary)]" />
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
            {fileCount} files
          </span>
        </div>
        <div className="w-px h-3 bg-[var(--border-stroke)]" />
        <div className="flex items-center gap-1.5">
          <Timer className="h-3 w-3 text-[var(--text-tertiary)]" />
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
            {elapsed}s
          </span>
        </div>
      </div>

      {/* ── Live Activity Feed ────────────────────────────────── */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {buildActivity.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-[10px] text-[var(--text-tertiary)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting for architect to start writing files...
          </div>
        ) : (
          buildActivity.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-0.5 animate-fadeIn">
              {item.type === "skill" ? (
                <div className="w-4 h-4 rounded-full bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                  <Zap className="h-2.5 w-2.5 text-[var(--primary)]" />
                </div>
              ) : item.type === "tool" ? (
                <div className="w-4 h-4 rounded-full bg-[var(--warning)]/10 flex items-center justify-center shrink-0">
                  <Wrench className="h-2.5 w-2.5 text-[var(--warning)]" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full bg-[var(--text-tertiary)]/8 flex items-center justify-center shrink-0">
                  <FileText className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />
                </div>
              )}
              <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate">
                {item.type === "skill" ? `✦ ${item.label}` : item.label}
              </span>
              <span className="text-[9px] font-mono text-[var(--text-tertiary)]/50 shrink-0 ml-auto">
                {Math.round((Date.now() - item.timestamp) / 1000)}s ago
              </span>
            </div>
          ))
        )}
        {buildActivity.length > 0 && (
          <div className="flex items-center gap-2 py-0.5">
            <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />
            <span className="text-[10px] font-mono text-[var(--primary)]">
              {buildProgress?.currentSkill
                ? `Building: ${buildProgress.currentSkill}...`
                : "Working..."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stage-aware placeholder text ───────────────────────────────────────────

export function getStageInputPlaceholder(devStage: string | undefined, isBuilderMode: boolean, agentName: string, isFeatureMode = false): string {
  if (!isBuilderMode) return `Message ${agentName}…`;
  if (isFeatureMode) {
    switch (devStage) {
      case "think": return "Describe the feature you want to add...";
      case "plan": return "Ask about the feature architecture...";
      case "build": return "Feature build in progress...";
      case "review": return "Ask about changes or request modifications...";
      case "test": return "Review feature test results...";
      case "ship": return "Ready to merge. Create a PR to proceed.";
      case "reflect": return "Feature complete.";
      default: return "Describe the feature...";
    }
  }
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
  agentId?: string | null;
  onComplete?: () => void | Promise<boolean>;
  canComplete?: boolean;
  isCompleting?: boolean;
  onDiscoveryComplete?: () => void;
  onPlanApproved?: () => void;
  onRetryBuild?: () => void;
  onCancelBuild?: () => void;
  onDone?: () => void;
  /**
   * Called when the user asks the architect to revise a specific artifact
   * (PRD, TRD, or Plan). Parent selects the target and switches chat into
   * revision mode.
   */
  onRequestArtifactChange?: (target: ArtifactTarget) => void;
}

export function LifecycleStepRenderer({
  embedded = false,
  agentId,
  onComplete,
  canComplete = false,
  isCompleting = false,
  onDiscoveryComplete,
  onPlanApproved,
  onRetryBuild,
  onCancelBuild,
  onDone,
  onRequestArtifactChange,
}: LifecycleStepRendererProps) {
  const store = useCoPilotStore();
  const { devStage, maxUnlockedDevStage } = store;
  const searchParams = useSearchParams();
  const featureBranch = searchParams.get("branch");
  const featureCtx = store.featureContext;
  const [revealAttemptCount, setRevealAttemptCount] = useState(1);

  const stageIdx = AGENT_DEV_STAGES.indexOf(devStage);
  const stageAdvanceSaving = store.lifecycleAdvanceStatus === "saving";

  const confirmStageWithBackend = useCallback(async (nextStage: AgentDevStage) => {
    if (featureBranch) {
      return { stage: nextStage };
    }
    if (devStage === "ship" && nextStage === "reflect") {
      return { stage: nextStage };
    }
    if (!agentId) {
      throw new Error("No agent ID is available for lifecycle advancement.");
    }
    const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/forge/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: nextStage }),
    });
    const payload = await res.json().catch(() => ({})) as { forge_stage?: string; detail?: string; message?: string };
    if (!res.ok) {
      throw new Error(payload.detail ?? payload.message ?? `Stage update failed (${res.status})`);
    }
    const confirmedStage = payload.forge_stage;
    if (!AGENT_DEV_STAGES.includes(confirmedStage as AgentDevStage)) {
      throw new Error("Stage update returned an invalid lifecycle stage.");
    }
    return { stage: confirmedStage as AgentDevStage };
  }, [agentId, devStage, featureBranch]);

  const advanceDevStage = useCallback(() => {
    void store.advanceDevStage({ confirmStage: confirmStageWithBackend });
  }, [confirmStageWithBackend, store]);

  const setArtifactChatContext = useCallback((target: ArtifactTarget, mode: "ask" | "revise" | "debug") => {
    store.setSelectedArtifactTarget(target);
    store.setChatMode(mode);
  }, [store]);

  const artifactActions = useMemo<ArtifactActionHandlers>(() => ({
    requestChanges: (target) => {
      setArtifactChatContext(target, "revise");
      onRequestArtifactChange?.(target);
    },
    regenerate: (target) => {
      setArtifactChatContext(target, "revise");
      onRequestArtifactChange?.(target);
    },
    compare: (target) => setArtifactChatContext(target, "ask"),
    explain: (target) => setArtifactChatContext(target, "ask"),
    openFiles: (target) => setArtifactChatContext(target, "ask"),
  }), [onRequestArtifactChange, setArtifactChatContext]);

  // Determine which stages are unlocked
  const isStageUnlocked = (stage: AgentDevStage): boolean =>
    isLifecycleStageUnlocked(stage, maxUnlockedDevStage);

  const isStageActive = (stage: AgentDevStage) => stage === devStage;

  const isStageDone = (stage: AgentDevStage): boolean =>
    isLifecycleStageDone(stage, maxUnlockedDevStage, {
      devStage,
      thinkStatus: store.thinkStatus,
      planStatus: store.planStatus,
      buildStatus: store.buildStatus,
      evalStatus: store.evalStatus,
      deployStatus: store.deployStatus,
    });

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

  const anyStageLoading = AGENT_DEV_STAGES.some((s) => isStageLoading(s)) || stageAdvanceSaving;

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
          const fMeta = featureCtx ? FEATURE_STAGE_META[stage] : null;
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
              title={fMeta?.description ?? meta.description}
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
              {fMeta?.label ?? meta.label}
              {i < AGENT_DEV_STAGES.length - 1 && (
                <ChevronRight className="h-2.5 w-2.5 text-[var(--text-tertiary)]/30 ml-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Stage content ─────────────────────────────────────── */}
      {store.lifecycleAdvanceError && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/5 px-4 py-2">
          <p className="text-xs font-satoshi-medium text-red-600">
            {store.lifecycleAdvanceError}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {devStage === "reveal" && (
          <StageReveal
            store={store}
            agentId={agentId ?? store.systemName ?? store.name ?? ""}
            attemptCount={revealAttemptCount}
            onRegenerate={() => setRevealAttemptCount((c) => c + 1)}
          />
        )}
        {devStage === "think" && featureCtx && (
          <div className="px-4 pt-4">
            <FeatureBriefCard
              title={featureCtx.title}
              description={featureCtx.description}
              baselineAgent={featureCtx.baselineAgent}
              stage={devStage}
            />
          </div>
        )}
        {devStage === "think" && (
          <StageThinkPlaceholder
            store={store}
            onDiscoveryComplete={onDiscoveryComplete}
            sandboxId={store.agentSandboxId}
            onRequestArtifactChange={onRequestArtifactChange}
            artifactActions={artifactActions}
          />
        )}
        {devStage === "plan" && (
          <StagePlan
            store={store}
            onPlanApproved={onPlanApproved}
            onRequestArtifactChange={onRequestArtifactChange}
            artifactActions={artifactActions}
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

            {store.buildReport && (
              <div className="space-y-3">
                <ArtifactActionBar
                  target={{ kind: "build_report", path: ".openclaw/build/build-report.json" }}
                  canApprove={store.buildStatus === "done" && store.buildReport.readiness !== "blocked"}
                  canRegenerate={false}
                  onApprove={advanceDevStage}
                  onRequestChanges={artifactActions.requestChanges}
                  onRegenerate={artifactActions.regenerate}
                  onCompare={artifactActions.compare}
                  onExplain={artifactActions.explain}
                  onOpenFiles={artifactActions.openFiles}
                />
                <BuildReportPanel
                  report={store.buildReport}
                  onRetryFailedStep={onRetryBuild ?? (() => undefined)}
                  onSelectArtifact={artifactActions.explain}
                />
              </div>
            )}

            {store.buildStatus === "building" && (
              <>
                <BuildActivityPanel
                  buildActivity={store.buildActivity}
                  buildProgress={store.buildProgress}
                />
                {onCancelBuild && (
                  <div className="flex justify-center mt-3">
                    <button
                      onClick={onCancelBuild}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-satoshi-medium text-[var(--text-tertiary)] border border-[var(--border-default)] rounded-lg hover:border-red-300 hover:text-red-500 transition-colors"
                    >
                      Cancel Build
                    </button>
                  </div>
                )}
              </>
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
          <>
            {featureBranch && agentId && (
              <div className="px-4 pt-4">
                <BranchDiffPanel agentId={agentId} branchName={featureBranch} />
              </div>
            )}
            <StageReview
              store={store}
              onApprove={advanceDevStage}
              artifactActions={artifactActions}
            />
          </>
        )}
        {devStage === "test" && (
          <StageTest
            store={store}
            onApprove={advanceDevStage}
            agentId={agentId}
            artifactActions={artifactActions}
          />
        )}
        {devStage === "ship" && featureCtx && featureBranch && agentId ? (
          <StageMerge agentId={agentId} branchName={featureBranch} featureTitle={featureCtx.title} agentName={featureCtx.baselineAgent.name} />
        ) : devStage === "ship" && (
          <StageShip
            store={store}
            agentId={agentId}
            onComplete={onComplete}
            canComplete={canComplete}
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
        <button
          onClick={advanceDevStage}
          disabled={stageIdx >= AGENT_DEV_STAGES.length - 1 || anyStageLoading || !store.canAdvanceDevStage()}
          className="px-3 py-1.5 text-xs font-satoshi-bold text-[var(--primary)] hover:text-[var(--primary)]/80 disabled:opacity-30 disabled:text-[var(--text-tertiary)] transition-colors"
        >
          {stageAdvanceSaving ? "Saving..." : stageIdx >= AGENT_DEV_STAGES.length - 1 ? "Done" : "Next →"}
        </button>
      </div>
    </div>
  );
}

// ─── Reveal stage (embedded employee profile card) ──────────────────────────
// Renders MeetYourEmployee inside the Co-Pilot workspace panel so the reveal
// lives alongside the chat instead of replacing the whole page.

function StageReveal({
  store,
  agentId,
  attemptCount,
  onRegenerate,
}: {
  store: CoPilotState & CoPilotActions;
  agentId: string;
  attemptCount: number;
  onRegenerate?: () => void;
}) {
  const phase: "composing" | "ready" =
    store.revealStatus === "ready" ? "ready" : "composing";
  const progress = new Set(store.revealProgress);

  return (
    <MeetYourEmployee
      embedded
      reveal={store.revealData ?? {}}
      agentId={agentId || "genesis"}
      agentName={store.name || "Agent"}
      phase={phase}
      progress={progress}
      thoughtStream={store.revealThoughtStream}
      attemptCount={attemptCount}
      isProvisioning={false}
      onConfirm={(answer) => {
        store.setRevealAnswer(answer);
        store.setRevealStatus("approved");
        store.setDevStage("think");
      }}
      onRegenerate={() => {
        store.resetRevealStreaming();
        onRegenerate?.();
      }}
    />
  );
}

// ─── Think stage (wraps existing StepDiscovery) ─────────────────────────────

function StageThinkPlaceholder({
  store,
  onDiscoveryComplete,
  sandboxId,
  onRequestArtifactChange,
  artifactActions,
}: {
  store: CoPilotState & CoPilotActions;
  onDiscoveryComplete?: () => void;
  sandboxId?: string | null;
  onRequestArtifactChange?: (target: ArtifactTarget) => void;
  artifactActions?: ArtifactActionHandlers;
}) {
  // New XML flow: workspace paths are set but in-memory documents are not.
  // Read the files from workspace and hydrate discoveryDocuments so StepDiscovery
  // can show the full PRD/TRD with tabs, editing, and the original approval UI.
  const hasWorkspaceDocs = store.prdPath && store.trdPath;
  const [loadingDocs, setLoadingDocs] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (
      store.thinkStatus === "ready" &&
      hasWorkspaceDocs &&
      !store.discoveryDocuments &&
      !loadingDocs &&
      !hydratedRef.current
    ) {
      hydratedRef.current = true;
      setLoadingDocs(true);

      // Read PRD and TRD from the workspace and parse into DiscoveryDocuments
      import("@/lib/openclaw/workspace-writer").then(({ readWorkspaceFile }) => {
        const effectiveSandboxId = sandboxId || store.agentSandboxId;
        if (!effectiveSandboxId) { setLoadingDocs(false); return; }

        Promise.all([
          readWorkspaceFile(effectiveSandboxId, store.prdPath!),
          readWorkspaceFile(effectiveSandboxId, store.trdPath!),
        ]).then(([prdContent, trdContent]) => {
          if (prdContent && trdContent) {
            // Parse markdown into sections (split by ## headings)
            const parseSections = (md: string) => {
              const lines = md.split("\n");
              const title = lines[0]?.replace(/^#\s+/, "") ?? "Document";
              const sections: Array<{ heading: string; content: string }> = [];
              let currentHeading = "";
              let currentContent: string[] = [];

              for (const line of lines.slice(1)) {
                if (line.startsWith("## ")) {
                  if (currentHeading) {
                    sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
                  }
                  currentHeading = line.replace(/^##\s+/, "");
                  currentContent = [];
                } else {
                  currentContent.push(line);
                }
              }
              if (currentHeading) {
                sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
              }
              return { title, sections };
            };

            store.setDiscoveryDocuments({
              prd: parseSections(prdContent),
              trd: parseSections(trdContent),
            });
          }
          setLoadingDocs(false);
        }).catch(() => setLoadingDocs(false));
      }).catch(() => setLoadingDocs(false));
    }
  }, [store.thinkStatus, hasWorkspaceDocs, store.discoveryDocuments, loadingDocs, sandboxId, store.agentSandboxId, store.prdPath, store.trdPath, store]);

  // While generating, show the animated Think activity panel instead of a
  // static "Preparing documents..." text box.
  if (store.thinkStatus === "generating") {
    return <ThinkActivityPanel thinkActivity={store.thinkActivity} thinkStep={store.thinkStep} researchFindings={store.researchFindings} />;
  }

  // Once documents are ready (or idle/error), delegate to StepDiscovery.
  const effectiveStatus = store.discoveryDocuments ? "ready" as const
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
      onRequestArtifactChange={onRequestArtifactChange}
      artifactActions={artifactActions}
    />
  );
}

// ─── Plan stage — displays the architecture plan for review/editing ──────────

function StagePlan({
  store,
  onPlanApproved,
  artifactActions,
}: {
  store: CoPilotState & CoPilotActions;
  onPlanApproved?: () => void;
  onRequestArtifactChange?: (target: ArtifactTarget) => void;
  artifactActions: ArtifactActionHandlers;
}) {
  const rawPlan = store.architecturePlan;
  const status = store.planStatus;

  // Defensive: normalize plan fields to prevent crashes from missing arrays
  const plan = rawPlan ? {
    ...rawPlan,
    skills: rawPlan.skills ?? [],
    workflow: rawPlan.workflow ?? { steps: [] },
    integrations: rawPlan.integrations ?? [],
    triggers: rawPlan.triggers ?? [],
    channels: rawPlan.channels ?? [],
    envVars: rawPlan.envVars ?? [],
    subAgents: rawPlan.subAgents ?? [],
    missionControl: rawPlan.missionControl ?? null,
    dataSchema: rawPlan.dataSchema ?? null,
    apiEndpoints: rawPlan.apiEndpoints ?? [],
    dashboardPages: rawPlan.dashboardPages ?? [],
    vectorCollections: rawPlan.vectorCollections ?? [],
  } : null;

  // Only show spinner when plan is actively being generated (not stale idle)
  if (status === "generating") {
    return <PlanActivityPanel planActivity={store.planActivity} planStep={store.planStep} />;
  }

  // Plan generation failed — show error with retry
  if (status === "failed") {
    return (
      <div className="p-6 space-y-4">
        <div className="rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/5 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--error)]">Plan generation failed</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            The architect could not generate an architecture plan. Check the chat for details.
          </p>
        </div>
        <button
          onClick={() => {
            store.setPlanStatus("generating");
            store.setUserTriggeredPlan(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-satoshi-medium text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Retry Plan Generation
        </button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-xs text-[var(--text-secondary)]">
          No architecture plan has been generated yet. Click below to generate one, or ask the architect in the chat.
        </p>
        <button
          onClick={() => {
            store.setPlanStatus("generating");
            store.setUserTriggeredPlan(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-satoshi-medium text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
        >
          <Play className="h-3 w-3" />
          Generate Plan
        </button>
      </div>
    );
  }

  const planTarget: ArtifactTarget = { kind: "plan", path: ".openclaw/plan/architecture.json" };
  const canApprovePlan = status === "ready" || status === "done" || status === "approved";

  return (
    <div className="p-4 space-y-4">
      <ArtifactActionBar
        target={planTarget}
        canApprove={canApprovePlan}
        canRegenerate
        onApprove={() => onPlanApproved?.()}
        onRequestChanges={artifactActions.requestChanges}
        onRegenerate={artifactActions.regenerate}
        onCompare={artifactActions.compare}
        onExplain={artifactActions.explain}
        onOpenFiles={artifactActions.openFiles}
      />

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

      {/* Data Schema */}
      {plan.dataSchema?.tables && plan.dataSchema.tables.length > 0 && (
        <PlanSection
          icon={<Database className="h-3.5 w-3.5" />}
          title="Database Schema"
          count={plan.dataSchema.tables.length}
        >
          <div className="space-y-2">
            {plan.dataSchema.tables.map((table) => (
              <div
                key={table.name}
                className="rounded-lg bg-[var(--card-color)] border border-[var(--border-default)] overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-subtle)]/50 border-b border-[var(--border-default)]">
                  <code className="text-[10px] font-mono font-bold text-[var(--text-primary)]">
                    {table.name}
                  </code>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {table.columns.length} columns
                  </span>
                </div>
                <div className="px-3 py-1.5">
                  <p className="text-[10px] text-[var(--text-tertiary)] mb-1.5">{table.description}</p>
                  <div className="space-y-0.5">
                    {table.columns.map((col) => (
                      <div key={col.name} className="flex items-baseline gap-2 text-[10px]">
                        <code className="font-mono text-[var(--text-primary)] shrink-0">{col.name}</code>
                        <span className="text-[var(--text-tertiary)] font-mono">{col.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* API Endpoints */}
      {plan.apiEndpoints && plan.apiEndpoints.length > 0 && (
        <PlanSection
          icon={<Terminal className="h-3.5 w-3.5" />}
          title="API Endpoints"
          count={plan.apiEndpoints.length}
        >
          <div className="space-y-1.5">
            {plan.apiEndpoints.map((ep, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <span className={`text-[10px] font-mono font-bold shrink-0 px-1.5 py-0.5 rounded ${
                  ep.method === "GET" ? "bg-green-500/10 text-green-600" :
                  ep.method === "POST" ? "bg-blue-500/10 text-blue-600" :
                  "bg-amber-500/10 text-amber-600"
                }`}>
                  {ep.method}
                </span>
                <div className="min-w-0">
                  <code className="text-[10px] font-mono text-[var(--text-primary)]">{ep.path}</code>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{ep.description}</p>
                </div>
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* Dashboard Pages */}
      {plan.dashboardPages && plan.dashboardPages.length > 0 && (
        <PlanSection
          icon={<FileText className="h-3.5 w-3.5" />}
          title="Mission Control Pages"
          count={plan.dashboardPages.length}
        >
          <div className="space-y-2">
            {plan.dashboardPages.map((page) => (
              <div
                key={page.path}
                className="px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">{page.title}</span>
                  <code className="text-[10px] font-mono text-[var(--text-tertiary)]">{page.path}</code>
                </div>
                {page.description && (
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{page.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {page.components.map((comp, ci) => (
                    <span
                      key={ci}
                      className="text-[9px] font-satoshi-medium bg-[var(--primary)]/8 text-[var(--primary)] px-1.5 py-0.5 rounded"
                    >
                      {comp.type}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* Vector Collections */}
      {plan.vectorCollections && plan.vectorCollections.length > 0 && (
        <PlanSection
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          title="Vector Memory"
          count={plan.vectorCollections.length}
        >
          <div className="space-y-1.5">
            {plan.vectorCollections.map((vc) => (
              <div
                key={vc.name}
                className="px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-default)]"
              >
                <div className="flex items-center gap-2">
                  <code className="text-[10px] font-mono font-medium text-[var(--text-primary)]">{vc.name}</code>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{vc.description}</p>
                {vc.retrievalUse && (
                  <p className="text-[10px] text-[var(--primary)]/80 mt-0.5">
                    RAG: {vc.retrievalUse}
                  </p>
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

      {/* Error banner — shown when plan approval failed (e.g. missing sandbox) */}
      {status === "ready" && store.skillGenerationError && (
        <div className="rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/5 px-4 py-3">
          <p className="text-xs font-satoshi-medium text-[var(--error)]">
            {store.skillGenerationError}
          </p>
        </div>
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

          {/* Parallel build toggle — shown for complex agents */}
          {plan.skills.length > 3 && (
            <label className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--card-color)] cursor-pointer hover:border-[var(--primary)]/30 transition-colors">
              <input
                type="checkbox"
                checked={store.parallelBuildEnabled}
                onChange={(e) => store.setParallelBuildEnabled(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[var(--border-default)] accent-[var(--primary)]"
              />
              <div>
                <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                  ⚡ Parallel build
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] ml-1.5">
                  Build {plan.skills.length} skills in parallel (~3x faster)
                </span>
              </div>
            </label>
          )}

          <div className="flex items-center justify-between">
            <span />
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
  artifactActions,
}: {
  store: CoPilotState & CoPilotActions;
  onApprove: () => void;
  artifactActions: ArtifactActionHandlers;
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
  const reviewSkillNodes = resolveReviewSkillNodes(plan, skillGraph);

  // Count built vs total skills
  const totalSkills = reviewSkillNodes.length;
  const builtCount = builtSkillIds.length;

  // Merge trigger sources: plan triggers + runtime trigger selections
  const allTriggerIds = new Set([
    ...planTriggers.map((t) => t.id),
    ...triggers.map((t) => t.id),
  ]);

  const hasContent = reviewSkillNodes.length > 0;

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

  const reviewTarget: ArtifactTarget = { kind: "review" };

  return (
    <div className="p-4 space-y-3">
      <ArtifactActionBar
        target={reviewTarget}
        canApprove
        canRegenerate={false}
        onApprove={onApprove}
        onRequestChanges={artifactActions.requestChanges}
        onRegenerate={artifactActions.regenerate}
        onCompare={artifactActions.compare}
        onExplain={artifactActions.explain}
        onOpenFiles={artifactActions.openFiles}
      />

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
          {reviewSkillNodes.map((node) => {
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
  agentId,
  artifactActions,
}: {
  store: CoPilotState & CoPilotActions;
  onApprove: () => void;
  agentId?: string | null;
  artifactActions: ArtifactActionHandlers;
}) {
  const {
    evalTasks, evalStatus, skillGraph, agentRules, sessionId, workflow,
    discoveryDocuments, architecturePlan, connectedTools, runtimeInputs,
    agentSandboxId, evalLoopState,
  } = store;
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [generating, setGenerating] = useState<"quick" | "ai" | null>(null);
  const [evalMode, setEvalMode] = useState<"mock" | "live">("mock");
  const [runMode, setRunMode] = useState<"single" | "auto-improve">("single");
  const [loopProgress, setLoopProgress] = useState<EvalLoopProgress | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockContextRef = useRef<any>(null);

  const passCount = evalTasks.filter((t) => t.status === "pass").length;
  const failCount = evalTasks.filter((t) => t.status === "fail").length;
  const pendingCount = evalTasks.filter((t) => t.status === "pending").length;
  const runningCount = evalTasks.filter((t) => t.status === "running").length;
  const manualCount = evalTasks.filter((t) => t.status === "manual").length;
  const totalCount = evalTasks.length;
  const containerState = resolveTestStageContainerState(agentSandboxId);
  const hasRealContainer = containerState.hasRealContainer;
  const isLoopRunning = evalLoopState.status === "running";
  const hasLoopResults = evalLoopState.scores.length > 0;
  const testTarget: ArtifactTarget = { kind: "test_report" };
  const evalReviewState = resolveEvalReviewState({
    totalCount,
    pendingCount,
    runningCount,
    failCount,
    manualCount,
    hasRealContainer,
    runMode,
    loopIterations: evalLoopState.iteration,
  });
  const {
    allDone,
    hasFailures,
    hasManualReview,
    canApprove: canApproveTest,
    canRerunManual,
    canApproveManual,
  } = evalReviewState;

  // Cleanup abort controller on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleGenerateQuick = async () => {
    setGenerating("quick");
    const { generateDeterministicScenarios } = await import("@/lib/openclaw/eval-scenario-generator");
    const scenarios = generateDeterministicScenarios({
      skillGraph: skillGraph ?? [], workflow, agentRules, discoveryDocuments, architecturePlan,
    });
    store.setEvalTasks(scenarios);
    store.setEvalStatus("ready");
    setGenerating(null);
  };

  const handleGenerateAI = async () => {
    setGenerating("ai");
    try {
      const { generateLLMScenarios, generateDeterministicScenarios } = await import("@/lib/openclaw/eval-scenario-generator");
      const scenarios = await generateLLMScenarios(sessionId, { skillGraph: skillGraph ?? [], agentRules, discoveryDocuments });
      if (scenarios.length > 0) {
        store.setEvalTasks(scenarios);
      } else {
        store.setEvalTasks(generateDeterministicScenarios({
          skillGraph: skillGraph ?? [], workflow, agentRules, discoveryDocuments, architecturePlan,
        }));
      }
      store.setEvalStatus("ready");
    } catch {
      const { generateDeterministicScenarios } = await import("@/lib/openclaw/eval-scenario-generator");
      store.setEvalTasks(generateDeterministicScenarios({
        skillGraph: skillGraph ?? [], workflow, agentRules, discoveryDocuments, architecturePlan,
      }));
      store.setEvalStatus("ready");
    }
    setGenerating(null);
  };

  const handleRunTasks = async (filter: "pending" | "fail" | "manual") => {
    if (!agentSandboxId) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(null);

    const { runEvalSuite } = await import("@/lib/openclaw/eval-runner");
    const tasksToRun = evalTasks.filter((t) => t.status === filter);

    if (evalMode === "mock" && !mockContextRef.current) {
      const { generateDeterministicMocks } = await import("@/lib/openclaw/eval-mock-generator");
      mockContextRef.current = generateDeterministicMocks({ skillGraph: skillGraph ?? [], toolConnections: connectedTools, runtimeInputs, architecturePlan });
    }

    await runEvalSuite(tasksToRun, {
      sessionId,
      store,
      skillGraph: skillGraph ?? [],
      agentRules,
      mode: evalMode,
      mockContext: evalMode === "mock" ? mockContextRef.current : null,
      agentSandboxId,
      signal: controller.signal,
      onProgress: (current, total, title) => setProgress({ current, total, title }),
    });

    setProgress(null);
    abortRef.current = null;

    // Auto-save eval results if we have an agent ID
    persistEvalResults();
  };

  const persistEvalResults = async (tasksOverride?: EvalTask[]) => {
    if (!agentId) return;
    try {
      const { saveEvalResults } = await import("@/lib/openclaw/eval-persistence");
      await saveEvalResults(agentId, {
        sandboxId: agentSandboxId,
        mode: evalMode,
        tasks: tasksOverride ?? evalTasks,
        loopState: evalLoopState.scores.length > 0 ? evalLoopState : null,
      });
    } catch (err) {
      console.warn("[Eval] Failed to persist results:", err);
    }
  };

  const handleApproveManualResults = () => {
    const approvedTasks = approveManualEvalTasks(evalTasks);
    approvedTasks.forEach((task, index) => {
      if (task !== evalTasks[index]) {
        store.updateEvalTask(task.id, task);
      }
    });
    store.setEvalStatus("done");
    persistEvalResults(approvedTasks);
  };

  const handleRunAutoImprove = async () => {
    if (!agentSandboxId) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setLoopProgress(null);
    store.resetEvalLoop();

    const { runEvalLoop } = await import("@/lib/openclaw/eval-loop");

    if (evalMode === "mock" && !mockContextRef.current) {
      const { generateDeterministicMocks } = await import("@/lib/openclaw/eval-mock-generator");
      mockContextRef.current = generateDeterministicMocks({ skillGraph: skillGraph ?? [], toolConnections: connectedTools, runtimeInputs, architecturePlan });
    }

    await runEvalLoop({
      tasks: [...evalTasks],
      evalRunnerConfig: {
        sessionId,
        store,
        skillGraph: skillGraph ?? [],
        agentRules,
        mode: evalMode,
        mockContext: evalMode === "mock" ? mockContextRef.current : null,
        agentSandboxId,
        signal: controller.signal,
        onProgress: (current, total, title) => setProgress({ current, total, title }),
      },
      loopStore: {
        ...store,
        getEvalLoopState: () => store.evalLoopState,
      },
      skillGraph: skillGraph ?? [],
      sessionId,
      sandboxId: agentSandboxId,
      signal: controller.signal,
      onLoopProgress: (p) => setLoopProgress(p),
    });

    setLoopProgress(null);
    abortRef.current = null;

    persistEvalResults();
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    setLoopProgress(null);
  };

  // Empty state — generate scenarios
  if (totalCount === 0) {
    return (
      <div className="p-4 space-y-4">
        <ArtifactActionBar
          target={testTarget}
          canApprove={canApproveTest}
          canRegenerate
          onApprove={onApprove}
          onRequestChanges={artifactActions.requestChanges}
          onRegenerate={artifactActions.regenerate}
          onCompare={artifactActions.compare}
          onExplain={artifactActions.explain}
          onOpenFiles={artifactActions.openFiles}
        />
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-4">
            <FlaskConical className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
            No evaluation tasks yet
          </p>
          <p className="mt-1 text-[10px] font-satoshi-regular text-[var(--text-tertiary)] text-center max-w-xs">
            Generate test scenarios based on your agent&apos;s skills and requirements.
            {` ${containerState.emptyStateMessage}`}
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
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <ArtifactActionBar
        target={testTarget}
        canApprove={canApproveTest}
        canRegenerate
        onApprove={onApprove}
        onRequestChanges={artifactActions.requestChanges}
        onRegenerate={artifactActions.regenerate}
        onCompare={artifactActions.compare}
        onExplain={artifactActions.explain}
        onOpenFiles={artifactActions.openFiles}
      />

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
                {` · ${containerState.label}`}
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

      {!hasRealContainer && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600" />
            <div>
              <p className="text-xs font-satoshi-bold text-amber-700">
                {containerState.label}
              </p>
              <p className="mt-1 text-[10px] font-satoshi-regular text-amber-700/90">
                {containerState.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Reinforcement loop progress */}
      {hasLoopResults && (
        <EvalLoopIndicator loopState={evalLoopState} loopProgress={loopProgress} />
      )}

      {/* Mode toggles */}
      {evalStatus !== "running" && !isLoopRunning && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Mock / Live toggle */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-default)]">
              <button
                onClick={() => { setEvalMode("mock"); mockContextRef.current = null; }}
                className={`px-2.5 py-1 text-[10px] font-satoshi-medium rounded-md transition-colors ${
                  evalMode === "mock"
                    ? "bg-white text-[var(--primary)] shadow-sm border border-[var(--primary)]/20"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Mock
              </button>
              <button
                onClick={() => setEvalMode("live")}
                className={`px-2.5 py-1 text-[10px] font-satoshi-medium rounded-md transition-colors ${
                  evalMode === "live"
                    ? "bg-white text-amber-600 shadow-sm border border-amber-500/20"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Live
              </button>
            </div>
            {/* Single / Auto-improve toggle */}
            {hasRealContainer && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-default)]">
                <button
                  onClick={() => setRunMode("single")}
                  className={`px-2.5 py-1 text-[10px] font-satoshi-medium rounded-md transition-colors ${
                    runMode === "single"
                      ? "bg-white text-[var(--primary)] shadow-sm border border-[var(--primary)]/20"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  Single Run
                </button>
                <button
                  onClick={() => setRunMode("auto-improve")}
                  className={`px-2.5 py-1 text-[10px] font-satoshi-medium rounded-md transition-colors ${
                    runMode === "auto-improve"
                      ? "bg-white text-emerald-600 shadow-sm border border-emerald-500/20"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <RefreshCw className="h-2.5 w-2.5 inline mr-1" />
                  Auto-Improve
                </button>
              </div>
            )}
          </div>
          <span className="text-[9px] font-satoshi-regular text-[var(--text-tertiary)]">
            {hasRealContainer ? (evalMode === "mock" ? "Mock data" : "Real APIs") : containerState.label}
            {runMode === "auto-improve" && hasRealContainer ? " · Reinforcement loop" : ""}
          </span>
        </div>
      )}

      {/* Action buttons */}
      {pendingCount > 0 && evalStatus !== "running" && !isLoopRunning && hasRealContainer && (
        <div className="flex justify-end gap-2">
          {runMode === "auto-improve" && hasRealContainer ? (
            <button
              onClick={handleRunAutoImprove}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-satoshi-bold text-white bg-emerald-600 rounded-lg hover:opacity-90 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Run & Auto-Improve
            </button>
          ) : (
            <button
              onClick={() => handleRunTasks("pending")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-satoshi-bold text-[var(--primary)] bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-lg hover:bg-[var(--primary)]/15 transition-colors"
            >
              <Play className="h-3 w-3" />
              Run All Tests
            </button>
          )}
        </div>
      )}

      {/* Running indicator with progress */}
      {(evalStatus === "running" || isLoopRunning) && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 text-[var(--primary)] animate-spin" />
            <p className="text-xs font-satoshi-medium text-[var(--primary)]">
              {loopProgress
                ? loopProgress.message
                : progress
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

      {/* Skill mutations from reinforcement loop */}
      {evalLoopState.mutations.length > 0 && (
        <EvalMutationsPanel mutations={evalLoopState.mutations} />
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
            hasFailures || hasManualReview
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-[var(--primary)]/20 bg-[var(--primary)]/5"
          }`}>
            <p className={`text-xs font-satoshi-medium ${
              hasFailures || hasManualReview ? "text-amber-600" : "text-[var(--primary)]"
            }`}>
              {evalReviewState.message}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasFailures && (
                <button
                  onClick={() => handleRunTasks("fail")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Re-run Failed
                </button>
              )}
              {canRerunManual && (
                <button
                  onClick={() => handleRunTasks("manual")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Re-run Manual
                </button>
              )}
              {canApproveManual && (
                <button
                  onClick={handleApproveManualResults}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-satoshi-medium text-amber-600 hover:text-amber-700 transition-colors"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Mark Manual Passed
                </button>
              )}
              {hasFailures && hasRealContainer && runMode !== "auto-improve" && (
                <button
                  onClick={() => { setRunMode("auto-improve"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-satoshi-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Try Auto-Improve
                </button>
              )}
            </div>
            <button
              onClick={onApprove}
              disabled={!canApproveTest}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" />
              {evalReviewState.buttonLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reinforcement loop indicator ──────────────────────────────────────────

function EvalLoopIndicator({
  loopState,
  loopProgress,
}: {
  loopState: EvalLoopState;
  loopProgress: EvalLoopProgress | null;
}) {
  const scores = loopState.scores;
  const latest = scores[scores.length - 1];
  const improving = scores.length >= 2 && scores[scores.length - 1].avgScore > scores[scores.length - 2].avgScore;

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <RefreshCw className={`h-3.5 w-3.5 text-emerald-600 ${loopState.status === "running" ? "animate-spin" : ""}`} />
          <span className="text-xs font-satoshi-bold text-emerald-700">
            Reinforcement Loop
          </span>
          {loopState.stopReason && (
            <span className="text-[9px] font-satoshi-medium text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              {loopState.stopReason.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-emerald-600">
          Round {loopState.iteration}/{loopState.maxIterations}
        </span>
      </div>
      {/* Score progression */}
      {scores.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-1">
            {scores.map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <div
                  className="rounded-sm bg-emerald-500"
                  style={{
                    width: "16px",
                    height: `${Math.max(4, s.avgScore * 24)}px`,
                    opacity: 0.3 + s.avgScore * 0.7,
                  }}
                />
                <span className="text-[8px] font-mono text-emerald-600">
                  {Math.round(s.passRate * 100)}%
                </span>
              </div>
            ))}
          </div>
          {latest && (
            <div className="text-right shrink-0">
              <p className="text-[10px] font-satoshi-medium text-emerald-700">
                {Math.round(latest.passRate * 100)}% passing
              </p>
              <p className="text-[9px] text-emerald-600 flex items-center gap-0.5 justify-end">
                {improving ? <TrendingUp className="h-2.5 w-2.5" /> : null}
                avg score: {latest.avgScore.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      )}
      {/* Mutations count + cost */}
      <div className="flex items-center justify-between mt-1.5">
        {loopState.mutations.length > 0 && (
          <p className="text-[9px] text-emerald-600">
            {loopState.mutations.filter((m) => m.accepted).length} mutation(s) accepted,{" "}
            {loopState.mutations.filter((m) => !m.accepted).length} reverted
          </p>
        )}
        {loopState.cost && loopState.cost.totalLlmCalls > 0 && (
          <p className="text-[9px] text-emerald-600 font-mono">
            {loopState.cost.totalLlmCalls} LLM calls · ~${loopState.cost.estimatedCostUsd.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Skill mutations panel ─────────────────────────────────────────────────

function EvalMutationsPanel({ mutations }: { mutations: SkillMutation[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-default)] flex items-center gap-2">
        <Diff className="h-3 w-3 text-[var(--text-tertiary)]" />
        <span className="text-[10px] font-satoshi-bold text-[var(--text-secondary)] uppercase tracking-wider">
          Skill Mutations ({mutations.length})
        </span>
      </div>
      <div className="divide-y divide-[var(--border-default)]">
        {mutations.map((m, i) => {
          const key = `${m.skillId}-${m.iteration}`;
          const isExpanded = expandedId === key;
          return (
            <div key={i}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : key)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-subtle)] transition-colors"
              >
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-satoshi-medium ${
                  m.accepted ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-red-500/10 text-red-500"
                }`}>
                  {m.accepted ? "kept" : "reverted"}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-primary)]">{m.skillId}</span>
                <span className="text-[9px] text-[var(--text-tertiary)]">round {m.iteration}</span>
                <span className="flex-1" />
                <ChevronRight className={`h-2.5 w-2.5 text-[var(--text-tertiary)] transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  <p className="text-[10px] text-[var(--text-secondary)]">{m.rationale}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[8px] font-satoshi-bold text-red-400 uppercase">Before</span>
                      <pre className="text-[9px] text-[var(--text-tertiary)] bg-red-500/5 rounded-lg p-2 mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {m.before.slice(0, 800)}
                      </pre>
                    </div>
                    <div>
                      <span className="text-[8px] font-satoshi-bold text-[var(--success)] uppercase">After</span>
                      <pre className="text-[9px] text-[var(--text-tertiary)] bg-[var(--success)]/5 rounded-lg p-2 mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {m.after.slice(0, 800)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Eval task card ────────────────────────────────────────────────────────

function EvalTaskCard({ task }: { task: EvalTask }) {
  const [expanded, setExpanded] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const cfg = EVAL_STATUS_CONFIG[task.status];
  const StatusIcon = cfg.icon;
  const confidencePct = task.confidence != null ? Math.round(task.confidence * 100) : null;
  const confidenceColor = task.confidence != null
    ? task.confidence >= 0.7 ? "text-[var(--success)]" : task.confidence >= 0.4 ? "text-amber-500" : "text-red-500"
    : "";
  const hasTrace = Boolean(task.trace && task.trace.toolCalls.length > 0);

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
            {hasTrace && (
              <span className="text-[9px] font-satoshi-medium text-[var(--primary)] bg-[var(--primary)]/5 px-1 py-0.5 rounded">
                {task.trace!.toolCalls.length} tool call{task.trace!.toolCalls.length !== 1 ? "s" : ""}
              </span>
            )}
            {task.iteration != null && task.iteration > 1 && (
              <span className="text-[9px] font-mono text-emerald-600">
                r{task.iteration}
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

          {/* Execution trace (tool calls timeline) */}
          {hasTrace && (
            <div>
              <button
                onClick={() => setTraceExpanded((prev) => !prev)}
                className="flex items-center gap-1.5 group"
              >
                <Terminal className="h-3 w-3 text-[var(--primary)]" />
                <span className="text-[9px] font-satoshi-bold text-[var(--primary)] uppercase tracking-wider group-hover:underline">
                  Execution Trace ({task.trace!.toolCalls.length} tool calls, {(task.trace!.totalDurationMs / 1000).toFixed(1)}s)
                </span>
                <ChevronRight className={`h-2.5 w-2.5 text-[var(--primary)] transition-transform ${traceExpanded ? "rotate-90" : ""}`} />
              </button>
              {traceExpanded && (
                <div className="mt-1.5 space-y-1.5">
                  {task.trace!.toolCalls.map((tc: ToolCallTrace, i: number) => (
                    <div key={i} className="rounded-lg bg-[var(--card-color)] border border-[var(--border-default)] px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-[var(--primary)]">
                          {tc.toolName}
                        </span>
                        <span className="text-[9px] font-mono text-[var(--text-tertiary)]">
                          {tc.durationMs}ms
                        </span>
                      </div>
                      {tc.input && (
                        <p className="text-[9px] text-[var(--text-tertiary)] mt-1 font-mono truncate">
                          → {tc.input.slice(0, 200)}
                        </p>
                      )}
                      {tc.output && (
                        <p className="text-[9px] text-[var(--text-secondary)] mt-0.5 font-mono truncate">
                          ← {tc.output.slice(0, 200)}
                        </p>
                      )}
                    </div>
                  ))}
                  {task.trace!.errors.length > 0 && (
                    <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
                      <span className="text-[9px] font-satoshi-bold text-red-500 uppercase">Errors</span>
                      {task.trace!.errors.map((err: string, i: number) => (
                        <p key={i} className="text-[9px] text-red-400 mt-0.5">{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trace score (LLM judge feedback) */}
          {task.traceScore && (
            <div>
              <span className="text-[9px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                Judge Feedback
              </span>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed bg-[var(--card-color)] rounded-lg px-3 py-2 border border-[var(--border-default)]">
                {task.traceScore.feedback}
              </p>
              {task.traceScore.skillDiagnosis.filter((d) => d.issue).length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {task.traceScore.skillDiagnosis
                    .filter((d) => d.issue)
                    .map((d, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${
                          d.verdict === "working" ? "bg-[var(--success)]/10 text-[var(--success)]"
                            : d.verdict === "partial" ? "bg-amber-500/10 text-amber-500"
                            : d.verdict === "broken" ? "bg-red-500/10 text-red-500"
                            : "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
                        }`}>
                          {d.verdict}
                        </span>
                        <span className="text-[9px] font-mono text-[var(--text-secondary)]">{d.skillId}</span>
                        <span className="text-[9px] text-[var(--text-tertiary)]">{d.issue}</span>
                      </div>
                    ))}
                </div>
              )}
              {task.traceScore.suggestedFixes.length > 0 && (
                <div className="mt-1.5">
                  <span className="text-[8px] font-satoshi-bold text-emerald-600 uppercase">Suggested Fixes</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {task.traceScore.suggestedFixes.map((fix, i) => (
                      <li key={i} className="text-[9px] text-emerald-600 flex items-start gap-1">
                        <span className="shrink-0">→</span> {fix}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Legacy scoring rationale (for fallback mode) */}
          {!task.traceScore && task.reasons && task.reasons.length > 0 && (
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

/**
 * Run the v1 spec conformance check against the agent's pipeline manifest.
 * Returns a list of human-readable error messages — empty array means the
 * manifest is conformant (or absent, which we treat as a non-blocking soft
 * skip until Path B requires it).
 *
 * Path A tolerates the substrate's `dashboard-manifest-required` finding
 * because we don't emit a dashboard manifest yet. Path B will remove that
 * filter once the dashboard side ships.
 */
async function runDeployConformanceCheck(
  agentSandboxId: string | null,
  apiBase: string,
): Promise<string[]> {
  if (!agentSandboxId) return [];
  try {
    const { readWorkspaceFile } = await import("@/lib/openclaw/workspace-writer");
    const manifestJson = await readWorkspaceFile(
      agentSandboxId,
      ".openclaw/plan/pipeline-manifest.json",
    );
    if (!manifestJson) {
      // No manifest yet — Plan stage didn't emit one. Soft skip rather
      // than block: the loud signal is missing manifest, not a malformed
      // one. Path B will turn this into a hard block.
      console.warn("[ship-conformance] No pipeline-manifest.json — skipping conformance check");
      return [];
    }
    const manifest = JSON.parse(manifestJson) as unknown;
    const { fetchBackendWithAuth } = await import("@/lib/auth/backend-fetch");
    const res = await fetchBackendWithAuth(`${apiBase}/api/conformance/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineManifest: manifest }),
    });
    if (!res.ok) {
      console.warn(`[ship-conformance] /api/conformance/check returned ${res.status}; skipping`);
      return [];
    }
    type Finding = { severity: "error" | "warning"; rule: string; message: string };
    const data = (await res.json()) as { report: { findings: Finding[] } };
    return data.report.findings
      .filter((f) => f.severity === "error" && f.rule !== "dashboard-manifest-required")
      .map((f) => `[${f.rule}] ${f.message}`);
  } catch (err) {
    console.warn("[ship-conformance] check failed; deploying anyway:", err);
    return [];
  }
}

// ─── Feature-mode Merge stage (replaces Ship when on a feature branch) ────

function StageMerge({ agentId, branchName, featureTitle, agentName }: {
  agentId: string; branchName: string; featureTitle: string; agentName: string;
}) {
  const [step, setStep] = useState<"idle" | "creating-pr" | "merging" | "done" | "error">("idle");
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prNumber, setPrNumber] = useState<number | null>(null);
  const [error, setError] = useState("");

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  const handleCreatePR = async () => {
    setStep("creating-pr");
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}/pr`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as Record<string, string>).error ?? "Failed"); }
      const data = await res.json() as { prNumber: number; prUrl: string };
      setPrNumber(data.prNumber); setPrUrl(data.prUrl); setStep("idle");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); setStep("error"); }
  };

  const handleMerge = async () => {
    setStep("merging");
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}/merge`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as Record<string, string>).error ?? "Merge failed"); }
      setStep("done");
    } catch (err) { setError(err instanceof Error ? err.message : "Merge failed"); setStep("error"); }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-[var(--primary)]/15 bg-[var(--primary)]/3 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Merge Feature</h3>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Merge &quot;{featureTitle}&quot; into {agentName}&apos;s main branch via GitHub Pull Request.
        </p>
      </div>

      {step === "done" ? (
        <div className="flex flex-col items-center py-8 gap-3">
          <CheckCircle2 className="h-10 w-10 text-[var(--success)]" />
          <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">Feature merged</p>
          <p className="text-xs text-[var(--text-secondary)]">&quot;{featureTitle}&quot; is now part of {agentName}</p>
          {prUrl && (
            <a href={prUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline">
              View PR on GitHub <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ) : step === "error" ? (
        <div className="rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/5 px-4 py-3">
          <p className="text-xs text-[var(--error)]">{error}</p>
          <button onClick={() => setStep("idle")} className="mt-2 text-xs text-[var(--primary)] hover:underline">Try again</button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Step 1: Create PR */}
          <div className={`rounded-xl border px-4 py-3 ${prNumber ? "border-[var(--success)]/20 bg-[var(--success)]/5" : "border-[var(--border-stroke)]"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {prNumber ? <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> : <span className="w-5 h-5 rounded-full border-2 border-[var(--primary)] flex items-center justify-center text-[9px] font-bold text-[var(--primary)]">1</span>}
                <div>
                  <p className="text-xs font-satoshi-bold text-[var(--text-primary)]">Create Pull Request</p>
                  {prUrl && <a href={prUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--primary)] hover:underline flex items-center gap-0.5">PR #{prNumber} <ExternalLink className="h-2.5 w-2.5" /></a>}
                </div>
              </div>
              {!prNumber && (
                <button onClick={handleCreatePR} disabled={step === "creating-pr"}
                  className="px-3 py-1.5 text-xs font-satoshi-bold text-white rounded-lg bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 transition-all">
                  {step === "creating-pr" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create PR"}
                </button>
              )}
            </div>
          </div>

          {/* Step 2: Squash & Merge */}
          <div className={`rounded-xl border px-4 py-3 ${!prNumber ? "opacity-40 border-[var(--border-stroke)]" : "border-[var(--border-stroke)]"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full border-2 border-[var(--text-tertiary)] flex items-center justify-center text-[9px] font-bold text-[var(--text-tertiary)]">2</span>
                <p className="text-xs font-satoshi-bold text-[var(--text-primary)]">Squash & Merge to Main</p>
              </div>
              {prNumber && (
                <button onClick={handleMerge} disabled={step === "merging"}
                  className="px-3 py-1.5 text-xs font-satoshi-bold text-white rounded-lg bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 transition-all">
                  {step === "merging" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Merge"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StageShip({
  store,
  agentId,
  onComplete,
  canComplete = false,
  isCompleting = false,
}: {
  store: CoPilotState & CoPilotActions;
  agentId?: string | null;
  onComplete?: () => void | Promise<boolean>;
  canComplete?: boolean;
  isCompleting?: boolean;
}) {
  const [stepStatuses, setStepStatuses] = useState<Record<ShipStep, ShipStepStatus>>({
    save: "pending",
    deploy: "pending",
    github: "pending",
  });
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [skipGithub, setSkipGithub] = useState(false);
  const [deploying, setDeploying] = useState(false);

  // GitHub OAuth connection state (reuses the connection made at agent creation start)
  const [ghConnected, setGhConnected] = useState(false);
  const [ghUsername, setGhUsername] = useState<string | null>(null);
  const [ghLoading, setGhLoading] = useState(true);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  // Check existing OAuth connection on mount
  useEffect(() => {
    (async () => {
      try {
        const { fetchBackendWithAuth } = await import("@/lib/auth/backend-fetch");
        const res = await fetchBackendWithAuth(`${API_BASE}/api/auth/github/status`, {});
        if (res.ok) {
          const data = await res.json();
          setGhConnected(data.connected ?? false);
          setGhUsername(data.username ?? null);
        }
      } catch {
        setGhConnected(false);
      } finally {
        setGhLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = SHIP_STEPS.every(
    (s) => stepStatuses[s.id] === "done" || stepStatuses[s.id] === "skipped",
  );

  const handleDeploy = async () => {
    if (!canComplete) return;

    setDeploying(true);
    setGithubError(null);
    setSaveError(null);
    setStepStatuses({ save: "pending", deploy: "pending", github: "pending" });

    // Step 0: Validate the pipeline manifest against the OpenClaw v1 spec via
    // the substrate's runConformance(). Path A scope: only the pipeline
    // manifest is emitted today, so we expect (and tolerate) the
    // `dashboard-manifest-required` finding. Path B will emit the dashboard
    // manifest and remove that exception.
    const conformanceErrors = await runDeployConformanceCheck(
      store.agentSandboxId,
      API_BASE,
    );
    if (conformanceErrors.length > 0) {
      setSaveError(
        `Pipeline manifest is not v1-conformant — fix these before deploy:\n - ${conformanceErrors.join("\n - ")}`,
      );
      setStepStatuses((prev) => ({ ...prev, save: "failed" }));
      store.setDeployStatus("failed");
      setDeploying(false);
      return;
    }

    // Step 1: Save agent
    setStepStatuses((prev) => ({ ...prev, save: "running" }));
    try {
      store.setDeployStatus("running");
      const completed = await onComplete?.();
      if (completed === false) {
        throw new Error("Agent save or activation failed. Check the console for details.");
      }
      setStepStatuses((prev) => ({ ...prev, save: "done" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setSaveError(msg);
      setStepStatuses((prev) => ({ ...prev, save: "failed" }));
      store.setDeployStatus("failed");
      setDeploying(false);
      return;
    }

    // Step 2: Deploy (the actual deploy is handled by onComplete callback)
    setStepStatuses((prev) => ({ ...prev, deploy: "running" }));
    await new Promise((r) => setTimeout(r, 2000));
    setStepStatuses((prev) => ({ ...prev, deploy: "done" }));

    // Step 3: GitHub export (uses OAuth token stored on the backend)
    if (skipGithub || !ghConnected) {
      setStepStatuses((prev) => ({ ...prev, github: "skipped" }));
      store.setDeployStatus("done");
      setDeploying(false);
      return;
    }

    setStepStatuses((prev) => ({ ...prev, github: "running" }));
    try {
      if (!agentId) {
        throw new Error("No agent ID — cannot ship.");
      }

      console.log("[Ship]", { agentId, oauthUser: ghUsername });

      // Ship via backend — it uses the stored OAuth token automatically.
      const pushRes = await fetch(`${API_BASE}/api/agents/${agentId}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          commitMessage: `ship: ${store.name || "agent"} template`,
        }),
      });
      const result = await pushRes.json();

      if (!pushRes.ok && pushRes.status === 404) {
        setStepStatuses((prev) => ({ ...prev, github: "failed" }));
        setGithubError(`Agent not found in backend (ID: ${agentId}). The agent may not have been saved yet — try saving first.`);
      } else if (result.ok) {
        setStepStatuses((prev) => ({ ...prev, github: "done" }));
        setGithubRepoUrl(result.repoUrl);
      } else {
        setStepStatuses((prev) => ({ ...prev, github: "failed" }));
        setGithubError(result.error ?? "GitHub push failed");
      }
    } catch (err) {
      setStepStatuses((prev) => ({ ...prev, github: "failed" }));
      setGithubError(err instanceof Error ? err.message : "GitHub push failed");
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
                Push to GitHub
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
            <div className="space-y-3">
              {ghLoading ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)]" />
                  <span className="text-xs text-[var(--text-tertiary)]">Checking GitHub connection...</span>
                </div>
              ) : ghConnected && ghUsername ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--success)]/5 border border-[var(--success)]/20">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4 text-[var(--text-primary)]" />
                    <span className="text-xs font-satoshi-medium text-[var(--text-primary)]">
                      @{ghUsername}
                    </span>
                    <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                  </div>
                  <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)]">
                    Connected
                  </span>
                </div>
              ) : (
                <div className="px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)]">
                  <p className="text-xs text-[var(--text-secondary)]">
                    GitHub not connected. Connect GitHub from the agent creation start page to enable push.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save/deploy error with retry */}
      {saveError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 space-y-2">
          <p className="text-xs font-satoshi-medium text-red-500">{saveError}</p>
          <button
            onClick={handleDeploy}
            disabled={isCompleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-satoshi-bold text-white bg-red-500 rounded-lg hover:opacity-90 disabled:opacity-30 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
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
            Template pushed to GitHub
          </span>
          <ExternalLink className="h-3 w-3 text-[var(--success)] ml-auto" />
        </a>
      )}

      {/* Action buttons */}
      {!deploying && !allDone && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleDeploy}
            disabled={isCompleting || !canComplete || ghLoading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 disabled:opacity-30 transition-colors"
          >
            <Rocket className="h-3 w-3" />
            {isCompleting ? "Saving..." : "Save & Activate"}
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
            {workflow.steps.map((step, i) => {
              const label = formatWorkflowStepLabel(step, i);
              return (
                <span
                  key={`${label}-${i}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--border-default)] bg-[var(--card-color)] text-[10px] font-satoshi-medium text-[var(--text-secondary)]"
                >
                  {label}
                  {i < workflow.steps.length - 1 && <ChevronRight className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />}
                </span>
              );
            })}
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
