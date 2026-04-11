import { describe, expect, test, beforeEach } from "bun:test";
import { tracer } from "./event-tracer";

describe("EventTracer", () => {
  beforeEach(() => {
    tracer.clear();
    tracer.enabled = true;
  });

  test("emit adds a trace with status 'emitted'", () => {
    tracer.emit("builder-agent", "TEXT_MESSAGE_START", "msg-1");
    const traces = tracer.getTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].source).toBe("builder-agent");
    expect(traces[0].eventType).toBe("TEXT_MESSAGE_START");
    expect(traces[0].eventName).toBe("msg-1");
    expect(traces[0].status).toBe("emitted");
  });

  test("receive adds a trace with status 'received'", () => {
    tracer.receive("use-agent-chat", "CUSTOM", "browser_event");
    const traces = tracer.getTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].status).toBe("received");
  });

  test("apply adds a trace with status 'applied'", () => {
    tracer.apply("copilot-store", "CUSTOM", "skill_graph_ready");
    const traces = tracer.getTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].status).toBe("applied");
  });

  test("drop adds a trace with status 'dropped' and optional reason", () => {
    tracer.drop("use-agent-chat", "CUSTOM", "unknown_event", "no consumer registered");
    const traces = tracer.getTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].status).toBe("dropped");
    expect(traces[0].reason).toBe("no consumer registered");
  });

  test("emit with payload stores payload in trace", () => {
    tracer.emit("builder-agent", "CUSTOM", "test", { foo: "bar" });
    const traces = tracer.getTraces();
    expect(traces[0].payload).toEqual({ foo: "bar" });
  });

  test("traces are capped at MAX_TRACES (500)", () => {
    for (let i = 0; i < 550; i++) {
      tracer.emit("builder-agent", "CUSTOM", `event-${i}`);
    }
    const traces = tracer.getTraces();
    expect(traces.length).toBe(500);
    expect(traces[0].eventName).toBe("event-50");
    expect(traces[traces.length - 1].eventName).toBe("event-549");
  });

  test("clear removes all traces", () => {
    tracer.emit("builder-agent", "CUSTOM", "e1");
    tracer.emit("builder-agent", "CUSTOM", "e2");
    expect(tracer.getTraces().length).toBe(2);
    tracer.clear();
    expect(tracer.getTraces().length).toBe(0);
  });

  test("disabling tracer prevents new traces from being pushed", () => {
    tracer.enabled = false;
    tracer.emit("builder-agent", "CUSTOM", "should-not-appear");
    expect(tracer.getTraces().length).toBe(0);
  });

  test("re-enabling tracer allows traces again", () => {
    tracer.enabled = false;
    tracer.emit("builder-agent", "CUSTOM", "no");
    tracer.enabled = true;
    tracer.emit("builder-agent", "CUSTOM", "yes");
    expect(tracer.getTraces().length).toBe(1);
    expect(tracer.getTraces()[0].eventName).toBe("yes");
  });

  test("dump returns all traces", () => {
    tracer.emit("builder-agent", "CUSTOM", "e1");
    tracer.apply("copilot-store", "CUSTOM", "e2");
    const dumped = tracer.dump();
    expect(dumped).toHaveLength(2);
  });

  test("traces have timestamps", () => {
    const before = Date.now();
    tracer.emit("builder-agent", "CUSTOM", "timed");
    const after = Date.now();
    const trace = tracer.getTraces()[0];
    expect(trace.timestamp).toBeGreaterThanOrEqual(before);
    expect(trace.timestamp).toBeLessThanOrEqual(after);
  });

  test("enabled getter returns current enabled state", () => {
    expect(tracer.enabled).toBe(true);
    tracer.enabled = false;
    expect(tracer.enabled).toBe(false);
    tracer.enabled = true;
    expect(tracer.enabled).toBe(true);
  });

  test("drop stores reason in trace when reason is provided", () => {
    tracer.drop("use-agent-chat", "CUSTOM", "my-event", "explicit reason text");
    const traces = tracer.getTraces();
    expect(traces[0].reason).toBe("explicit reason text");
  });

  test("drop with no reason leaves reason undefined", () => {
    tracer.drop("use-agent-chat", "CUSTOM", "my-event");
    const traces = tracer.getTraces();
    expect(traces[0].reason).toBeUndefined();
  });

  test("emit with no eventName leaves eventName undefined", () => {
    tracer.emit("builder-agent", "TEXT_MESSAGE_START");
    const traces = tracer.getTraces();
    expect(traces[0].eventName).toBeUndefined();
  });

  test("getTraces returns readonly reference — not a copy", () => {
    tracer.emit("builder-agent", "CUSTOM", "test");
    const traces = tracer.getTraces();
    expect(traces.length).toBe(1);
    // Must still have the trace after a second call
    expect(tracer.getTraces()).toBe(traces);
  });
});
