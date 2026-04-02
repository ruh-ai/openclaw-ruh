import { describe, expect, test, mock } from "bun:test";

// --- Mocks ---

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}), replace: mock(() => {}), refresh: mock(() => {}) }),
  usePathname: () => "/agents/test-id/deploy",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "test-id" }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

mock.module("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

mock.module("@/hooks/use-agents-store", () => ({
  useAgentsStore: () => ({
    agents: [
      {
        id: "test-id",
        name: "Test Agent",
        description: "A test agent",
        avatar: "🤖",
        status: "active",
        skills: ["s1"],
        skillGraph: [],
        agentRules: [],
        runtimeInputs: [],
        toolConnections: [],
        triggers: [],
        improvements: [],
        sandboxIds: [],
        channels: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        triggerLabel: "Manual",
      },
    ],
    addSandboxToAgent: mock(() => Promise.resolve()),
    promoteForge: mock(() => Promise.resolve()),
    getForgeStatus: mock(() => Promise.resolve({ active: false })),
    fetchAgent: mock(() => Promise.resolve()),
    updateAgentConfig: mock(() => Promise.resolve()),
  }),
}));

mock.module("@/lib/openclaw/agent-config", () => ({
  pushAgentConfig: mock(() => Promise.resolve({ ok: true, steps: [], webhooks: [] })),
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ),
}));

mock.module("@/lib/agents/operator-config-summary", () => ({
  buildDeployConfigSummary: () => ({
    readinessLabel: "Ready to deploy",
    toolSummary: "0 connected",
    runtimeInputSummary: "No inputs",
    triggerSummary: "Manual trigger",
  }),
  buildReviewRuntimeInputItems: () => [],
  buildReviewToolItems: () => [],
  buildReviewTriggerItems: () => [],
}));

mock.module("@/lib/agents/deploy-handoff", () => ({
  shouldAutoStartCreateDeploy: () => false,
  buildReflectHref: (id: string) => `/agents/${id}/reflect`,
}));

mock.module("@/lib/agents/runtime-inputs", () => ({
  hasMissingRequiredInputs: () => false,
  mergeRuntimeInputDefinitions: () => [],
}));

// --- Tests ---

describe("deploy page", () => {
  test("exports a default page component", async () => {
    const mod = await import("../deploy/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});

describe("setup page", () => {
  test("exports a default page component", async () => {
    const mod = await import("../setup/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
