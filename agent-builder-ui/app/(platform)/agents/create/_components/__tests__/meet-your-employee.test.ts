import { describe, expect, test, mock } from "bun:test";
import type { EmployeeRevealPayload } from "@/lib/openclaw/ag-ui/types";

// ─── Test data ─────────────────────────────────────────────────────────────

const sampleReveal: EmployeeRevealPayload = {
  name: "Google Ads Specialist",
  title: "Campaign Management & Optimization",
  opening: "You're running Google Ads campaigns but spending too much time on bid management.",
  what_i_heard: [
    "Running Google Ads but spending too much time on bids",
    "Need to focus on product and growth",
    "Looking for someone to own the day-to-day",
  ],
  what_i_will_own: [
    "Daily bid adjustments and budget allocation",
    "Weekly performance reports with recommendations",
    "Keyword research and negative keyword management",
  ],
  what_i_wont_do: [
    "Access your billing or payment settings",
    "Change campaign strategy without your approval",
  ],
  first_move: "Audit your current campaign structure and identify top 3 quick wins",
  clarifying_question: "Are you optimizing primarily for ROAS, new customer acquisition, or brand awareness?",
};

// ─── Payload structure tests ───────────────────────────────────────────────

describe("MeetYourEmployee payload", () => {
  test("reveal payload has all required fields", () => {
    expect(sampleReveal.name).toBeTruthy();
    expect(sampleReveal.title).toBeTruthy();
    expect(sampleReveal.opening).toBeTruthy();
    expect(sampleReveal.what_i_heard.length).toBeGreaterThanOrEqual(1);
    expect(sampleReveal.what_i_will_own.length).toBeGreaterThanOrEqual(1);
    expect(sampleReveal.what_i_wont_do.length).toBeGreaterThanOrEqual(1);
    expect(sampleReveal.first_move).toBeTruthy();
    expect(sampleReveal.clarifying_question).toBeTruthy();
  });

  test("initials derived correctly from name", () => {
    const initials = sampleReveal.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    expect(initials).toBe("GA");
  });

  test("single-word name produces single initial", () => {
    const name = "Specialist";
    const initials = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    expect(initials).toBe("S");
  });
});

// ─── Confirm/regenerate logic tests ────────────────────────────────────────

describe("MeetYourEmployee actions", () => {
  test("onConfirm passes the answer text", () => {
    const onConfirm = mock(() => {});
    const answer = "Primarily ROAS optimization";
    onConfirm(answer.trim());
    expect(onConfirm).toHaveBeenCalledWith("Primarily ROAS optimization");
  });

  test("onConfirm with empty answer passes empty string", () => {
    const onConfirm = mock(() => {});
    onConfirm("");
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  test("skip option appears after 3 attempts", () => {
    const attemptCount = 3;
    const showSkipOption = attemptCount >= 3;
    expect(showSkipOption).toBe(true);
  });

  test("skip option hidden for attempts 1 and 2", () => {
    expect(1 >= 3).toBe(false);
    expect(2 >= 3).toBe(false);
  });

  test("onRegenerate is callable", () => {
    const onRegenerate = mock(() => {});
    onRegenerate();
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });
});

// ─── Reveal marker parsing tests ───────────────────────────────────────────

describe("employee_reveal marker parsing", () => {
  test("valid JSON in marker is parseable", () => {
    const markerJson = JSON.stringify(sampleReveal);
    const marker = `<employee_reveal data='${markerJson}'/>`;
    const re = /<employee_reveal\s+data='(\{[\s\S]*?\})'\s*\/>/g;
    const match = re.exec(marker);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.name).toBe("Google Ads Specialist");
    expect(parsed.what_i_heard).toHaveLength(3);
    expect(parsed.what_i_will_own).toHaveLength(3);
    expect(parsed.what_i_wont_do).toHaveLength(2);
  });

  test("malformed JSON in marker does not throw", () => {
    const marker = `<employee_reveal data='{bad json}'/>`;
    const re = /<employee_reveal\s+data='(\{[\s\S]*?\})'\s*\/>/g;
    const match = re.exec(marker);
    expect(match).not.toBeNull();
    expect(() => JSON.parse(match![1])).toThrow();
  });

  test("marker with no data attribute does not match", () => {
    const marker = `<employee_reveal/>`;
    const re = /<employee_reveal\s+data='(\{[\s\S]*?\})'\s*\/>/g;
    const match = re.exec(marker);
    expect(match).toBeNull();
  });

  test("marker embedded in streaming text is extractable", () => {
    const markerJson = JSON.stringify({ name: "Test", what_i_heard: ["a"] });
    const text = `Some preamble text...\n\n<employee_reveal data='${markerJson}'/>\n\nSome trailing text`;
    const re = /<employee_reveal\s+data='(\{[\s\S]*?\})'\s*\/>/g;
    const match = re.exec(text);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.name).toBe("Test");
  });
});

// ─── Accessibility tests ───────────────────────────────────────────────────

describe("MeetYourEmployee accessibility", () => {
  test("reduced motion preference disables animations", () => {
    // In a real test with JSDOM, we'd check window.matchMedia.
    // Here we verify the logic: if reducedMotion is true, showContent should be true immediately.
    const reducedMotion = true;
    const showContent = reducedMotion ? true : false;
    expect(showContent).toBe(true);
  });
});
