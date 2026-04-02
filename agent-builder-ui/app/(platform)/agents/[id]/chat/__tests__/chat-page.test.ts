/**
 * chat-page.test.ts — Verify the chat page component exports correctly.
 *
 * The page has heavy runtime dependencies (hooks, stores, sandbox health),
 * so we verify it is importable and exports a default component.
 */
import { describe, expect, test, mock } from "bun:test";

// --- Mocks ---

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}), replace: mock(() => {}), refresh: mock(() => {}) }),
  usePathname: () => "/agents/123/chat",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "agent-123" }),
}));

mock.module("@/hooks/use-agents-store", () => ({
  useAgentsStore: () => ({
    agents: [],
    getAgentById: () => null,
    fetchAgents: mock(() => Promise.resolve()),
  }),
}));

mock.module("@/hooks/use-sandbox-health", () => ({
  useSandboxHealth: () => "running",
}));

mock.module("@/hooks/use-backend-health", () => ({
  useBackendHealth: () => true,
}));

mock.module("@/lib/openclaw/shared-codex", () => ({
  sanitizeAgentModelForSandbox: (m: string) => m,
}));

mock.module("@/lib/agents/runtime-inputs", () => ({
  hasMissingRequiredInputs: () => false,
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => null,
}));

// Mock child components
mock.module("../_components/TabChat", () => ({ TabChat: () => null }));
mock.module("../_components/TabChats", () => ({ TabChats: () => null }));
mock.module("../_components/TabMissionControl", () => ({ TabMissionControl: () => null }));
mock.module("../_components/TabSettings", () => ({ TabSettings: () => null }));
mock.module("../_components/TabSkills", () => ({ TabSkills: () => null }));

describe("ChatPage", () => {
  test("exports a default component", async () => {
    const mod = await import("../page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
