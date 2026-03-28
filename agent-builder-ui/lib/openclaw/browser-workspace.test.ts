import { describe, expect, test } from "bun:test";
import {
  applyBrowserWorkspaceEvent,
  createEmptyBrowserWorkspaceState,
  extractPersistedWorkspaceState,
  extractBrowserWorkspaceEvent,
  extractBrowserWorkspaceState,
  toPersistedWorkspaceState,
} from "./browser-workspace";

describe("extractBrowserWorkspaceEvent", () => {
  test("returns null for ordinary chat deltas", () => {
    expect(
      extractBrowserWorkspaceEvent({
        choices: [{ delta: { content: "hello" } }],
      }),
    ).toBeNull();
  });

  test("extracts structured browser workspace event payloads", () => {
    expect(
      extractBrowserWorkspaceEvent({
        browser: {
          type: "navigation",
          url: "https://example.com/login",
          label: "Example login",
        },
      }),
    ).toEqual({
      type: "navigation",
      url: "https://example.com/login",
      label: "Example login",
    });
  });

  test("accepts browser_event takeover payloads and normalizes snake_case action labels", () => {
    expect(
      extractBrowserWorkspaceEvent({
        browser_event: {
          type: "takeover_requested",
          reason: "Finish the login flow in the attached browser",
          action_label: "Resume browser run",
        },
      }),
    ).toEqual({
      type: "takeover_requested",
      reason: "Finish the login flow in the attached browser",
      actionLabel: "Resume browser run",
    });
  });
});

describe("applyBrowserWorkspaceEvent", () => {
  test("builds timeline items plus preview and takeover state", () => {
    const startedAt = 1_711_111_111_000;
    let state = createEmptyBrowserWorkspaceState();

    state = applyBrowserWorkspaceEvent(state, {
      type: "navigation",
      url: "https://example.com/login",
      label: "Example login",
    }, startedAt);

    state = applyBrowserWorkspaceEvent(state, {
      type: "screenshot",
      url: "https://cdn.example.com/browser-shot.png",
      label: "Login screen",
    }, startedAt + 10);

    state = applyBrowserWorkspaceEvent(state, {
      type: "preview",
      url: "http://localhost:4173",
      label: "Preview server",
    }, startedAt + 20);

    state = applyBrowserWorkspaceEvent(state, {
      type: "takeover_requested",
      reason: "Complete CAPTCHA to continue",
      actionLabel: "Resume agent run",
    }, startedAt + 30);

    expect(state.items).toHaveLength(3);
    expect(state.items.map((item) => item.kind)).toEqual([
      "navigation",
      "screenshot",
      "preview",
    ]);
    expect(state.previewUrl).toBe("http://localhost:4173");
    expect(state.takeover).toEqual({
      status: "requested",
      reason: "Complete CAPTCHA to continue",
      actionLabel: "Resume agent run",
      updatedAt: startedAt + 30,
    });
  });

  test("marks takeover as resumed when the stream reports recovery", () => {
    const startedAt = 1_711_111_111_000;
    let state = createEmptyBrowserWorkspaceState();

    state = applyBrowserWorkspaceEvent(state, {
      type: "takeover_requested",
      reason: "Finish MFA in the browser",
    }, startedAt);

    state = applyBrowserWorkspaceEvent(state, {
      type: "takeover_resumed",
      reason: "Operator confirmed the browser step",
      actionLabel: "Agent resumed",
    }, startedAt + 5);

    expect(state.takeover).toEqual({
      status: "resumed",
      reason: "Operator confirmed the browser step",
      actionLabel: "Agent resumed",
      updatedAt: startedAt + 5,
    });
  });
});

describe("workspace-state persistence", () => {
  test("serializes browser state into a versioned workspace envelope", () => {
    const state = {
      items: [
        {
          id: 0,
          kind: "navigation" as const,
          label: "Example",
          url: "https://example.com",
          timestamp: 1_711_111_111_000,
        },
      ],
      previewUrl: "https://example.com",
      takeover: null,
    };

    expect(toPersistedWorkspaceState(state)).toEqual({
      version: 1,
      browser: state,
    });
  });

  test("hydrates browser state from persisted workspace envelopes", () => {
    expect(extractBrowserWorkspaceState({
      version: 1,
      browser: {
        items: [
          {
            id: 0,
            kind: "preview",
            label: "Preview",
            url: "http://localhost:3000",
            timestamp: 1_711_111_111_100,
          },
        ],
        previewUrl: "http://localhost:3000",
        takeover: {
          status: "requested",
          reason: "Login required",
          actionLabel: "Resume agent run",
          updatedAt: 1_711_111_111_200,
        },
      },
    })).toEqual({
      items: [
        {
          id: 0,
          kind: "preview",
          label: "Preview",
          url: "http://localhost:3000",
          timestamp: 1_711_111_111_100,
        },
      ],
      previewUrl: "http://localhost:3000",
      takeover: {
        status: "requested",
        reason: "Login required",
        actionLabel: "Resume agent run",
        updatedAt: 1_711_111_111_200,
      },
    });
  });

  test("fails closed on malformed persisted browser state", () => {
    expect(extractBrowserWorkspaceState({
      version: 1,
      browser: {
        items: "nope",
      },
    })).toBeNull();
  });

  test("hydrates task-plan and terminal replay from persisted workspace envelopes", () => {
    expect(extractPersistedWorkspaceState({
      version: 1,
      task: {
        plan: {
          items: [
            { id: 1, label: "Inspect account", status: "done" },
            { id: 2, label: "Draft report", status: "active" },
          ],
          currentTaskIndex: 1,
          totalTasks: 2,
        },
        steps: [
          {
            id: 0,
            kind: "tool",
            label: "bash",
            detail: "ls -la",
            toolName: "bash",
            status: "done",
            startedAt: 1_711_111_111_000,
            elapsedMs: 250,
          },
        ],
      },
    })).toEqual({
      browserState: undefined,
      taskPlan: {
        items: [
          { id: 1, label: "Inspect account", status: "done" },
          { id: 2, label: "Draft report", status: "active" },
        ],
        currentTaskIndex: 1,
        totalTasks: 2,
      },
      steps: [
        {
          id: 0,
          kind: "tool",
          label: "bash",
          detail: "ls -la",
          toolName: "bash",
          status: "done",
          startedAt: 1_711_111_111_000,
          elapsedMs: 250,
        },
      ],
    });
  });
});
