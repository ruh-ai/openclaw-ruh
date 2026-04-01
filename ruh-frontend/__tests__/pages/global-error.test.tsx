import { render, screen, fireEvent } from "@testing-library/react";
import GlobalError from "@/app/global-error";

describe("GlobalError page", () => {
  const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  test("renders error heading and description", () => {
    const error = new Error("critical failure");
    const reset = jest.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(screen.getByText("Application Error")).toBeInTheDocument();
    expect(
      screen.getByText(/A critical error occurred/)
    ).toBeInTheDocument();
  });

  test("displays error digest when present", () => {
    const error = Object.assign(new Error("fail"), { digest: "def456" });
    const reset = jest.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(screen.getByText("Error ID: def456")).toBeInTheDocument();
  });

  test("does not display error digest when absent", () => {
    const error = new Error("fail");
    const reset = jest.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
  });

  test("calls reset when Refresh is clicked", () => {
    const error = new Error("fail");
    const reset = jest.fn();

    render(<GlobalError error={error} reset={reset} />);

    fireEvent.click(screen.getByText("Refresh"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test("renders the Refresh button", () => {
    const error = new Error("fail");
    const reset = jest.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  test("logs error details to console", () => {
    const error = Object.assign(new Error("critical"), { digest: "ghi789" });
    const reset = jest.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(consoleSpy).toHaveBeenCalledWith(
      "[GlobalError]",
      expect.objectContaining({
        message: "critical",
        digest: "ghi789",
        service: "ruh-frontend",
      })
    );
  });
});
