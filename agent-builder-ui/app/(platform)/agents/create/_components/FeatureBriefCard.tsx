"use client";

import { GitBranch, Wrench, Zap, Clock, Shield } from "lucide-react";

interface FeatureBriefCardProps {
  title: string;
  description: string;
  baselineAgent: {
    name: string;
    skillCount: number;
    skills: string[];
  };
  stage?: string;
}

const STAGE_STATUS: Record<string, { label: string; color: string }> = {
  think:   { label: "Analyzing...",        color: "var(--primary)" },
  plan:    { label: "Requirements ready",  color: "var(--success)" },
  build:   { label: "Planned",             color: "var(--success)" },
  review:  { label: "Built",               color: "var(--success)" },
  test:    { label: "Under review",        color: "var(--primary)" },
  ship:    { label: "Tested",              color: "var(--success)" },
  reflect: { label: "Merged",              color: "var(--success)" },
};

export function FeatureBriefCard({ title, description, baselineAgent, stage }: FeatureBriefCardProps) {
  const status = stage ? STAGE_STATUS[stage] : null;

  return (
    <div className="rounded-xl border border-[var(--primary)]/15 bg-[var(--primary)]/3 overflow-hidden">
      {/* Feature header */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
              <GitBranch className="h-3.5 w-3.5 text-[var(--primary)]" />
            </div>
            <div>
              <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">{title}</h3>
              {status && (
                <span className="text-[9px] font-satoshi-medium px-1.5 py-0.5 rounded-full" style={{ color: status.color, backgroundColor: `color-mix(in srgb, ${status.color} 10%, transparent)` }}>
                  {status.label}
                </span>
              )}
            </div>
          </div>
        </div>
        {description && (
          <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {/* Baseline agent info */}
      <div className="px-4 py-2.5 border-t border-[var(--primary)]/10 bg-[var(--primary)]/2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Shield className="h-3 w-3 text-[var(--text-tertiary)]" />
          <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            Existing Agent
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-satoshi-bold text-[var(--text-primary)]">{baselineAgent.name}</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-tertiary)]">
              <Wrench className="h-3 w-3" /> {baselineAgent.skillCount} skills
            </span>
          </div>
        </div>
        {baselineAgent.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {baselineAgent.skills.slice(0, 6).map((skill) => (
              <span key={skill} className="text-[9px] font-mono text-[var(--text-tertiary)] bg-[var(--background)] px-1.5 py-0.5 rounded">
                {skill}
              </span>
            ))}
            {baselineAgent.skills.length > 6 && (
              <span className="text-[9px] text-[var(--text-tertiary)]">+{baselineAgent.skills.length - 6} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
