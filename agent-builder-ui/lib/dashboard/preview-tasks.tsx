/**
 * Task feed + run inspector primitives.
 *
 * Shared by:
 *   1. Prototype stage (LifecycleStepRenderer's Tasks tab) — driven from
 *      synthesizeTaskRuns().
 *   2. Build-generated dashboard (scaffoldTemplates writes a near-identical
 *      copy of these into dashboard/components/) — driven from fixtures.json
 *      with eventual swap to real backend endpoints.
 *
 * Keep this module *visually* in sync with the templates emitted by
 * scaffoldTemplates.ts. The whole point is that the operator sees the
 * same UI in the prototype that they'll see in production.
 */

"use client";

import { useState, type CSSProperties } from "react";
import type {
  ArtifactRecord,
  ArtifactStatus,
  TaskRunDetail,
  TaskStatus,
  TaskSummary,
  TimelineEvent,
} from "@/lib/openclaw/types";
import { dashboardTokens as T } from "./tokens";

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: T.textTertiary },
  in_progress: { label: "In progress", color: T.primary },
  blocked: { label: "Blocked", color: T.warning },
  needs_approval: { label: "Needs approval", color: T.secondary },
  completed: { label: "Completed", color: T.success },
  failed: { label: "Failed", color: T.error },
};

const ARTIFACT_STATUS_META: Record<ArtifactStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: T.textTertiary },
  pending_review: { label: "Pending review", color: T.secondary },
  approved: { label: "Approved", color: T.success },
  revision_requested: { label: "Revision requested", color: T.warning },
};

function formatRelative(iso: string | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: color + "18",
        color,
      }}
    >
      {label}
    </span>
  );
}

export function PreviewTaskFeed({
  tasks,
  selectedTaskId,
  onSelect,
  onNewTask,
}: {
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onNewTask?: () => void;
}) {
  const groups: Array<{ title: string; statuses: TaskStatus[] }> = [
    { title: "In flight", statuses: ["in_progress", "blocked", "needs_approval"] },
    { title: "Pending", statuses: ["pending"] },
    { title: "Done", statuses: ["completed", "failed"] },
  ];

  return (
    <div
      style={{
        background: T.cardColor,
        border: `1px solid ${T.borderDefault}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          borderBottom: `1px solid ${T.borderDefault}`,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>Tasks</div>
          <div style={{ fontSize: 12, color: T.textTertiary }}>
            Click any task to inspect its run
          </div>
        </div>
        {onNewTask && (
          <button
            type="button"
            onClick={onNewTask}
            style={{
              padding: "8px 14px",
              background: T.primary,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + Assign new task
          </button>
        )}
      </div>

      <div style={{ maxHeight: 520, overflowY: "auto" }}>
        {groups.map((group) => {
          const groupTasks = tasks.filter((t) => group.statuses.includes(t.status));
          if (groupTasks.length === 0) return null;
          return (
            <div key={group.title}>
              <div
                style={{
                  padding: "10px 16px",
                  background: "#fafafa",
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.textTertiary,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {group.title}
              </div>
              {groupTasks.map((task) => {
                const meta = STATUS_META[task.status];
                const active = selectedTaskId === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onSelect(task.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 16px",
                      borderBottom: `1px solid ${T.borderDefault}`,
                      background: active ? "rgba(174,0,208,0.04)" : "transparent",
                      borderLeft: active ? `3px solid ${T.primary}` : "3px solid transparent",
                      cursor: "pointer",
                      border: "none",
                      borderTop: 0,
                      borderRight: 0,
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: T.textPrimary,
                          fontSize: 13,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {task.title}
                      </div>
                      <Pill label={meta.label} color={meta.color} />
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: T.textTertiary }}>
                      {task.currentStepName ? `Step: ${task.currentStepName}` : "Not started"}
                      {task.assignedTo ? ` · ${task.assignedTo}` : ""}
                      {" · "}
                      {formatRelative(task.updatedAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const KIND_ICON_COLOR: Record<TimelineEvent["kind"], string> = {
  input: T.info,
  step_started: T.primary,
  step_completed: T.success,
  tool_call: T.secondary,
  decision: T.primary,
  artifact_produced: T.primary,
  approval_requested: T.warning,
  approval_granted: T.success,
  approval_rejected: T.error,
  error: T.error,
  complete: T.success,
};

function TimelineDot({ kind }: { kind: TimelineEvent["kind"] }) {
  const color = KIND_ICON_COLOR[kind];
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 5,
        background: color,
        flexShrink: 0,
        marginTop: 5,
        boxShadow: `0 0 0 3px ${color}22`,
      }}
    />
  );
}

function ArtifactCard({
  artifact,
  selected,
  onSelect,
}: {
  artifact: ArtifactRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = ARTIFACT_STATUS_META[artifact.status];
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: 12,
        marginBottom: 8,
        background: selected ? "rgba(174,0,208,0.04)" : T.cardColor,
        border: `1px solid ${selected ? "rgba(174,0,208,0.25)" : T.borderDefault}`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div
          style={{
            fontWeight: 600,
            color: T.textPrimary,
            fontSize: 13,
          }}
        >
          {artifact.name}
        </div>
        <Pill label={meta.label} color={meta.color} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: T.textTertiary }}>
        {artifact.type} · {formatRelative(artifact.createdAt)}
      </div>
    </button>
  );
}

const drawerStyle: CSSProperties = {
  background: T.cardColor,
  border: `1px solid ${T.borderDefault}`,
  borderRadius: 12,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  maxHeight: 680,
};

export function PreviewRunInspector({
  run,
  onApprove,
  onRequestRevision,
  onRerun,
}: {
  run: TaskRunDetail | null;
  onApprove?: (artifactId: string) => void;
  onRequestRevision?: (artifactId: string) => void;
  onRerun?: (taskId: string) => void;
}) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  if (!run) {
    return (
      <div style={{ ...drawerStyle, padding: 40, textAlign: "center", color: T.textTertiary }}>
        Select a task to inspect its run.
      </div>
    );
  }
  const { task, timeline, artifacts } = run;
  const meta = STATUS_META[task.status];
  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? artifacts[0] ?? null;

  return (
    <div style={drawerStyle}>
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${T.borderDefault}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: "ui-monospace, monospace" }}>
            {task.id}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginTop: 2 }}>
            {task.title}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Pill label={meta.label} color={meta.color} />
            {task.assignedTo && (
              <span style={{ fontSize: 11, color: T.textTertiary }}>
                Owner: <strong style={{ color: T.textSecondary }}>{task.assignedTo}</strong>
              </span>
            )}
            <span style={{ fontSize: 11, color: T.textTertiary }}>
              Started {formatRelative(task.startedAt)}
            </span>
          </div>
        </div>
        {onRerun && (
          <button
            type="button"
            onClick={() => onRerun(task.id)}
            style={{
              padding: "6px 12px",
              border: `1px solid ${T.borderDefault}`,
              background: T.cardColor,
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              color: T.textSecondary,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Re-run
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", flex: 1, minHeight: 0 }}>
        <div style={{ padding: 16, overflowY: "auto", borderRight: `1px solid ${T.borderDefault}` }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: T.textTertiary,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 8,
            }}
          >
            Timeline
          </div>
          {timeline.map((event) => (
            <div
              key={event.id}
              style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 10, marginBottom: 10 }}
            >
              <TimelineDot kind={event.kind} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{event.label}</div>
                {event.detail && (
                  <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>{event.detail}</div>
                )}
                {event.toolName && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: "4px 8px",
                      background: "rgba(123,90,255,0.06)",
                      borderRadius: 6,
                      fontSize: 10,
                      color: T.secondary,
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    {event.toolName}({event.toolArgs ? JSON.stringify(event.toolArgs) : ""})
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: 10, color: T.textTertiary }}>
                  {event.actor ?? "agent"} · {formatRelative(event.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: T.textTertiary,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 8,
            }}
          >
            Artifacts
          </div>
          {artifacts.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textTertiary }}>No artifacts produced yet.</div>
          ) : (
            artifacts.map((a) => (
              <ArtifactCard
                key={a.id}
                artifact={a}
                selected={selectedArtifact?.id === a.id}
                onSelect={() => setSelectedArtifactId(a.id)}
              />
            ))
          )}

          {selectedArtifact && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                border: `1px solid ${T.borderDefault}`,
                borderRadius: 10,
                background: "#fafafa",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>
                  {selectedArtifact.name}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {onApprove && selectedArtifact.status !== "approved" && (
                    <button
                      type="button"
                      onClick={() => onApprove(selectedArtifact.id)}
                      style={{
                        padding: "4px 10px",
                        background: T.success + "18",
                        color: T.success,
                        border: `1px solid ${T.success}40`,
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Approve
                    </button>
                  )}
                  {onRequestRevision && selectedArtifact.status !== "approved" && (
                    <button
                      type="button"
                      onClick={() => onRequestRevision(selectedArtifact.id)}
                      style={{
                        padding: "4px 10px",
                        background: T.warning + "18",
                        color: T.warning,
                        border: `1px solid ${T.warning}40`,
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Request revision
                    </button>
                  )}
                </div>
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  color: T.textSecondary,
                  background: "transparent",
                  margin: 0,
                  lineHeight: 1.55,
                }}
              >
                {selectedArtifact.content ?? "(no content)"}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
