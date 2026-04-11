import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor, act } from "@testing-library/react";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

mock.module("next/navigation", () => ({
  usePathname: () => "/runtime",
  useRouter: () => ({ push: mock(() => {}) }),
}));

const sandboxItem = {
  sandbox_id: "sb-1",
  sandbox_name: "My Sandbox",
  sandbox_state: "running",
  drift_state: "healthy",
  container_exists: true,
  container_running: true,
  container_status: "Up 2 hours",
  approved: true,
  shared_codex_enabled: false,
  shared_codex_model: null,
  dashboard_url: null,
  standard_url: "http://localhost:18789",
  signed_url: null,
  created_at: "2026-01-01T00:00:00Z",
  linked_agents: [{ id: "a1", name: "Google Ads Agent", status: "active", attachment: "runtime" as const }],
};

const runtimeData = {
  summary: {
    total: 5,
    healthy: 4,
    gateway_unreachable: 1,
    db_only: 0,
    container_only: 0,
    approved: 3,
    sharedCodexEnabled: 2,
  },
  items: [sandboxItem],
};

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(runtimeData),
  } as Response),
);

describe("RuntimePage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(runtimeData),
      } as Response),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "t");
  });

  test("renders Runtime heading", async () => {
    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { getByText } = render(<RuntimePage />);
    expect(getByText("Runtime")).toBeTruthy();
  });

  test("fetches runtime data from API on mount", async () => {
    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    render(<RuntimePage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/api/admin/runtime");
  });

  test("renders sandbox rows after fetch resolves", async () => {
    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("My Sandbox");
    });
    expect(container.textContent).toContain("healthy");
    expect(container.textContent).toContain("Google Ads Agent");
  });

  test("renders drift state tones: gateway_unreachable", async () => {
    const driftItem = {
      ...sandboxItem,
      sandbox_id: "sb-2",
      sandbox_name: "Drifted Sandbox",
      drift_state: "gateway_unreachable",
      container_running: false,
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...runtimeData,
            items: [driftItem],
          }),
      } as Response),
    );
    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("gateway_unreachable");
    });
  });

  test("renders db_only drift with Delete stale DB record action", async () => {
    const dbOnlyItem = {
      ...sandboxItem,
      sandbox_id: "sb-3",
      sandbox_name: null,
      drift_state: "db_only",
      container_exists: false,
      container_running: false,
      linked_agents: [],
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...runtimeData,
            items: [dbOnlyItem],
          }),
      } as Response),
    );
    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Delete stale DB record");
    });
  });

  test("shows empty state when no runtime entries exist", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...runtimeData, items: [] }),
      } as Response),
    );
    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No runtime entries");
    });
  });

  test("restartSandbox calls restart endpoint when confirmed", async () => {
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;

    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("My Sandbox");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const restartBtn = buttons.find((b) => b.textContent?.includes("Restart sandbox"));
    expect(restartBtn).toBeTruthy();

    await act(async () => {
      restartBtn!.click();
    });

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => (c as unknown[])[0] as string);
      expect(urls.some((u) => u.includes("/restart"))).toBe(true);
    });
  });

  test("restartSandbox: no request when confirm is cancelled", async () => {
    globalThis.confirm = mock(() => false) as unknown as typeof confirm;

    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("My Sandbox");
    });

    const callsBefore = mockFetch.mock.calls.length;
    const buttons = Array.from(container.querySelectorAll("button"));
    const restartBtn = buttons.find((b) => b.textContent?.includes("Restart sandbox"));
    if (restartBtn) {
      await act(async () => {
        restartBtn.click();
      });
    }
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });

  test("restartGateway calls gateway restart endpoint when confirmed", async () => {
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;

    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("My Sandbox");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const gatewayBtn = buttons.find((b) => b.textContent?.includes("Restart gateway"));
    expect(gatewayBtn).toBeTruthy();

    await act(async () => {
      gatewayBtn!.click();
    });

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => (c as unknown[])[0] as string);
      expect(urls.some((u) => u.includes("/gateway/restart"))).toBe(true);
    });
  });

  test("repair (delete_db_record) calls reconcile/repair endpoint when confirmed", async () => {
    const dbOnlyItem = {
      ...sandboxItem,
      sandbox_id: "sb-repair",
      drift_state: "db_only",
      container_exists: false,
      container_running: false,
      linked_agents: [],
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...runtimeData, items: [dbOnlyItem] }),
      } as Response),
    );
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;

    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Delete stale DB record");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const repairBtn = buttons.find((b) => b.textContent?.includes("Delete stale DB record"));
    expect(repairBtn).toBeTruthy();

    await act(async () => {
      repairBtn!.click();
    });

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => (c as unknown[])[0] as string);
      expect(urls.some((u) => u.includes("/reconcile/repair"))).toBe(true);
    });
  });

  test("retrofitSharedCodex calls retrofit endpoint when confirmed", async () => {
    const retrofitItem = {
      ...sandboxItem,
      sandbox_id: "sb-retrofit",
      approved: true,
      shared_codex_enabled: false,
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...runtimeData, items: [retrofitItem] }),
      } as Response),
    );
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;

    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Enable shared Codex");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const retrofitBtn = buttons.find((b) => b.textContent?.includes("Enable shared Codex"));
    expect(retrofitBtn).toBeTruthy();

    await act(async () => {
      retrofitBtn!.click();
    });

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => (c as unknown[])[0] as string);
      expect(urls.some((u) => u.includes("/retrofit-shared-codex"))).toBe(true);
    });
  });

  test("shows error message when API fails", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Runtime service error" }),
      } as Response),
    );
    const { default: RuntimePage } = await import("../app/(admin)/runtime/page");
    const { container } = render(<RuntimePage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Runtime service error");
    });
  });
});
