/**
 * test-stage-readiness.test.ts
 * Tests for getTestStageContainerState and exported constants.
 */
import { describe, expect, test } from "bun:test";
import {
  getTestStageContainerState,
  TEST_STAGE_CONTAINER_READY_LABEL,
  TEST_STAGE_CONTAINER_NOT_READY_LABEL,
  TEST_STAGE_CONTAINER_NOT_READY_MESSAGE,
  TEST_STAGE_CONTAINER_NOT_READY_REASON,
} from "./test-stage-readiness";

describe("getTestStageContainerState", () => {
  test("returns ready state when sandboxId is a non-empty string", () => {
    const state = getTestStageContainerState("sandbox-abc-123");
    expect(state.hasRealContainer).toBe(true);
    expect(state.state).toBe("ready");
    expect(state.label).toBe(TEST_STAGE_CONTAINER_READY_LABEL);
    expect(state.description).toContain("real agent container");
    expect(state.emptyStateMessage).toContain("real agent container");
  });

  test("returns not-ready state when sandboxId is null", () => {
    const state = getTestStageContainerState(null);
    expect(state.hasRealContainer).toBe(false);
    expect(state.state).toBe("container-not-ready");
    expect(state.label).toBe(TEST_STAGE_CONTAINER_NOT_READY_LABEL);
    expect(state.description).toBe(TEST_STAGE_CONTAINER_NOT_READY_REASON);
    expect(state.emptyStateMessage).toContain("Container not ready");
  });

  test("returns not-ready state when sandboxId is undefined", () => {
    const state = getTestStageContainerState(undefined);
    expect(state.hasRealContainer).toBe(false);
    expect(state.state).toBe("container-not-ready");
  });

  test("returns not-ready state when sandboxId is empty string (falsy)", () => {
    const state = getTestStageContainerState("" as unknown as null);
    expect(state.hasRealContainer).toBe(false);
    expect(state.state).toBe("container-not-ready");
  });

  test("not-ready description explicitly mentions no shared architect fallback", () => {
    const state = getTestStageContainerState(null);
    // The description must communicate that the shared fallback is disabled
    expect(state.description).toContain("shared architect fallback is disabled");
  });

  test("not-ready emptyStateMessage mentions provisioning", () => {
    const state = getTestStageContainerState(null);
    expect(state.emptyStateMessage).toContain("provisioning");
  });
});

describe("constants", () => {
  test("REASON combines MESSAGE and DETAIL", () => {
    expect(TEST_STAGE_CONTAINER_NOT_READY_REASON).toContain(TEST_STAGE_CONTAINER_NOT_READY_MESSAGE);
  });

  test("labels are non-empty strings", () => {
    expect(TEST_STAGE_CONTAINER_READY_LABEL.length).toBeGreaterThan(0);
    expect(TEST_STAGE_CONTAINER_NOT_READY_LABEL.length).toBeGreaterThan(0);
  });
});
