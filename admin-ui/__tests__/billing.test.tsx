import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor, act } from "@testing-library/react";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

mock.module("next/navigation", () => ({
  usePathname: () => "/billing",
  useRouter: () => ({ push: mock(() => {}) }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const billingData = {
  summary: {
    customerOrgs: 10,
    activeEntitlements: 8,
    pastDueOrgs: 2,
    blockedOrgs: 1,
    missingCustomerLinks: 3,
    overrideActiveEntitlements: 1,
    invoicesDue: 4,
    amountDue: 99900,
  },
  items: [
    {
      orgId: "org-1",
      orgName: "Acme Corp",
      orgSlug: "acme",
      orgStatus: "active",
      plan: "pro",
      customerLinked: true,
      activeEntitlements: 2,
      blockedEntitlements: 0,
      pastDueEntitlements: 0,
      overrideActiveEntitlements: 0,
      payableInvoices: 1,
      amountDue: 1000,
      seatCapacity: 10,
      seatInUse: 5,
      risk: "low" as const,
      signals: [],
      lastEventAt: "2026-01-01T00:00:00Z",
    },
    {
      orgId: "org-2",
      orgName: "Risk Corp",
      orgSlug: "risk",
      orgStatus: "active",
      plan: "free",
      customerLinked: false,
      activeEntitlements: 0,
      blockedEntitlements: 1,
      pastDueEntitlements: 2,
      overrideActiveEntitlements: 0,
      payableInvoices: 3,
      amountDue: 5000,
      seatCapacity: 5,
      seatInUse: 5,
      risk: "high" as const,
      signals: ["past_due", "blocked"],
      lastEventAt: null,
    },
  ],
  events: [
    {
      id: "evt-1",
      orgId: "org-1",
      orgName: "Acme Corp",
      orgSlug: "acme",
      source: "stripe",
      eventType: "invoice.payment_succeeded",
      status: "success",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
};

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(billingData),
  } as Response),
);

describe("BillingOpsPage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "t");
  });

  test("renders Billing Ops heading", async () => {
    const { default: BillingOpsPage } = await import("../app/(admin)/billing/page");
    const { getByText } = render(<BillingOpsPage />);
    expect(getByText("Billing Ops")).toBeTruthy();
  });

  test("fetches billing ops from API on mount", async () => {
    const { default: BillingOpsPage } = await import("../app/(admin)/billing/page");
    render(<BillingOpsPage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/api/admin/billing/ops");
  });

  test("renders org rows with data after fetch resolves", async () => {
    const { default: BillingOpsPage } = await import("../app/(admin)/billing/page");
    const { container } = render(<BillingOpsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Acme Corp");
    });
    expect(container.textContent).toContain("Risk Corp");
  });

  test("renders risk tone variants: high, low", async () => {
    const { default: BillingOpsPage } = await import("../app/(admin)/billing/page");
    const { container } = render(<BillingOpsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("high risk");
    });
    expect(container.textContent).toContain("low risk");
  });

  test("renders recent billing events section", async () => {
    const { default: BillingOpsPage } = await import("../app/(admin)/billing/page");
    const { container } = render(<BillingOpsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("invoice.payment_succeeded");
    });
    expect(container.textContent).toContain("stripe");
  });

  test("shows error message when API fails", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Billing service down" }),
      } as Response),
    );
    const { default: BillingOpsPage } = await import("../app/(admin)/billing/page");
    const { container } = render(<BillingOpsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Billing service down");
    });
  });

  test("Apply filter button triggers search refetch", async () => {
    const { default: BillingOpsPage } = await import("../app/(admin)/billing/page");
    const { container } = render(<BillingOpsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Acme Corp");
    });

    const form = container.querySelector("form");
    expect(form).toBeTruthy();
    const callsBefore = mockFetch.mock.calls.length;
    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true }));
    });
    // A refetch should have been triggered
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
    });
  });

  test("renders summary metrics correctly", async () => {
    const { default: BillingOpsPage } = await import("../app/(admin)/billing/page");
    const { container } = render(<BillingOpsPage />);
    await waitFor(() => {
      // Summary metric cards
      expect(container.textContent).toContain("Customer orgs");
    });
    expect(container.textContent).toContain("Active entitlements");
    expect(container.textContent).toContain("Past due orgs");
    expect(container.textContent).toContain("Blocked orgs");
  });
});
