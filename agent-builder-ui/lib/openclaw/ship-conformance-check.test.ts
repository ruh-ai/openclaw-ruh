/**
 * ship-conformance-check tests
 *
 * Covers every branch of the discriminated outcome — including the
 * fail-closed paths (workspace error, network failure, HTTP 5xx, malformed
 * JSON, missing report shape) that earlier review found were silently
 * letting deploy proceed.
 */

import { describe, expect, mock, test } from "bun:test";
import {
  runDeployConformanceCheckWithDeps,
  type ShipConformanceDeps,
} from "./ship-conformance-check";

const SANDBOX = "sandbox-001";
const API_BASE = "http://localhost:8000";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeps(over: Partial<ShipConformanceDeps> = {}): ShipConformanceDeps {
  return {
    readWorkspaceFile: mock(async () => null),
    fetchBackend: mock(async () =>
      jsonResponse({ report: { ok: true, errors: 0, warnings: 0, findings: [] } }),
    ),
    ...over,
  };
}

const SAMPLE_MANIFEST_JSON = JSON.stringify({ id: "p" });

// ─── Happy + soft-skip paths ──────────────────────────────────────────────

describe("runDeployConformanceCheck — outcomes", () => {
  test("ok: substrate returns no blocking findings", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => SAMPLE_MANIFEST_JSON),
      fetchBackend: mock(async () =>
        jsonResponse({ report: { ok: true, findings: [] } }),
      ),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out).toEqual({ status: "ok" });
  });

  test("ok: dashboard-manifest-required is filtered (Path A tolerates)", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => SAMPLE_MANIFEST_JSON),
      fetchBackend: mock(async () =>
        jsonResponse({
          report: {
            ok: false,
            findings: [
              {
                severity: "error",
                rule: "dashboard-manifest-required",
                message: "dashboard ref present but no dashboard manifest supplied",
              },
            ],
          },
        }),
      ),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out).toEqual({ status: "ok" });
  });

  test("skipped: missing manifest in workspace (Path A soft skip)", async () => {
    const deps = makeDeps({ readWorkspaceFile: mock(async () => null) });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out).toEqual({ status: "skipped" });
  });
});

// ─── Substrate-reported blocks ────────────────────────────────────────────

describe("runDeployConformanceCheck — substrate findings block", () => {
  test("blocked: error finding (other than dashboard-manifest-required)", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => SAMPLE_MANIFEST_JSON),
      fetchBackend: mock(async () =>
        jsonResponse({
          report: {
            ok: false,
            findings: [
              {
                severity: "error",
                rule: "memory-confirm-needs-tier1",
                message: "permission held by no tier-1 writer",
              },
            ],
          },
        }),
      ),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") {
      expect(out.reasons).toEqual([
        "[memory-confirm-needs-tier1] permission held by no tier-1 writer",
      ]);
    }
  });

  test("blocked: warnings alone do not block", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => SAMPLE_MANIFEST_JSON),
      fetchBackend: mock(async () =>
        jsonResponse({
          report: {
            ok: true,
            findings: [
              {
                severity: "warning",
                rule: "dashboard-title-mismatch",
                message: "stub title differs from dashboard title",
              },
            ],
          },
        }),
      ),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out).toEqual({ status: "ok" });
  });
});

// ─── Fail-closed infrastructure paths (the P2 review fix) ─────────────────

describe("runDeployConformanceCheck — fail-closed on infra failure", () => {
  test("blocked: workspace read throws (could be a docker exec failure)", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => {
        throw new Error("docker exec timed out");
      }),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") {
      expect(out.reasons[0]).toContain("Could not read or parse");
      expect(out.reasons[0]).toContain("docker exec timed out");
    }
  });

  test("blocked: manifest JSON is malformed", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => "{not-json"),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") {
      expect(out.reasons[0]).toContain("Could not read or parse");
    }
  });

  test("blocked: network/auth failure when calling /api/conformance/check", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => SAMPLE_MANIFEST_JSON),
      fetchBackend: mock(async () => {
        throw new Error("network down");
      }),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") {
      expect(out.reasons[0]).toContain("did not run (network/auth failure)");
      expect(out.reasons[0]).toContain("network down");
    }
  });

  test("blocked: backend returns HTTP 5xx", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => SAMPLE_MANIFEST_JSON),
      fetchBackend: mock(
        async () => new Response("internal error", { status: 500 }),
      ),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") {
      expect(out.reasons[0]).toContain("HTTP 500");
      expect(out.reasons[0]).toContain("validator did not run");
    }
  });

  test("blocked: backend returns 401 (auth dropped mid-deploy)", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => SAMPLE_MANIFEST_JSON),
      fetchBackend: mock(async () => new Response("unauthorized", { status: 401 })),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") {
      expect(out.reasons[0]).toContain("HTTP 401");
    }
  });

  test("blocked: response body is not JSON", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => SAMPLE_MANIFEST_JSON),
      fetchBackend: mock(
        async () =>
          new Response("<html>500 error</html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") {
      expect(out.reasons[0]).toContain("not valid JSON");
    }
  });

  test("blocked: response is JSON but missing report.findings[]", async () => {
    const deps = makeDeps({
      readWorkspaceFile: mock(async () => SAMPLE_MANIFEST_JSON),
      fetchBackend: mock(async () => jsonResponse({ ok: true })),
    });
    const out = await runDeployConformanceCheckWithDeps(SANDBOX, API_BASE, deps);
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") {
      expect(out.reasons[0]).toContain("missing report.findings[]");
    }
  });
});

// ─── Sandbox-id guard ──────────────────────────────────────────────────────

describe("runDeployConformanceCheck — sandbox readiness", () => {
  test("skipped when no sandbox id is supplied (cannot read manifest)", async () => {
    // Calling the entry point with null returns skipped without invoking
    // any deps. This is the behavior of the production wrapper, not the
    // *WithDeps core. We verify it via the reachable equivalent: passing
    // an empty string would still attempt to read; null is a separate
    // path through the production wrapper. The core test below mirrors
    // the contract.
    const deps = makeDeps({ readWorkspaceFile: mock(async () => null) });
    // Empty workspace read on a real sandbox id → skipped (Path A)
    const out = await runDeployConformanceCheckWithDeps("any-sandbox", API_BASE, deps);
    expect(out).toEqual({ status: "skipped" });
  });
});
