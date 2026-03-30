"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedAgent } from "@/hooks/use-agents-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POLL_INTERVAL_MS = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type SkillStatus = "proposed" | "active" | "rejected";

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  confidence: number; // 0–1
  status: SkillStatus;
  evolutionType: "CAPTURED" | "FIX" | "DERIVED";
  detectedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
}

interface TabSkillsProps {
  agent: SavedAgent;
  activeSandboxId: string | null;
  onProposedCount?: (count: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function confidenceColor(score: number): string {
  if (score >= 0.8) return "text-[var(--success)]";
  if (score >= 0.5) return "text-[#F59E0B]";
  return "text-[var(--error)]";
}

function confidenceBg(score: number): string {
  if (score >= 0.8) return "bg-[var(--success)]/10 border-[var(--success)]/20";
  if (score >= 0.5) return "bg-[#F59E0B]/10 border-[#F59E0B]/20";
  return "bg-[var(--error)]/10 border-[var(--error)]/20";
}

function evolutionBadge(type: AgentSkill["evolutionType"]): React.ReactNode {
  const label = type === "CAPTURED" ? "Captured" : type === "FIX" ? "Fix" : "Derived";
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-satoshi-bold bg-[var(--primary)]/8 text-[var(--primary)] border border-[var(--primary)]/15">
      <Sparkles className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

// ─── Skill Card ──────────────────────────────────────────────────────────────

interface SkillCardProps {
  skill: AgentSkill;
  onApprove?: (skill: AgentSkill) => void;
  onReject?: (skill: AgentSkill) => void;
  pending?: boolean;
}

function SkillCard({ skill, onApprove, onReject, pending }: SkillCardProps) {
  return (
    <div className="rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-4 flex flex-col gap-3 transition-all hover:border-[var(--border-default)]">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center shrink-0">
            <Brain className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-satoshi-bold text-[var(--text-primary)] truncate">{skill.name}</p>
            <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)]">
              {skill.detectedAt ? `Detected ${new Date(skill.detectedAt).toLocaleDateString()}` : "Auto-detected"}
            </p>
          </div>
        </div>
        {evolutionBadge(skill.evolutionType)}
      </div>

      {/* Description */}
      <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">
        {skill.description}
      </p>

      {/* Confidence + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-satoshi-bold ${confidenceBg(skill.confidence)} ${confidenceColor(skill.confidence)}`}>
          <span>{Math.round(skill.confidence * 100)}% confidence</span>
        </div>

        {skill.status === "proposed" && onApprove && onReject && (
          <div className="flex items-center gap-2">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
            ) : (
              <>
                <button
                  onClick={() => onReject(skill)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-satoshi-bold text-[var(--error)] bg-[var(--error)]/5 hover:bg-[var(--error)]/10 border border-[var(--error)]/20 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </button>
                <button
                  onClick={() => onApprove(skill)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-satoshi-bold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </button>
              </>
            )}
          </div>
        )}

        {skill.status === "active" && (
          <span className="flex items-center gap-1 text-[11px] font-satoshi-bold text-[var(--success)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Active
          </span>
        )}

        {skill.status === "rejected" && (
          <span className="flex items-center gap-1 text-[11px] font-satoshi-bold text-[var(--text-tertiary)]">
            <XCircle className="h-3.5 w-3.5" />
            Rejected
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function SkillSection({
  title,
  skills,
  emptyMessage,
  children,
}: {
  title: string;
  skills: AgentSkill[];
  emptyMessage: string;
  children: (skill: AgentSkill) => React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[11px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">{title}</p>
        {skills.length > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--primary)]/10 text-[9px] font-satoshi-bold text-[var(--primary)]">
            {skills.length}
          </span>
        )}
      </div>
      {skills.length === 0 ? (
        <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)] py-2">{emptyMessage}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {skills.map((s) => children(s))}
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ────────────────────────────────────────────────────────────────

export function TabSkills({ agent, activeSandboxId, onProposedCount }: TabSkillsProps) {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/skills`);
      if (!res.ok) {
        if (res.status === 404) {
          // Endpoint not yet implemented — show empty state gracefully
          setSkills([]);
          setError(null);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data: AgentSkill[] = await res.json();
      setSkills(data);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      // Only show error if we don't already have skills loaded
      setError((prev) => (skills.length === 0 ? msg : prev));
    } finally {
      setLoading(false);
    }
  }, [agent.id, skills.length]);

  // Initial fetch + polling
  useEffect(() => {
    fetchSkills();
    pollRef.current = setInterval(fetchSkills, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchSkills]);

  // Notify parent of proposed count for badge
  const proposed = skills.filter((s) => s.status === "proposed");
  useEffect(() => {
    onProposedCount?.(proposed.length);
  }, [proposed.length, onProposedCount]);

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const handleApprove = async (skill: AgentSkill) => {
    setPendingIds((prev) => new Set(prev).add(skill.id));
    // Optimistic update
    setSkills((prev) =>
      prev.map((s) => (s.id === skill.id ? { ...s, status: "active" as SkillStatus, approvedAt: new Date().toISOString() } : s))
    );
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/skills/${encodeURIComponent(skill.name)}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(`"${skill.name}" approved`, "success");
    } catch {
      // Revert
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, status: "proposed" as SkillStatus, approvedAt: undefined } : s))
      );
      showToast(`Failed to approve "${skill.name}"`, "error");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  };

  const handleReject = async (skill: AgentSkill) => {
    setPendingIds((prev) => new Set(prev).add(skill.id));
    // Optimistic update
    setSkills((prev) =>
      prev.map((s) => (s.id === skill.id ? { ...s, status: "rejected" as SkillStatus, rejectedAt: new Date().toISOString() } : s))
    );
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/skills/${encodeURIComponent(skill.name)}/reject`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(`"${skill.name}" rejected`, "success");
    } catch {
      // Revert
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, status: "proposed" as SkillStatus, rejectedAt: undefined } : s))
      );
      showToast(`Failed to reject "${skill.name}"`, "error");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  };

  const active = skills.filter((s) => s.status === "active");
  const rejected = skills.filter((s) => s.status === "rejected");

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0 relative">
      {/* Toast */}
      {toast && (
        <div
          className={`absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-xs font-satoshi-bold transition-all ${
            toast.kind === "success"
              ? "bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20"
              : "bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20"
          }`}
        >
          {toast.kind === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 md:px-8 py-4 border-b border-[var(--border-default)]">
        <div>
          <h2 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Learned Skills</h2>
          <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
            Skills auto-detected from {agent.name}&apos;s behavior. Approve to activate.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-8 px-3 gap-2 rounded-lg text-xs"
          onClick={() => { setLoading(true); fetchSkills(); }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <AlertCircle className="h-8 w-8 text-[var(--error)]/50" />
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
              Could not load skills. Skills API may not be active yet.
            </p>
            <Button variant="outline" className="h-8 px-4 text-xs rounded-lg" onClick={fetchSkills}>
              Try again
            </Button>
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center">
              <Brain className="h-6 w-6 text-[var(--primary)]" />
            </div>
            <div>
              <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">No skills yet</h3>
              <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] max-w-xs leading-relaxed">
                As {agent.name} handles conversations, repeated tool-use patterns are detected and surfaced here for your review.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8 max-w-2xl">
            <SkillSection title="Proposed" skills={proposed} emptyMessage="No skills pending review.">
              {(skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  pending={pendingIds.has(skill.id)}
                />
              )}
            </SkillSection>

            <SkillSection title="Active" skills={active} emptyMessage="No active skills yet.">
              {(skill) => <SkillCard key={skill.id} skill={skill} />}
            </SkillSection>

            <SkillSection title="Rejected" skills={rejected} emptyMessage="No rejected skills.">
              {(skill) => <SkillCard key={skill.id} skill={skill} />}
            </SkillSection>
          </div>
        )}
      </div>
    </div>
  );
}
