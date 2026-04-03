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

mock.module("@/hooks/use-agents-store", () => ({
  useAgentsStore: () => ({
    agents: [],
    addAgent: mock(() => Promise.resolve()),
    updateAgentConfig: mock(() => Promise.resolve()),
  }),
}));

mock.module("@/lib/openclaw/builder-state", () => ({
  useBuilderState: () => ({
    state: { sandboxId: null, agentName: "Test" },
    actions: {},
  }),
}));

mock.module("sonner", () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}));

mock.module("react-markdown", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

mock.module("remark-gfm", () => ({
  default: () => {},
}));

mock.module("rehype-highlight", () => ({
  default: () => {},
}));

// --- Tests ---

describe("ChatInput", () => {
  test("exports ChatInput component", async () => {
    const { ChatInput } = await import("../_components/ChatInput");
    expect(ChatInput).toBeDefined();
    expect(typeof ChatInput).toBe("function");
  });
});

describe("MessageContent", () => {
  test("exports a MessageContent component", async () => {
    const mod = await import("../_components/MessageContent");
    const component = mod.MessageContent || mod.default;
    expect(component).toBeDefined();
    // React.memo returns an object, not a plain function
    expect(typeof component === "function" || (typeof component === "object" && component !== null)).toBe(true);
  });
});

describe("UserMessage", () => {
  test("exports UserMessage component", async () => {
    const { UserMessage } = await import("../_components/UserMessage");
    expect(UserMessage).toBeDefined();
    expect(typeof UserMessage).toBe("function");
  });
});

describe("ClarificationMessage", () => {
  test("exports ClarificationMessage component", async () => {
    const { ClarificationMessage } = await import(
      "../_components/ClarificationMessage"
    );
    expect(ClarificationMessage).toBeDefined();
    expect(typeof ClarificationMessage).toBe("function");
  });
});

describe("AgentConfigPanel", () => {
  test("exports AgentConfigPanel component", async () => {
    const mod = await import("../_components/AgentConfigPanel");
    const component = mod.AgentConfigPanel || mod.default;
    expect(component).toBeDefined();
    expect(typeof component).toBe("function");
  });
});

describe("AgentSummary", () => {
  test("exports AgentSummary component", async () => {
    const { AgentSummary } = await import("../_components/AgentSummary");
    expect(AgentSummary).toBeDefined();
    expect(typeof AgentSummary).toBe("function");
  });
});

describe("OptionPills", () => {
  test("exports OptionPills component", async () => {
    const { OptionPills } = await import("../_components/OptionPills");
    expect(OptionPills).toBeDefined();
    expect(typeof OptionPills).toBe("function");
  });
});

describe("WorkspacePanel", () => {
  test("exports WorkspacePanel component", async () => {
    const { WorkspacePanel } = await import("../_components/WorkspacePanel");
    expect(WorkspacePanel).toBeDefined();
    expect(typeof WorkspacePanel).toBe("function");
  });
});

describe("ShipDialog", () => {
  test("exports ShipDialog component", async () => {
    const { ShipDialog } = await import("../_components/ShipDialog");
    expect(ShipDialog).toBeDefined();
    expect(typeof ShipDialog).toBe("function");
  });
});

describe("OnboardingSequence", () => {
  test("exports OnboardingSequence component", async () => {
    const { OnboardingSequence } = await import(
      "../_components/OnboardingSequence"
    );
    expect(OnboardingSequence).toBeDefined();
    expect(typeof OnboardingSequence).toBe("function");
  });
});

describe("CreationProgressCard", () => {
  test("exports CreationProgressCard and deriveCreationPhase", async () => {
    const { CreationProgressCard, deriveCreationPhase } = await import(
      "../_components/CreationProgressCard"
    );
    expect(CreationProgressCard).toBeDefined();
    expect(typeof CreationProgressCard).toBe("function");
    expect(deriveCreationPhase).toBeDefined();
    expect(typeof deriveCreationPhase).toBe("function");
  });
});

describe("AnimatedRuhLogo", () => {
  test("exports AnimatedRuhLogo component", async () => {
    const { AnimatedRuhLogo } = await import("../_components/AnimatedRuhLogo");
    expect(AnimatedRuhLogo).toBeDefined();
    expect(typeof AnimatedRuhLogo).toBe("function");
  });
});
