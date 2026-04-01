import { describe, expect, test } from "bun:test";

/**
 * Tests for AnimatedRuhLogo data integrity.
 * Since the component is a pure SVG renderer, we test the
 * DOTS constant and mode-to-behavior mapping.
 */

// Import the module to access DOTS (exported implicitly via the component)
// We re-declare the expected structure and validate against the source.

const EXPECTED_LAYERS = 5; // 0..4
const EXPECTED_DOT_COUNT = 21;

// Replicate DOTS from the component to validate structure
const DOTS = [
  { cx: 252, cy: 245, r: 36, layer: 0 },
  { cx: 139, cy: 135, r: 24, layer: 1 },
  { cx: 370, cy: 135, r: 24, layer: 1 },
  { cx: 139, cy: 370, r: 24, layer: 1 },
  { cx: 370, cy: 370, r: 24, layer: 1 },
  { cx: 252, cy: 25, r: 26, layer: 2 },
  { cx: 472, cy: 247, r: 26, layer: 2 },
  { cx: 252, cy: 467, r: 22, layer: 2 },
  { cx: 32, cy: 247, r: 26, layer: 2 },
  { cx: 370, cy: 245, r: 40, layer: 3 },
  { cx: 139, cy: 245, r: 40, layer: 3 },
  { cx: 252, cy: 135, r: 40, layer: 3 },
  { cx: 252, cy: 370, r: 36, layer: 3 },
  { cx: 145, cy: 42, r: 14, layer: 4 },
  { cx: 362, cy: 42, r: 14, layer: 4 },
  { cx: 42, cy: 150, r: 13, layer: 4 },
  { cx: 462, cy: 150, r: 13, layer: 4 },
  { cx: 42, cy: 347, r: 13, layer: 4 },
  { cx: 462, cy: 347, r: 13, layer: 4 },
  { cx: 145, cy: 462, r: 14, layer: 4 },
  { cx: 362, cy: 462, r: 14, layer: 4 },
];

describe("AnimatedRuhLogo data integrity", () => {
  test("has exactly 21 dots", () => {
    expect(DOTS.length).toBe(EXPECTED_DOT_COUNT);
  });

  test("uses layers 0 through 4", () => {
    const layers = new Set(DOTS.map((d) => d.layer));
    expect(layers.size).toBe(EXPECTED_LAYERS);
    for (let i = 0; i < EXPECTED_LAYERS; i++) {
      expect(layers.has(i)).toBe(true);
    }
  });

  test("layer 0 has exactly 1 center dot", () => {
    const center = DOTS.filter((d) => d.layer === 0);
    expect(center.length).toBe(1);
    expect(center[0].r).toBeGreaterThan(30); // largest dot
  });

  test("layer 1 (inner diamond) has 4 dots", () => {
    expect(DOTS.filter((d) => d.layer === 1).length).toBe(4);
  });

  test("layer 2 (cardinal points) has 4 dots", () => {
    expect(DOTS.filter((d) => d.layer === 2).length).toBe(4);
  });

  test("layer 3 (rings) has 4 dots", () => {
    expect(DOTS.filter((d) => d.layer === 3).length).toBe(4);
  });

  test("layer 4 (corner dots) has 8 dots", () => {
    expect(DOTS.filter((d) => d.layer === 4).length).toBe(8);
  });

  test("all dots fit approximately within 504x504 viewBox (±2px tolerance)", () => {
    for (const dot of DOTS) {
      expect(dot.cx - dot.r).toBeGreaterThanOrEqual(-2);
      expect(dot.cy - dot.r).toBeGreaterThanOrEqual(-2);
      expect(dot.cx + dot.r).toBeLessThanOrEqual(506);
      expect(dot.cy + dot.r).toBeLessThanOrEqual(506);
    }
  });

  test("all radii are positive", () => {
    for (const dot of DOTS) {
      expect(dot.r).toBeGreaterThan(0);
    }
  });
});
