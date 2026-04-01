import { describe, expect, test, mock, beforeEach, afterAll } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import GlobalError from "../app/global-error";

describe("GlobalError page", () => {
  const consoleError = console.error;

  beforeEach(() => {
    console.error = mock(() => {});
  });

  afterAll(() => {
    console.error = consoleError;
  });

  test("renders Application Error heading", () => {
    const error = new Error("critical");
    const reset = mock(() => {});
    const { getByText } = render(<GlobalError error={error} reset={reset} />);
    expect(getByText("Application Error")).toBeTruthy();
  });

  test("renders recovery instructions", () => {
    const error = new Error("critical");
    const reset = mock(() => {});
    const { getByText } = render(<GlobalError error={error} reset={reset} />);
    expect(getByText(/critical error occurred/i)).toBeTruthy();
  });

  test("displays error digest when present", () => {
    const error = Object.assign(new Error("fail"), { digest: "xyz789" });
    const reset = mock(() => {});
    const { getByText } = render(<GlobalError error={error} reset={reset} />);
    expect(getByText(/xyz789/)).toBeTruthy();
  });

  test("hides error digest when absent", () => {
    const error = new Error("fail");
    const reset = mock(() => {});
    const { queryByText } = render(<GlobalError error={error} reset={reset} />);
    expect(queryByText(/Error ID:/)).toBeNull();
  });

  test("calls reset when Refresh is clicked", () => {
    const error = new Error("fail");
    const reset = mock(() => {});
    const { getByText } = render(<GlobalError error={error} reset={reset} />);
    fireEvent.click(getByText("Refresh"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test("logs error details on render", () => {
    const error = Object.assign(new Error("boom"), { digest: "d2" });
    const reset = mock(() => {});
    render(<GlobalError error={error} reset={reset} />);
    expect(console.error).toHaveBeenCalled();
  });

  test("renders the full page structure", () => {
    const error = new Error("fail");
    const reset = mock(() => {});
    const { container } = render(<GlobalError error={error} reset={reset} />);
    // GlobalError renders its own html/body but testing-library flattens them;
    // verify the main content wrapper is present
    expect(container.textContent).toContain("Application Error");
  });
});
