/**
 * AssignTaskModal + task simulator.
 *
 * Behavior Sandbox piece — lets the operator (or the founder previewing
 * the agent) drop an input into the agent and watch the pipeline run,
 * step-by-step, with realistic timeline events and an artifact at the
 * end. Pure local simulation — no backend call. The architect's
 * `dashboardPrototype.pipeline` drives the step sequence; sub-agents and
 * artifact names come from the same plan so the simulation reflects
 * THIS agent's design.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Play, Loader2 } from "lucide-react";
import type {
  ArchitecturePlan,
  ArtifactRecord,
  TaskRunDetail,
  TaskSummary,
  TimelineEvent,
} from "@/lib/openclaw/types";
import { dashboardTokens as T } from "./tokens";

interface AssignTaskInput {
  title: string;
  input: string;
}

export function AssignTaskModal({
  open,
  onClose,
  onSubmit,
  defaultTitle,
  inputHint,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: AssignTaskInput) => void;
  defaultTitle?: string;
  inputHint?: string;
}) {
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [input, setInput] = useState("");
  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle ?? "");
    setInput("");
  }, [open, defaultTitle]);

  if (!open) return null;
  const canSubmit = title.trim().length > 0 && input.trim().length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: T.cardColor,
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${T.borderDefault}`,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>Assign a new task</div>
            <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>
              Watch the agent run the pipeline you designed.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              padding: 6,
              borderRadius: 6,
              cursor: "pointer",
              color: T.textTertiary,
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Draft Q4 outreach"
              style={{
                padding: "10px 12px",
                border: `1px solid ${T.borderDefault}`,
                borderRadius: 8,
                fontSize: 13,
                color: T.textPrimary,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Input
            </span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputHint ?? "What should the agent work on? Paste context, a URL, an instruction…"}
              rows={5}
              style={{
                padding: "10px 12px",
                border: `1px solid ${T.borderDefault}`,
                borderRadius: 8,
                fontSize: 13,
                color: T.textPrimary,
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
            />
          </label>
          <div style={{ fontSize: 11, color: T.textTertiary }}>
            This runs a simulation against your prototype — no real API calls are made.
            Once you ship, the same form will hit your <code style={{ fontFamily: "ui-monospace, monospace" }}>POST /api/tasks</code> endpoint.
          </div>
        </div>
        <div
          style={{
            padding: "12px 18px",
            borderTop: `1px solid ${T.borderDefault}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              border: `1px solid ${T.borderDefault}`,
              background: T.cardColor,
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: T.textSecondary,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => onSubmit({ title: title.trim(), input: input.trim() })}
            style={{
              padding: "8px 14px",
              background: canSubmit ? T.primary : T.borderDefault,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.6,
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Play className="h-3 w-3" />
            Run task
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task simulator ────────────────────────────────────────────────────────

type SimulatedRun = TaskRunDetail & { _stepIndex: number; _ticker?: ReturnType<typeof setInterval> };

function iso(): string {
  return new Date().toISOString();
}

function buildInitialRun(
  plan: ArchitecturePlan | null,
  input: AssignTaskInput,
  taskNumber: number,
): SimulatedRun {
  const pipeline = plan?.dashboardPrototype?.pipeline ?? null;
  const stepNames = pipeline?.steps.map((s) => s.name) ?? ["Intake", "Process", "Review"];
  const stepIds = pipeline?.steps.map((s) => s.id) ?? stepNames.map((_, i) => `step-${i + 1}`);
  const subAgents = plan?.subAgents ?? [];
  const firstOwner =
    pipeline?.steps[0]?.owner ?? subAgents[0]?.name;
  const id = `task-${Date.now()}-${taskNumber}`;
  const task: TaskSummary = {
    id,
    title: input.title,
    status: "in_progress",
    pipelineId: pipeline?.name,
    startedAt: iso(),
    updatedAt: iso(),
    assignedTo: firstOwner,
    currentStepId: stepIds[0],
    currentStepName: stepNames[0],
    inputs: { input: input.input },
  };
  const timeline: TimelineEvent[] = [
    {
      id: `${id}-input`,
      timestamp: iso(),
      kind: "input",
      actor: "operator",
      label: `Task assigned: ${input.title}`,
      detail: input.input.length > 200 ? `${input.input.slice(0, 200)}…` : input.input,
    },
    {
      id: `${id}-step-0-start`,
      timestamp: iso(),
      kind: "step_started",
      stepId: stepIds[0],
      stepName: stepNames[0],
      actor: firstOwner ?? "agent",
      label: `${stepNames[0]} started`,
    },
  ];
  return { task, timeline, artifacts: [], _stepIndex: 0 };
}

/**
 * Advance the simulated run by one step. Pure function over the run +
 * plan; ticker that drives it is managed by the caller.
 */
function advanceRun(run: SimulatedRun, plan: ArchitecturePlan | null): SimulatedRun {
  const pipeline = plan?.dashboardPrototype?.pipeline ?? null;
  const stepNames = pipeline?.steps.map((s) => s.name) ?? ["Intake", "Process", "Review"];
  const stepIds = pipeline?.steps.map((s) => s.id) ?? stepNames.map((_, i) => `step-${i + 1}`);
  const subAgents = plan?.subAgents ?? [];
  const ownerFor = (i: number): string | undefined =>
    pipeline?.steps[i]?.owner ?? subAgents[i % Math.max(1, subAgents.length)]?.name;

  const nextIndex = run._stepIndex + 1;
  const id = run.task.id;
  const newTimeline = [...run.timeline];
  const currentStepName = stepNames[run._stepIndex];
  const currentStepId = stepIds[run._stepIndex];

  // Mid-step tool call to make it feel like the agent is doing something
  newTimeline.push({
    id: `${id}-step-${run._stepIndex}-tool`,
    timestamp: iso(),
    kind: "tool_call",
    stepId: currentStepId,
    stepName: currentStepName,
    actor: ownerFor(run._stepIndex) ?? "agent",
    label: `Called ${["search", "summarize", "fetch", "draft"][run._stepIndex % 4]} tool`,
    toolName: ["search_records", "summarize_text", "fetch_data", "generate_draft"][run._stepIndex % 4],
    toolArgs: { query: run.task.inputs?.input },
    toolResult: { ok: true },
  });

  newTimeline.push({
    id: `${id}-step-${run._stepIndex}-end`,
    timestamp: iso(),
    kind: "step_completed",
    stepId: currentStepId,
    stepName: currentStepName,
    actor: ownerFor(run._stepIndex) ?? "agent",
    label: `${currentStepName} completed`,
  });

  // Done?
  if (nextIndex >= stepNames.length) {
    const planArtifacts = plan?.dashboardPrototype?.artifacts ?? [];
    const artifactSpec = planArtifacts[0] ?? { name: "Run summary", type: "summary", description: "Auto-generated summary of the run." };
    const artifact: ArtifactRecord = {
      id: `${id}-art-0`,
      taskId: id,
      name: artifactSpec.name,
      type: artifactSpec.type,
      status: "pending_review",
      createdAt: iso(),
      content:
        `# ${artifactSpec.name}\n\n` +
        `**Input:** ${run.task.inputs?.input ?? "—"}\n\n` +
        `## Result\n\n${artifactSpec.description ?? "Generated artifact for review."}\n\n` +
        `## Pipeline steps run\n${stepNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n`,
    };
    newTimeline.push({
      id: `${id}-artifact`,
      timestamp: iso(),
      kind: "artifact_produced",
      actor: "agent",
      label: `Produced ${artifactSpec.name}`,
      artifactId: artifact.id,
    });
    newTimeline.push({
      id: `${id}-complete`,
      timestamp: iso(),
      kind: "complete",
      actor: "agent",
      label: "Task completed",
    });
    return {
      task: {
        ...run.task,
        status: "needs_approval",
        completedAt: iso(),
        updatedAt: iso(),
        currentStepId: undefined,
        currentStepName: undefined,
      },
      timeline: newTimeline,
      artifacts: [artifact],
      _stepIndex: nextIndex,
    };
  }

  // Start next step
  const nextOwner = ownerFor(nextIndex);
  newTimeline.push({
    id: `${id}-step-${nextIndex}-start`,
    timestamp: iso(),
    kind: "step_started",
    stepId: stepIds[nextIndex],
    stepName: stepNames[nextIndex],
    actor: nextOwner ?? "agent",
    label: `${stepNames[nextIndex]} started`,
  });

  return {
    task: {
      ...run.task,
      currentStepId: stepIds[nextIndex],
      currentStepName: stepNames[nextIndex],
      assignedTo: nextOwner ?? run.task.assignedTo,
      updatedAt: iso(),
    },
    timeline: newTimeline,
    artifacts: run.artifacts,
    _stepIndex: nextIndex,
  };
}

/**
 * Hook that owns the live-simulated task list. Returns the merged tasks
 * (simulated first, then static fixture tasks), the runs map (simulated
 * + static), and an `assignTask` callback that the modal calls on submit.
 */
export function useTaskSimulator(plan: ArchitecturePlan | null): {
  simulatedTasks: TaskSummary[];
  simulatedRuns: Record<string, TaskRunDetail>;
  assignTask: (input: AssignTaskInput) => string;
  isRunning: boolean;
} {
  const [runs, setRuns] = useState<Record<string, SimulatedRun>>({});
  const tickersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const counterRef = useRef(0);

  // Cleanup all tickers on unmount
  useEffect(() => {
    return () => {
      for (const t of Object.values(tickersRef.current)) clearInterval(t);
      tickersRef.current = {};
    };
  }, []);

  const assignTask = useCallback(
    (input: AssignTaskInput): string => {
      counterRef.current += 1;
      const run = buildInitialRun(plan, input, counterRef.current);
      const id = run.task.id;
      setRuns((prev) => ({ ...prev, [id]: run }));

      // Advance every 1.4s until pipeline finishes
      const ticker = setInterval(() => {
        setRuns((prev) => {
          const current = prev[id];
          if (!current) return prev;
          const stepNames = plan?.dashboardPrototype?.pipeline?.steps?.length ?? 3;
          if (current._stepIndex >= stepNames) {
            const t = tickersRef.current[id];
            if (t) {
              clearInterval(t);
              delete tickersRef.current[id];
            }
            return prev;
          }
          const next = advanceRun(current, plan);
          return { ...prev, [id]: next };
        });
      }, 1400);
      tickersRef.current[id] = ticker;
      return id;
    },
    [plan],
  );

  const simulatedTasks: TaskSummary[] = Object.values(runs)
    .sort((a, b) => (b.task.startedAt ?? "").localeCompare(a.task.startedAt ?? ""))
    .map((r) => r.task);
  const simulatedRuns: Record<string, TaskRunDetail> = Object.fromEntries(
    Object.entries(runs).map(([id, r]) => [id, { task: r.task, timeline: r.timeline, artifacts: r.artifacts }]),
  );

  return {
    simulatedTasks,
    simulatedRuns,
    assignTask,
    isRunning: Object.keys(tickersRef.current).length > 0,
  };
}

export function TaskRunningBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        background: "rgba(174,0,208,0.10)",
        color: T.primary,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      simulating
    </span>
  );
}
