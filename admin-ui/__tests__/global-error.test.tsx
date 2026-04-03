import { describe, expect, test, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";

describe("GlobalError", () => {
  test("renders Application Error heading", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    const error = Object.assign(new Error("Critical failure"), {});
    const reset = mock(() => {});
    const { getByText } = render(<GlobalError error={error} reset={reset} />);
    expect(getByText("Application Error")).toBeTruthy();
  });

  test("renders critical error description", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    const error = Object.assign(new Error("Critical failure"), {});
    const reset = mock(() => {});
    const { getByText } = render(<GlobalError error={error} reset={reset} />);
    expect(
      getByText("A critical error occurred. Please try refreshing the page.")
    ).toBeTruthy();
  });

  test("renders Refresh button that calls reset", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    const error = Object.assign(new Error("Critical failure"), {});
    const reset = mock(() => {});
    const { getByText } = render(<GlobalError error={error} reset={reset} />);
    const button = getByText("Refresh");
    expect(button).toBeTruthy();
    fireEvent.click(button);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test("displays digest when present", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    const error = Object.assign(new Error("Critical failure"), {
      digest: "xyz789",
    });
    const reset = mock(() => {});
    const { getByText } = render(<GlobalError error={error} reset={reset} />);
    expect(getByText("Error ID: xyz789")).toBeTruthy();
  });

  test("does not display digest when absent", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    const error = Object.assign(new Error("Critical failure"), {});
    const reset = mock(() => {});
    const { container } = render(<GlobalError error={error} reset={reset} />);
    expect(container.textContent).not.toContain("Error ID:");
  });

  test("renders the component structure", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    const error = Object.assign(new Error("Critical failure"), {});
    const reset = mock(() => {});
    const { container } = render(<GlobalError error={error} reset={reset} />);
    // The component wraps content in a full-page layout
    expect(container.textContent).toContain("Application Error");
  });
});
