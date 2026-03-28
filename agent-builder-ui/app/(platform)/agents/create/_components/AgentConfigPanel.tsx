"use client";

import { useState, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  FileJson,
  Clock3,
  Pencil,
  Plus,
  X,
  Check,
  Rocket,
  SlidersHorizontal,
  ArrowRight,
  Globe,
  KeyRound,
  Users,
  Cpu,
  CalendarClock,
  MessageCircle,
  Hash,
  Headphones,
} from "lucide-react";
import type { SkillGraphNode, WorkflowDefinition } from "@/lib/openclaw/types";
import type { SavedAgent } from "@/hooks/use-agents-store";
import type { BuilderDraftSaveStatus } from "@/lib/openclaw/ag-ui/types";
import type { AgentChannelSelection } from "@/lib/agents/types";

interface AgentConfigPanelProps {
  skillGraph: SkillGraphNode[] | null;
  workflow: WorkflowDefinition | null;
  systemName: string | null;
  description?: string | null;
  agentRules: string[];
  triggerLabel: string;
  channels?: AgentChannelSelection[];
  existingAgent?: SavedAgent | null;
  isLoading?: boolean;
  draftSaveStatus?: BuilderDraftSaveStatus;
  variant?: "panel" | "embedded";
  builderWorkspace?: ReactNode;
  onNameChange: (name: string) => void;
  onRulesChange: (rules: string[]) => void;
}

// Parse the flat agentRules strings into typed categories
function parseRules(rules: string[]) {
  const tone: string[] = [];
  const schedule: string[] = [];
  const users: string[] = [];
  const envVars: string[] = [];
  const other: string[] = [];

  for (const r of rules) {
    const lower = r.toLowerCase();
    if (lower.startsWith("communicate") || lower.startsWith("tone") || lower.includes("tone")) {
      tone.push(r);
    } else if (lower.startsWith("schedule") || lower.startsWith("runs on cron")) {
      schedule.push(r);
    } else if (lower.startsWith("intended for") || lower.startsWith("primary users")) {
      users.push(r);
    } else if (lower.startsWith("requires env")) {
      // Extract just the var names after the colon
      const vars = r.replace(/requires env[:\s]*/i, "").split(",").map((s) => s.trim()).filter(Boolean);
      envVars.push(...vars);
    } else {
      other.push(r);
    }
  }
  return { tone, schedule, users, envVars, other };
}

export function AgentConfigPanel({
  skillGraph,
  workflow,
  systemName,
  description,
  agentRules,
  triggerLabel,
  channels = [],
  existingAgent,
  isLoading,
  draftSaveStatus = "idle",
  variant = "panel",
  builderWorkspace,
  onNameChange,
  onRulesChange,
}: AgentConfigPanelProps) {
  const displayName = systemName || existingAgent?.name || "";
  const displayAvatar = existingAgent?.avatar || "🤖";
  const displayDescription = description || existingAgent?.description || "";
  const hasPersistedDraftIdentity = Boolean(
    existingAgent && existingAgent.id !== "new-agent" && !existingAgent.id.startsWith("new-"),
  );
  const effectiveDraftSaveStatus =
    draftSaveStatus === "idle" && hasPersistedDraftIdentity
      ? "saved"
      : draftSaveStatus;
  const draftStatusLabel =
    effectiveDraftSaveStatus === "saving"
      ? "Saving draft…"
      : effectiveDraftSaveStatus === "saved"
      ? "Draft saved"
      : effectiveDraftSaveStatus === "error"
      ? "Draft save failed"
      : null;

  // Skills: prefer rich SkillGraphNode[], fall back to skills string[]
  const displaySkillNodes = skillGraph ?? existingAgent?.skillGraph ?? null;
  const displaySkillNames: string[] = !displaySkillNodes ? (existingAgent?.skills ?? []) : [];

  // Workflow steps
  const displayWorkflow = workflow ?? existingAgent?.workflow ?? null;

  const displayRules = agentRules.length > 0 ? agentRules : (existingAgent?.agentRules ?? []);
  const parsed = parseRules(displayRules);

  // All env vars: from rules + from skill nodes
  const skillEnvVars = displaySkillNodes?.flatMap((n) => n.requires_env ?? []) ?? [];
  const allEnvVars = [...new Set([...parsed.envVars, ...skillEnvVars])];

  // External integrations from skill nodes
  const externalApis = displaySkillNodes
    ?.filter((n) => n.external_api)
    .map((n) => n.external_api as string) ?? [];
  const uniqueApis = [...new Set(externalApis)];

  const hasConfig = !!(
    displayName ||
    displaySkillNodes ||
    displaySkillNames.length > 0 ||
    displayRules.length > 0
  );

  // Name edit state — sync when props update (e.g. after initialize())
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  useEffect(() => {
    if (!editingName) setDraftName(displayName);
  }, [displayName, editingName]);

  const saveName = () => {
    const trimmed = draftName.trim();
    if (trimmed) onNameChange(trimmed);
    setEditingName(false);
  };

  const handleNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") saveName();
    if (e.key === "Escape") setEditingName(false);
  };

  // Rules edit state (other/behavioral rules only — schedule/tone/users are display-only)
  const [editingRules, setEditingRules] = useState(false);
  const [draftOther, setDraftOther] = useState<string[]>(parsed.other);
  const [newRule, setNewRule] = useState("");

  const startEditRules = () => {
    setDraftOther([...parsed.other]);
    setNewRule("");
    setEditingRules(true);
  };

  const saveRules = () => {
    // Reconstruct the full rules array preserving tone/schedule/users/env, replacing other
    const preserved = displayRules.filter((r) => !parsed.other.includes(r));
    onRulesChange([...preserved, ...draftOther.filter(Boolean)]);
    setEditingRules(false);
  };

  const addRule = () => {
    const trimmed = newRule.trim();
    if (trimmed) { setDraftOther((p) => [...p, trimmed]); setNewRule(""); }
  };

  const handleNewRuleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addRule();
    if (e.key === "Escape") setEditingRules(false);
  };

  // ── Progressive highlight tracking ──
  // Tracks which sections just received data, adds a brief pulse animation.
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());
  const prevSkillCountRef = useRef(0);
  const prevRulesCountRef = useRef(0);
  const prevChannelCountRef = useRef(0);
  const prevTriggerRef = useRef("");

  useEffect(() => {
    const updated = new Set<string>();
    const skillCount = (displaySkillNodes?.length ?? 0) + displaySkillNames.length;
    if (skillCount > 0 && prevSkillCountRef.current === 0) updated.add("skills");
    if (displayRules.length > 0 && prevRulesCountRef.current === 0) updated.add("behaviour");
    if (channels.length > 0 && prevChannelCountRef.current === 0) updated.add("channels");
    if (triggerLabel && triggerLabel !== "No trigger selected yet" && prevTriggerRef.current === "") updated.add("trigger");

    prevSkillCountRef.current = skillCount;
    prevRulesCountRef.current = displayRules.length;
    prevChannelCountRef.current = channels.length;
    prevTriggerRef.current = triggerLabel && triggerLabel !== "No trigger selected yet" ? triggerLabel : "";

    if (updated.size > 0) {
      setRecentlyUpdated(updated);
      const timer = setTimeout(() => setRecentlyUpdated(new Set()), 2500);
      return () => clearTimeout(timer);
    }
  }, [displaySkillNodes, displaySkillNames, displayRules, channels, triggerLabel]);

  const CHANNEL_ICON_MAP: Record<string, typeof MessageCircle> = {
    telegram: MessageCircle,
    slack: Hash,
    discord: Headphones,
  };

  const sectionHighlight = (section: string) =>
    recentlyUpdated.has(section)
      ? "animate-pulse ring-2 ring-[var(--primary)]/30 transition-all duration-500"
      : "transition-all duration-300";

  return (
    <div
      className={`flex flex-col h-full bg-[var(--card-color)] ${
        variant === "panel" ? "border-l border-[var(--border-default)]" : ""
      }`}
    >
      {/* Panel header */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--border-default)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
          <span className="text-xs font-satoshi-bold text-[var(--text-secondary)] uppercase tracking-wide">
            {variant === "embedded" ? "Builder Snapshot" : "Configuration"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {draftStatusLabel && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-satoshi-bold border ${
                effectiveDraftSaveStatus === "error"
                  ? "bg-[var(--error)]/10 text-[var(--error)] border-[var(--error)]/20"
                  : "bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/20"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  effectiveDraftSaveStatus === "saving"
                    ? "bg-[var(--primary)] animate-pulse"
                    : effectiveDraftSaveStatus === "error"
                    ? "bg-[var(--error)]"
                    : "bg-[var(--primary)]"
                }`}
              />
              {draftStatusLabel}
            </span>
          )}
          {isLoading && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-satoshi-bold bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {!hasConfig ? (
          <div className="flex flex-col items-center justify-center text-center pt-8 pb-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-3">
              <SlidersHorizontal className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <p className="text-xs font-satoshi-medium text-[var(--text-secondary)] mb-1">No config yet</p>
            <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] leading-relaxed max-w-[160px]">
              Describe your agent. The live snapshot and builder controls will appear here as it builds.
            </p>
          </div>
        ) : (
          <>
            {/* ── Identity ── */}
            <div>
              <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Identity</p>
              <div className="bg-[var(--background)] border border-[var(--border-stroke)] rounded-xl px-3 py-3 space-y-2">
                {/* Avatar + Name */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center text-base shrink-0">
                    {displayAvatar}
                  </div>
                  {editingName ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={handleNameKeyDown}
                        className="flex-1 text-sm font-satoshi-bold text-[var(--text-primary)] bg-transparent border-b border-[var(--primary)] outline-none min-w-0"
                      />
                      <button onClick={() => setEditingName(false)} className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--error)] transition-colors shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                      <button onClick={saveName} className="p-1 rounded bg-[var(--primary)] text-white transition-colors shrink-0">
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1.5 flex-1 min-w-0 group">
                      <span className="text-sm font-satoshi-bold text-[var(--text-primary)] truncate">
                        {displayName || <span className="text-[var(--text-tertiary)] font-satoshi-regular italic">Unnamed</span>}
                      </span>
                      <button onClick={() => setEditingName(true)} className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-all shrink-0">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                {/* Description */}
                {displayDescription && (
                  <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] leading-relaxed pl-[42px]">
                    {displayDescription}
                  </p>
                )}
                {/* Status */}
                {existingAgent && (
                  <div className="pl-[42px]">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-satoshi-bold ${
                      existingAgent.status === "active"
                        ? "bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20"
                        : "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)] border border-[var(--border-default)]"
                    }`}>
                      <span className={`w-1 h-1 rounded-full ${existingAgent.status === "active" ? "bg-[var(--success)]" : "bg-[var(--text-tertiary)]"}`} />
                      {existingAgent.status === "active" ? "Active" : "Draft"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Skills ── */}
            <div className={sectionHighlight("skills")}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">Skills</p>
                {(displaySkillNodes ?? displaySkillNames).length > 0 && (
                  <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)]">
                    {(displaySkillNodes ?? displaySkillNames).length} total
                  </span>
                )}
              </div>

              {!displaySkillNodes && displaySkillNames.length === 0 ? (
                <div className="bg-[var(--background)] border border-dashed border-[var(--border-stroke)] rounded-xl px-3 py-3 text-center">
                  <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] italic">
                    {isLoading ? "Generating skills..." : "No skills defined yet"}
                  </p>
                </div>
              ) : displaySkillNodes ? (
                <div className="space-y-1.5">
                  {displaySkillNodes.map((node) => (
                    <div key={node.skill_id} className="bg-[var(--background)] border border-[var(--border-stroke)] rounded-lg px-3 py-2.5 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <FileJson className="h-3.5 w-3.5 text-[var(--primary)]/60 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-satoshi-bold text-[var(--text-primary)] truncate">{node.name}</p>
                          {node.description && (
                            <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] leading-snug mt-0.5 line-clamp-2">
                              {node.description}
                            </p>
                          )}
                        </div>
                        {/* Source badge */}
                        {node.source && node.source !== "custom" && (
                          <span className="shrink-0 text-[9px] font-satoshi-bold px-1.5 py-0.5 rounded bg-[var(--primary)]/8 text-[var(--primary)] border border-[var(--primary)]/15 uppercase">
                            {node.source.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      {/* Env vars required by this skill */}
                      {node.requires_env && node.requires_env.length > 0 && (
                        <div className="flex flex-wrap gap-1 pl-5">
                          {node.requires_env.map((v) => (
                            <span key={v} className="inline-flex items-center gap-1 text-[9px] font-mono text-[var(--text-tertiary)] bg-[var(--border-default)]/40 px-1.5 py-0.5 rounded">
                              <KeyRound className="h-2 w-2" />{v}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* External API */}
                      {node.external_api && (
                        <div className="pl-5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
                            <Globe className="h-2.5 w-2.5" />{node.external_api}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {displaySkillNames.map((name) => (
                    <div key={name} className="flex items-center gap-2 bg-[var(--background)] border border-[var(--border-stroke)] rounded-lg px-3 py-2">
                      <FileJson className="h-3.5 w-3.5 text-[var(--primary)]/60 shrink-0" />
                      <p className="text-xs font-satoshi-bold text-[var(--text-primary)] truncate">{name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Workflow ── */}
            {displayWorkflow && displayWorkflow.steps.length > 0 && (
              <div>
                <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Workflow</p>
                <div className="bg-[var(--background)] border border-[var(--border-stroke)] rounded-xl px-3 py-2.5 space-y-1">
                  {displayWorkflow.steps.map((step, i) => (
                    <div key={step.id ?? i} className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-[9px] font-satoshi-bold text-[var(--primary)] flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-satoshi-regular text-[var(--text-secondary)] truncate flex-1">
                        {step.skill}
                      </span>
                      {i < displayWorkflow.steps.length - 1 && (
                        <ArrowRight className="h-2.5 w-2.5 text-[var(--text-tertiary)] shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Behaviour / Rules ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">Behaviour</p>
                {!editingRules ? (
                  <button onClick={startEditRules} className="flex items-center gap-1 text-[10px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors">
                    <Pencil className="h-2.5 w-2.5" />Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingRules(false)} className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--error)] transition-colors">Cancel</button>
                    <span className="text-[var(--border-default)]">·</span>
                    <button onClick={saveRules} className="text-[10px] font-satoshi-medium text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors">Save</button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                {/* Tone — read-only */}
                {parsed.tone.map((r, i) => (
                  <div key={`tone-${i}`} className="flex items-start gap-2 bg-[var(--background)] border border-[var(--border-stroke)] rounded-lg px-3 py-2">
                    <MessageCircle className="h-3 w-3 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                    <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">{r}</p>
                  </div>
                ))}
                {/* Schedule — read-only */}
                {parsed.schedule.map((r, i) => (
                  <div key={`sched-${i}`} className="flex items-start gap-2 bg-[var(--background)] border border-[var(--border-stroke)] rounded-lg px-3 py-2">
                    <CalendarClock className="h-3 w-3 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                    <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">{r}</p>
                  </div>
                ))}
                {/* Primary users — read-only */}
                {parsed.users.map((r, i) => (
                  <div key={`users-${i}`} className="flex items-start gap-2 bg-[var(--background)] border border-[var(--border-stroke)] rounded-lg px-3 py-2">
                    <Users className="h-3 w-3 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                    <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">{r}</p>
                  </div>
                ))}
                {/* Other rules — editable */}
                {editingRules ? (
                  <>
                    {draftOther.map((rule, i) => (
                      <div key={i} className="flex items-center gap-2 bg-[var(--background)] border border-[var(--border-stroke)] rounded-lg px-3 py-2 group">
                        <input
                          value={rule}
                          onChange={(e) => setDraftOther((p) => p.map((r, idx) => idx === i ? e.target.value : r))}
                          className="flex-1 text-xs font-satoshi-regular text-[var(--text-primary)] bg-transparent outline-none"
                          placeholder="Enter rule..."
                        />
                        <button onClick={() => setDraftOther((p) => p.filter((_, idx) => idx !== i))} className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--error)] transition-all shrink-0">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 bg-[var(--background)] border border-dashed border-[var(--border-stroke)] rounded-lg px-3 py-2">
                      <input
                        value={newRule}
                        onChange={(e) => setNewRule(e.target.value)}
                        onKeyDown={handleNewRuleKeyDown}
                        placeholder="Add rule and press Enter..."
                        className="flex-1 text-xs font-satoshi-regular text-[var(--text-primary)] bg-transparent outline-none placeholder:text-[var(--text-tertiary)]"
                      />
                      <button onClick={addRule} className="text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors shrink-0">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                ) : (
                  parsed.other.map((rule, i) => (
                    <div key={`other-${i}`} className="flex items-start gap-2 bg-[var(--background)] border border-[var(--border-stroke)] rounded-lg px-3 py-2">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--text-tertiary)] shrink-0" />
                      <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">{rule}</p>
                    </div>
                  ))
                )}
                {displayRules.length === 0 && !editingRules && (
                  <div className="bg-[var(--background)] border border-dashed border-[var(--border-stroke)] rounded-xl px-3 py-3 text-center">
                    <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] italic">No rules yet — click Edit to add</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Environment Variables ── */}
            {allEnvVars.length > 0 && (
              <div>
                <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Env Variables</p>
                <div className="bg-[var(--background)] border border-[var(--border-stroke)] rounded-xl px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {allEnvVars.map((v) => (
                      <span key={v} className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--border-default)]/40 border border-[var(--border-stroke)] px-2 py-0.5 rounded">
                        <KeyRound className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />{v}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── External Integrations ── */}
            {uniqueApis.length > 0 && (
              <div>
                <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Integrations</p>
                <div className="bg-[var(--background)] border border-[var(--border-stroke)] rounded-xl px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueApis.map((api) => (
                      <span key={api} className="inline-flex items-center gap-1 text-[10px] font-satoshi-medium text-[var(--text-secondary)] bg-[var(--border-default)]/40 border border-[var(--border-stroke)] px-2 py-0.5 rounded">
                        <Globe className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />{api}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Trigger ── */}
            <div className={sectionHighlight("trigger")}>
              <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Trigger</p>
              <div className="flex items-center gap-2 bg-[var(--background)] border border-[var(--border-stroke)] rounded-xl px-3 py-2.5">
                <Clock3 className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                <span className="text-xs font-satoshi-medium text-[var(--text-secondary)]">{triggerLabel}</span>
              </div>
            </div>

            {/* ── Channels ── */}
            {channels.length > 0 && (
              <div className={sectionHighlight("channels")}>
                <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Channels</p>
                <div className="space-y-1.5">
                  {channels.map((ch) => {
                    const ChannelIcon = CHANNEL_ICON_MAP[ch.kind] ?? MessageCircle;
                    return (
                      <div key={ch.kind} className="flex items-center gap-2 bg-[var(--background)] border border-[var(--border-stroke)] rounded-lg px-3 py-2">
                        <ChannelIcon className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                        <span className="text-xs font-satoshi-medium text-[var(--text-secondary)] flex-1">{ch.label}</span>
                        <span className={`text-[9px] font-satoshi-bold px-1.5 py-0.5 rounded-full border ${
                          ch.status === "planned"
                            ? "bg-[var(--primary)]/8 text-[var(--primary)] border-[var(--primary)]/15"
                            : ch.status === "configured"
                            ? "bg-[var(--success)]/8 text-[var(--success)] border-[var(--success)]/15"
                            : "bg-[var(--text-tertiary)]/8 text-[var(--text-tertiary)] border-[var(--border-default)]"
                        }`}>
                          {ch.status === "planned" ? "After deploy" : ch.status === "configured" ? "Connected" : "Planned"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Deployments (edit mode) ── */}
            {existingAgent && (existingAgent.sandboxIds?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Deployments</p>
                <div className="flex items-center gap-2 bg-[var(--success)]/5 border border-[var(--success)]/20 rounded-xl px-3 py-2.5">
                  <Rocket className="h-3.5 w-3.5 text-[var(--success)] shrink-0" />
                  <span className="text-xs font-satoshi-medium text-[var(--success)]">
                    {existingAgent.sandboxIds.length} running instance{existingAgent.sandboxIds.length !== 1 ? "s" : ""}
                  </span>
                  <span className="ml-auto text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">will auto-update</span>
                </div>
              </div>
            )}
          </>
        )}

        {builderWorkspace && (
          <section className="space-y-3 pt-1">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--border-default)]" />
              <span className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-[0.18em]">
                Builder Flow
              </span>
              <div className="h-px flex-1 bg-[var(--border-default)]" />
            </div>

            <div className="overflow-hidden rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] shadow-sm">
              {builderWorkspace}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
