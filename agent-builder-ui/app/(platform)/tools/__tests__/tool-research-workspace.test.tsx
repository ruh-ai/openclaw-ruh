import { describe, expect, test, mock } from "bun:test";

// --- Mocks ---

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}) }),
  usePathname: () => "/tools",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

mock.module("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

mock.module("@/lib/tools/tool-integration", () => ({
  researchToolIntegration: mock(() =>
    Promise.resolve({
      toolName: "GitHub",
      recommendedMethod: "mcp",
      summary: "Use the GitHub MCP server",
      rationale: "Official package available",
      requiredCredentials: [],
      sources: [],
      setupSteps: [],
      integrationSteps: [],
      validationSteps: [],
      alternatives: [],
    }),
  ),
  buildToolResearchPlan: () => ({ steps: [], toolId: "", toolName: "" }),
  buildToolResearchResultFromPlan: () => null,
  normalizeToolResearchResponse: () => ({}),
  buildToolResearchPrompt: () => "",
  reconcileToolConnections: () => [],
  finalizeCredentialBackedToolConnections: () => [],
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ),
}));

// --- Tests ---

describe("ToolResearchWorkspace", () => {
  test("exports ToolResearchWorkspace component", async () => {
    const { ToolResearchWorkspace } = await import(
      "../_components/ToolResearchWorkspace"
    );
    expect(ToolResearchWorkspace).toBeDefined();
    expect(typeof ToolResearchWorkspace).toBe("function");
  });
});
