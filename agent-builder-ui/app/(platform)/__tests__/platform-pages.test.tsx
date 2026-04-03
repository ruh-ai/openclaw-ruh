import { describe, expect, test, mock } from "bun:test";

// --- Mocks ---

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}), replace: mock(() => {}) }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: mock(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

mock.module("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

mock.module("@/lib/utils/canonical", () => ({
  generateCanonicalMetadata: () => ({}),
}));

mock.module("@/lib/utils/marketplace-url", () => ({
  getMarketplaceDestination: () => "http://localhost:3001/marketplace",
}));

mock.module("@/hooks/use-agents-store", () => ({
  useAgentsStore: () => ({
    agents: [],
    deleteAgent: mock(() => {}),
    deleteForge: mock(() => {}),
    bulkDeleteAgents: mock(() => Promise.resolve()),
    updateAgentStatus: mock(() => {}),
    fetchAgents: mock(() => Promise.resolve()),
  }),
}));

mock.module("@/hooks/use-sandbox-health", () => ({
  useSandboxHealth: () => ({}),
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

mock.module("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

// --- Platform Layout ---

describe("platform layout", () => {
  test("exports a default layout component", async () => {
    // layout.tsx is a server component with metadata export - verify it's importable
    const mod = await import("../layout");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test("exports metadata", async () => {
    const mod = await import("../layout");
    expect(mod.metadata).toBeDefined();
    expect(mod.metadata.title).toBe("Dashboard");
  });
});

// --- Dashboard Page (redirect) ---

describe("platform page (dashboard redirect)", () => {
  test("exports a default page that calls redirect", async () => {
    const mod = await import("../page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
    // The page calls redirect() which throws in our mock
    expect(() => mod.default()).toThrow("NEXT_REDIRECT");
  });
});

// --- Activity Page ---

describe("activity page", () => {
  test("exports a default page component", async () => {
    const mod = await import("../activity/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});

// --- Marketplace Page ---

describe("marketplace page", () => {
  test("exports a default page component", async () => {
    const mod = await import("../marketplace/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});

// --- Settings Page ---

describe("settings page", () => {
  test("exports a default page component", async () => {
    const mod = await import("../settings/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});

// --- Tools Page ---

describe("tools page", () => {
  test("exports a default page component", async () => {
    const mod = await import("../tools/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});

// --- Agents Page ---

describe("agents page", () => {
  test("exports a default page component", async () => {
    const mod = await import("../agents/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
