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

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status: "ok" }),
  } as Response),
);

describe("SystemPage", () => {
  beforeEach(() => {
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

  test("renders health payload keys after fetch resolves", async () => {
    mockFetch.mockImplementation((url: unknown) => {
      const u = url as string;
      if (u.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ok", version: "1.0.0", db: true }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            summary: { total: 5, healthy: 5, gateway_unreachable: 0, db_only: 0, container_only: 0 },
          }),
      } as Response);
    });
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("reachable");
    });
    // JSON payload should be rendered in the pre block
    expect(container.textContent).toContain("status");
  });

  test("shows error message when health fetch fails", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ message: "Service unavailable" }),
      } as Response),
    );
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    await waitFor(() => {
      // Either the error message or "down" metric should appear
      expect(
        container.textContent?.includes("Service unavailable") ||
        container.textContent?.includes("down") ||
        container.textContent?.includes("failed"),
      ).toBe(true);
    });
  });

  test("renders runtime drift metrics when runtime API resolves", async () => {
    mockFetch.mockImplementation((url: unknown) => {
      const u = url as string;
      if (u.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ok" }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            summary: { total: 10, healthy: 7, gateway_unreachable: 1, db_only: 1, container_only: 1 },
          }),
      } as Response);
    });
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { container } = render(<SystemPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Tracked Sandboxes");
    });
    expect(container.textContent).toContain("Runtime Drift");
  });
});
