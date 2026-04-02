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

mock.module("uuid", () => ({
  v4: () => "test-uuid-1234",
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ),
}));

// --- Tests ---

describe("ReviewAgent", () => {
  test("exports ReviewAgent component", async () => {
    const mod = await import("../_components/review/ReviewAgent");
    expect(mod.ReviewAgent).toBeDefined();
    expect(typeof mod.ReviewAgent).toBe("function");
  });
});

describe("SectionCard", () => {
  test("exports SectionCard component", async () => {
    const { SectionCard } = await import("../_components/review/SectionCard");
    expect(SectionCard).toBeDefined();
    expect(typeof SectionCard).toBe("function");
  });
});

describe("InlineInput", () => {
  test("exports InlineInput component", async () => {
    const { InlineInput } = await import("../_components/review/InlineInput");
    expect(InlineInput).toBeDefined();
    expect(typeof InlineInput).toBe("function");
  });
});

describe("FlowNode", () => {
  test("exports FlowNode component", async () => {
    const { FlowNode } = await import("../_components/review/FlowNode");
    expect(FlowNode).toBeDefined();
    expect(typeof FlowNode).toBe("function");
  });
});

describe("DataFlowDiagram", () => {
  test("exports DataFlowDiagram component", async () => {
    const { DataFlowDiagram } = await import(
      "../_components/review/DataFlowDiagram"
    );
    expect(DataFlowDiagram).toBeDefined();
    expect(typeof DataFlowDiagram).toBe("function");
  });
});

describe("review types", () => {
  test("review/types module is importable", async () => {
    const mod = await import("../_components/review/types");
    expect(mod).toBeDefined();
  });
});
