import { NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Resolve a sandbox record for the architect.
 *
 * With forge-only architecture, every agent has its own sandbox.
 * This endpoint finds the first available sandbox with VNC or gateway port.
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

    // First sandbox with VNC (browser-capable)
    let match = sandboxes.find(
      (sb) => typeof sb.vnc_port === "number" && sb.vnc_port > 0,
    );

    // Fallback: first running sandbox
    if (!match) {
      match = sandboxes[0];
    }

    if (!match) {
      return NextResponse.json(
        { error: "No sandbox found" },
        { status: 404 },
      );
    }

    // Health-check: verify the gateway port is reachable before returning.
    // If the sandbox container is running but its gateway process is dead,
    // returning it causes ECONNRESET errors downstream.
    const port = typeof match.gateway_port === "number" ? match.gateway_port : 0;
    if (port > 0) {
      try {
        const probe = await fetch(`http://localhost:${port}/`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!probe.ok) throw new Error(`probe status ${probe.status}`);
      } catch {
        console.warn(
          `[architect-sandbox] Gateway at port ${port} (sandbox ${match.sandbox_id}) is unreachable, skipping`,
        );
        // Try to find another healthy sandbox
        const fallback = sandboxes.find(
          (sb) =>
            sb.sandbox_id !== match!.sandbox_id &&
            typeof sb.gateway_port === "number" &&
            (sb.gateway_port as number) > 0,
        );
        if (fallback) {
          try {
            const fbProbe = await fetch(
              `http://localhost:${fallback.gateway_port}/`,
              { signal: AbortSignal.timeout(3000) },
            );
            if (fbProbe.ok) {
              match = fallback;
            }
          } catch {
            // fallback also dead — continue with original match anyway
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
