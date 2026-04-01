"use client";
import { useEffect, useState, useCallback } from "react";
import { Clock, ChevronDown, ChevronRight, ListTodo } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { api, type SessionListItem, type SessionDetail, type TaskLog } from "@/lib/api";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatLiveDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  return formatDuration(ms);
}

function TaskTree({ tasks }: { tasks: TaskLog[] }) {
  const roots = tasks.filter((t) => !t.parentTaskId);
  const childrenOf = (parentId: string) => tasks.filter((t) => t.parentTaskId === parentId);

  function TaskNode({ task, depth }: { task: TaskLog; depth: number }) {
    const children = childrenOf(task.id);
    return (
      <div>
        <div
          className="flex items-start gap-2 py-1.5 hover:bg-[var(--bg-subtle)] rounded px-1 transition-colors"
          style={{ paddingLeft: `${depth * 20 + 4}px` }}
        >
          {depth > 0 && (
            <div className="shrink-0 w-3 border-l-2 border-b-2 border-[var(--border-muted)] h-4 mt-0.5 rounded-bl" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[var(--text-primary)] truncate">{task.description}</span>
              <StatusBadge status={task.status} />
              {task.delegatedTo && (
                <span className="text-[10px] font-medium text-[var(--primary)]">{task.delegatedTo}</span>
              )}
              {task.durationMs != null && (
                <span className="text-[10px] text-[var(--text-tertiary)]">{formatDuration(task.durationMs)}</span>
              )}
            </div>
          </div>
        </div>
        {children.map((child) => (
          <TaskNode key={child.id} task={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  if (roots.length === 0) {
    return <p className="text-xs text-[var(--text-tertiary)] py-2">No tasks in this session</p>;
  }

  return (
    <div className="mt-2">
      {roots.map((task) => (
        <TaskNode key={task.id} task={task} depth={0} />
      ))}
    </div>
  );
}

function SessionCard({ session }: { session: SessionListItem }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleExpand = useCallback(() => {
    if (!expanded && !detail) {
      setLoadingDetail(true);
      api.sessions.get(session.id)
        .then(setDetail)
        .catch(console.error)
        .finally(() => setLoadingDetail(false));
    }
    setExpanded((v) => !v);
  }, [expanded, detail, session.id]);

  const isActive = !session.endedAt;
  const duration = session.endedAt
    ? formatDuration(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())
    : null;

  return (
    <div className="animate-fadeIn bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] overflow-hidden">
      <button
        onClick={handleExpand}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-[var(--bg-subtle)] transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--text-primary)] font-mono">
              {session.id.slice(0, 8)}…
            </span>
            {isActive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#22c55e] bg-[#22c55e]/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full soul-pulse bg-[#22c55e]" />
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-[var(--text-tertiary)]">
              Started {new Date(session.startedAt).toLocaleString()}
            </span>
            {session.endedAt && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                → {new Date(session.endedAt).toLocaleString()}
              </span>
            )}
            {duration && (
              <span className="text-[10px] text-[var(--text-tertiary)]">{duration}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center">
            <p className="text-xs font-bold text-[var(--text-primary)]">{session.tasksCount ?? session.taskCount ?? 0}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">tasks</p>
          </div>
          {isActive && (session.activeTaskCount ?? 0) > 0 && (
            <div className="text-center">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full soul-pulse bg-[#22c55e]" />
                <p className="text-xs font-bold text-[#22c55e]">{session.activeTaskCount}</p>
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)]">active</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-xs font-bold text-[var(--text-primary)]">{session.learningsCount ?? 0}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">learnings</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-[var(--border-muted)]">
          {session.summary && (
            <p className="text-xs text-[var(--text-secondary)] mt-3 mb-2 italic">{session.summary}</p>
          )}
          {loadingDetail ? (
            <p className="text-xs text-[var(--text-tertiary)] py-2">Loading tasks...</p>
          ) : detail ? (
            <TaskTree tasks={detail.tasks} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ActiveSessionCard({ session }: { session: SessionListItem }) {
  const [liveDuration, setLiveDuration] = useState(formatLiveDuration(session.startedAt));
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  useEffect(() => {
    const iv = setInterval(() => {
      setLiveDuration(formatLiveDuration(session.startedAt));
    }, 1000);
    return () => clearInterval(iv);
  }, [session.startedAt]);

  useEffect(() => {
    api.sessions.get(session.id).then(setDetail).catch(console.error);
  }, [session.id]);

  return (
    <div className="animate-fadeIn bg-[var(--card-color)] rounded-xl border-2 border-[var(--primary)]/40 p-5 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl soul-pulse bg-[var(--primary)]/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Active Session</h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#22c55e] bg-[#22c55e]/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full soul-pulse bg-[#22c55e]" />
                Live
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)] font-mono mt-0.5">{session.id.slice(0, 16)}…</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-xl font-bold text-[var(--primary)]">{liveDuration}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">running</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-[var(--text-primary)]">{session.tasksCount ?? session.taskCount ?? 0}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">tasks</p>
          </div>
          {(session.activeTaskCount ?? 0) > 0 && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full soul-pulse bg-[#22c55e]" />
                <p className="text-xl font-bold text-[#22c55e]">{session.activeTaskCount}</p>
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)]">active</p>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {expanded ? "Hide" : "Show"} task tree
      </button>

      {expanded && detail && (
        <div className="mt-3 border-t border-[var(--border-muted)] pt-3">
          <TaskTree tasks={detail.tasks} />
        </div>
      )}
    </div>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.sessions.list(50)
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const activeSession = sessions.find((s) => !s.endedAt);
  const pastSessions = sessions.filter((s) => s.endedAt);

  return (
    <div>
      <h1 className="text-lg font-bold text-[var(--text-primary)]">Sessions</h1>
      <p className="text-xs text-[var(--text-tertiary)] mt-1">Active and recent orchestration sessions</p>

      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 rounded-lg soul-pulse mx-auto mb-3 bg-[var(--primary)]/10" />
          <p className="text-[var(--text-tertiary)] text-sm">Loading...</p>
        </div>
      ) : (
        <div className="mt-6">
          {activeSession && <ActiveSessionCard session={activeSession} />}

          {pastSessions.length === 0 && !activeSession ? (
            <div className="text-center py-12">
              <ListTodo className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-tertiary)]">No sessions yet</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">Sessions appear as Hermes runs tasks</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pastSessions.length > 0 && (
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3">Past Sessions</h2>
              )}
              {pastSessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
