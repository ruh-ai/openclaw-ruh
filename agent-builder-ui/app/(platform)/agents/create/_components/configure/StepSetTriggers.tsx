"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Search,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOCK_TRIGGER_CATEGORIES } from "./mockData";
import type { TriggerCategory, TriggerCategoryId } from "./types";

interface StepSetTriggersProps {
  onContinue: () => void;
  onCancel: () => void;
  onSkip?: () => void;
  stepLabel: string;
  agentRules?: string[];
}

const FILTER_PILLS: { id: "all" | TriggerCategoryId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "user-initiated", label: "User-Initiated" },
  { id: "time-based", label: "Time-Based" },
  { id: "data-change", label: "Data-Change" },
  { id: "event-webhook", label: "Event/Webhook" },
  { id: "conditional", label: "Conditional" },
  { id: "agent-to-agent", label: "Agent-to-Agent" },
  { id: "compliance", label: "Compliance" },
  { id: "system-infra", label: "System/Infra" },
];

// Detect which trigger to pre-select from agent rules (schedule/cron info)
function detectPreselectedTrigger(agentRules?: string[]): string | null {
  if (!agentRules || agentRules.length === 0) return null;
  const combined = agentRules.join(" ").toLowerCase();
  if (combined.includes("cron") || combined.includes("schedule") || combined.includes("daily") || combined.includes("weekly") || combined.includes("hourly")) {
    return "cron-schedule";
  }
  if (combined.includes("webhook")) return "webhook-post";
  if (combined.includes("message") || combined.includes("slack")) return "message-received";
  return null;
}

export function StepSetTriggers({
  onContinue,
  onCancel,
  onSkip,
  stepLabel,
  agentRules,
}: StepSetTriggersProps) {
  const preselected = detectPreselectedTrigger(agentRules);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | TriggerCategoryId>("all");
  const [expanded, setExpanded] = useState<Set<TriggerCategoryId>>(
    new Set(["user-initiated", "time-based", "data-change", "event-webhook"])
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(preselected ? [preselected] : [])
  );

  const totalCount = MOCK_TRIGGER_CATEGORIES.reduce((sum, c) => sum + c.triggers.length, 0);

  const toggleExpand = (id: TriggerCategoryId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (triggerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(triggerId)) next.delete(triggerId);
      else next.add(triggerId);
      return next;
    });
  };

  const filteredCategories = MOCK_TRIGGER_CATEGORIES.filter(
    (c) => activeFilter === "all" || c.id === activeFilter
  ).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.label.toLowerCase().includes(q) ||
      c.triggers.some(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q)
      )
    );
  });

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Step label */}
          <p className="text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
            {stepLabel}
          </p>

          {/* Title area */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 shrink-0 mt-0.5">
                <Image
                  src="/assets/logos/favicon.svg"
                  alt="Configure"
                  width={36}
                  height={36}
                />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
                    Agent Triggers
                  </h2>
                  <span className="w-7 h-7 rounded-full bg-[var(--primary)] text-white text-xs font-satoshi-bold flex items-center justify-center">
                    {totalCount}
                  </span>
                </div>
                <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
                  {totalCount} triggers across {MOCK_TRIGGER_CATEGORIES.length} categories
                  {selected.size > 0 && ` · ${selected.size} selected`}
                </p>
              </div>
            </div>
            <Button variant="tertiary" size="sm" className="gap-1.5 shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
              Suggest with AI
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search triggers..."
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)]"
            />
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 mb-6">
            {FILTER_PILLS.map((pill) => {
              const isActive = activeFilter === pill.id;
              const count =
                pill.id === "all"
                  ? totalCount
                  : (MOCK_TRIGGER_CATEGORIES.find((c) => c.id === pill.id)?.triggers.length ?? 0);
              return (
                <button
                  key={pill.id}
                  onClick={() => setActiveFilter(pill.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-satoshi-medium border transition-colors cursor-pointer ${
                    isActive
                      ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                      : "bg-[var(--card-color)] text-[var(--text-secondary)] border-[var(--border-stroke)] hover:border-[var(--border-default)]"
                  }`}
                >
                  {pill.label}
                  <span
                    className={`text-[10px] ${
                      isActive ? "text-white/70" : "text-[var(--text-tertiary)]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Categories */}
          <div className="space-y-4">
            {filteredCategories.map((category) => {
              const isExpanded = expanded.has(category.id);
              const hasTriggers = category.triggers.length > 0;

              return (
                <div key={category.id}>
                  {/* Category header */}
                  <button
                    onClick={() => hasTriggers && toggleExpand(category.id)}
                    className={`w-full flex items-center gap-3 py-2.5 text-left ${
                      hasTriggers ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-full text-xs font-satoshi-bold flex items-center justify-center text-white"
                      style={{ backgroundColor: category.color }}
                    >
                      {category.triggers.length}
                    </span>
                    <span className="text-base font-satoshi-bold text-[var(--text-primary)] flex-1">
                      {category.label}
                    </span>
                    {hasTriggers ? (
                      <ChevronDown
                        className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${
                          isExpanded ? "" : "-rotate-90"
                        }`}
                      />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                    )}
                  </button>

                  {/* Trigger cards grid */}
                  {hasTriggers && isExpanded && (
                    <div className="grid grid-cols-2 gap-3 mt-2 mb-2">
                      {category.triggers.map((trigger) => {
                        const isSelected = selected.has(trigger.id);
                        return (
                          <button
                            key={trigger.id}
                            onClick={() => toggleSelect(trigger.id)}
                            className={`text-left rounded-xl border-2 px-4 py-3.5 transition-all cursor-pointer ${
                              isSelected
                                ? "border-[var(--primary)] shadow-[0_0_0_3px_rgba(174,0,208,0.08)] bg-[var(--card-color)]"
                                : "border-[var(--border-stroke)] bg-[var(--card-color)] hover:border-[var(--border-default)]"
                            }`}
                            style={{
                              borderLeftWidth: "3px",
                              borderLeftColor: isSelected
                                ? "var(--primary)"
                                : category.color,
                            }}
                          >
                            <p
                              className={`text-sm font-satoshi-bold mb-0.5 ${
                                isSelected
                                  ? "text-[var(--primary)]"
                                  : "text-[var(--text-primary)]"
                              }`}
                            >
                              {trigger.title}
                            </p>
                            <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mb-2 line-clamp-1">
                              {trigger.description}
                            </p>
                            <span className="inline-block px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border-default)] text-[11px] font-mono text-[var(--text-tertiary)]">
                              {trigger.code}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Divider */}
                  <div className="border-b border-[var(--border-default)]" />
                </div>
              );
            })}
          </div>

          {/* Bottom hint */}
          <p className="text-center text-xs font-satoshi-regular text-[var(--text-tertiary)] mt-5 flex items-center justify-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Click any card to select trigger
          </p>

          {/* Selection summary */}
          {selected.size > 0 && (
            <div className="mt-4 flex items-center gap-2.5 bg-[var(--background)] border border-[var(--border-default)] rounded-xl px-5 py-3.5">
              <Zap className="h-4 w-4 text-[var(--primary)] shrink-0" />
              <p className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                <span className="font-satoshi-bold">
                  {selected.size} trigger{selected.size > 1 ? "s" : ""} selected
                </span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] px-6 md:px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button variant="tertiary" className="h-10 px-6" onClick={onCancel}>
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            {onSkip && (
              <Button variant="tertiary" className="h-10 px-5" onClick={onSkip}>
                Skip this step
              </Button>
            )}
            <Button
              variant="primary"
              className="h-10 px-6 gap-1.5"
              onClick={onContinue}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
