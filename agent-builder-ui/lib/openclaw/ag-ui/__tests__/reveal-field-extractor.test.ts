import { describe, expect, test } from "bun:test";
import {
  extractRevealFieldMarkers,
  stripRevealMarkers,
} from "../builder-agent";

/**
 * Tests for the progressive reveal marker pipeline.
 *
 * The Architect emits ordered `<reveal_field k="..." v='JSON'/>` markers and
 * terminates with `<reveal_done/>`. The UI builds the employee card in place
 * as each field arrives — see MeetYourEmployee.tsx.
 */

describe("extractRevealFieldMarkers", () => {
  test("extracts a single string field", () => {
    const text = `<reveal_field k="name" v='"Google Ads Specialist"'/>`;
    const { events, newOffset } = extractRevealFieldMarkers(text, 0);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      name: "reveal_field",
      value: { key: "name", value: "Google Ads Specialist" },
    });
    expect(newOffset).toBe(text.length);
  });

  test("extracts an array field", () => {
    const text = `<reveal_field k="what_i_will_own" v='["Bid adjustments","Keyword hygiene","Weekly reports"]'/>`;
    const { events } = extractRevealFieldMarkers(text, 0);
    expect(events).toHaveLength(1);
    expect(events[0].value).toEqual({
      key: "what_i_will_own",
      value: ["Bid adjustments", "Keyword hygiene", "Weekly reports"],
    });
  });

  test("extracts ordered fields + reveal_done in sequence", () => {
    const text = [
      `<reveal_field k="name" v='"Ads Specialist"'/>`,
      `<reveal_field k="title" v='"Campaign Management"'/>`,
      `<reveal_field k="opening" v='"I read your brief."'/>`,
      `<reveal_done/>`,
    ].join("\n");
    const { events } = extractRevealFieldMarkers(text, 0);
    const names = events.map((e) => e.name);
    expect(names).toEqual(["reveal_field", "reveal_field", "reveal_field", "reveal_done"]);
    expect((events[0].value as { key: string }).key).toBe("name");
    expect((events[1].value as { key: string }).key).toBe("title");
    expect((events[2].value as { key: string }).key).toBe("opening");
  });

  test("skips unknown keys safely", () => {
    const text = `<reveal_field k="bogus_key" v='"value"'/><reveal_field k="name" v='"Ava"'/>`;
    const { events } = extractRevealFieldMarkers(text, 0);
    expect(events).toHaveLength(1);
    expect((events[0].value as { key: string }).key).toBe("name");
  });

  test("skips malformed JSON in v attribute", () => {
    const text = `<reveal_field k="name" v='{"unterminated'/>\n<reveal_field k="title" v='"OK"'/>`;
    const { events } = extractRevealFieldMarkers(text, 0);
    expect(events).toHaveLength(1);
    expect((events[0].value as { key: string }).key).toBe("title");
  });

  test("advances newOffset past the last matched marker on each call", () => {
    // The extractor intentionally scans a rolling window (matches sibling
    // extractRevealMarker contract). Downstream callers dedupe via a seen-key
    // set. We only contract that newOffset keeps moving forward.
    const base = `<reveal_field k="name" v='"First"'/>`;
    const more = `<reveal_field k="title" v='"Second"'/>`;
    const first = extractRevealFieldMarkers(base, 0);
    expect(first.events).toHaveLength(1);
    expect(first.newOffset).toBeGreaterThan(0);
    const second = extractRevealFieldMarkers(base + more, first.newOffset);
    expect(second.newOffset).toBeGreaterThan(first.newOffset);
    // The second call sees both markers in its search window; `title` is
    // present in the returned events regardless of whether `name` re-appears.
    const keys = second.events.map((e) => (e.value as { key: string }).key);
    expect(keys).toContain("title");
  });

  test("handles multiline content inside array values", () => {
    const text = `<reveal_field k="what_i_heard" v='["Line A","Line B","Line C"]'/>`;
    const { events } = extractRevealFieldMarkers(text, 0);
    expect(events).toHaveLength(1);
    expect(((events[0].value as { value: string[] }).value).length).toBe(3);
  });
});

describe("stripRevealMarkers", () => {
  test("removes <reveal_field> markers", () => {
    const text = `Thinking about role. <reveal_field k="name" v='"Ava"'/> Now the title.`;
    expect(stripRevealMarkers(text)).toBe("Thinking about role.  Now the title.");
  });

  test("removes <reveal_done/>", () => {
    const text = `All fields ready. <reveal_done/> Done.`;
    expect(stripRevealMarkers(text)).toBe("All fields ready.  Done.");
  });

  test("removes legacy <employee_reveal data='...'/>", () => {
    const text = `Prose. <employee_reveal data='{"name":"X","title":"Y"}'/> more`;
    expect(stripRevealMarkers(text)).toBe("Prose.  more");
  });

  test("leaves plain prose untouched", () => {
    const text = "Just plain prose, no markers here.";
    expect(stripRevealMarkers(text)).toBe(text);
  });
});
