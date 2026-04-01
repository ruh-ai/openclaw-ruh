describe("api client", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  test("apiFetch always includes credentials", async () => {
    const { apiFetch } = await import("@/lib/api/client");

    await apiFetch("http://localhost:8000/api/sandboxes", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/sandboxes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
        credentials: "include",
      })
    );
  });

  test("createAuthenticatedEventSource uses credentialed SSE", async () => {
    const eventSource = jest.fn();
    Object.defineProperty(global, "EventSource", {
      value: eventSource,
      writable: true,
    });

    const { createAuthenticatedEventSource } = await import("@/lib/api/client");

    createAuthenticatedEventSource("http://localhost:8000/api/sandboxes/stream/test");

    expect(eventSource).toHaveBeenCalledWith(
      "http://localhost:8000/api/sandboxes/stream/test",
      { withCredentials: true }
    );
  });
});
