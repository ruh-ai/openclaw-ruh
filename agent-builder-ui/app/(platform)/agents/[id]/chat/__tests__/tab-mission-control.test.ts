/**
 * tab-mission-control.test.ts — Verify TabMissionControl component exports.
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}), replace: mock(() => {}) }),
  usePathname: () => "/agents/123/chat",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "agent-123" }),
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => null,
}));

mock.module("@/hooks/use-agents-store", () => ({
  useAgentsStore: () => ({
    agents: [],
    updateAgent: mock(() => Promise.resolve()),
  }),
}));

mock.module("@/lib/openclaw/agent-config", () => ({
  pushAgentConfig: mock(() => Promise.resolve({ ok: true, steps: [], webhooks: [] })),
  buildSoulContent: () => "",
  buildCronJobs: () => [],
}));

mock.module("@/lib/openclaw/workspace-memory", () => ({
  hasWorkspaceMemory: () => false,
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

describe("TabMissionControl", () => {
  test("exports TabMissionControl as a named export", async () => {
    const mod = await import("../_components/TabMissionControl");
    expect(mod.TabMissionControl).toBeDefined();
    expect(typeof mod.TabMissionControl).toBe("function");
  });
});
