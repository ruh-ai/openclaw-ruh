import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { render, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

mock.module("next/navigation", () => ({
  usePathname: () => "/agents",
  useRouter: () => ({ push: mock(() => {}) }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const agentRecord = {
  id: "agent-1",
  name: "Google Ads Agent",
  description: "Manages ads",
  status: "active",
  sandboxCount: 1,
  sandboxIds: ["sb-1"],
  forgeSandboxId: "forge-1",
  createdAt: "2026-01-01T00:00:00Z",
  creatorEmail: "dev@ruh.ai",
  creatorDisplayName: "Dev User",
  orgName: "Ruh AI",
  orgSlug: "ruh-ai",
  orgKind: "developer",
  toolConnectionCount: 2,
  runtimeInputCount: 1,
  triggerCount: 3,
  channelCount: 1,
};

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ items: [], total: 0 }),
  } as Response),
);

describe("AgentsPage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "t");
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  test("renders Agents heading", async () => {
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { getByText } = render(<AgentsPage />);
    expect(getByText("Agents")).toBeTruthy();
  });

  test("renders table headers", async () => {
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    const headers = container.querySelectorAll("th");
    const headerTexts = Array.from(headers).map((h) => h.textContent);
    expect(headerTexts).toContain("Agent");
    expect(headerTexts).toContain("Created");
  });

  test("fetches agents from API on mount", async () => {
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    render(<AgentsPage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/api/admin/agents");
  });

  test("renders agent row with data including statusTone variants", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Google Ads Agent");
    });
    // statusTone("active") branch covered
    expect(container.textContent).toContain("active");
    // forgeSandboxId branch covered
    expect(container.textContent).toContain("forge-1");
  });

  test("search input onChange updates search state", async () => {
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    const searchInput = container.querySelector(
      'input[placeholder="Search agent, owner, or org"]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    await act(async () => {
      await userEvent.type(searchInput, "test");
    });
    expect(searchInput.value).toBe("test");
  });

  test("status filter select onChange updates filter", async () => {
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    const selects = container.querySelectorAll("select");
    const statusSelect = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.value === "active"),
    );
    expect(statusSelect).toBeTruthy();
    await act(async () => {
      await userEvent.selectOptions(statusSelect!, "active");
    });
    expect((statusSelect as HTMLSelectElement).value).toBe("active");
  });

  test("forging and draft agent status tones render without error", async () => {
    const forgingAgent = { ...agentRecord, id: "a2", status: "forging", sandboxIds: [], forgeSandboxId: null };
    const draftAgent = { ...agentRecord, id: "a3", status: "draft", sandboxIds: [], forgeSandboxId: null };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [forgingAgent, draftAgent], total: 2 }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("forging");
    });
    expect(container.textContent).toContain("draft");
  });

  test("restartSandboxes: calls restart endpoint when confirmed", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;

    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Google Ads Agent");
    });

    // Click the "Restart runtime" button
    const buttons = Array.from(container.querySelectorAll("button"));
    const restartBtn = buttons.find((b) => b.textContent?.includes("Restart runtime"));
    expect(restartBtn).toBeTruthy();
    await act(async () => {
      restartBtn!.click();
    });

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => (c as unknown[])[0] as string);
      expect(urls.some((u) => u.includes("/restart"))).toBe(true);
    });
  });

  test("restartSandboxes: no request when confirm is cancelled", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    globalThis.confirm = mock(() => false) as unknown as typeof confirm;

    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Google Ads Agent");
    });

    const callsBefore = mockFetch.mock.calls.length;
    const buttons = Array.from(container.querySelectorAll("button"));
    const restartBtn = buttons.find((b) => b.textContent?.includes("Restart runtime"));
    if (restartBtn) {
      await act(async () => {
        restartBtn.click();
      });
    }
    // No extra fetch calls should have been made
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });

  test("deleteAgent: calls delete endpoint when confirmed", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;

    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Google Ads Agent");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const deleteBtn = buttons.find((b) => b.textContent?.includes("Delete agent"));
    expect(deleteBtn).toBeTruthy();
    await act(async () => {
      deleteBtn!.click();
    });

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => (c as unknown[])[0] as string);
      expect(urls.some((u) => u.includes("/api/admin/agents/"))).toBe(true);
    });
  });

  test("deleteAgent: no request when confirm is cancelled", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    globalThis.confirm = mock(() => false) as unknown as typeof confirm;

    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Google Ads Agent");
    });

    const callsBefore = mockFetch.mock.calls.length;
    const buttons = Array.from(container.querySelectorAll("button"));
    const deleteBtn = buttons.find((b) => b.textContent?.includes("Delete agent"));
    if (deleteBtn) {
      await act(async () => {
        deleteBtn.click();
      });
    }
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });

  test("shows error message when API returns error", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Internal server error" }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Internal server error");
    });
  });
});
