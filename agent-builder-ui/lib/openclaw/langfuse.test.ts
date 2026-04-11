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

    // Should not throw — addScore is silently skipped when disabled
    await expect(langfuseModule.withLangfuseBridgeTrace(
      { name: "openclaw.bridge.request" },
      async (trace) => {
        await trace.addScore("quality", 1, "all good");
      }
    )).resolves.toBeUndefined();
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

  test("fn throwing re-throws after updating trace with ERROR level", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    await expect(
      langfuseModule.withLangfuseBridgeTrace(
        { name: "openclaw.bridge.request" },
        async () => {
          throw new Error("architect crashed");
        }
      )
    ).rejects.toThrow("architect crashed");

    // updateActiveObservation should have been called with ERROR level
    const errorCall = updateActiveObservation.mock.calls.find(
      (call) => (call[0] as { level?: string }).level === "ERROR"
    );
    expect(errorCall).toBeDefined();
    expect((errorCall![0] as { statusMessage?: string }).statusMessage).toBe("architect crashed");
    // flush still called even on error
    expect(spanProcessorForceFlush).toHaveBeenCalled();
  });

  test("fn throwing a non-Error re-throws after updating trace with String(error)", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    await expect(
      langfuseModule.withLangfuseBridgeTrace(
        { name: "openclaw.bridge.request" },
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw "non-error string";
        }
      )
    ).rejects.toBe("non-error string");

    const errorCall = updateActiveObservation.mock.calls.find(
      (call) => (call[0] as { level?: string }).level === "ERROR"
    );
    expect(errorCall).toBeDefined();
    expect((errorCall![0] as { statusMessage?: string }).statusMessage).toBe("non-error string");
  });

  test("sanitizeValue truncates strings longer than 500 chars", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    const longString = "a".repeat(600);

    await langfuseModule.withLangfuseBridgeTrace(
      {
        name: "openclaw.bridge.request",
        metadata: { longField: longString },
      },
      async () => "ok"
    );

    const call = updateActiveObservation.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
    };
    const sanitized = call?.metadata?.longField as string | undefined;
    expect(sanitized).toBeDefined();
    expect(sanitized!.length).toBeLessThanOrEqual(500);
    expect(sanitized!.endsWith("...")).toBe(true);
  });

  test("sanitizeValue handles array inputs with mixed entries", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    await langfuseModule.withLangfuseBridgeTrace(
      {
        name: "openclaw.bridge.request",
        metadata: {
          items: ["short", "safe".repeat(200)],
        },
      },
      async () => "ok"
    );

    const call = updateActiveObservation.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
    };
    const items = call?.metadata?.items as string[] | undefined;
    expect(Array.isArray(items)).toBe(true);
    // Both items present (array passes through sanitizeValue)
    expect(items!.length).toBe(2);
  });

  test("flushLangfuseSpans swallows errors from forceFlush", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    spanProcessorForceFlush.mockRejectedValueOnce(new Error("flush failed"));

    // Should NOT throw even if forceFlush rejects
    await expect(
      langfuseModule.withLangfuseBridgeTrace(
        { name: "openclaw.bridge.request" },
        async () => "ok"
      )
    ).resolves.toEqual({ result: "ok", traceId: "trace-123" });
  });

  test("addScore posts score to Langfuse REST endpoint when traceId is available", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_BASE_URL = "https://langfuse.example";

    const fetchMock = mock(async () => new Response("", { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await langfuseModule.withLangfuseBridgeTrace(
        { name: "openclaw.bridge.request" },
        async (trace) => {
          // trace is enabled, traceId is "trace-123"
          await trace.addScore("quality", 0.9, "excellent");
          return "done";
        }
      );

      // postScore fires fetch to Langfuse scores endpoint
      // It is fire-and-forget so we need to wait a tick
      await new Promise((r) => setTimeout(r, 10));

      const calls = fetchMock.mock.calls;
      const scoreCall = calls.find(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("/scores")
      );
      expect(scoreCall).toBeDefined();
      const body = JSON.parse((scoreCall![1] as RequestInit).body as string);
      expect(body.name).toBe("quality");
      expect(body.value).toBe(0.9);
      expect(body.comment).toBe("excellent");
      expect(body.traceId).toBe("trace-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("addScore swallows postScore fetch errors gracefully", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_BASE_URL = "https://langfuse.example";

    const fetchMock = mock(async (_url: unknown) => {
      if (typeof _url === "string" && _url.includes("/scores")) {
        throw new Error("network error posting score");
      }
      return new Response("", { status: 200 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      // Should not throw even if postScore fetch fails
      await expect(
        langfuseModule.withLangfuseBridgeTrace(
          { name: "openclaw.bridge.request" },
          async (trace) => {
            await trace.addScore("quality", 0.5);
            return "ok";
          }
        )
      ).resolves.toEqual({ result: "ok", traceId: "trace-123" });

      // Allow the fire-and-forget postScore to settle
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("addScore is a no-op when traceId is null on enabled trace (edge case)", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";

    // Override startActiveObservation to return null traceId
    startActiveObservation.mockImplementationOnce(
      async (
        _name: string,
        fn: (observation: {
          traceId: null;
          startObservation: typeof startObservation;
        }) => Promise<unknown>
      ) =>
        fn({
          traceId: null,
          startObservation,
        })
    );

    const fetchMock = mock(async () => new Response("", { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await langfuseModule.withLangfuseBridgeTrace(
        { name: "openclaw.bridge.request" },
        async (trace) => {
          // traceId is null — addScore should be a no-op
          await trace.addScore("quality", 1);
          return "ok";
        }
      );

      await new Promise((r) => setTimeout(r, 10));
      const scoreCalls = fetchMock.mock.calls.filter(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("/scores")
      );
      expect(scoreCalls.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
