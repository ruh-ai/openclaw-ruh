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

mock.module("sonner", () => ({
  toast: mock(() => {}),
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

mock.module("@/lib/openclaw/api", () => ({
  sendToArchitectStreaming: mock(() => Promise.resolve({ text: "" })),
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ),
}));

// --- Tests ---

describe("WizardContext", () => {
  test("exports WizardProvider and useWizard", async () => {
    const mod = await import("../_components/wizard/WizardContext");
    expect(mod.WizardProvider).toBeDefined();
    expect(mod.useWizard).toBeDefined();
  });
});

describe("WizardShell", () => {
  test("exports a default or named component", async () => {
    const mod = await import("../_components/wizard/WizardShell");
    // Could be default or named export
    const component = mod.default || mod.WizardShell;
    expect(component).toBeDefined();
    expect(typeof component).toBe("function");
  });
});

describe("TemplatePicker", () => {
  test("exports a TemplatePicker component", async () => {
    const { TemplatePicker } = await import(
      "../_components/wizard/TemplatePicker"
    );
    expect(TemplatePicker).toBeDefined();
    expect(typeof TemplatePicker).toBe("function");
  });
});

describe("PhasePurpose", () => {
  test("exports a PhasePurpose component", async () => {
    const { PhasePurpose } = await import("../_components/wizard/PhasePurpose");
    expect(PhasePurpose).toBeDefined();
    expect(typeof PhasePurpose).toBe("function");
  });
});

describe("PhaseSkills", () => {
  test("exports a PhaseSkills component", async () => {
    const { PhaseSkills } = await import("../_components/wizard/PhaseSkills");
    expect(PhaseSkills).toBeDefined();
    expect(typeof PhaseSkills).toBe("function");
  });
});

describe("PhaseTools", () => {
  test("exports a PhaseTools component", async () => {
    const { PhaseTools } = await import("../_components/wizard/PhaseTools");
    expect(PhaseTools).toBeDefined();
    expect(typeof PhaseTools).toBe("function");
  });
});

describe("PhaseBehavior", () => {
  test("exports a PhaseBehavior component", async () => {
    const { PhaseBehavior } = await import(
      "../_components/wizard/PhaseBehavior"
    );
    expect(PhaseBehavior).toBeDefined();
    expect(typeof PhaseBehavior).toBe("function");
  });
});

describe("PhaseReviewDeploy", () => {
  test("exports a PhaseReviewDeploy component", async () => {
    const { PhaseReviewDeploy } = await import(
      "../_components/wizard/PhaseReviewDeploy"
    );
    expect(PhaseReviewDeploy).toBeDefined();
    expect(typeof PhaseReviewDeploy).toBe("function");
  });
});
