"use client";

import type { StageContext } from "@/lib/openclaw/stage-context";

const STAGE_LABELS: Record<StageContext["stage"], string> = {
  reveal: "Reveal",
  think: "Think",
  plan: "Plan",
  prototype: "Prototype",
  build: "Build",
  review: "Review",
  test: "Test",
  ship: "Ship",
  reflect: "Reflect",
};

function formatArtifact(kind: string): string {
  return kind
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ChatStageContextBar({ context }: { context: StageContext }) {
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-[var(--border-default)] bg-[var(--surface-subtle,#fafafa)] px-5 py-2 text-xs">
      <span className="rounded-full border border-[var(--border-default)] bg-white px-2.5 py-1 font-satoshi-bold text-[var(--text-primary)]">
        {STAGE_LABELS[context.stage]}
      </span>
      <span className="rounded-full border border-[var(--border-default)] bg-white px-2.5 py-1 font-satoshi-medium capitalize text-[var(--text-secondary)]">
        {context.mode}
      </span>
      {context.primaryArtifact ? (
        <span className="min-w-0 rounded-full border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-2.5 py-1 font-satoshi-medium text-[var(--primary)]">
          Editing: {formatArtifact(context.primaryArtifact.kind)}
        </span>
      ) : null}
      <span className="ml-auto rounded-full border border-[var(--border-default)] bg-white px-2.5 py-1 font-satoshi-medium text-[var(--text-tertiary)]">
        {context.readiness}
      </span>
    </div>
  );
}
