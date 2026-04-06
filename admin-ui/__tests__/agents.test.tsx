import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render } from "@testing-library/react";
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

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ items: [] }),
  } as Response),
);

describe("AgentsPage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "t");
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
});
