import { useEffect, useState } from "react";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

export interface ForgeSandboxInfo {
  sandbox_id: string;
  sandbox_name: string;
  vnc_port?: number | null;
  gateway_port?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
    setLoading(true);

    (async () => {
      try {
        const res = await fetchBackendWithAuth(noStoreUrl(`${API_BASE}/api/agents/${agentId}/forge`), {
          cache: "no-store",
        });
        if (!res.ok) { setSandbox(null); return; }
        const data = await res.json();
        if (cancelled) return;
        // data.sandbox is the full SandboxRecord; data.forge_sandbox_id is the ID
        if (data.status === "ready" && data.sandbox) {
          setSandbox({
            sandbox_id: data.sandbox.sandbox_id,
            sandbox_name: data.sandbox.sandbox_name ?? "agent-forge",
            vnc_port: data.sandbox.vnc_port ?? null,
            gateway_port: data.sandbox.gateway_port ?? 18789,
          });
        } else {
          setSandbox(null);
        }
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
