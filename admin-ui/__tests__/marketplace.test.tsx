import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";

describe("MarketplacePage", () => {
  test("renders Marketplace heading", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { getByText } = render(<MarketplacePage />);
    expect(getByText("Marketplace")).toBeTruthy();
  });

  test("renders moderation subtitle", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { getByText } = render(<MarketplacePage />);
    expect(getByText("Agent submissions and moderation")).toBeTruthy();
  });

  test("renders phase 3 placeholder text", async () => {
    const { default: MarketplacePage } = await import(
      "../app/(admin)/marketplace/page"
    );
    const { getByText } = render(<MarketplacePage />);
    expect(getByText(/Marketplace moderation will be available/)).toBeTruthy();
  });
});
