"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POLL_INTERVAL_MS = 30_000;

export type SandboxHealth = "running" | "stopped" | "unreachable" | "loading";

export interface SandboxStatusResponse {
  status?: string;
  container_running?: boolean;
}

type FetchLike = typeof fetch;

export function classifySandboxHealth(status: SandboxStatusResponse): SandboxHealth {
  const normalized = String(status.status ?? "").trim().toLowerCase();
  const gatewayHealthy = ["running", "ok", "healthy", "ready", "started"].includes(normalized);

  if (status.container_running === false) {
    return "stopped";
  }

  if (status.container_running === true) {
    return gatewayHealthy ? "running" : "unreachable";
  }

  return gatewayHealthy ? "running" : "unreachable";
}

export async function fetchSandboxHealthMap(
  sandboxIds: string[],
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<Record<string, SandboxHealth>> {
  const entries = await Promise.all(
    sandboxIds.map(async (sandboxId) => {
      try {
        const response = await fetchImpl(`${API_BASE}/api/sandboxes/${sandboxId}/status`, { signal });
        if (!response.ok) {
          return [sandboxId, "unreachable"] as const;
        }

        const payload = (await response.json()) as SandboxStatusResponse;
        return [sandboxId, classifySandboxHealth(payload)] as const;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return [sandboxId, "unreachable"] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}

function buildLoadingState(sandboxIds: string[]): Record<string, SandboxHealth> {
  return Object.fromEntries(sandboxIds.map((sandboxId) => [sandboxId, "loading" satisfies SandboxHealth]));
}

export function createSandboxHealthPoller(options: {
  sandboxIds: string[];
  onUpdate: (next: Record<string, SandboxHealth>) => void;
  fetchImpl?: FetchLike;
  intervalMs?: number;
}) {
  const { sandboxIds, onUpdate, fetchImpl = fetch, intervalMs = POLL_INTERVAL_MS } = options;

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentController: AbortController | null = null;

  const poll = async () => {
    if (stopped) return;

    currentController?.abort();
    const controller = new AbortController();
    currentController = controller;

    try {
      const next = await fetchSandboxHealthMap(sandboxIds, fetchImpl, controller.signal);
      if (!stopped) {
        onUpdate(next);
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError") && !stopped) {
        onUpdate(Object.fromEntries(sandboxIds.map((sandboxId) => [sandboxId, "unreachable"])));
      }
    }
  };

  return {
    start() {
      onUpdate(buildLoadingState(sandboxIds));
      void poll();
      timer = setInterval(() => {
        void poll();
      }, intervalMs);
    },
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      currentController?.abort();
    },
  };
}

export function useSandboxHealth(sandboxIds: string[]): Record<string, SandboxHealth> {
  const idsKey = sandboxIds.join("|");
  const stableIds = useMemo(() => [...new Set(sandboxIds)].sort(), [idsKey]);
  const [health, setHealth] = useState<Record<string, SandboxHealth>>(() => buildLoadingState(stableIds));

  useEffect(() => {
    if (stableIds.length === 0) {
      setHealth({});
      return;
    }

    const poller = createSandboxHealthPoller({
      sandboxIds: stableIds,
      onUpdate: setHealth,
    });

    poller.start();
    return () => {
      poller.stop();
    };
  }, [stableIds]);

  return health;
}
