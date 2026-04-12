import { NextResponse } from "next/server";

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "";
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Resolve the sandbox record backing the architect gateway.
 *
 * Matching strategy (in priority order):
 * 1. URL match: compare OPENCLAW_GATEWAY_URL against standard_url/dashboard_url
 * 2. Token match: compare OPENCLAW_GATEWAY_TOKEN against gateway_token
 * 3. Fallback: first sandbox with vnc_port set (browser-capable)
 */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sandboxes`);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: 502 },
      );
    }

    const sandboxes = (await res.json()) as Array<Record<string, unknown>>;
    if (!sandboxes.length) {
      return NextResponse.json(
        { error: "No sandboxes available" },
        { status: 404 },
      );
    }

    let match: Record<string, unknown> | undefined;

    // Strategy 1: Match by gateway URL (ws→http conversion)
    if (GATEWAY_URL) {
      const gatewayHttp = GATEWAY_URL
        .replace(/^wss:/, "https:")
        .replace(/^ws:/, "http:")
        .replace(/\/+$/, "");

      match = sandboxes.find((sb) => {
        for (const key of ["standard_url", "dashboard_url"] as const) {
          const url = sb[key];
          if (typeof url === "string" && url.replace(/\/+$/, "") === gatewayHttp) {
            return true;
          }
        }
        return false;
      });
    }

    // Strategy 2: Match by gateway token
    if (!match && GATEWAY_TOKEN) {
      match = sandboxes.find(
        (sb) => typeof sb.gateway_token === "string" && sb.gateway_token === GATEWAY_TOKEN,
      );
    }

    // Strategy 3: First sandbox with VNC (browser-capable)
    if (!match) {
      match = sandboxes.find(
        (sb) => typeof sb.vnc_port === "number" && sb.vnc_port > 0,
      );
    }

    // Strategy 4: First running sandbox
    if (!match) {
      match = sandboxes[0];
    }

    if (!match) {
      return NextResponse.json(
        { error: "No sandbox found" },
        { status: 404 },
      );
    }

    // Health-check: verify the gateway is reachable before returning.
    // If the sandbox container is running but its gateway process is dead,
    // returning it causes ECONNRESET errors downstream.
    // Use the stored standard_url/dashboard_url (set correctly by the backend
    // for both local dev and Docker environments) instead of hardcoding localhost.
    const probeUrl =
      (typeof match.standard_url === "string" && match.standard_url) ||
      (typeof match.dashboard_url === "string" && match.dashboard_url) ||
      "";
    if (probeUrl) {
      try {
        const probe = await fetch(`${probeUrl}/`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!probe.ok) throw new Error(`probe status ${probe.status}`);
      } catch {
        console.warn(
          `[architect-sandbox] Gateway at ${probeUrl} (sandbox ${match.sandbox_id}) is unreachable, skipping`,
        );
        // Try to find another healthy sandbox
        const fallback = sandboxes.find(
          (sb) =>
            sb.sandbox_id !== match!.sandbox_id &&
            typeof sb.gateway_port === "number" &&
            (sb.gateway_port as number) > 0,
        );
        if (fallback) {
          const fbUrl =
            (typeof fallback.standard_url === "string" && fallback.standard_url) ||
            (typeof fallback.dashboard_url === "string" && fallback.dashboard_url) ||
            "";
          if (fbUrl) {
            try {
              const fbProbe = await fetch(`${fbUrl}/`, {
                signal: AbortSignal.timeout(3000),
              });
              if (fbProbe.ok) {
                match = fallback;
              }
            } catch {
              // fallback also dead — continue with original match anyway
            }
          }
        }
      }
    }

    return NextResponse.json({
      sandbox_id: match.sandbox_id,
      sandbox_name: match.sandbox_name ?? "architect",
      vnc_port: match.vnc_port ?? undefined,
      gateway_port: match.gateway_port ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
