const API = process.env.NEXT_PUBLIC_HERMES_API || "http://localhost:8100";

async function fetchAPI<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}

export interface DashboardStats {
  tasks: { total: number; completed: number; failed: number; running: number; successRate: number };
  memories: { total: number; byType: Record<string, number>; byAgent: Record<string, number> };
  agents: {
    total: number;
    active: number;
    list: Array<{
      name: string; model: string; tasksTotal: number;
      tasksPassed: number; tasksFailed: number; passRate: number;
    }>;
  };
}

export interface TimelineEvent {
  id: string; eventType: string; title: string;
  detail: string | null; agent: string | null; createdAt: string;
}

export interface Agent {
  id: string; name: string; description: string | null; version: number;
  model: string; status: string; filePath: string | null; promptHash: string | null;
  tools: string; stack: string; skills: string[]; promptSize: number;
  circuitState: string; consecutiveFailures: number;
  tasksTotal: number; tasksPassed: number; tasksFailed: number;
  lastSyncedAt: string | null; createdAt: string; updatedAt: string;
}

export interface TaskLog {
  id: string; description: string; status: string; delegatedTo: string | null;
  startedAt: string; completedAt: string | null; resultSummary: string | null;
  error: string | null; sessionId: string | null; createdAt: string;
  parentTaskId: string | null; priority: string; durationMs: number | null;
}

export interface SessionListItem {
  id: string; startedAt: string; endedAt: string | null;
  tasksCount: number; learningsCount: number; summary: string | null;
  taskCount: number; activeTaskCount: number;
}

export interface SessionDetail {
  id: string; startedAt: string; endedAt: string | null;
  tasksCount: number; learningsCount: number; summary: string | null;
  tasks: TaskLog[];
}

export interface Memory {
  id: string; text: string; type: string; agent: string;
  tags: string; taskContext: string; vectorId: string | null; createdAt: string;
}

export interface AgentScore {
  id: string; agentName: string; taskId: string | null;
  passed: boolean; score: number | null; notes: string | null; createdAt: string;
}

export interface Refinement {
  id: string; agentName: string; changeDescription: string;
  reason: string | null; diffSummary: string | null; createdAt: string;
}

// ── Queue Types ────────────────────────────────────────────────

export interface QueueJob {
  id: string; queueName: string; jobId: string; taskLogId: string | null;
  agentName: string | null; priority: number; status: string; source: string;
  prompt: string | null; resultJson: unknown; errorMessage: string | null;
  attempts: number; maxAttempts: number; timeoutMs: number;
  startedAt: string | null; completedAt: string | null; createdAt: string;
}

export interface QueueStats {
  [queueName: string]: { waiting: number; active: number; completed: number; failed: number };
}

export interface QueueHealth {
  redis: string;
  workers: { running: boolean; workerCount: number; activeSubprocesses: number; workers: Array<{ name: string; running: boolean }> };
  timestamp: string;
}

export interface ScheduledTask {
  id: string; name: string; description: string; cronExpression: string;
  agentName: string; priority: number; timeoutMs: number; enabled: boolean;
  lastRunAt: string | null; nextRunAt: string | null; runCount: number; createdAt: string;
}

export interface EvolutionReport {
  id: string; reportType: string; summary: string;
  details: unknown; actionsTaken: unknown; trigger: string; createdAt: string;
}

export interface Goal {
  id: string; title: string; description: string; priority: string;
  status: string; deadline: string | null; acceptanceCriteria: string[];
  progressPct: number; createdAt: string; updatedAt: string;
}

export interface GoalProgress {
  total: number; completed: number; failed: number; running: number; progressPct: number;
}

export interface WorkerPoolConfig {
  id: string; queueName: string; agentName: string | null;
  concurrency: number; maxConcurrency: number; updatedAt: string;
}

export interface AgentTrend {
  agentName: string; date: string; total: number;
  passed: number; failed: number; avgScore: number;
}

export const api = {
  dashboard: () => fetchAPI<DashboardStats>("/api/dashboard/stats"),
  timeline: (limit = 30) => fetchAPI<TimelineEvent[]>(`/api/evolution/timeline?limit=${limit}`),

  agents: {
    list: () => fetchAPI<Agent[]>("/api/agents"),
    get: (name: string) => fetchAPI<Agent>(`/api/agents/${name}`),
    sync: () => fetchAPI<{ synced: number; created: number; updated: number }>("/api/agents/sync", { method: "POST" }),
  },

  tasks: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetchAPI<{ items: TaskLog[]; total: number }>(`/api/tasks${qs}`);
    },
  },

  sessions: {
    list: (limit = 20) => fetchAPI<SessionListItem[]>(`/api/sessions?limit=${limit}`),
    get: (id: string) => fetchAPI<SessionDetail>(`/api/sessions/${id}`),
  },

  memories: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetchAPI<{ items: Memory[]; total: number }>(`/api/memories${qs}`);
    },
    search: (q: string, params?: Record<string, string>) => {
      const qs = new URLSearchParams({ q, ...params }).toString();
      return fetchAPI<{ items: Memory[]; total: number }>(`/api/memories/search?${qs}`);
    },
  },

  scores: {
    list: (agentName?: string) => {
      const qs = agentName ? `?agentName=${agentName}` : "";
      return fetchAPI<AgentScore[]>(`/api/scores${qs}`);
    },
  },

  refinements: {
    list: (agentName?: string) => {
      const qs = agentName ? `?agentName=${agentName}` : "";
      return fetchAPI<Refinement[]>(`/api/refinements${qs}`);
    },
  },

  // ── Queue API ──────────────────────────────────────────────
  queue: {
    stats: () => fetchAPI<QueueStats>("/api/queue/stats"),
    health: () => fetchAPI<QueueHealth>("/api/queue/health"),
    jobs: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetchAPI<{ items: QueueJob[]; total: number }>(`/api/queue/tasks${qs}`);
    },
    job: (id: string) => fetchAPI<QueueJob>(`/api/queue/tasks/${id}`),
    submit: (data: { description: string; agentName?: string; priority?: number }) =>
      fetchAPI<{ jobId: string }>("/api/queue/tasks", { method: "POST", body: JSON.stringify(data) }),
    cancel: (id: string) => fetchAPI<void>(`/api/queue/tasks/${id}`, { method: "DELETE" }),
    retry: (id: string) => fetchAPI<{ retryJobId: string }>(`/api/queue/tasks/${id}/retry`, { method: "POST" }),
    pause: (queue: string) => fetchAPI<void>(`/api/queue/pause/${queue}`, { method: "POST" }),
    resume: (queue: string) => fetchAPI<void>(`/api/queue/resume/${queue}`, { method: "POST" }),
  },

  // ── Schedules API ──────────────────────────────────────────
  schedules: {
    list: () => fetchAPI<ScheduledTask[]>("/api/schedules"),
    create: (data: { name: string; description: string; cronExpression: string; agentName?: string; priority?: number }) =>
      fetchAPI<ScheduledTask>("/api/schedules", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ScheduledTask>) =>
      fetchAPI<ScheduledTask>(`/api/schedules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchAPI<void>(`/api/schedules/${id}`, { method: "DELETE" }),
    runNow: (id: string) => fetchAPI<{ triggered: boolean; jobId: string }>(`/api/schedules/${id}/run`, { method: "POST" }),
  },

  // ── Evolution API ──────────────────────────────────────────
  evolution: {
    reports: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetchAPI<EvolutionReport[]>(`/api/evolution/reports${qs}`);
    },
    report: (id: string) => fetchAPI<EvolutionReport>(`/api/evolution/reports/${id}`),
    trigger: () => fetchAPI<{ triggered: boolean }>("/api/evolution/trigger", { method: "POST" }),
    trends: (days = 7) => fetchAPI<AgentTrend[]>(`/api/evolution/trends?days=${days}`),
  },

  // ── Goals API ──────────────────────────────────────────────
  goals: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetchAPI<{ items: Goal[]; total: number }>(`/api/goals${qs}`);
    },
    get: (id: string) => fetchAPI<Goal>(`/api/goals/${id}`),
    create: (data: { title: string; description: string; priority?: string; deadline?: string; acceptanceCriteria?: string[] }) =>
      fetchAPI<Goal>("/api/goals", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Goal>) =>
      fetchAPI<Goal>(`/api/goals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchAPI<void>(`/api/goals/${id}`, { method: "DELETE" }),
    progress: (id: string) => fetchAPI<GoalProgress>(`/api/goals/${id}/progress`),
    tasks: (id: string) => fetchAPI<{ items: TaskLog[]; total: number }>(`/api/goals/${id}/tasks`),
    analyze: (id: string) => fetchAPI<{ triggered: boolean }>(`/api/goals/${id}/analyze`, { method: "POST" }),
  },

  // ── Worker Pool API ────────────────────────────────────────
  pool: {
    list: () => fetchAPI<WorkerPoolConfig[]>("/api/pool"),
    update: (id: string, data: { concurrency?: number; maxConcurrency?: number }) =>
      fetchAPI<WorkerPoolConfig>(`/api/pool/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    reload: () => fetchAPI<{ reloaded: boolean }>("/api/pool/reload", { method: "POST" }),
  },
};
