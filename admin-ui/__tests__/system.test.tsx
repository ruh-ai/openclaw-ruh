import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render } from "@testing-library/react";

mock.module("lucide-react", () => {
  const Icon = ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children}</span>;
  return {
    Users: Icon, Bot: Icon, Server: Icon, Store: Icon,
    LayoutDashboard: Icon, Activity: Icon, LogOut: Icon,
    Shield: Icon, User: Icon, Code: Icon,
  };
});

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

  test("renders System Health heading", async () => {
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { getByText } = render(<SystemPage />);
    expect(getByText("System Health")).toBeTruthy();
  });

  test("renders subtitle", async () => {
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    const { getByText } = render(<SystemPage />);
    expect(getByText("Backend and infrastructure status")).toBeTruthy();
  });

  test("fetches health endpoint on mount", async () => {
    const { default: SystemPage } = await import("../app/(admin)/system/page");
    render(<SystemPage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/health");
  });
});
