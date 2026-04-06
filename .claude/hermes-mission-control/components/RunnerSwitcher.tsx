"use client";

import type { AgentRunnerKind, QueueHealth } from "@/lib/api";

interface RunnerSwitcherProps {
  runner: QueueHealth["agentRunner"];
  onSelect: (runner: AgentRunnerKind) => Promise<void> | void;
  pendingRunner?: AgentRunnerKind | null;
  className?: string;
}

export function RunnerSwitcher({ runner, onSelect, pendingRunner = null, className = "" }: RunnerSwitcherProps) {
  return (
    <div className={`rounded-[24px] border border-[var(--border-muted)] bg-white/55 px-4 py-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-label">Execution Runner</p>
          <h4 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
            {runner.selected === "claude" ? "Claude Code" : "Codex"}
          </h4>
          <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
            Selected via {runner.selectedSource}. Hermes will use this runner for new subprocess work.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            runner.available ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--error)]/10 text-[var(--error)]"
          }`}
        >
          {runner.available ? "ready" : "blocked"}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {runner.options.map((option) => {
          const active = option.kind === runner.selected;
          const disabled = pendingRunner !== null || (!option.available && !active);
          return (
            <button
              key={option.kind}
              type="button"
              onClick={() => onSelect(option.kind)}
              disabled={disabled || active}
              className={`rounded-[20px] border px-3 py-3 text-left transition-colors ${
                active
                  ? "border-[var(--primary)] bg-[var(--primary)]/8"
                  : option.available
                    ? "border-[var(--border-default)] bg-white hover:border-[var(--primary)]/40"
                    : "border-[var(--border-default)] bg-[var(--bg-subtle)] opacity-65"
              } ${disabled && !active ? "cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {option.kind === "claude" ? "Claude Code" : "Codex"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${
                    option.available ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--error)]/10 text-[var(--error)]"
                  }`}
                >
                  {pendingRunner === option.kind ? "switching" : option.available ? "ready" : "blocked"}
                </span>
              </div>
              <p className="mt-2 break-all text-[11px] leading-5 text-[var(--text-tertiary)]">{option.path}</p>
              {option.error && (
                <p className="mt-2 text-[11px] leading-5 text-[var(--error)]">{option.error}</p>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-5 text-[var(--text-tertiary)]">
        Switching affects new Hermes subprocess work immediately. In-flight tasks keep their current runner.
      </p>
    </div>
  );
}
