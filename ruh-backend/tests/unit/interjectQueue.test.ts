import { afterEach, describe, expect, test } from "bun:test";
import {
  _resetAllInterjectsForTest,
  drainInterjects,
  peekInterjectCount,
  pushInterject,
} from "../../src/interjectQueue";

afterEach(() => _resetAllInterjectsForTest());

describe("interjectQueue", () => {
  test("pushInterject grows the queue and returns new depth", () => {
    expect(pushInterject("agent-A", "first")).toBe(1);
    expect(pushInterject("agent-A", "second")).toBe(2);
    expect(peekInterjectCount("agent-A")).toBe(2);
  });

  test("queues are isolated per agent id", () => {
    pushInterject("agent-A", "for-A");
    pushInterject("agent-B", "for-B-one");
    pushInterject("agent-B", "for-B-two");
    expect(peekInterjectCount("agent-A")).toBe(1);
    expect(peekInterjectCount("agent-B")).toBe(2);
    expect(drainInterjects("agent-A")).toEqual(["for-A"]);
    expect(drainInterjects("agent-B")).toEqual(["for-B-one", "for-B-two"]);
  });

  test("drainInterjects returns messages in submit order and clears the queue", () => {
    pushInterject("agent-A", "one");
    pushInterject("agent-A", "two");
    pushInterject("agent-A", "three");
    expect(drainInterjects("agent-A")).toEqual(["one", "two", "three"]);
    expect(peekInterjectCount("agent-A")).toBe(0);
    // Repeated drain is safe and returns empty.
    expect(drainInterjects("agent-A")).toEqual([]);
  });

  test("ignores empty / whitespace-only messages without growing the queue", () => {
    expect(pushInterject("agent-A", "")).toBe(0);
    expect(pushInterject("agent-A", "   ")).toBe(0);
    expect(pushInterject("agent-A", "\n\t  ")).toBe(0);
    expect(peekInterjectCount("agent-A")).toBe(0);
  });

  test("trims whitespace around stored messages", () => {
    pushInterject("agent-A", "  use OAuth refresh  \n");
    expect(drainInterjects("agent-A")).toEqual(["use OAuth refresh"]);
  });

  test("draining an unknown agent returns empty without throwing", () => {
    expect(drainInterjects("never-pushed-to")).toEqual([]);
    expect(peekInterjectCount("never-pushed-to")).toBe(0);
  });
});
