import { describe, expect, test, mock } from "bun:test";

// --- Mocks ---

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}), replace: mock(() => {}) }),
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

mock.module("@/lib/skills/skill-registry", () => ({
  fetchSkillRegistry: mock(() => Promise.resolve([])),
  resolveSkillAvailability: mock(() => []),
}));

mock.module("sonner", () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}));

// --- Tests ---

describe("ConfigureAgent", () => {
  test("exports ConfigureAgent component and ConfigureOutput type", async () => {
    const mod = await import("../_components/configure/ConfigureAgent");
    expect(mod.ConfigureAgent).toBeDefined();
    expect(typeof mod.ConfigureAgent).toBe("function");
  });
});

describe("ConfigureStepper", () => {
  test("exports ConfigureStepper component", async () => {
    const { ConfigureStepper } = await import(
      "../_components/configure/ConfigureStepper"
    );
    expect(ConfigureStepper).toBeDefined();
    expect(typeof ConfigureStepper).toBe("function");
  });
});

describe("StepConnectTools", () => {
  test("exports StepConnectTools component", async () => {
    const { StepConnectTools } = await import(
      "../_components/configure/StepConnectTools"
    );
    expect(StepConnectTools).toBeDefined();
    expect(typeof StepConnectTools).toBe("function");
  });
});

describe("StepRuntimeInputs", () => {
  test("exports StepRuntimeInputs component", async () => {
    const { StepRuntimeInputs } = await import(
      "../_components/configure/StepRuntimeInputs"
    );
    expect(StepRuntimeInputs).toBeDefined();
    expect(typeof StepRuntimeInputs).toBe("function");
  });
});

describe("StepChooseSkills", () => {
  test("exports StepChooseSkills component", async () => {
    const { StepChooseSkills } = await import(
      "../_components/configure/StepChooseSkills"
    );
    expect(StepChooseSkills).toBeDefined();
    expect(typeof StepChooseSkills).toBe("function");
  });
});

describe("StepSetTriggers", () => {
  test("exports StepSetTriggers component", async () => {
    const { StepSetTriggers } = await import(
      "../_components/configure/StepSetTriggers"
    );
    expect(StepSetTriggers).toBeDefined();
    expect(typeof StepSetTriggers).toBe("function");
  });
});

describe("StepDiscovery", () => {
  test("exports StepDiscovery component", async () => {
    const { StepDiscovery } = await import(
      "../_components/configure/StepDiscovery"
    );
    expect(StepDiscovery).toBeDefined();
    expect(typeof StepDiscovery).toBe("function");
  });
});

describe("StepConfigureChannels", () => {
  test("exports StepConfigureChannels component", async () => {
    const { StepConfigureChannels } = await import(
      "../_components/configure/StepConfigureChannels"
    );
    expect(StepConfigureChannels).toBeDefined();
    expect(typeof StepConfigureChannels).toBe("function");
  });
});

describe("ConnectToolsSidebar", () => {
  test("exports ConnectToolsSidebar component", async () => {
    const { ConnectToolsSidebar } = await import(
      "../_components/configure/ConnectToolsSidebar"
    );
    expect(ConnectToolsSidebar).toBeDefined();
    expect(typeof ConnectToolsSidebar).toBe("function");
  });
});

describe("SkillDetailPanel", () => {
  test("exports SkillDetailPanel component", async () => {
    const { SkillDetailPanel } = await import(
      "../_components/configure/SkillDetailPanel"
    );
    expect(SkillDetailPanel).toBeDefined();
    expect(typeof SkillDetailPanel).toBe("function");
  });
});

describe("configure types", () => {
  test("configure/types module is importable", async () => {
    const mod = await import("../_components/configure/types");
    expect(mod).toBeDefined();
  });
});
