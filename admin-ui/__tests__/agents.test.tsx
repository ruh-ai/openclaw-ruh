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
    window.confirm = mock(() => true);
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

  test("handles fetch error gracefully", async () => {
    mockFetch.mockImplementation(() =>
      Promise.reject(new Error("Connection refused")),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Connection refused");
    });
  });

  test("handles non-Error fetch rejection", async () => {
    mockFetch.mockImplementation(() => Promise.reject("string error"));
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Failed to load agents");
    });
  });

  test("renders no agents message when list is empty", async () => {
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No agents matched");
    });
  });

  test("renders agent with no org fallback text", async () => {
    const noOrgAgent = {
      ...agentRecord,
      id: "a4",
      orgName: null,
      orgSlug: null,
      orgKind: null,
      creatorDisplayName: null,
      creatorEmail: null,
      description: "",
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [noOrgAgent], total: 1 }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No owning organization recorded");
    });
    expect(container.textContent).toContain("Unknown creator");
    expect(container.textContent).toContain("No agent description saved.");
  });

  test("renders customer org kind as warning tone", async () => {
    const customerOrgAgent = {
      ...agentRecord,
      id: "a5",
      orgKind: "customer",
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [customerOrgAgent], total: 1 }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container } = render(<AgentsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("customer");
    });
  });

  test("calls restartSandboxes when Restart runtime is clicked", async () => {
    window.confirm = mock(() => true);
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { getByText } = render(<AgentsPage />);
    await waitFor(() => {
      expect(getByText("Restart runtime")).toBeTruthy();
    });

    mockFetch.mockClear();
    await act(async () => {
      await userEvent.click(getByText("Restart runtime"));
    });

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find((call) => {
        const [url, init] = call as [string, RequestInit | undefined];
        return url.includes("/restart") && init?.method === "POST";
      });
      expect(postCall).toBeTruthy();
    });
  });

  test("calls restartSandboxes for forge when Restart forge is clicked", async () => {
    window.confirm = mock(() => true);
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { getByText } = render(<AgentsPage />);
    await waitFor(() => {
      expect(getByText("Restart forge")).toBeTruthy();
    });

    mockFetch.mockClear();
    await act(async () => {
      await userEvent.click(getByText("Restart forge"));
    });

    expect(window.confirm).toHaveBeenCalled();
  });

  test("does not restart when confirmation is cancelled", async () => {
    window.confirm = mock(() => false);
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { getByText } = render(<AgentsPage />);
    await waitFor(() => {
      expect(getByText("Restart runtime")).toBeTruthy();
    });

    const callCountBefore = mockFetch.mock.calls.length;
    await act(async () => {
      await userEvent.click(getByText("Restart runtime"));
    });

    const postCalls = mockFetch.mock.calls.slice(callCountBefore).filter((call) => {
      const [, init] = call as [string, RequestInit | undefined];
      return init?.method === "POST";
    });
    expect(postCalls.length).toBe(0);
  });

  test("calls deleteAgent when Delete agent is clicked and confirmed", async () => {
    window.confirm = mock(() => true);
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { getByText } = render(<AgentsPage />);
    await waitFor(() => {
      expect(getByText("Delete agent")).toBeTruthy();
    });

    mockFetch.mockClear();
    await act(async () => {
      await userEvent.click(getByText("Delete agent"));
    });

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      const deleteCall = mockFetch.mock.calls.find((call) => {
        const [, init] = call as [string, RequestInit | undefined];
        return init?.method === "DELETE";
      });
      expect(deleteCall).toBeTruthy();
    });
  });

  test("does not delete when confirmation is cancelled", async () => {
    window.confirm = mock(() => false);
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
      } as Response),
    );
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { getByText } = render(<AgentsPage />);
    await waitFor(() => {
      expect(getByText("Delete agent")).toBeTruthy();
    });

    const callCountBefore = mockFetch.mock.calls.length;
    await act(async () => {
      await userEvent.click(getByText("Delete agent"));
    });

    const deleteCalls = mockFetch.mock.calls.slice(callCountBefore).filter((call) => {
      const [, init] = call as [string, RequestInit | undefined];
      return init?.method === "DELETE";
    });
    expect(deleteCalls.length).toBe(0);
  });

  test("shows error when restartSandboxes fails", async () => {
    window.confirm = mock(() => true);
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Restart failed" }),
      } as unknown as Response);
    });
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container, getByText } = render(<AgentsPage />);
    await waitFor(() => {
      expect(getByText("Restart runtime")).toBeTruthy();
    });

    await act(async () => {
      await userEvent.click(getByText("Restart runtime"));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Restart failed");
    });
  });

  test("shows error when deleteAgent fails", async () => {
    window.confirm = mock(() => true);
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [agentRecord], total: 1 }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Delete failed" }),
      } as unknown as Response);
    });
    const { default: AgentsPage } = await import("../app/(admin)/agents/page");
    const { container, getByText } = render(<AgentsPage />);
    await waitFor(() => {
      expect(getByText("Delete agent")).toBeTruthy();
    });

    await act(async () => {
      await userEvent.click(getByText("Delete agent"));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Delete failed");
    });
  });
});
