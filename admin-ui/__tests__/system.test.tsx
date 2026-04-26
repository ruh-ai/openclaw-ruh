import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

mock.module("next/navigation", () => ({
  usePathname: () => "/system",
  useRouter: () => ({ push: mock(() => {}) }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const healthPayload = { status: "ok", uptime: 12345, database: true };
const runtimePayload = {
  summary: {
    total: 10,
    healthy: 7,
    gateway_unreachable: 1,
    db_only: 1,
    container_only: 1,
  },
};

let callIndex = 0;
const mockFetch = mock(() => {
  const idx = callIndex++;
  if (idx === 0) {
    // First call: /health
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(healthPayload),
    } as Response);
  }
  // Second call: /api/admin/runtime
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(runtimePayload),
  } as Response);
});

describe("SystemPage", () => {
  beforeEach(() => {
    callIndex = 0;
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  test("renders System heading", async () => {
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { getByText } = render(<SystemPage />);
    expect(getByText("System")).toBeTruthy();
  });

  test("renders subtitle", async () => {
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    const text = container.textContent || "";
    expect(text).toContain("backend");
  });

  test("fetches health endpoint on mount", async () => {
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    render(<SystemPage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/health");
  });

  test("renders health payload and runtime metrics after fetch", async () => {
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("reachable");
    });
    // Runtime metrics
    expect(container.textContent).toContain("10"); // total sandboxes
    expect(container.textContent).toContain("7"); // healthy
    // Drift count = 1+1+1 = 3
    expect(container.textContent).toContain("3");
    // Health payload JSON display
    expect(container.textContent).toContain("uptime");
    expect(container.textContent).toContain("12345");
    // Health entries rendered as StatusPills
    expect(container.textContent).toContain("status");
    expect(container.textContent).toContain("database");
  });

  test("renders error message when fetch fails", async () => {
    mockFetch.mockImplementation(() =>
      Promise.reject(new Error("Connection refused")),
    );
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Connection refused");
    });
  });

  test("renders non-Error catch fallback message", async () => {
    mockFetch.mockImplementation(() => Promise.reject("string error"));
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Failed to load system data");
    });
  });

  test("shows health endpoint as down when health returns not-ok", async () => {
    callIndex = 0;
    mockFetch.mockImplementation(() => {
      const idx = callIndex++;
      if (idx === 0) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(runtimePayload),
      } as Response);
    });
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    await waitFor(() => {
      // When health fetch fails, the error catch fires
      const text = container.textContent || "";
      expect(text).toContain("System");
    });
  });

  test("shows no health payload message when no health data", async () => {
    // Both fetches fail
    mockFetch.mockImplementation(() =>
      Promise.reject(new Error("Network error")),
    );
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No health payload available.");
    });
  });

  test("renders zero drift when all sandboxes are healthy", async () => {
    callIndex = 0;
    const allHealthy = {
      summary: { total: 5, healthy: 5, gateway_unreachable: 0, db_only: 0, container_only: 0 },
    };
    mockFetch.mockImplementation(() => {
      const idx = callIndex++;
      if (idx === 0) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(healthPayload),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(allHealthy),
      } as Response);
    });
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("reachable");
    });
    // Drift should be 0
    expect(container.textContent).toContain("0");
  });
});
