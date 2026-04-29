import { useEffect, useState } from "react";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

export interface ForgeSandboxInfo {
  sandbox_id: string;
  sandbox_name: string;
  vnc_port?: number | null;
  gateway_port?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isForgeSandboxForAgent(
  sandbox: Pick<ForgeSandboxInfo, "sandbox_id"> | null | undefined,
  forgeSandboxId: string | null | undefined,
): sandbox is ForgeSandboxInfo {
  return Boolean(sandbox?.sandbox_id && forgeSandboxId && sandbox.sandbox_id === forgeSandboxId);
}

export function isReadyForgeSandboxPayload(data: unknown): data is {
  status: "ready";
  sandbox: ForgeSandboxInfo;
} {
  const payload = data as { status?: unknown; sandbox?: { sandbox_id?: unknown } | null };
  return payload?.status === "ready" && typeof payload.sandbox?.sandbox_id === "string";
}

function noStoreUrl(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}

/**
 * Fetches the forge sandbox record for a given agent.
 * Returns the sandbox info so the builder chat can route to the agent's
 * own container instead of the shared architect sandbox.
 */
export function useForgeSandbox(agentId: string | null | undefined) {
  const [sandbox, setSandbox] = useState<ForgeSandboxInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setSandbox(null);
      return;
    }

    let cancelled = false;
    setSandbox(null);
    setLoading(true);

    (async () => {
      try {
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS && !cancelled; attempt += 1) {
          const res = await fetchBackendWithAuth(noStoreUrl(`${API_BASE}/api/agents/${agentId}/forge`), {
            cache: "no-store",
          });
          if (!res.ok) {
            await delay(POLL_INTERVAL_MS);
            continue;
          }
          const data = await res.json();
          if (cancelled) return;
          // data.sandbox is the full SandboxRecord; data.forge_sandbox_id is the ID
          if (isReadyForgeSandboxPayload(data)) {
            setSandbox({
              sandbox_id: data.sandbox.sandbox_id,
              sandbox_name: data.sandbox.sandbox_name ?? "agent-forge",
              vnc_port: data.sandbox.vnc_port ?? null,
              gateway_port: data.sandbox.gateway_port ?? 18789,
            });
            return;
          }

          await delay(POLL_INTERVAL_MS);
        }
        if (!cancelled) setSandbox(null);
      } catch {
        if (!cancelled) setSandbox(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [agentId]);

  const error = !loading && agentId && !sandbox
    ? "Forge sandbox is not available. The agent's container may still be provisioning or has stopped."
    : null;

  return { sandbox, loading, error };
}
