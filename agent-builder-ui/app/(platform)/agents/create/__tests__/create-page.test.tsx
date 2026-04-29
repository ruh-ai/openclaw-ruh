import { describe, expect, test, mock } from "bun:test";

// --- Mocks ---

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}), replace: mock(() => {}), refresh: mock(() => {}) }),
  usePathname: () => "/agents/create",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

mock.module("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

mock.module("@/hooks/use-agents-store", () => ({
  useAgentsStore: () => ({
    agents: [],
    addAgent: mock(() => Promise.resolve()),
    updateAgentConfig: mock(() => Promise.resolve()),
    fetchAgents: mock(() => Promise.resolve()),
    fetchAgent: mock(() => Promise.resolve()),
    deleteForge: mock(() => Promise.resolve()),
    addSandboxToAgent: mock(() => Promise.resolve()),
    promoteForge: mock(() => Promise.resolve()),
    getForgeStatus: mock(() => Promise.resolve({ active: false })),
  }),
}));

mock.module("@/lib/openclaw/builder-state", () => ({
  useBuilderState: () => ({
    state: { sandboxId: null, agentName: "Test", conversationId: null },
    actions: {},
  }),
}));

mock.module("@/lib/openclaw/copilot-state", () => ({
  hasRequiredDashboardPrototype: () => false,
  hasUsableArchitecturePlan: () => false,
  useCoPilotStore: () => ({
    state: { phase: "think", skills: [], tools: [], triggers: [] },
    actions: {},
  }),
}));

// Mirror every export from lib/openclaw/copilot-flow.ts so module-graph
// resolution succeeds even for transitive importers.
mock.module("@/lib/openclaw/copilot-flow", () => ({
  hasPurposeMetadata: () => false,
  planHasInlineContent: () => false,
  resolveCoPilotToolResearchUseCase: () => undefined,
  getSelectedUnresolvedSkillIds: () => [],
  countSkillAvailability: () => ({ available: 0, total: 0 }),
  resolveEvalReviewState: () => ({ canDeploy: false, blockerMessage: null }),
  approveManualEvalTasks: (tasks: unknown[]) => tasks,
  buildReviewStateFromArchitecturePlan: () => ({ canDeploy: false, blockerMessage: null }),
  resolveReviewSkillNodes: () => [],
  buildCoPilotReviewData: () => ({}),
  buildCoPilotReviewAgentSnapshot: () => ({}),
  evaluateCoPilotDeployReadiness: () => ({ ready: false, blockers: [] }),
  canPersistReviewOrLaterForgeStage: () => false,
  createCoPilotSeedFromAgent: () => ({}),
  resolveCoPilotCompletionKind: () => null,
}));

mock.module("@/hooks/use-architect-sandbox", () => ({
  useArchitectSandbox: () => ({ sandbox: null, loading: false }),
}));

mock.module("@/hooks/use-forge-sandbox", () => ({
  isForgeSandboxForAgent: (sandbox: { sandbox_id?: string } | null | undefined, forgeSandboxId: string | null | undefined) =>
    Boolean(sandbox?.sandbox_id && forgeSandboxId && sandbox.sandbox_id === forgeSandboxId),
  useForgeSandbox: () => ({ sandbox: null, loading: false }),
}));

mock.module("@/lib/openclaw/agent-config", () => ({
  pushAgentConfig: mock(() => Promise.resolve({ ok: true, steps: [], webhooks: [] })),
  buildSoulContent: () => "",
  buildCronJobs: () => [],
}));

mock.module("@/lib/openclaw/copilot-lifecycle-cache", () => ({
  saveCoPilotLifecycleToCache: mock(() => {}),
  loadCoPilotLifecycleFromCache: () => null,
  clearCoPilotLifecycleCache: mock(() => {}),
}));

mock.module("@/lib/openclaw/create-session-cache", () => ({
  saveCreateSessionToCache: mock(() => {}),
  loadCreateSessionFromCache: () => null,
  clearCreateSessionCache: mock(() => {}),
  shouldWaitForRouteAgentBeforeCacheRestore: () => false,
  shouldReconcileToPersistedForgeStage: () => false,
  shouldSuppressRevealTriggerForResume: () => false,
  resolveRouteAgentForRestore: () => null,
  buildResumedCoPilotSeed: () => null,
  buildResumedBuilderState: () => null,
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() => Promise.resolve({ ok: true, json: () => ({}) })),
}));

mock.module("@/lib/agents/operator-config-summary", () => ({
  buildDeployConfigSummary: () => ({
    readinessLabel: "Ready",
    toolSummary: "OK",
    runtimeInputSummary: "OK",
    triggerSummary: "Manual",
  }),
  buildReviewToolItems: () => [],
  buildReviewTriggerItems: () => [],
  buildReviewRuntimeInputItems: () => [],
}));

mock.module("@/lib/agents/runtime-inputs", () => ({
  mergeRuntimeInputDefinitions: () => [],
  extractRuntimeInputKeys: () => [],
  isRuntimeInputFilled: () => false,
  hasMissingRequiredInputs: () => false,
  getRuntimeInputDetails: () => ({ label: "", description: "" }),
  enrichRuntimeInputsFromPlan: () => [],
}));

mock.module("@/lib/agents/deploy-handoff", () => ({
  buildCreateDeployHref: () => "/agents/test/deploy",
  resolveImproveAgentCompletionHref: () => "/agents/test/deploy",
}));

mock.module("@/lib/tools/tool-integration", () => ({
  finalizeCredentialBackedToolConnections: () => [],
  researchToolIntegration: mock(() => Promise.resolve(null)),
  buildToolResearchPlan: () => ({ steps: [], toolId: "", toolName: "" }),
  buildToolResearchResultFromPlan: () => null,
  normalizeToolResearchResponse: () => ({}),
  buildToolResearchPrompt: () => "",
  reconcileToolConnections: () => [],
}));

mock.module("sonner", () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

// --- Tests ---

describe("create/page.tsx", () => {
  test("exports a default page component", async () => {
    const mod = await import("../page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
