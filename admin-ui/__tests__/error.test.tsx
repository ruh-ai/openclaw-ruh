import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, fireEvent } from "@testing-library/react";

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // Suppress console.error from the component's useEffect
    mock.module("react", () => {
      const actual = require("react");
      return { ...actual };
    });
  });

  test("renders error heading", async () => {
    const { default: ErrorPage } = await import("../app/error");
    const error = Object.assign(new Error("Test failure"), {});
    const reset = mock(() => {});
    const { getByText } = render(<ErrorPage error={error} reset={reset} />);
    expect(getByText("Something went wrong")).toBeTruthy();
  });

  test("renders error description", async () => {
    const { default: ErrorPage } = await import("../app/error");
    const error = Object.assign(new Error("Test failure"), {});
    const reset = mock(() => {});
    const { getByText } = render(<ErrorPage error={error} reset={reset} />);
    expect(
      getByText(
        "An unexpected error occurred. You can try again or return to the home page."
      )
    ).toBeTruthy();
  });

  test("renders Try Again button that calls reset", async () => {
    const { default: ErrorPage } = await import("../app/error");
    const error = Object.assign(new Error("Test failure"), {});
    const reset = mock(() => {});
    const { getByText } = render(<ErrorPage error={error} reset={reset} />);
    const button = getByText("Try Again");
    expect(button).toBeTruthy();
    fireEvent.click(button);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test("renders Home link", async () => {
    const { default: ErrorPage } = await import("../app/error");
    const error = Object.assign(new Error("Test failure"), {});
    const reset = mock(() => {});
    const { getByText } = render(<ErrorPage error={error} reset={reset} />);
    const homeLink = getByText("Home");
    expect(homeLink).toBeTruthy();
    expect(homeLink.getAttribute("href")).toBe("/");
  });

  test("displays digest when present", async () => {
    const { default: ErrorPage } = await import("../app/error");
    const error = Object.assign(new Error("Test failure"), {
      digest: "abc123",
    });
    const reset = mock(() => {});
    const { getByText } = render(<ErrorPage error={error} reset={reset} />);
    expect(getByText("Error ID: abc123")).toBeTruthy();
  });

  test("does not display digest when absent", async () => {
    const { default: ErrorPage } = await import("../app/error");
    const error = Object.assign(new Error("Test failure"), {});
    const reset = mock(() => {});
    const { container } = render(<ErrorPage error={error} reset={reset} />);
    expect(container.textContent).not.toContain("Error ID:");
  });
});
