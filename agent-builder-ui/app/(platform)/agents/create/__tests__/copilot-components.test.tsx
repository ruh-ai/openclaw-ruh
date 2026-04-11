import { describe, expect, test, mock } from "bun:test";

// --- Mocks ---

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}), replace: mock(() => {}), refresh: mock(() => {}) }),
  usePathname: () => "/agents/create",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

mock.module("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

mock.module("uuid", () => ({
  v4: () => "test-uuid-5678",
}));

mock.module("@/lib/openclaw/copilot-state", () => ({
  useCoPilotStore: () => ({
    state: { phase: "think", skills: [], tools: [], triggers: [], improvements: [] },
    actions: {},
  }),
  PHASE_ORDER: ["think", "plan", "build", "review", "test", "ship", "reflect"],
}));

mock.module("@/lib/openclaw/copilot-flow", () => ({
  evaluateCoPilotDeployReadiness: () => ({ ready: false, blockers: [] }),
  hasPurposeMetadata: () => false,
  getSelectedUnresolvedSkillIds: () => [],
  buildCoPilotReviewAgentSnapshot: () => ({}),
  buildCoPilotReviewData: () => ({}),
  countSkillAvailability: () => ({ available: 0, total: 0 }),
  resolveCoPilotToolResearchUseCase: () => "",
  resolveCoPilotCompletionKind: () => null,
  createCoPilotSeedFromAgent: () => ({}),
  canPersistReviewOrLaterForgeStage: () => false,
  planHasInlineContent: () => false,
}));

mock.module("@/lib/openclaw/builder-state", () => ({
  useBuilderState: () => ({
    state: { sandboxId: null, agentName: "Test", conversationId: null },
    actions: {},
  }),
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
  isRuntimeInputFilled: () => false,
  mergeRuntimeInputDefinitions: () => [],
  extractRuntimeInputKeys: () => [],
  hasMissingRequiredInputs: () => false,
  getRuntimeInputDetails: () => ({ label: "", description: "" }),
  enrichRuntimeInputsFromPlan: () => [],
}));

mock.module("@/lib/skills/skill-registry", () => ({
  fetchSkillRegistry: mock(() => Promise.resolve([])),
  resolveSkillAvailability: mock(() => []),
}));

mock.module("@/lib/openclaw/api", () => ({
  sendToArchitectStreaming: mock(() => Promise.resolve({ text: "" })),
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ),
}));

mock.module("@/lib/tools/tool-integration", () => ({
  researchToolIntegration: mock(() => Promise.resolve(null)),
  buildToolResearchPlan: () => ({ steps: [], toolId: "", toolName: "" }),
  buildToolResearchResultFromPlan: () => null,
  normalizeToolResearchResponse: () => ({}),
  buildToolResearchPrompt: () => "",
  reconcileToolConnections: () => [],
  finalizeCredentialBackedToolConnections: () => [],
}));

mock.module("@/hooks/use-agents-store", () => ({
  useAgentsStore: () => ({
    agents: [],
    fetchAgent: mock(() => Promise.resolve()),
  }),
}));

mock.module("sonner", () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}));

// --- Tests ---

describe("CoPilotLayout", () => {
  test("exports CoPilotLayout component", async () => {
    const { CoPilotLayout } = await import(
      "../_components/copilot/CoPilotLayout"
    );
    expect(CoPilotLayout).toBeDefined();
    expect(typeof CoPilotLayout).toBe("function");
  });
});

describe("WizardStepRenderer", () => {
  test("exports WizardStepRenderer component", async () => {
    const mod = await import("../_components/copilot/WizardStepRenderer");
    const component = mod.WizardStepRenderer || mod.default;
    expect(component).toBeDefined();
    expect(typeof component).toBe("function");
  });
});

describe("LifecycleStepRenderer", () => {
  test("exports LifecycleStepRenderer component", async () => {
    const mod = await import("../_components/copilot/LifecycleStepRenderer");
    const component = mod.LifecycleStepRenderer || mod.default;
    expect(component).toBeDefined();
    expect(typeof component).toBe("function");
  });
});
