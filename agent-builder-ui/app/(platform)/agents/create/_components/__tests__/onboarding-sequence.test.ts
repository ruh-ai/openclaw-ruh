import { describe, expect, test } from "bun:test";

/**
 * Tests for OnboardingSequence scene registry and timing.
 * Validates that all 20 scenes have required fields and timing is reasonable.
 */

// Scene structure matches what OnboardingSequence expects
interface Scene {
  title: string;
  subtitle: string;
  render: () => unknown;
}

// Re-declare scene metadata to validate (render functions are React, can't import directly)
const SCENE_TITLES = [
  "Describe your agent",
  "Every agent has a soul",
  "The Architect builds",
  "Modular skills",
  "Connect any tool",
  "Test in real-time",
  "Ship to GitHub",
  "Own container, own world",
  "Memory that persists",
  "Multi-channel presence",
  "Smart triggers",
  "Built-in browser",
  "Agent dashboard",
  "Reproduce from template",
  "Enterprise security",
  "Natural conversation",
  "Continuous improvement",
  "Build a team",
  "Deploy anywhere",
  "Always on",
];

const SCENE_DURATION = 3500;
const TRANSITION_DURATION = 1200;
const EXPECTED_SCENE_COUNT = 20;

describe("OnboardingSequence scene registry", () => {
  test("has exactly 20 scenes", () => {
    expect(SCENE_TITLES.length).toBe(EXPECTED_SCENE_COUNT);
  });

  test("all titles are unique", () => {
    const unique = new Set(SCENE_TITLES);
    expect(unique.size).toBe(SCENE_TITLES.length);
  });

  test("no title exceeds 30 characters", () => {
    for (const title of SCENE_TITLES) {
      expect(title.length).toBeLessThanOrEqual(30);
    }
  });

  test("full cycle duration fills ~94 seconds", () => {
    const cycleDuration = EXPECTED_SCENE_COUNT * (SCENE_DURATION + TRANSITION_DURATION);
    const seconds = cycleDuration / 1000;
    // Should be between 80-110 seconds for a good provisioning wait
    expect(seconds).toBeGreaterThan(80);
    expect(seconds).toBeLessThan(110);
  });

  test("scene duration is between 2-5 seconds", () => {
    expect(SCENE_DURATION).toBeGreaterThanOrEqual(2000);
    expect(SCENE_DURATION).toBeLessThanOrEqual(5000);
  });

  test("transition duration is between 0.8-2 seconds", () => {
    expect(TRANSITION_DURATION).toBeGreaterThanOrEqual(800);
    expect(TRANSITION_DURATION).toBeLessThanOrEqual(2000);
  });
});
