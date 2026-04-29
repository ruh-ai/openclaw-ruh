import { describe, expect, test, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

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
  hasRequiredDashboardPrototype: () => true,
  hasUsableArchitecturePlan: () => true,
  useCoPilotStore: () => ({
    state: { phase: "think", skills: [], tools: [], triggers: [], improvements: [] },
    actions: {},
  }),
  PHASE_ORDER: ["think", "plan", "prototype", "build", "review", "test", "ship", "reflect"],
}));

// Mirror every export from lib/openclaw/copilot-flow.ts so module-graph
// resolution succeeds even for transitive importers (LifecycleStepRenderer,
// page.tsx, review components).
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

describe("BuildReportPanel", () => {
  test("shows blockers and retry action", async () => {
    const { BuildReportPanel } = await import("../_components/copilot/BuildReportPanel");

    const html = renderToStaticMarkup(
      <BuildReportPanel
        report={{
          readiness: "blocked",
          blockers: ["Required setup failed: dashboard-build"],
          warnings: [],
          checks: [],
          generatedAt: "2026-04-26T00:00:00.000Z",
        }}
        onRetryFailedStep={mock(() => {})}
        onSelectArtifact={mock(() => {})}
      />,
    );

    expect(html).toContain("Required setup failed: dashboard-build");
    expect(html).toContain("Retry failed step");
    expect(html).not.toContain("disabled=\"\"");
  });
});

describe("ArtifactActionBar", () => {
  test("renders artifact controls and disables approve when blocked", async () => {
    const { ArtifactActionBar } = await import("../_components/copilot/ArtifactActionBar");

    const html = renderToStaticMarkup(
      <ArtifactActionBar
        target={{ kind: "plan", path: ".openclaw/plan/architecture.json" }}
        canApprove={false}
        canRegenerate
        onApprove={mock(() => {})}
        onRequestChanges={mock(() => {})}
        onRegenerate={mock(() => {})}
        onCompare={mock(() => {})}
        onExplain={mock(() => {})}
        onOpenFiles={mock(() => {})}
      />,
    );

    expect(html).toContain("Approve");
    expect(html).toContain("Request Changes");
    expect(html).toContain("Regenerate");
    expect(html).toContain("Compare Changes");
    expect(html).toContain("Explain");
    expect(html).toContain("Open Files");
    expect(html).toContain("disabled=\"\"");
  });
});

describe("StepDiscovery", () => {
  test("renders PRD/TRD artifact action bar when artifact actions are available", async () => {
    const { StepDiscovery } = await import("../_components/configure/StepDiscovery");

    const artifactActions = {
      requestChanges: mock(() => {}),
      regenerate: mock(() => {}),
      compare: mock(() => {}),
      explain: mock(() => {}),
      openFiles: mock(() => {}),
    };

    const html = renderToStaticMarkup(
      <StepDiscovery
        questions={null}
        answers={{}}
        documents={{
          prd: { title: "PRD", sections: [{ heading: "Goals", content: "Launch cleanly" }] },
          trd: { title: "TRD", sections: [{ heading: "Architecture", content: "Use the sandbox" }] },
        }}
        status="ready"
        onAnswer={mock(() => {})}
        onDocSectionEdit={mock(() => {})}
        onContinue={mock(() => {})}
        onSkip={mock(() => {})}
        onRequestArtifactChange={mock(() => {})}
        artifactActions={artifactActions}
      />,
    );

    expect(html).toContain("prd actions");
    expect(html).toContain("Request Changes");
    expect(html).toContain("Compare Changes");
    expect(html).toContain("Open Files");
  });
});
