import { afterEach, describe, expect, mock, test } from "bun:test";

import { buildSoulContent, pushAgentConfig } from "./agent-config";
import type { SavedAgent } from "@/hooks/use-agents-store";

const agent: SavedAgent = {
  id: "agent-1",
  name: "Review Agent",
  avatar: "",
  description: "summarize incidents and suggest next actions",
  skills: ["incident_lookup", "slack_notify"],
  triggerLabel: "Manual review",
  status: "draft",
  createdAt: "2026-03-25T00:00:00.000Z",
  sandboxIds: [],
  runtimeInputs: [
    {
      key: "GOOGLE_ADS_CUSTOMER_ID",
      label: "Customer ID",
      description: "Google Ads customer ID for the target account.",
      required: true,
      source: "architect_requirement",
      value: "123-456-7890",
    },
  ],
  toolConnections: [
    {
      toolId: "google-ads",
      name: "Google Ads",
      description: "Manage campaigns and pull performance data.",
      status: "configured",
      authKind: "oauth",
      connectorType: "mcp",
      configSummary: ["Connected account: Acme Ads"],
    },
  ],
  triggers: [
    {
      id: "cron-schedule",
      title: "Cron Schedule",
      kind: "schedule",
      status: "supported",
      description: "Runs every weekday at 9 AM.",
      schedule: "0 9 * * 1-5",
    },
  ],
  agentRules: ["Always explain the likely root cause first"],
  skillGraph: [
    {
      skill_id: "incident_lookup",
      name: "Incident Lookup",
      description: "Look up recent incidents",
      source: "custom",
      status: "approved",
      depends_on: [],
    },
  ],
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("buildSoulContent", () => {
  test("includes the agent name, skills, and rules for review-mode testing", () => {
    const soul = buildSoulContent(agent);

    expect(soul).toContain("# You are Review Agent");
    expect(soul).toContain("## Your Skills");
    expect(soul).toContain("- **Incident Lookup**: Look up recent incidents");
    expect(soul).toContain("## Rules");
    expect(soul).toContain("- Always explain the likely root cause first");
  });

  test("includes safe tool and trigger context from saved config without leaking secrets", () => {
    const soul = buildSoulContent({
      ...agent,
      toolConnections: [
        {
          toolId: "google",
          name: "Google Workspace",
          description: "Connected through the Google MCP bridge.",
          status: "configured",
          authKind: "oauth",
          connectorType: "mcp",
          configSummary: ["Connected account: Acme Ads", "Refresh token: secret-token-value"],
        },
        {
          toolId: "google-ads",
          name: "Google Ads Manual Plan",
          description: "Requires manual setup steps.",
          status: "unsupported",
          authKind: "none",
          connectorType: "mcp",
          configSummary: ["Callback URL: https://example.test/callback", "Manual research required"],
        },
      ],
      triggers: [
        {
          id: "cron-schedule",
          title: "Weekday Optimization Run",
          kind: "schedule",
          status: "supported",
          description: "Runs every weekday morning.",
          schedule: "0 9 * * 1-5",
        },
        {
          id: "webhook-post",
          title: "Webhook Intake",
          kind: "webhook",
          status: "unsupported",
          description: "Not wired into runtime yet.",
        },
      ],
    });

    expect(soul).toContain("## Configured Tools And Triggers");
    expect(soul).toContain("Google Workspace");
    expect(soul).toContain("configured");
    expect(soul).toContain("Weekday Optimization Run");
    expect(soul).toContain("supported");
    expect(soul).toContain("Webhook Intake");
    expect(soul).toContain("manual plan");
    expect(soul).toContain("Runtime input Customer ID: provided");
    expect(soul).not.toContain("secret-token-value");
    expect(soul).not.toContain("https://example.test/callback");
  });
});

describe("pushAgentConfig", () => {
  test("serializes cron jobs from structured triggers before falling back to rules", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.cron_jobs).toEqual([
        {
          name: "Review Agent-schedule",
          schedule: "0 9 * * 1-5",
          message: "Run Review Agent scheduled task",
        },
      ]);
      expect(body.runtime_inputs).toEqual([
        {
          key: "GOOGLE_ADS_CUSTOMER_ID",
          label: "Customer ID",
          description: "Google Ads customer ID for the target account.",
          required: true,
          source: "architect_requirement",
          value: "123-456-7890",
        },
      ]);

      return new Response(
        JSON.stringify({ ok: true, applied: true, steps: [] }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await pushAgentConfig("sandbox-1", agent);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("falls back to cron rules when saved schedule triggers are not runtime-supported", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.cron_jobs).toEqual([
        {
          name: "Review Agent-schedule",
          schedule: "15 6 * * 2",
          message: "Run Review Agent scheduled task",
        },
      ]);
      expect(body.runtime_inputs).toEqual([
        expect.objectContaining({
          key: "GOOGLE_ADS_CUSTOMER_ID",
          value: "123-456-7890",
        }),
      ]);

      return new Response(
        JSON.stringify({ ok: true, applied: true, steps: [] }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await pushAgentConfig("sandbox-1", {
      ...agent,
      triggers: [
        {
          id: "webhook-trigger",
          title: "Webhook",
          kind: "webhook",
          status: "unsupported",
          description: "Not wired into runtime yet.",
        },
      ],
      agentRules: ["schedule: 15 6 * * 2"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("treats a 200 response with ok false as a failed apply", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          applied: false,
          detail: "Agent config apply failed",
          steps: [
            {
              kind: "cron",
              target: "daily-report",
              ok: false,
              message: "Cron daily-report failed",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      )
    ) as typeof fetch;

    await expect(pushAgentConfig("sandbox-1", agent)).resolves.toEqual({
      ok: false,
      applied: false,
      detail: "Agent config apply failed",
      steps: [
        {
          kind: "cron",
          target: "daily-report",
          ok: false,
          message: "Cron daily-report failed",
        },
      ],
    });
  });

  test("only reports success when both ok and applied are true", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          applied: true,
          steps: [
            {
              kind: "soul",
              target: "SOUL.md",
              ok: true,
              message: "SOUL.md written",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      )
    ) as typeof fetch;

    await expect(pushAgentConfig("sandbox-1", agent)).resolves.toEqual({
      ok: true,
      applied: true,
      detail: null,
      steps: [
        {
          kind: "soul",
          target: "SOUL.md",
          ok: true,
          message: "SOUL.md written",
        },
      ],
    });
  });

  test("returns one-time webhook provisioning details from config apply without treating them as persistent agent state", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          applied: true,
          steps: [],
          webhooks: [
            {
              triggerId: "webhook-post",
              title: "Webhook POST",
              url: "http://localhost:8000/api/triggers/webhooks/public-webhook-1",
              secret: "whsec_test_secret",
              secretLastFour: "cret",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      )
    ) as typeof fetch;

    await expect(
      pushAgentConfig("sandbox-1", {
        ...agent,
        triggers: [
          {
            id: "webhook-post",
            title: "Webhook POST",
            kind: "webhook",
            status: "supported",
            description: "Accepts signed inbound POST events.",
          },
        ],
      })
    ).resolves.toEqual({
      ok: true,
      applied: true,
      detail: null,
      steps: [],
      webhooks: [
        {
          triggerId: "webhook-post",
          title: "Webhook POST",
          url: "http://localhost:8000/api/triggers/webhooks/public-webhook-1",
          secret: "whsec_test_secret",
          secretLastFour: "cret",
        },
      ],
    });
  });
});
