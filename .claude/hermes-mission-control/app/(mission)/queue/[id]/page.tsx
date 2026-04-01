"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, RotateCcw } from "lucide-react";
import { api, type QueueJob } from "@/lib/api";

function JsonViewer({ data, label }: { data: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        {expanded ? "Hide" : "Show"} {label}
      </button>
      {expanded && (
        <pre className="mt-2 p-3 bg-[var(--bg-subtle)] rounded-lg text-[10px] text-[var(--text-secondary)] overflow-x-auto max-h-96 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function QueueJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<QueueJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    api.queue.job(id).then(setJob).catch((e) => setError(e.message));
  }, [id]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const result = await api.queue.retry(id);
      router.push(`/queue/${result.retryJobId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRetrying(false);
    }
  };

  if (error && !job) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--error)] text-sm">{error}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 rounded-lg soul-pulse mx-auto mb-3 bg-[var(--primary)]/10" />
        <p className="text-[var(--text-tertiary)] text-sm">Loading...</p>
      </div>
    );
  }

  const statusColor =
    job.status === "completed" ? "text-[var(--success)]" :
    job.status === "failed" ? "text-[var(--error)]" :
    job.status === "active" ? "text-[#3b82f6]" :
    "text-[var(--text-tertiary)]";

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/queue")} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="h-4 w-4 text-[var(--text-tertiary)]" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Job Detail</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{job.id}</p>
        </div>
        {job.status === "failed" && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            {retrying ? "Retrying..." : "Retry"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Metadata */}
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-5">
          <h2 className="text-xs font-bold text-[var(--text-primary)] mb-4 uppercase">Metadata</h2>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Status</span>
              <span className={`font-medium ${statusColor}`}>{job.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Agent</span>
              <span className="text-[var(--text-primary)]">{job.agentName || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Queue</span>
              <span className="text-[var(--text-primary)]">{job.queueName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Source</span>
              <span className="text-[var(--text-primary)]">{job.source}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Priority</span>
              <span className="text-[var(--text-primary)]">{job.priority}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Attempts</span>
              <span className="text-[var(--text-primary)]">{job.attempts} / {job.maxAttempts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Timeout</span>
              <span className="text-[var(--text-primary)]">{(job.timeoutMs / 1000)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Created</span>
              <span className="text-[var(--text-primary)]">{new Date(job.createdAt).toLocaleString()}</span>
            </div>
            {job.startedAt && (
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Started</span>
                <span className="text-[var(--text-primary)]">{new Date(job.startedAt).toLocaleString()}</span>
              </div>
            )}
            {job.completedAt && (
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Completed</span>
                <span className="text-[var(--text-primary)]">{new Date(job.completedAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Error / Output */}
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-5">
          {job.errorMessage && (
            <div className="mb-4">
              <h2 className="text-xs font-bold text-[var(--error)] mb-2 uppercase">Error</h2>
              <pre className="p-3 bg-[var(--error)]/5 rounded-lg text-[10px] text-[var(--error)] whitespace-pre-wrap">
                {job.errorMessage}
              </pre>
            </div>
          )}

          <h2 className="text-xs font-bold text-[var(--text-primary)] mb-2 uppercase">Prompt</h2>
          <pre className="p-3 bg-[var(--bg-subtle)] rounded-lg text-[10px] text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto">
            {job.prompt || "No prompt recorded"}
          </pre>

          <JsonViewer data={job.resultJson} label="Result JSON" />
        </div>
      </div>
    </div>
  );
}
