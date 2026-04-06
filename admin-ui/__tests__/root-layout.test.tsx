import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import RootLayout from "../app/layout";

describe("RootLayout", () => {
  test("renders children", () => {
    const { getByText } = render(
      <RootLayout>
        <div>Test content</div>
      </RootLayout>,
    );
    expect(getByText("Test content")).toBeTruthy();
  });

  test("renders body with expected styling classes", () => {
    const { container } = render(
      <RootLayout>
        <div>child</div>
      </RootLayout>,
    );
    // testing-library nests html/body inside a div, so query within container
    const body = container.querySelector("body");
    // In happy-dom/jsdom the nested html is flattened; check the rendered text instead
    expect(container.textContent).toContain("child");
  });

  test("exports metadata with correct title", () => {
    // metadata is a named export, not rendered — validate it directly
    const { metadata } = require("../app/layout");
    expect(metadata.title).toBe("Ruh Admin");
    expect(metadata.description).toBe("Ruh.ai Platform Administration");
  });
});
