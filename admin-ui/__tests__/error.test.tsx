import { describe, expect, test, mock, beforeEach, afterAll } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import ErrorComponent from "../app/error";

describe("Error boundary page", () => {
  const consoleError = console.error;

  beforeEach(() => {
    // silence the useEffect console.error call
    console.error = mock(() => {});
  });

  test("renders error heading and description", () => {
    const error = new Error("Something broke");
    const reset = mock(() => {});
    const { getByText } = render(<ErrorComponent error={error} reset={reset} />);
    expect(getByText("Something went wrong")).toBeTruthy();
    expect(getByText(/unexpected error occurred/i)).toBeTruthy();
  });

  test("displays error digest when present", () => {
    const error = Object.assign(new Error("fail"), { digest: "abc123" });
    const reset = mock(() => {});
    const { getByText } = render(<ErrorComponent error={error} reset={reset} />);
    expect(getByText(/abc123/)).toBeTruthy();
  });

  test("does not display error digest when absent", () => {
    const error = new Error("fail");
    const reset = mock(() => {});
    const { queryByText } = render(<ErrorComponent error={error} reset={reset} />);
    expect(queryByText(/Error ID:/)).toBeNull();
  });

  test("calls reset when Try Again is clicked", () => {
    const error = new Error("fail");
    const reset = mock(() => {});
    const { getByText } = render(<ErrorComponent error={error} reset={reset} />);
    fireEvent.click(getByText("Try Again"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test("renders Home link pointing to /", () => {
    const error = new Error("fail");
    const reset = mock(() => {});
    const { getByText } = render(<ErrorComponent error={error} reset={reset} />);
    const homeLink = getByText("Home");
    expect(homeLink.getAttribute("href")).toBe("/");
  });

  test("logs error details via console.error", () => {
    const error = Object.assign(new Error("test error"), { digest: "d1" });
    const reset = mock(() => {});
    render(<ErrorComponent error={error} reset={reset} />);
    expect(console.error).toHaveBeenCalled();
  });

  // restore
  afterAll(() => {
    console.error = consoleError;
  });
});
