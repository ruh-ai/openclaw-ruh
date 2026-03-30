import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const nodeSdkStart = mock(async () => undefined);
const nodeSdkCtor = mock(() => ({
  start: nodeSdkStart,
}));
const spanProcessorForceFlush = mock(async () => undefined);
const updateActiveObservation = mock(() => undefined);
const startObservationEnd = mock(() => undefined);
const startObservationUpdate = mock(() => undefined);
const startObservation = mock(() => ({
  end: startObservationEnd,
  update: startObservationUpdate,
}));
const startActiveObservation = mock(
  async (
    _name: string,
    fn: (observation: {
      traceId: string;
      startObservation: typeof startObservation;
    }) => Promise<unknown>
  ) =>
    fn({
      traceId: "trace-123",
      startObservation,
    })
);
const propagateAttributes = mock(
  async (
    _params: Record<string, unknown>,
    fn: () => Promise<unknown>
  ) => fn()
);

mock.module("@opentelemetry/sdk-node", () => ({
  NodeSDK: function MockNodeSdk(this: unknown, ...args: unknown[]) {
    nodeSdkCtor(...args);
    return { start: nodeSdkStart };
  },
}));

mock.module("@langfuse/otel", () => ({
  LangfuseSpanProcessor: function MockLangfuseSpanProcessor(this: unknown) {
    return {
      forceFlush: spanProcessorForceFlush,
    };
  },
}));

mock.module("@langfuse/tracing", () => ({
  startActiveObservation,
  updateActiveObservation,
  propagateAttributes,
}));

const langfuseModule = await import("./langfuse");

const ENV_KEYS = [
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_TRACING_ENVIRONMENT",
  "LANGFUSE_RELEASE",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

beforeEach(() => {
  nodeSdkCtor.mockClear();
  nodeSdkStart.mockClear();
  spanProcessorForceFlush.mockClear();
  startActiveObservation.mockClear();
  startObservation.mockClear();
  startObservationEnd.mockClear();
  startObservationUpdate.mockClear();
  updateActiveObservation.mockClear();
  propagateAttributes.mockClear();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] == null) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] == null) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe("withLangfuseBridgeTrace", () => {
  test("stays disabled when Langfuse credentials are absent", async () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;

    const traced = await langfuseModule.withLangfuseBridgeTrace(
      {
        name: "openclaw.bridge.request",
        input: { message: "hello" },
      },
      async (trace) => {
        expect(trace.enabled).toBe(false);
        expect(trace.traceId).toBe(null);
        trace.recordEvent("openclaw.bridge.noop");
        trace.update({ metadata: { ignored: true } });
        trace.startToolSpan("bash").end();
        trace.recordGeneration("gen", { output: "x" });
        await trace.addScore("quality", 1);
        return { ok: true };
      }
    );

    expect(traced).toEqual({
      result: { ok: true },
      traceId: null,
    });
    expect(nodeSdkCtor).not.toHaveBeenCalled();
    expect(startActiveObservation).not.toHaveBeenCalled();
    expect(updateActiveObservation).not.toHaveBeenCalled();
    expect(propagateAttributes).not.toHaveBeenCalled();
  });

  test("initializes tracing once and returns a trace id when configured", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_BASE_URL = "https://langfuse.example";
    process.env.LANGFUSE_TRACING_ENVIRONMENT = "test";
    process.env.LANGFUSE_RELEASE = "v1";

    const traced = await langfuseModule.withLangfuseBridgeTrace(
      {
        name: "openclaw.bridge.request",
        input: {
          message: "hello",
          token: "secret-token",
        },
        metadata: {
          request_id: "req-123",
          cookie: "secret-cookie",
        },
        sessionId: "sess-abc",
        userId: "architect",
        tags: ["mode:build", "agent:architect"],
      },
      async (trace) => {
        expect(trace.enabled).toBe(true);
        expect(trace.traceId).toBe("trace-123");
        trace.recordEvent("openclaw.bridge.gateway_resolved", {
          keep: "value",
          authorization: "secret",
        });
        trace.update({
          metadata: {
            safe: "value",
            password: "secret",
          },
        });
        return { ok: true };
      }
    );

    expect(traced).toEqual({
      result: { ok: true },
      traceId: "trace-123",
    });
    expect(nodeSdkCtor).toHaveBeenCalledTimes(1);
    expect(nodeSdkStart).toHaveBeenCalledTimes(1);
    expect(spanProcessorForceFlush).toHaveBeenCalledTimes(1);
    expect(startActiveObservation).toHaveBeenCalledTimes(1);

    // propagateAttributes must be called with session/user/tags
    expect(propagateAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-abc",
        userId: "architect",
        tags: ["mode:build", "agent:architect"],
      }),
      expect.any(Function)
    );

    // Sensitive fields are redacted
    expect(updateActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { message: "hello" }, // token key stripped
        metadata: { request_id: "req-123" }, // cookie key stripped
      }),
      { asType: "agent" }
    );
    expect(updateActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { safe: "value" }, // password key stripped
      }),
      { asType: "agent" }
    );
  });

  test("propagateAttributes omits undefined session/user/tags", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    await langfuseModule.withLangfuseBridgeTrace(
      { name: "openclaw.bridge.request" },
      async () => "ok"
    );

    expect(propagateAttributes).toHaveBeenCalledWith(
      {}, // no sessionId/userId/tags keys at all
      expect.any(Function)
    );
  });

  test("recordEvent creates and immediately ends a child event observation", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    await langfuseModule.withLangfuseBridgeTrace(
      { name: "openclaw.bridge.request" },
      async (trace) => {
        trace.recordEvent("openclaw.bridge.connected", { auth: "ok" });
      }
    );

    expect(startObservation).toHaveBeenCalledWith(
      "openclaw.bridge.connected",
      expect.objectContaining({ metadata: { auth: "ok" } }),
      { asType: "event" }
    );
    expect(startObservationEnd).toHaveBeenCalledTimes(1);
  });

  test("startToolSpan creates a tool observation and end() closes it", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    await langfuseModule.withLangfuseBridgeTrace(
      { name: "openclaw.bridge.request" },
      async (trace) => {
        const span = trace.startToolSpan("bash", { run_id: "r1" });
        span.end({ exit_code: 0 }, { duration_ms: 42 });
      }
    );

    expect(startObservation).toHaveBeenCalledWith(
      "openclaw.bridge.tool.bash",
      expect.objectContaining({ metadata: { run_id: "r1" } }),
      { asType: "tool" }
    );
    expect(startObservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ output: { exit_code: 0 } })
    );
    expect(startObservationEnd).toHaveBeenCalledTimes(1);
  });

  test("recordGeneration creates and immediately ends a generation observation", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    await langfuseModule.withLangfuseBridgeTrace(
      { name: "openclaw.bridge.request" },
      async (trace) => {
        trace.recordGeneration("openclaw.bridge.generation", {
          output: { text: "hello" },
          model: "openclaw-architect",
          usageDetails: { output: 5, total: 5 },
        });
      }
    );

    expect(startObservation).toHaveBeenCalledWith(
      "openclaw.bridge.generation",
      expect.objectContaining({
        model: "openclaw-architect",
        usageDetails: { output: 5, total: 5 },
        output: { text: "hello" },
      }),
      { asType: "generation" }
    );
    expect(startObservationEnd).toHaveBeenCalledTimes(1);
  });

  test("token count keys (tokens, total_tokens, etc.) are NOT redacted", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    await langfuseModule.withLangfuseBridgeTrace(
      {
        name: "openclaw.bridge.request",
        metadata: {
          tokens: 42,
          total_tokens: 100,
          prompt_tokens: 20,
          completion_tokens: 80,
          token_count: 42,
          // These should still be redacted:
          token: "secret-value",
          access_token: "bearer-abc",
        },
      },
      async () => "ok"
    );

    expect(updateActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          tokens: 42,
          total_tokens: 100,
          prompt_tokens: 20,
          completion_tokens: 80,
          token_count: 42,
          // Sensitive keys are absent
        }),
      }),
      { asType: "agent" }
    );
    // Verify sensitive keys are not present
    const call = updateActiveObservation.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
    };
    expect(call?.metadata).not.toHaveProperty("token");
    expect(call?.metadata).not.toHaveProperty("access_token");
  });

  test("addScore is a no-op when traceId is null (disabled)", async () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;

    // Should not throw
    await langfuseModule.withLangfuseBridgeTrace(
      { name: "openclaw.bridge.request" },
      async (trace) => {
        await trace.addScore("quality", 1, "all good");
      }
    );
  });

  test("per-agent instance ID propagates through userId and tags", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_BASE_URL = "https://langfuse.example";

    await langfuseModule.withLangfuseBridgeTrace(
      {
        name: "openclaw.bridge.request",
        sessionId: "sess-v2",
        // v2: userId is the agent instance ID, not just "architect"
        userId: "agent-abc123",
        tags: ["mode:build", "agent:architect", "agent-id:agent-abc123", "sandbox:forge"],
      },
      async (trace) => {
        expect(trace.enabled).toBe(true);
        return { ok: true };
      }
    );

    // Verify propagateAttributes was called with the agent instance ID
    expect(propagateAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-v2",
        userId: "agent-abc123",
        tags: expect.arrayContaining(["agent-id:agent-abc123", "sandbox:forge"]),
      }),
      expect.any(Function)
    );
  });
});
