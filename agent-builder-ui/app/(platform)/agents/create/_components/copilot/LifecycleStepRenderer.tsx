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
import { useCoPilotStore, type CoPilotState, type CoPilotActions, type BuildActivityItem, type BuildProgress } from "@/lib/openclaw/copilot-state";
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
  FileText,
  RefreshCw,
  TrendingUp,
  Diff,
  Terminal,
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
): boolean {
  const idx = getStageIndex(stage);
  const unlockedIdx = getStageIndex(maxUnlockedDevStage);
  return idx < unlockedIdx;
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

function BuildActivityPanel({
  buildActivity,
  buildProgress,
}: {
  buildActivity: BuildActivityItem[];
  buildProgress: BuildProgress | null;
}) {
  const elapsed = useElapsedTime(true);

  // Prefer real events to drive the SVG; fall back to time-based
  const lastEvent = buildActivity.length > 0 ? buildActivity[buildActivity.length - 1] : null;
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
  // Use a label from the real event when available
  const displayLabel = lastEvent
    ? lastEvent.type === "skill"
      ? `Skill created: ${lastEvent.label}`
      : lastEvent.label
    : currentPhase.label;

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-5">
      {/* ── Animated SVG ── */}
      <div key={currentPhase.at} className="typewriter-word">
        <Svg />
      </div>

      {/* ── Phase label ── */}
      <div className="flex flex-col items-center gap-1.5">
        <p key={displayLabel} className="text-xs font-satoshi-medium text-[var(--text-secondary)] typewriter-word text-center px-4">
          {displayLabel}
        </p>
        {/* Progress counter when available */}
        {buildProgress && buildProgress.total ? (
          <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
            {buildProgress.completed}/{buildProgress.total} skills · {elapsed}s
          </p>
        ) : (
          <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
            {elapsed}s
          </p>
        )}
      </div>
    </div>
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
  onComplete?: () => void | Promise<boolean>;
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
  const { devStage, maxUnlockedDevStage } = store;

  const stageIdx = AGENT_DEV_STAGES.indexOf(devStage);

  // Determine which stages are unlocked
  const isStageUnlocked = (stage: AgentDevStage): boolean =>
    isLifecycleStageUnlocked(stage, maxUnlockedDevStage);

  const isStageActive = (stage: AgentDevStage) => stage === devStage;

  const isStageDone = (stage: AgentDevStage): boolean =>
    isLifecycleStageDone(stage, maxUnlockedDevStage);

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
              <BuildActivityPanel
                buildActivity={store.buildActivity}
                buildProgress={store.buildProgress}
              />
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
  agentId,
}: {
  store: CoPilotState & CoPilotActions;
  onApprove: () => void;
  agentId?: string | null;
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
  const allDone = totalCount > 0 && pendingCount === 0 && runningCount === 0;
  const hasFailures = failCount > 0;
  const hasRealContainer = Boolean(agentSandboxId);
  const isLoopRunning = evalLoopState.status === "running";
  const hasLoopResults = evalLoopState.scores.length > 0;

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

  const handleRunTasks = async (filter: "pending" | "fail") => {
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

  const persistEvalResults = async () => {
    if (!agentId) return;
    try {
      const { saveEvalResults } = await import("@/lib/openclaw/eval-persistence");
      await saveEvalResults(agentId, {
        sandboxId: agentSandboxId,
        mode: evalMode,
        tasks: evalTasks,
        loopState: evalLoopState.scores.length > 0 ? evalLoopState : null,
      });
    } catch (err) {
      console.warn("[Eval] Failed to persist results:", err);
    }
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
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-4">
          <FlaskConical className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
          No evaluation tasks yet
        </p>
        <p className="mt-1 text-[10px] font-satoshi-regular text-[var(--text-tertiary)] text-center max-w-xs">
          Generate test scenarios based on your agent&apos;s skills and requirements.
          {hasRealContainer
            ? " Tests will run against your real agent container."
            : " Connect a sandbox to test against the real agent."}
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
                {hasRealContainer && " · Real agent"}
                {!hasRealContainer && " · Simulated"}
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
            {evalMode === "mock" ? "Mock data" : "Real APIs"}
            {runMode === "auto-improve" && hasRealContainer ? " · Reinforcement loop" : ""}
          </span>
        </div>
      )}

      {/* Action buttons */}
      {pendingCount > 0 && evalStatus !== "running" && !isLoopRunning && (
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
            hasFailures
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-[var(--primary)]/20 bg-[var(--primary)]/5"
          }`}>
            <p className={`text-xs font-satoshi-medium ${
              hasFailures ? "text-amber-600" : "text-[var(--primary)]"
            }`}>
              {hasFailures
                ? `${failCount} test${failCount !== 1 ? "s" : ""} failed. ${
                    hasRealContainer && runMode === "single"
                      ? "Try Auto-Improve to iteratively fix skills."
                      : "Review the results above."
                  }`
                : evalLoopState.scores.length > 0
                  ? `All tests passed after ${evalLoopState.iteration} iteration(s). Skills have been optimized.`
                  : "All tests passed. Approve to proceed to deployment."}
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

function StageShip({
  store,
  onComplete,
  canComplete = false,
  isCompleting = false,
}: {
  store: CoPilotState & CoPilotActions;
  onComplete?: () => void | Promise<boolean>;
  canComplete?: boolean;
  isCompleting?: boolean;
}) {
  const [stepStatuses, setStepStatuses] = useState<Record<ShipStep, ShipStepStatus>>({
    save: "pending",
    deploy: "pending",
    github: "pending",
  });
  const [githubRepo, setGithubRepo] = useState("");
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [skipGithub, setSkipGithub] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const allDone = SHIP_STEPS.every(
    (s) => stepStatuses[s.id] === "done" || stepStatuses[s.id] === "skipped",
  );

  const handleDeploy = async () => {
    if (!canComplete) return;

    setDeploying(true);
    setGithubError(null);
    setSaveError(null);
    setStepStatuses({ save: "pending", deploy: "pending", github: "pending" });

    // Step 1: Save agent
    setStepStatuses((prev) => ({ ...prev, save: "running" }));
    try {
      store.setDeployStatus("running");
      // Trigger the page-level onComplete which handles save + deploy.
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
    // Simulate waiting for deploy completion
    await new Promise((r) => setTimeout(r, 2000));
    setStepStatuses((prev) => ({ ...prev, deploy: "done" }));

    // Step 3: GitHub export
    if (skipGithub || !githubRepo) {
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
                <p className="text-[9px] text-[var(--text-tertiary)] mt-1">
                  Uses local <code className="font-mono">gh</code> CLI auth. Will create the repo if it doesn&apos;t exist.
                </p>
              </div>
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
            disabled={isCompleting || !canComplete}
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
