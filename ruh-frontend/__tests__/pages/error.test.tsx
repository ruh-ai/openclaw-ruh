import { render, screen, fireEvent } from "@testing-library/react";
import ErrorPage from "@/app/error";

describe("Error boundary page", () => {
  const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  test("renders error heading and description", () => {
    const error = Object.assign(new globalThis.Error("Test failure"), {}) as Error & { digest?: string };
    const reset = jest.fn();

    render(<ErrorPage error={error} reset={reset} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error occurred/)
    ).toBeInTheDocument();
  });

  test("displays error digest when present", () => {
    const error = Object.assign(new globalThis.Error("fail"), { digest: "abc123" });
    const reset = jest.fn();

    render(<ErrorPage error={error} reset={reset} />);

    expect(screen.getByText("Error ID: abc123")).toBeInTheDocument();
  });

  test("does not display error digest when absent", () => {
    const error = new globalThis.Error("fail") as Error & { digest?: string };
    const reset = jest.fn();

    render(<ErrorPage error={error} reset={reset} />);

    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
  });

  test("calls reset when Try Again is clicked", () => {
    const error = new globalThis.Error("fail") as Error & { digest?: string };
    const reset = jest.fn();

    render(<ErrorPage error={error} reset={reset} />);

    fireEvent.click(screen.getByText("Try Again"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test("renders Home link pointing to /", () => {
    const error = new globalThis.Error("fail") as Error & { digest?: string };
    const reset = jest.fn();

    render(<ErrorPage error={error} reset={reset} />);

    const homeLink = screen.getByText("Home");
    expect(homeLink.closest("a")).toHaveAttribute("href", "/");
  });

  test("logs error details to console", () => {
    const error = Object.assign(new globalThis.Error("logged error"), {
      digest: "xyz",
    });
    const reset = jest.fn();

    render(<ErrorPage error={error} reset={reset} />);

    expect(consoleSpy).toHaveBeenCalledWith(
      "[ruh-frontend] Unhandled error caught by boundary",
      expect.objectContaining({
        message: "logged error",
        digest: "xyz",
      })
    );
  });
});
