import { useEffect, useState } from "react";

export interface ArchitectSandboxInfo {
  sandbox_id: string;
  sandbox_name: string;
  vnc_port?: number | null;
  gateway_port?: number;
}

/**
 * Fetches the sandbox record backing the architect gateway on mount.
 * Returns the sandbox info so the browser panel can connect to it.
 */
export function useArchitectSandbox() {
  const [sandbox, setSandbox] = useState<ArchitectSandboxInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/openclaw/architect-sandbox");
        if (!res.ok) {
          setSandbox(null);
          return;
        }
        const data: ArchitectSandboxInfo = await res.json();
        if (!cancelled) {
          setSandbox(data);
        }
      } catch {
        if (!cancelled) setSandbox(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { sandbox, loading };
}
