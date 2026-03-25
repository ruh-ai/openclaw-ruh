import { describe, expect, test } from "bun:test";
import {
  applyBrowserWorkspaceEvent,
  createEmptyBrowserWorkspaceState,
  extractBrowserWorkspaceEvent,
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
