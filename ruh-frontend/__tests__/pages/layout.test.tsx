import { render, screen } from "@testing-library/react";

jest.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

jest.mock("@/app/_components/CustomerSessionGate", () => ({
  CustomerSessionGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-gate">{children}</div>
  ),
}));

import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  test("renders children inside CustomerSessionGate", () => {
    render(
      <RootLayout>
        <div>Test Child</div>
      </RootLayout>
    );

    expect(screen.getByText("Test Child")).toBeInTheDocument();
    expect(screen.getByTestId("session-gate")).toBeInTheDocument();
  });

  test("children are nested within the session gate", () => {
    render(
      <RootLayout>
        <span data-testid="inner">Hello</span>
      </RootLayout>
    );

    const gate = screen.getByTestId("session-gate");
    expect(gate).toContainElement(screen.getByTestId("inner"));
  });
});
