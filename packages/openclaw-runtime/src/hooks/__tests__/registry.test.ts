import { describe, expect, test } from "bun:test";
import { HookRegistry } from "../registry";

describe("HookRegistry — register / unregister", () => {
  test("register returns an id; list reflects it", () => {
    const reg = new HookRegistry();
    const id = reg.register({
      name: "session_start",
      handler: () => {},
    });
    expect(typeof id).toBe("string");
    expect(reg.list("session_start").map((h) => h.id)).toEqual([id]);
  });

  test("default scope is pipeline; default fire_mode is sync", () => {
    const reg = new HookRegistry();
    reg.register({ name: "session_start", handler: () => {} });
    const [hook] = reg.list("session_start");
    expect(hook?.scope).toBe("pipeline");
    expect(hook?.fire_mode).toBe("sync");
  });

  test("unregister removes the handler; returns true", () => {
    const reg = new HookRegistry();
    const id = reg.register({ name: "session_start", handler: () => {} });
    expect(reg.unregister(id)).toBe(true);
    expect(reg.list("session_start")).toHaveLength(0);
  });

  test("unregister returns false for unknown id", () => {
    const reg = new HookRegistry();
    expect(reg.unregister("ghost")).toBe(false);
  });
});

describe("HookRegistry — scope priority on list", () => {
  test("returns runtime → pipeline → session", () => {
    const reg = new HookRegistry();
    const pipelineId = reg.register({
      name: "session_start",
      scope: "pipeline",
      handler: () => {},
      label: "pipeline",
    });
    const sessionId = reg.register({
      name: "session_start",
      scope: "session",
      handler: () => {},
      label: "session",
    });
    const runtimeId = reg.register({
      name: "session_start",
      scope: "runtime",
      handler: () => {},
      label: "runtime",
    });
    const list = reg.list("session_start");
    expect(list.map((h) => h.label)).toEqual(["runtime", "pipeline", "session"]);
    expect(list.map((h) => h.id)).toEqual([runtimeId, pipelineId, sessionId]);
  });

  test("within a scope, insertion order is preserved", () => {
    const reg = new HookRegistry();
    const a = reg.register({
      name: "session_start",
      scope: "pipeline",
      handler: () => {},
      label: "a",
    });
    const b = reg.register({
      name: "session_start",
      scope: "pipeline",
      handler: () => {},
      label: "b",
    });
    expect(reg.list("session_start").map((h) => h.id)).toEqual([a, b]);
  });
});

describe("HookRegistry — clearSession", () => {
  test("removes only session-scoped handlers", () => {
    const reg = new HookRegistry();
    reg.register({
      name: "session_start",
      scope: "runtime",
      handler: () => {},
      label: "rt",
    });
    reg.register({
      name: "session_start",
      scope: "pipeline",
      handler: () => {},
      label: "pl",
    });
    reg.register({
      name: "session_start",
      scope: "session",
      handler: () => {},
      label: "se",
    });

    reg.clearSession();
    const list = reg.list("session_start");
    expect(list.map((h) => h.label)).toEqual(["rt", "pl"]);
  });

  test("clearSession is idempotent", () => {
    const reg = new HookRegistry();
    reg.register({
      name: "session_start",
      scope: "session",
      handler: () => {},
    });
    reg.clearSession();
    reg.clearSession();
    expect(reg.list("session_start")).toHaveLength(0);
  });
});

describe("HookRegistry — size + name segregation", () => {
  test("size totals all scopes", () => {
    const reg = new HookRegistry();
    reg.register({ name: "session_start", scope: "runtime", handler: () => {} });
    reg.register({ name: "session_end", scope: "pipeline", handler: () => {} });
    reg.register({ name: "config_commit", scope: "session", handler: () => {} });
    expect(reg.size()).toBe(3);
  });

  test("list filters by hook name", () => {
    const reg = new HookRegistry();
    reg.register({ name: "session_start", handler: () => {} });
    reg.register({ name: "session_end", handler: () => {} });
    expect(reg.list("session_start")).toHaveLength(1);
    expect(reg.list("session_end")).toHaveLength(1);
  });
});
