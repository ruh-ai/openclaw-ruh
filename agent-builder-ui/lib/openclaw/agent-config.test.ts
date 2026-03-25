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
});

describe("pushAgentConfig", () => {
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
});
