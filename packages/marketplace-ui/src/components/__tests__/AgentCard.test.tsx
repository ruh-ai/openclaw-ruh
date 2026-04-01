import { describe, expect, test, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { AgentCard } from "../AgentCard";
import type { MarketplaceListing } from "../../types";

const baseListing: MarketplaceListing = {
  id: "l1",
  agentId: "a1",
  publisherId: "p1",
  title: "Test Agent",
  slug: "test-agent",
  summary: "A test agent for testing",
  description: "Full description",
  category: "marketing",
  tags: ["ads", "google"],
  iconUrl: null,
  screenshots: [],
  version: "1.0.0",
  status: "published",
  installCount: 42,
  avgRating: 4.5,
  publishedAt: "2026-01-01",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

describe("AgentCard", () => {
  test("renders title and summary", () => {
    const { getByText } = render(<AgentCard listing={baseListing} />);
    expect(getByText("Test Agent")).toBeTruthy();
    expect(getByText("A test agent for testing")).toBeTruthy();
  });

  test("renders category badge", () => {
    const { getByText } = render(<AgentCard listing={baseListing} />);
    expect(getByText("marketing")).toBeTruthy();
  });

  test("renders install count with plural", () => {
    const { container } = render(<AgentCard listing={baseListing} />);
    expect(container.textContent).toContain("42 installs");
  });

  test("renders rating when avgRating > 0", () => {
    const { getByText } = render(<AgentCard listing={baseListing} />);
    expect(getByText(/4\.5/)).toBeTruthy();
  });

  test("hides rating when avgRating is 0", () => {
    const { queryByText } = render(<AgentCard listing={{ ...baseListing, avgRating: 0 }} />);
    expect(queryByText(/0\.0/)).toBeNull();
  });

  test("calls onClick when clicked", () => {
    const onClick = mock(() => {});
    const { container } = render(<AgentCard listing={baseListing} onClick={onClick} />);
    fireEvent.click(container.querySelector("button")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("renders robot emoji when no iconUrl", () => {
    const { getByText } = render(<AgentCard listing={baseListing} />);
    expect(getByText("\u{1F916}")).toBeTruthy();
  });

  test("renders img when iconUrl is set", () => {
    const { container } = render(
      <AgentCard listing={{ ...baseListing, iconUrl: "https://example.com/icon.png" }} />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("https://example.com/icon.png");
  });

  test("shows singular 'install' for count of 1", () => {
    const { container } = render(<AgentCard listing={{ ...baseListing, installCount: 1 }} />);
    expect(container.textContent).toContain("1 install");
    expect(container.textContent).not.toContain("1 installs");
  });

  test("shows 0 installs", () => {
    const { container } = render(<AgentCard listing={{ ...baseListing, installCount: 0 }} />);
    expect(container.textContent).toContain("0 installs");
  });

  test("does not crash without onClick", () => {
    const { container } = render(<AgentCard listing={baseListing} />);
    fireEvent.click(container.querySelector("button")!);
    // No error = pass
  });
});
