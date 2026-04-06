import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render } from "@testing-library/react";
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
});
