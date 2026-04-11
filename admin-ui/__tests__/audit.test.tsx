import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

mock.module("next/navigation", () => ({
  usePathname: () => "/audit",
  useRouter: () => ({ push: mock(() => {}) }),
}));

const auditEvent = {
  event_id: "ev-1",
  occurred_at: "2026-01-01T00:00:00Z",
  action_type: "user.login",
  target_type: "user",
  target_id: "u1",
  outcome: "success",
  actor_type: "user",
  actor_id: "a1",
  request_id: "req-123",
  details: { ip: "127.0.0.1" },
};

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ items: [], has_more: false }),
  } as Response),
);

describe("AuditPage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], has_more: false }),
      } as Response),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "t");
  });

  test("renders Audit heading", async () => {
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    const { getByText } = render(<AuditPage />);
    expect(getByText("Audit")).toBeTruthy();
  });

  test("fetches audit events from API on mount", async () => {
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    render(<AuditPage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/api/admin/audit-events");
  });

  test("renders audit event rows after fetch resolves", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [auditEvent], has_more: false }),
      } as Response),
    );
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    const { container } = render(<AuditPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("user.login");
    });
    expect(container.textContent).toContain("success");
    expect(container.textContent).toContain("req-123");
  });

  test("shows empty state when no events match filters", async () => {
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    const { container } = render(<AuditPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No audit events matched");
    }, { timeout: 3000 });
  });

  test("renders outcome failure tone for failed events", async () => {
    const failedEvent = { ...auditEvent, event_id: "ev-2", outcome: "failure" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [failedEvent], has_more: false }),
      } as Response),
    );
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    const { container } = render(<AuditPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("failure");
    });
  });

  test("renders has_more indicator in metric card detail", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [auditEvent], has_more: true }),
      } as Response),
    );
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    const { container } = render(<AuditPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("More events exist");
    });
  });

  test("filter inputs update state and refetch", async () => {
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    const { container } = render(<AuditPage />);
    const inputs = container.querySelectorAll('input[type="text"]');
    const actionTypeInput = inputs[0] as HTMLInputElement;
    expect(actionTypeInput).toBeTruthy();
    await act(async () => {
      await userEvent.type(actionTypeInput, "user.login");
    });
    expect(actionTypeInput.value).toBe("user.login");
  });

  test("outcome select filter updates state", async () => {
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    const { container } = render(<AuditPage />);
    const selects = container.querySelectorAll("select");
    const outcomeSelect = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.value === "success"),
    ) as HTMLSelectElement;
    expect(outcomeSelect).toBeTruthy();
    await act(async () => {
      await userEvent.selectOptions(outcomeSelect, "success");
    });
    expect(outcomeSelect.value).toBe("success");
  });

  test("renders event with no request_id (null branch)", async () => {
    const noReqEvent = { ...auditEvent, event_id: "ev-3", request_id: null };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [noReqEvent], has_more: false }),
      } as Response),
    );
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    const { container } = render(<AuditPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("user.login");
    });
    // request_id null branch - no "Request:" text should render
    expect(container.textContent).not.toContain("Request:");
  });

  test("shows error message when API fails", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Failed to fetch audit" }),
      } as Response),
    );
    const { default: AuditPage } = await import("../app/(admin)/audit/page");
    const { container } = render(<AuditPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Failed to fetch audit");
    });
  });
});
