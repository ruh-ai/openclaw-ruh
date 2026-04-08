/**
 * use-feature-session.ts — Loads and manages a feature session from the branch API.
 */

import { useState, useEffect, useCallback } from "react";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type FeatureStage = "think" | "plan" | "build" | "review" | "test" | "ship" | "reflect" | "complete";

export interface FeatureContext {
  title: string;
  description: string;
  baselineAgent: { name: string; skillCount: number; toolCount: number; triggerCount: number; ruleCount: number; skills: string[] };
}

export interface FeatureSessionData {
  featureStage: FeatureStage;
  featureContext: FeatureContext | null;
  featurePrd: string | null;
  featurePlan: unknown | null;
  branchName: string;
  baseBranch: string;
  title: string;
  status: "open" | "merged" | "closed";
}

export function useFeatureSession(agentId: string | null, branchName: string | null) {
  const [session, setSession] = useState<FeatureSessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (!agentId || !branchName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}/session`);
      if (!res.ok) throw new Error(`Failed to load feature session (${res.status})`);
      setSession(await res.json() as FeatureSessionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [agentId, branchName]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  const setFeatureStage = useCallback(async (stage: FeatureStage) => {
    if (!agentId || !branchName) return;
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}/session`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureStage: stage }),
      });
      if (res.ok) { const updated = await res.json() as Partial<FeatureSessionData>; setSession((prev) => prev ? { ...prev, ...updated } : prev); }
    } catch { /* non-blocking */ }
  }, [agentId, branchName]);

  const buildArchitectPrompt = useCallback((): string | null => {
    if (!session?.featureContext) return null;
    const ctx = session.featureContext;
    const baseline = ctx.baselineAgent;
    return [
      `You are improving an existing agent called "${baseline.name}".`,
      `It currently has ${baseline.skillCount} skills (${baseline.skills.join(", ") || "none"}), ${ctx.baselineAgent.toolCount} tools, ${ctx.baselineAgent.triggerCount} triggers.`,
      ``, `The user wants to add a new feature: "${ctx.title}"`,
      ctx.description ? `Description: ${ctx.description}` : "",
      ``, `Important: You are NOT building a new agent. Only create new skills/tools needed for this feature.`,
    ].filter(Boolean).join("\n");
  }, [session]);

  return { session, loading, error, setFeatureStage, buildArchitectPrompt, refresh: fetchSession, isActive: Boolean(session && session.status === "open") };
}
