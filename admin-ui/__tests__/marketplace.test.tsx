import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render } from "@testing-library/react";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ items: [], total: 0, stats: {} }),
  } as Response),
);

describe("MarketplacePage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "test-token");
  });

  test("renders Marketplace heading", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { getByText } = render(<MarketplacePage />);
    expect(getByText("Marketplace")).toBeTruthy();
  });

  test("renders marketplace subtitle", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    const text = container.textContent || "";
    expect(text).toContain("marketplace");
  });

  test("renders catalog section", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { container } = render(<MarketplacePage />);
    const text = container.textContent || "";
    expect(text).toContain("Catalog");
  });
});
