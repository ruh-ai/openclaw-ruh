import { describe, expect, test } from "bun:test";
import { summarizeBuildReport } from "../../src/buildReport";

describe("summarizeBuildReport", () => {
  test("marks readiness blocked when required setup fails", () => {
    const report = summarizeBuildReport({
      manifestTasks: [{ specialist: "backend", status: "done" }],
      setup: [{ name: "migrate", ok: false, optional: false }],
      services: [{ name: "backend", healthy: true }],
      verification: { status: "done", checks: [] },
    });

    expect(report.readiness).toBe("blocked");
    expect(report.blockers[0]).toContain("migrate");
  });

  test("marks ship-ready only after build, setup, services, and verification pass", () => {
    const report = summarizeBuildReport({
      manifestTasks: [{ specialist: "verify", status: "done" }],
      setup: [{ name: "migrate", ok: true, optional: false }],
      services: [{ name: "backend", healthy: true }],
      verification: { status: "done", checks: [] },
    });

    expect(report.readiness).toBe("ship-ready");
    expect(report.blockers).toEqual([]);
  });

  test("marks test-ready when build and setup pass before verification finishes", () => {
    const report = summarizeBuildReport({
      manifestTasks: [{ specialist: "backend", status: "done" }],
      setup: [{ name: "migrate", ok: true, optional: false }],
      services: [{ name: "backend", healthy: true }],
      verification: { status: "pending", checks: [] },
    });

    expect(report.readiness).toBe("test-ready");
  });
});
