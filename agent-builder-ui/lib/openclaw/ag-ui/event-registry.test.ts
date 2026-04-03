import { describe, expect, test, beforeEach } from "bun:test";
import { EventType } from "@ag-ui/core";
import {
  processResponse,
  customEvent,
  textMessageEvents,
  formatAgentName,
  handleError,
  type EventContext,
} from "./event-registry";
import { tracer } from "./event-tracer";
import type { ArchitectResponse } from "../types";

function createContext(overrides: Partial<EventContext> = {}): EventContext {
  return {
    messageId: "msg-test",
    isCopilot: false,
    hasStreamedDeltas: false,
    threadId: "thread-1",
    runId: "run-1",
    ...overrides,
  };
}

describe("formatAgentName", () => {
  test("converts hyphenated name to title case", () => {
    expect(formatAgentName("google-ads-agent")).toBe("Google Ads Agent");
  });

  test("returns non-hyphenated name as-is", () => {
    expect(formatAgentName("MyAgent")).toBe("MyAgent");
  });
});

describe("customEvent", () => {
  test("creates an event with CUSTOM type", () => {
    const event = customEvent("test_event", { foo: 1 });
    expect(event.type).toBe(EventType.CUSTOM);
    expect((event as Record<string, unknown>).name).toBe("test_event");
    expect((event as Record<string, unknown>).value).toEqual({ foo: 1 });
  });
});

describe("textMessageEvents", () => {
  test("returns START, CONTENT, END events", () => {
    const events = textMessageEvents("msg-1", "Hello");
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe(EventType.TEXT_MESSAGE_START);
    expect(events[1].type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect(events[2].type).toBe(EventType.TEXT_MESSAGE_END);
  });
});

describe("processResponse", () => {
  beforeEach(() => { tracer.clear(); });

  test("routes error response to handleError", () => {
    const response = { type: "error", content: "Something went wrong." } as unknown as ArchitectResponse;
    const events = processResponse(response, createContext());
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(EventType.RUN_ERROR);
  });

  test("routes discovery response correctly", () => {
    const response = {
      type: "discovery",
      content: "Generated.",
      prd: { title: "PRD" },
      trd: { title: "TRD" },
    } as unknown as ArchitectResponse;
    const events = processResponse(response, createContext());
    expect(events.length).toBeGreaterThan(0);
    const customEvents = events.filter((e) => e.type === EventType.CUSTOM);
    expect(customEvents.find((e) => (e as Record<string, unknown>).name === "discovery_documents")).toBeDefined();
  });

  test("handles unknown response type via default", () => {
    const response = { type: "something_weird", content: "Unexpected." } as unknown as ArchitectResponse;
    const events = processResponse(response, createContext());
    expect(events.length).toBeGreaterThan(0);
  });
});
