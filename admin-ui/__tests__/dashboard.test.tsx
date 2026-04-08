import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

mock.module("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: mock(() => {}) }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const fullOverviewData = {
  users: {
    total: 42,
    byRole: { admin: 2, developer: 10, endUser: 30 },
    byStatus: { active: 38, suspended: 2, pending: 2 },
  },
  organizations: {
    total: 5,
    developer: 3,
    customer: 2,
    top: [
      {
        id: "org-1",
        name: "Ruh AI",
        slug: "ruh-ai",
        kind: "developer",
        memberCount: 5,
        agentCount: 3,
        installCount: 10,
        listingCount: 2,
      },
    ],
  },
  agents: {
    total: 15,
    byStatus: { active: 10, draft: 3, forging: 2 },
  },
  runtime: {
    summary: {
      total: 12,
      healthy: 10,
      gateway_unreachable: 1,
      db_only: 1,
      container_only: 0,
      sharedCodexEnabled: 3,
    },
    issues: [
      {
        sandbox_id: "sb-bad-1",
        sandbox_name: "broken-sandbox",
        drift_state: "gateway_unreachable",
        linked_agents: [{ id: "a1", name: "Agent 1", attachment: "runtime" }],
      },
    ],
  },
  marketplace: {
    summary: {
      totalListings: 8,
      published: 5,
      pendingReview: 3,
      totalInstalls: 100,
    },
    topListings: [
      {
        id: "l1",
        title: "Google Ads Agent",
        status: "published",
        installCount: 50,
        ownerOrgName: "Ruh AI",
        publisherEmail: null,
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  },
  activity: {
    recentAuditEvents: [
      {
        event_id: "ev-1",
        occurred_at: "2026-01-01T00:00:00Z",
        action_type: "agent.create",
        target_type: "agent",
        target_id: "a1",
        outcome: "success",
        actor_type: "user",
        actor_id: "u1",
      },
    ],
  },
  attention: [
    {
      id: "att-1",
      severity: "high" as const,
      title: "Runtime drift detected",
      detail: "1 sandbox unreachable",
      href: "/runtime",
    },
  ],
};

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(fullOverviewData),
  } as Response),
);

describe("DashboardPage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "test-token");
  });

  test("renders Overview heading", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    const { getByText } = render(<DashboardPage />);
    expect(getByText("Overview")).toBeTruthy();
  });

  test("renders platform overview subtitle", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    const { container } = render(<DashboardPage />);
    const text = container.textContent || "";
    expect(text).toContain("command view");
  });

  test("renders stat card labels", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    const { container } = render(<DashboardPage />);
    const text = container.textContent || "";
    expect(text).toContain("Users");
    expect(text).toContain("Agents");
  });

  test("fetches stats from API on mount", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    render(<DashboardPage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/api/admin/overview");
  });

  test("renders organization, audit, and marketplace data after fetch", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    const { container } = render(<DashboardPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Ruh AI");
    });
    expect(container.textContent).toContain("Google Ads Agent");
    expect(container.textContent).toContain("agent.create");
  });

  test("renders attention items and runtime issues after fetch", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    const { container } = render(<DashboardPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Runtime drift detected");
    });
    expect(container.textContent).toContain("broken-sandbox");
    expect(container.textContent).toContain("Agent 1");
  });
});
